import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { freshness, queryKeys, type CacheIdentity } from './query-cache';
import { appendMessage, flattenMessages, type MessagePages } from './message-cache';
import type { ConversationMessage, MessageWorkspaceThread, ProjectSummary, ClientTaskSummary } from './types';

type Row = Record<string, unknown>;
type Inventory = { threads: MessageWorkspaceThread[]; projects: ProjectSummary[] };
type OpenConversation = { read: () => Promise<unknown>; refresh: () => Promise<unknown> };
export type SyncStatus = 'connecting' | 'live' | 'degraded' | 'stopped';
// Serialize removal/replacement even across account-scoped provider instances.
let channelRemoval: Promise<unknown> = Promise.resolve();
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export class RealtimeSync {
  private alive = true;
  private generation = 0;
  private channel?: RealtimeChannel;
  private transport?: SupabaseClient;
  private status: SyncStatus = 'connecting';
  private listeners = new Set<() => void>();
  private pending = new Map<string, QueryKey>();
  private timer?: ReturnType<typeof setTimeout>;
  private flushing = false;
  private reads = 0;
  private open = new Map<string, OpenConversation>();
  private readQueue = new Set<string>();
  private readInFlight = new Set<string>();
  private newestQueue = new Set<string>();
  private pendingSends = new Map<string, Set<string>>();
  private deferredOwnMessages = new Map<string, ConversationMessage[]>();
  private seen = new Set<string>();
  private visible: () => boolean;

  constructor(readonly client: QueryClient, readonly identity: CacheIdentity, visible = () => true) { this.visible = visible; }
  subscribeStatus = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getStatus = () => this.status;
  getChannelCount = () => this.transport?.getChannels().length || 0;
  private setStatus(status: SyncStatus) { if (!this.alive && status !== 'stopped') return; this.status = status; for (const listener of this.listeners) listener(); }

  async start(transport: SupabaseClient) {
    if (this.channel) return;
    this.alive = true;
    const generation = ++this.generation;
    this.transport = transport;
    await channelRemoval;
    if (!this.alive || generation !== this.generation) return;
    const {data:{session}} = await transport.auth.getSession().catch(() => ({data:{session:null}}));
    if (!this.alive || generation !== this.generation) return;
    if (!session || session.user.id !== this.identity.id) { this.setStatus('degraded'); return; }
    try { await transport.realtime.setAuth(session.access_token); }
    catch { this.setStatus('degraded'); return; }
    if (!this.alive || generation !== this.generation) return;
    const channel = transport.channel(`cache-sync:${this.identity.role}:${this.identity.id}`);
    this.channel = channel;
    const listen = (table: string, event: 'INSERT' | 'UPDATE', filter?: string) => {
      channel.on('postgres_changes', { schema: 'public', table, event, ...(filter ? { filter } : {}) }, payload => {
        if (this.alive && generation === this.generation) this.event(table, event, payload.new as Row);
      });
    };
    listen('project_messages', 'INSERT');
    listen('task_messages', 'INSERT');
    for (const event of ['INSERT', 'UPDATE'] as const) {
      listen('message_read_receipts', event, `recipient_id=eq.${this.identity.id}`);
      listen('notifications', event, `user_id=eq.${this.identity.id}`);
      listen('project_tasks', event);
    }
    channel.subscribe(status => {
      if (!this.alive || generation !== this.generation) return;
      if (status === 'SUBSCRIBED') { this.setStatus('live'); this.reconcile(); }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) this.setStatus('degraded');
    });
  }

  stop() {
    this.alive = false; ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined; this.pending.clear(); this.readQueue.clear(); this.newestQueue.clear();
    this.pendingSends.clear(); this.deferredOwnMessages.clear(); this.seen.clear(); this.open.clear();
    const channel = this.channel; this.channel = undefined;
    if (channel && this.transport) channelRemoval = this.transport.removeChannel(channel).catch(() => undefined);
    this.setStatus('stopped');
  }

  register(kind: string, id: string, callbacks: OpenConversation) {
    const key = `${kind}:${id}`; this.open.set(key, callbacks);
    if (Date.now() - (this.client.getQueryState(queryKeys.messages(this.identity,kind,id))?.dataUpdatedAt || 0) > freshness('messages').staleTime) this.newestQueue.add(key);
    this.requestRead(key);
    return () => { if (this.open.get(key) === callbacks) this.open.delete(key); };
  }
  private requestRead(key: string) { this.readQueue.add(key); this.schedule(); }
  private key(resource: string, ...args: string[]) { return queryKeys.data(this.identity, resource, ...args); }
  private enqueue(resource: string, ...args: string[]) { const key = this.key(resource, ...args); this.pending.set(JSON.stringify(key), key); this.schedule(); }
  private schedule() { if (this.alive && !this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 200); }

  communicationChanged() { this.enqueue('unread'); this.enqueue('conversations'); }
  async withRead<T>(operation: () => Promise<T>) {
    this.reads++;
    await Promise.all(['unread', 'conversations'].map(resource => this.client.cancelQueries({ queryKey: this.key(resource), exact: true })));
    try { return await operation(); }
    finally { this.reads--; if (this.alive) this.communicationChanged(); }
  }
  private async flush() {
    if (!this.alive || this.flushing) return;
    this.flushing = true;
    try {
      const jobs: Promise<unknown>[] = [];
      if (this.visible()) {
        for (const key of [...this.readQueue]) {
          this.readQueue.delete(key);
          const callbacks = this.open.get(key);
          if (!callbacks || this.readInFlight.has(key)) continue;
          this.readInFlight.add(key);
          jobs.push(callbacks.read().catch(() => this.setStatus('degraded')).finally(() => this.readInFlight.delete(key)));
        }
        for (const key of [...this.newestQueue]) {
          this.newestQueue.delete(key);
          const callbacks = this.open.get(key);
          if (callbacks) jobs.push(callbacks.refresh().catch(() => this.setStatus('degraded')));
        }
      }
      // Await acknowledgments before reading counts; never race old counts against a read.
      await Promise.all(jobs);
      if (!this.alive) return;
      const keys = [...this.pending.values()];
      for (const key of keys) {
        if (this.reads && ['unread', 'conversations'].includes(String(key[3]))) continue;
        this.pending.delete(JSON.stringify(key));
        await this.client.invalidateQueries({ queryKey: key, exact: true, refetchType: this.visible() ? 'active' : 'none' }, { cancelRefetch: false });
      }
    } finally {
      this.flushing = false;
      if (this.alive && (this.pending.size || (this.visible() && (this.readQueue.size || this.newestQueue.size)))) this.schedule();
    }
  }

  reconcile() {
    if (!this.alive) return;
    this.communicationChanged();
    this.projectActivityChanged();
    for (const resource of ['tasks', 'home', 'dashboard']) this.enqueue(resource);
    for (const query of this.client.getQueryCache().findAll({ queryKey: this.key('task') })) {
      if (query.getObserversCount()) this.enqueue('task', String(query.queryKey[4]));
      else void this.client.invalidateQueries({queryKey:query.queryKey,exact:true,refetchType:'none'});
    }
    for (const key of this.open.keys()) { this.newestQueue.add(key); this.requestRead(key); }
  }

  private projectActivityChanged(projectId?: string) {
    if (this.identity.role !== 'admin') return;
    for (const query of this.client.getQueryCache().findAll({ queryKey: this.key('project-activity') })) {
      if (!projectId || query.queryKey[4] === projectId) this.enqueue('project-activity', String(query.queryKey[4]));
    }
  }

  private inventory() { return this.client.getQueryData<Inventory>(this.key('conversations')); }
  private knownMessageScope(kind: string, id: string) {
    return Boolean(this.client.getQueryData(queryKeys.messages(this.identity, kind, id)) || this.inventory()?.threads.some(t => t.kind === kind && t.resourceId === id));
  }
  private taskScope(row: Row) {
    const home = this.client.getQueryData<{projects:ProjectSummary[];allTasks:ClientTaskSummary[]}>(this.key('home'));
    const detail = this.client.getQueryData<{task:{projectId:string;assigneeId:string};project:ProjectSummary}>(this.key('task', String(row.id)));
    const projects = [...(home?.projects || []), ...(this.inventory()?.projects || []), ...(detail ? [detail.project] : [])];
    const project = projects.find(p => p.id === row.project_id);
    if (this.identity.role === 'admin') return true; // Live transport is session/RLS authorized; never copy task payloads.
    if (project) return project.clientId === row.assignee_id && row.client_visible === true && row.status !== 'draft';
    // A list alone has no assignee identity. Treat it only as an invalidation hint.
    const tasks = this.client.getQueryData<ClientTaskSummary[]>(this.key('tasks'));
    return Boolean(tasks?.some(t => t.id === row.id && t.projectId === row.project_id));
  }

  event(table: string, event: string, row: Row) {
    if (!this.alive || !['INSERT','UPDATE'].includes(event) || !uuid(row.id)) return;
    if (table === 'message_read_receipts') { if (row.recipient_id === this.identity.id) this.communicationChanged(); return; }
    if (table === 'notifications') { if (row.user_id === this.identity.id) { this.enqueue('unread'); this.enqueue('home'); } return; }
    if (table === 'project_tasks') {
      if (!uuid(row.project_id)) return;
      this.projectActivityChanged(row.project_id);
      if (!this.taskScope(row)) {
        // An event is only a hint. Unknown IDs never populate task data; an active
        // authorized list can discover a newly assigned task through its own API.
        this.enqueue('tasks');
        return;
      }
      this.enqueue('task', row.id); this.enqueue('tasks'); this.enqueue('home'); this.enqueue('dashboard');
      // The inventory displays task title/status. No history invalidation.
      if (this.inventory()?.threads.some(t => t.kind === 'task' && t.resourceId === row.id)) this.enqueue('conversations');
      return;
    }
    if (event !== 'INSERT' || !['project_messages','task_messages'].includes(table) || row.message_type !== 'user') return;
    const kind = table === 'task_messages' ? 'task' : 'project';
    const id = row[kind + '_id'];
    if (!uuid(id) || !uuid(row.sender_id) || typeof row.body !== 'string' || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) return;
    this.projectActivityChanged(kind === 'project' ? id : this.inventory()?.threads.find(t => t.kind === 'task' && t.resourceId === id)?.projectId);
    const eventId = `${table}:${row.id}`;
    if (this.seen.has(eventId)) return;
    this.seen.add(eventId); if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value!);
    if (!this.knownMessageScope(kind, id)) {
      // The RLS-delivered hint may describe a new conversation; fetch authorized metadata,
      // but never populate a previously unknown history with event contents.
      this.communicationChanged(); return;
    }
    const history = this.client.getQueryData<MessagePages>(queryKeys.messages(this.identity,kind,id));
    const sender = flattenMessages(history).find(m => m.senderId === row.sender_id);
    const message: ConversationMessage = {id:row.id,senderId:row.sender_id,senderName:row.sender_id===this.identity.id?'You':sender?.senderName || 'Member',senderRole:sender?.senderRole || (row.sender_id===this.identity.id?this.identity.role:'client'),body:row.body,attachmentUrl:typeof row.attachment_url==='string'?row.attachment_url:null,createdAt:row.created_at};
    const resource = `${kind}:${id}`;
    if (row.sender_id === this.identity.id && this.pendingSends.get(resource)?.size) {
      this.deferredOwnMessages.set(resource,[...(this.deferredOwnMessages.get(resource)||[]),message]);
    } else this.applyMessage(kind,id,message);
    this.communicationChanged();
    if (this.open.has(resource)) this.requestRead(resource);
  }

  private applyMessage(kind: string, id: string, message: ConversationMessage) {
    const key = queryKeys.messages(this.identity,kind,id);
    if (this.client.getQueryData(key)) {
      // Prevent an older in-flight history response from replacing this event.
      void this.client.cancelQueries({queryKey:key,exact:true});
      this.client.setQueryData<MessagePages>(key,current => appendMessage(current,message));
    }
    this.client.setQueryData<Inventory>(this.key('conversations'), current => current && {...current,threads:current.threads.map(t => t.kind===kind && t.resourceId===id && (!t.lastMessageAt || t.lastMessageAt<=message.createdAt) ? {...t,preview:message.body,senderName:message.senderName,lastMessageAt:message.createdAt} : t)});
  }
  beginSend(kind: string, id: string, temporaryId: string) { const key=`${kind}:${id}`; const pending=this.pendingSends.get(key)||new Set<string>(); pending.add(temporaryId); this.pendingSends.set(key,pending); }
  finishSend(kind: string, id: string, temporaryId: string) {
    const key=`${kind}:${id}`; this.pendingSends.get(key)?.delete(temporaryId);
    if (!this.pendingSends.get(key)?.size) {
      this.pendingSends.delete(key);
      if(this.alive) for(const message of this.deferredOwnMessages.get(key)||[]) this.applyMessage(kind,id,message);
      this.deferredOwnMessages.delete(key);
    }
  }
}


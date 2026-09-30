import type { AdminConversationSummary, ConversationThread, MessageWorkspaceThread, ProjectSummary } from './types';

export function messageThreadKey(kind: 'project' | 'task', resourceId: string) {
  return `${kind}:${resourceId}`;
}

export function parseMessageThreadKey(value: string | null | undefined) {
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const kind = value.slice(0, separator);
  const resourceId = value.slice(separator + 1);
  if ((kind !== 'project' && kind !== 'task') || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId)) return null;
  return { kind, resourceId } as const;
}

export function clientWorkspaceThreads(threads: ConversationThread[]): MessageWorkspaceThread[] {
  return threads.map((thread) => ({
    key: messageThreadKey(thread.kind, thread.id),
    kind: thread.kind,
    resourceId: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    projectName: thread.projectName,
    clientName: null,
    senderName: thread.lastSenderName || null,
    preview: thread.lastMessagePreview,
    lastMessageAt: thread.lastMessageAt,
    unreadCount: thread.unreadCount,
  }));
}

export function adminWorkspaceThreads(conversations: AdminConversationSummary[], projects: ProjectSummary[]): MessageWorkspaceThread[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  return conversations.map((conversation) => ({
    key: messageThreadKey(conversation.kind, conversation.resourceId),
    kind: conversation.kind,
    resourceId: conversation.resourceId,
    projectId: conversation.projectId,
    title: conversation.taskTitle || conversation.projectName,
    projectName: conversation.projectName,
    clientName: projectsById.get(conversation.projectId)?.clientName || null,
    senderName: conversation.senderName,
    preview: conversation.preview,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCount,
  }));
}

export function emptyAdminProjectThread(project: ProjectSummary): MessageWorkspaceThread {
  return {
    key: messageThreadKey('project', project.id),
    kind: 'project',
    resourceId: project.id,
    projectId: project.id,
    title: project.projectName,
    projectName: project.projectName,
    clientName: project.clientName || null,
    senderName: null,
    preview: null,
    lastMessageAt: null,
    unreadCount: 0,
  };
}

export function retainOpenProjectThreads<T extends {threads:MessageWorkspaceThread[];projects:ProjectSummary[]}>(next: T, previous?: T): T {
  const present = new Set(next.threads.map(thread => thread.key));
  const allowed = new Map(next.projects.map(project => [project.id,project]));
  const retained = (previous?.threads || []).filter(thread => thread.kind==='project' && !present.has(thread.key) && allowed.has(thread.resourceId)).map(thread => emptyAdminProjectThread(allowed.get(thread.resourceId)!));
  return retained.length ? {...next,threads:[...next.threads,...retained]} : next;
}

export function resolveMessageThread(threads: MessageWorkspaceThread[], requestedKey: string | null | undefined) {
  const requested = requestedKey && threads.find((thread) => thread.key === requestedKey);
  if (requested) return requested;
  return threads.find((thread) => thread.unreadCount > 0) || threads[0] || null;
}

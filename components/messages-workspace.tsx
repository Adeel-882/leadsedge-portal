'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useCacheIdentity } from './query-provider';
import { queryKeys } from '@/lib/query-cache';
import type { ScreenData } from '@/lib/screen-data';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowSquareOut, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { Conversation } from '@/components/conversation';
import { EmptyState } from '@/components/empty-state';
import { formatTime, initials } from '@/lib/format';
import { filterProjectChatOptions, projectChatSelection, resolveMessageThread } from '@/lib/message-workspace';
import type { ConversationMessage, MessageWorkspaceThread, ProjectSummary } from '@/lib/types';

type MessagesWorkspaceProps = {
  role: 'admin' | 'client';
  viewerId: string;
  initialThreads: MessageWorkspaceThread[];
  initialSelectedKey: string | null;
  initialMessages?: ConversationMessage[];
  initialMobileConversation: boolean;
  projects?: ProjectSummary[];
};

function threadHref(role: 'admin' | 'client', key: string) {
  return `/${role === 'admin' ? 'admin' : 'portal'}/messages?thread=${encodeURIComponent(key)}`;
}

function threadSearchText(thread: MessageWorkspaceThread) {
  return [thread.title, thread.projectName, thread.clientName, thread.senderName, thread.preview, thread.kind].filter(Boolean).join(' ').toLowerCase();
}

function ThreadRow({ thread, selected, onSelect }: { thread: MessageWorkspaceThread; selected: boolean; onSelect: () => void }) {
  const avatarLabel = thread.clientName || thread.title;
  return <button
    type="button"
    className={`messages-thread-row ${selected ? 'is-selected' : ''} ${thread.unreadCount > 0 ? 'has-unread' : ''}`}
    aria-current={selected ? 'true' : undefined}
    onClick={onSelect}
  >
    <span className="avatar messages-thread-avatar">{initials(avatarLabel)}</span>
    <span className="messages-thread-copy">
      <span className="messages-thread-heading">
        <span className="truncate">{thread.title}</span>
        {thread.lastMessageAt && <time>{formatTime(thread.lastMessageAt)}</time>}
      </span>
      <span className="messages-thread-context">
        <span className="messages-type-badge">{thread.kind === 'task' ? 'Task' : 'Project'}</span>
        <span className="truncate">{thread.kind === 'task' ? thread.projectName : thread.clientName || 'Project conversation'}</span>
      </span>
      <span className="messages-thread-preview">
        <span className="truncate">{thread.preview ? `${thread.senderName ? `${thread.senderName}: ` : ''}${thread.preview}` : 'No messages yet'}</span>
        {thread.unreadCount > 0 && <span className="unread-pill" aria-label={`${thread.unreadCount} unread`}>{thread.unreadCount}</span>}
      </span>
    </span>
  </button>;
}

export function MessagesWorkspace({ role, viewerId, initialThreads, initialSelectedKey, initialMessages, initialMobileConversation, projects = [] }: MessagesWorkspaceProps) {
  const client = useQueryClient();
  const identity = useCacheIdentity();
  const threads = initialThreads;
  const setThreads = useCallback((update: (current: MessageWorkspaceThread[]) => MessageWorkspaceThread[]) => {
    client.setQueryData<ScreenData<'conversations'>>(queryKeys.data(identity,'conversations'), current => current && {...current,threads:update(current.threads)});
  }, [client,identity]);
  const [selectedKey, setSelectedKey] = useState(initialSelectedKey);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [mobileConversation, setMobileConversation] = useState(initialMobileConversation);
  const [projectPicker, setProjectPicker] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const matchingProjects = useMemo(() => filterProjectChatOptions(projects, projectQuery), [projects, projectQuery]);
  const [desktop, setDesktop] = useState(false);

  const selected = threads.find((thread) => thread.key === selectedKey) || resolveMessageThread(threads, null);
  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? threads.filter((thread) => threadSearchText(thread).includes(normalized)) : threads;
  }, [query, threads]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const selectThread = useCallback(async (thread: MessageWorkspaceThread, history: 'push' | 'none' = 'push') => {
    setMobileConversation(true);
    if (history === 'push') window.history.pushState({}, '', threadHref(role, thread.key));
    if (thread.key === selectedKey) return;

    setSelectedKey(thread.key);
    setLoadError('');
  }, [role, selectedKey]);

  useEffect(() => {
    const onPopState = () => {
      const requested = new URL(window.location.href).searchParams.get('thread');
      const thread = threads.find((item) => item.key === requested);
      if (thread) void selectThread(thread, 'none');
      else setMobileConversation(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [selectThread, threads]);

  function openProject(project: ProjectSummary) {
    const thread = projectChatSelection(role, projects, threads, project.id);
    if (!thread) return;
    setThreads((current) => current.some(item => item.key === thread.key) ? current : [...current, thread]);
    setQuery('');
    setProjectPicker(false);
    void selectThread(thread);
  }

  const conversationRead = useCallback((readMessages: number) => {
    if (!readMessages || !selectedKey) return;
    setThreads((current) => current.map((thread) => thread.key === selectedKey ? { ...thread, unreadCount: Math.max(0, thread.unreadCount - readMessages) } : thread));
  }, [selectedKey, setThreads]);

  const messageSent = useCallback((message: ConversationMessage) => {
    if (!selectedKey) return;
    setThreads((current) => current.map((thread) => thread.key === selectedKey ? {
      ...thread,
      preview: message.body,
      senderName: 'You',
      lastMessageAt: message.createdAt,
    } : thread));
  }, [selectedKey, setThreads]);

  return <div className={`messages-workspace ${mobileConversation ? 'mobile-conversation-open' : ''}`}>
    <aside className="messages-rail" aria-label="Conversation list">
      <header className="messages-rail-header">
        <div>
          <p className="text-sm font-bold">Conversations</p>
          <p className="text-xs text-muted">{threads.length} {threads.length === 1 ? 'thread' : 'threads'}</p>
        </div>
        {role === 'admin' && <button type="button" className="icon-button" aria-label="Start or open project chat" onClick={() => { setProjectQuery(''); setProjectPicker(true); }}><Plus size={18} weight="bold" aria-hidden /></button>}
      </header>
      <label className="messages-search">
        <MagnifyingGlass size={16} aria-hidden />
        <span className="sr-only">Search conversations</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" />
      </label>
      <div className="messages-thread-list">
        {filteredThreads.map((thread) => <ThreadRow key={thread.key} thread={thread} selected={thread.key === selected?.key} onSelect={() => void selectThread(thread)} />)}
        {!filteredThreads.length && <p className="px-4 py-8 text-center text-sm text-muted">{threads.length ? 'No conversations match your search.' : 'No conversations yet.'}</p>}
      </div>
    </aside>

    <section className="messages-pane" aria-label="Selected conversation">
      {selected ? <>
        <header className="messages-pane-header">
          <button type="button" className="icon-button messages-mobile-back" aria-label="Back to conversations" onClick={() => { setMobileConversation(false); window.history.pushState({}, '', `/${role === 'admin' ? 'admin' : 'portal'}/messages`); }}><ArrowLeft size={18} aria-hidden /></button>
          <span className="avatar messages-pane-avatar">{initials(selected.clientName || selected.title)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold sm:text-base">{selected.title}</h2>
            <p className="truncate text-xs text-muted">{selected.clientName ? `${selected.clientName} · ` : ''}{selected.kind === 'task' ? `${selected.projectName} · Task conversation` : 'Project conversation'}</p>
          </div>
          {selected.kind === 'task' && <Link prefetch={false} className="button-ghost messages-open-lead" href={role === 'admin' ? `/admin/projects/${selected.projectId}/tasks/${selected.resourceId}` : `/portal/tasks/${selected.resourceId}`}><span>Open lead</span><ArrowSquareOut size={14} aria-hidden /></Link>}
        </header>
        <div className="messages-pane-body">
          {loadError && <p role="alert" className="p-2 text-sm">{loadError}</p>}{desktop || mobileConversation ? <Conversation key={selected.key} kind={selected.kind} resourceId={selected.resourceId} viewerId={viewerId} initialMessages={selected.key === initialSelectedKey ? initialMessages : undefined} onConversationRead={conversationRead} onMessageSent={messageSent} /> : null}
        </div>
      </> : <div className="messages-pane-empty"><EmptyState title="No message conversations yet" body={role === 'admin' ? 'Start a project chat to open the first conversation.' : 'Your project conversations will appear here.'} /></div>}
    </section>

    {role === 'admin' && projectPicker && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="project-chat-title"><div className="modal-card"><div className="flex items-start justify-between"><div><p className="page-eyebrow">Start or open</p><h2 id="project-chat-title" className="text-2xl font-bold">Project chat</h2><p className="mt-2 text-sm leading-6 text-muted">Choose an active project. Its conversation opens in the Messages workspace.</p></div><button className="icon-button" aria-label="Close" onClick={() => setProjectPicker(false)}><X size={19} aria-hidden /></button></div><label className="messages-search mt-4"><MagnifyingGlass size={16} aria-hidden /><span className="sr-only">Search client or project</span><input autoFocus value={projectQuery} onChange={event => setProjectQuery(event.target.value)} placeholder="Search client or project" /></label><div className="mt-4 max-h-80 overflow-y-auto border-y border-line">{matchingProjects.map((project) => <button type="button" key={project.id} onClick={() => openProject(project)} className="messages-project-option"><span className="avatar h-9 w-9 bg-[#e6f1ef] text-teal">{initials(project.clientName)}</span><span className="min-w-0 text-left"><b className="block truncate text-sm">{project.clientName}</b><small className="text-muted">Project: {project.projectName}</small></span><span className="ml-auto text-xs text-teal">Open chat</span></button>)}{!matchingProjects.length && <p className="p-4 text-sm text-muted">{projects.length ? 'No clients or projects match your search.' : 'No active projects available.'}</p>}</div><div className="mt-6 flex justify-end"><button className="button-secondary" onClick={() => setProjectPicker(false)}>Close</button></div></div></div>}
  </div>;
}

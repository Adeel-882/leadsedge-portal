import Link from 'next/link';
import { ChatCircleDots, ClipboardText } from '@phosphor-icons/react/dist/ssr';
import { formatDate } from '@/lib/format';
import type { ConversationThread } from '@/lib/types';

export function threadKey(thread: Pick<ConversationThread, 'kind' | 'id'>) {
  return `${thread.kind}:${thread.id}`;
}

function ThreadLink({ thread, selected }: { thread: ConversationThread; selected: boolean }) {
  const Icon = thread.kind === 'task' ? ClipboardText : ChatCircleDots;
  return <Link prefetch={false}
    href={`/portal/messages?thread=${encodeURIComponent(threadKey(thread))}`}
    aria-current={selected ? 'true' : undefined}
    className={`conversation-thread ${selected ? 'is-selected' : ''}`}
  >
    <span className="conversation-thread-icon"><Icon size={16} weight={selected ? 'fill' : 'regular'} aria-hidden /></span>
    <span className="conversation-thread-body">
      <span className="conversation-thread-title">
        <span className="truncate">{thread.title}</span>
        {thread.unreadCount > 0 && <span className="unread-pill" aria-label={`${thread.unreadCount} unread`}>{thread.unreadCount}</span>}
      </span>
      <span className="conversation-thread-meta">
        {thread.kind === 'task' ? `${thread.projectName} • Lead` : 'Project chat'}
        {thread.lastMessageAt ? ` • ${formatDate(thread.lastMessageAt)}` : ''}
      </span>
      {thread.lastMessagePreview && <span className="conversation-thread-preview">{thread.lastMessagePreview}</span>}
    </span>
  </Link>;
}

/**
 * The navigation badge counts unread project messages and unread task comments
 * together, so both kinds have to be openable from here. Without the lead
 * threads a client could see an unread count with no page that could clear it.
 */
export function ConversationList({ threads, selectedKey }: { threads: ConversationThread[]; selectedKey: string }) {
  const projectThreads = threads.filter((thread) => thread.kind === 'project');
  const taskThreads = threads.filter((thread) => thread.kind === 'task');
  const unreadTaskTotal = taskThreads.reduce((total, thread) => total + thread.unreadCount, 0);

  return <nav className="conversation-list" aria-label="Conversations">
    <p className="conversation-group-label">Projects</p>
    {projectThreads.map((thread) => <ThreadLink key={threadKey(thread)} thread={thread} selected={threadKey(thread) === selectedKey} />)}
    {taskThreads.length > 0 && <>
      <p className="conversation-group-label mt-4">
        Leads
        {unreadTaskTotal > 0 && <span className="unread-pill ml-2">{unreadTaskTotal}</span>}
      </p>
      {taskThreads.map((thread) => <ThreadLink key={threadKey(thread)} thread={thread} selected={threadKey(thread) === selectedKey} />)}
    </>}
  </nav>;
}

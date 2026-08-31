import { Tray } from '@phosphor-icons/react/dist/ssr';

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-state-icon"><Tray size={20} weight="regular" aria-hidden /></div><h3 className="text-sm font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{body}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

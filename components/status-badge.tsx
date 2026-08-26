import type { TaskStatus } from '@/lib/types';

export function StatusBadge({ status }: { status: TaskStatus | 'active-project' | 'completed-project' | 'archived-project' }) {
  const label = status.replace('-project', '').replace(/^./, (value) => value.toUpperCase());
  return <span className={`status-badge status-${status.replace('-project', '')}`}>{label}</span>;
}

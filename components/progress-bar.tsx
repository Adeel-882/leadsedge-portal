import { projectProgress } from '@/lib/authorization';

export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = projectProgress(completed, total);
  return <div className="min-w-36"><div className="mb-2 flex justify-between text-xs text-muted"><span>{completed} / {total} tasks</span><span>{percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e4e9ef]"><span className="block h-full rounded-full bg-teal transition-all" style={{ width: `${percent}%` }} /></div></div>;
}

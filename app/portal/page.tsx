import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatTime } from '@/lib/format';
import { getClientProjects, getNotifications, getProjectTasks } from '@/lib/queries';

export default async function ClientHomePage() {
  const [viewer, projects, notifications] = await Promise.all([requireRole('client'), getClientProjects(), getNotifications()]);
  const primary = projects[0];
  const tasks = primary ? await getProjectTasks(primary.id, true) : [];
  const active = tasks.filter((task) => task.status === 'active');
  const completed = tasks.filter((task) => task.status === 'completed');
  return <div><section className="rounded-3xl bg-[#123b53] px-5 py-8 text-white shadow-[0_20px_45px_rgba(16,48,69,.16)] md:px-9 md:py-10"><p className="text-sm text-[#b8d8df]">Welcome back</p><h1 className="mt-2 text-3xl font-bold tracking-[-.03em] md:text-4xl">{viewer.fullName}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#d6e5e9]">Everything for {primary?.projectName || 'your project'} lives here—tasks, details, and conversations.</p>{primary && <Link className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#123b53]" href="/portal/tasks">View active tasks</Link>}</section>
    <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><PortalMetric value={active.length} label="Active tasks" tone="teal" /><PortalMetric value={completed.length} label="Completed" tone="blue" /><PortalMetric value={notifications.filter((item) => !item.readAt).length} label="Unread" tone="amber" /><PortalMetric value="—" label="Meetings soon" tone="gray" /></section>
    <div className="mt-7 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><section className="card p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Your next tasks</h2><p className="mt-1 text-sm text-muted">Open a lead to see every detail.</p></div><Link href="/portal/tasks" className="text-sm font-semibold text-teal">View all</Link></div><div className="mt-4 divide-y divide-line">{active.slice(0, 3).map((task) => <Link href={`/portal/tasks/${task.id}`} key={task.id} className="flex items-center gap-3 py-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f5f2] text-teal">✓</span><span className="min-w-0"><b className="block truncate text-sm">{task.title}</b><span className="mt-1 block text-xs text-muted">Tap to view lead details</span></span><span className="ml-auto text-muted">›</span></Link>)}{!active.length && <p className="py-8 text-center text-sm text-muted">No active tasks right now.</p>}</div></section><section className="card p-5"><h2 className="text-lg font-bold">Recent activity</h2><div className="mt-4 space-y-4">{notifications.slice(0, 4).map((item) => <div key={item.id} className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 flex-none rounded-full bg-teal" /><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted">{item.body}</p><p className="mt-1 text-[11px] text-muted">{formatTime(item.createdAt)}</p></div></div>)}</div></section></div>
  </div>;
}

function PortalMetric({ value, label, tone }: { value: number | string; label: string; tone: 'teal' | 'blue' | 'amber' | 'gray' }) { const classes = { teal: 'bg-[#e6f7f3] text-[#0a7067]', blue: 'bg-[#eaf1fb] text-[#3c5f91]', amber: 'bg-[#fff4df] text-[#8b6116]', gray: 'bg-[#eef1f4] text-[#627084]' }; return <div className={`rounded-2xl p-4 ${classes[tone]}`}><b className="text-2xl">{value}</b><p className="mt-1 text-xs font-semibold">{label}</p></div>; }

export default function ClientTasksLoading() {
  return <div aria-label="Loading leads">
    <div className="page-header"><div className="skeleton h-3 w-28" /><div className="skeleton mt-3 h-8 w-56 max-w-full" /></div>
    <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="surface-flat flex items-center gap-4 p-5"><div className="skeleton h-11 w-11 flex-none rounded-lg" /><div className="min-w-0 flex-1"><div className="skeleton h-4 w-52 max-w-full" /><div className="skeleton mt-2 h-3 w-36" /></div><div className="skeleton h-5 w-20" /></div>)}</div>
  </div>;
}

export default function MessagesLoading() {
  return <div className="page-wrap" aria-label="Loading messages">
    <div className="skeleton h-3 w-20" />
    <div className="skeleton mt-3 h-8 w-48" />
    <div className="surface-flat mt-6 overflow-hidden">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="flex items-center gap-4 border-b border-line p-4 last:border-b-0"><div className="skeleton h-9 w-9 rounded-full" /><div className="min-w-0 flex-1"><div className="skeleton h-4 w-40" /><div className="skeleton mt-2 h-3 w-64 max-w-full" /></div><div className="skeleton h-3 w-16" /></div>)}</div>
  </div>;
}

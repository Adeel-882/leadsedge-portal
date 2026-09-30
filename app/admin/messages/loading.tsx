export default function MessagesLoading() {
  return <div className="page-wrap" aria-label="Loading messages">
    <div className="skeleton h-3 w-20" />
    <div className="skeleton mt-3 h-8 w-48" />
    <div className="messages-workspace mt-5 md:grid"><div className="border-r border-line p-3">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="flex items-center gap-3 border-b border-line py-4"><div className="skeleton h-9 w-9 rounded-full" /><div className="min-w-0 flex-1"><div className="skeleton h-3 w-32" /><div className="skeleton mt-2 h-3 w-44 max-w-full" /></div></div>)}</div><div className="hidden place-content-center p-8 md:grid"><div className="skeleton h-4 w-48" /><div className="skeleton mt-4 h-16 w-72" /></div></div>
  </div>;
}

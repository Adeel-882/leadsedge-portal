export default function ClientMessagesLoading() {
  return <div aria-label="Loading messages">
    <div className="mb-5"><div className="skeleton h-3 w-28" /><div className="skeleton mt-3 h-8 w-44" /></div>
    <div className="messages-workspace md:grid"><div className="border-r border-line p-3">{[1, 2, 3, 4].map((item) => <div key={item} className="flex gap-3 border-b border-line py-4"><div className="skeleton h-9 w-9 flex-none rounded-full" /><div className="min-w-0 flex-1"><div className="skeleton h-3 w-32" /><div className="skeleton mt-2 h-3 w-44 max-w-full" /></div></div>)}</div><div className="hidden place-content-center p-8 md:grid"><div className="skeleton h-4 w-48" /><div className="skeleton mt-4 h-16 w-72" /></div></div>
  </div>;
}

export default function ClientMessagesLoading() {
  return <div aria-label="Loading messages">
    <div className="mb-7"><div className="skeleton h-3 w-28" /><div className="skeleton mt-3 h-8 w-44" /></div>
    <div className="surface-flat p-5"><div className="space-y-4">{[1, 2, 3, 4].map((item) => <div key={item} className="flex gap-3"><div className="skeleton h-8 w-8 flex-none rounded-full" /><div className="skeleton h-12 w-2/3" /></div>)}</div></div>
  </div>;
}

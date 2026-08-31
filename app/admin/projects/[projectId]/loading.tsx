export default function ProjectLoading() {
  return <div className="page-wrap" aria-label="Loading project">
    <div className="skeleton h-3 w-28" />
    <div className="skeleton mt-3 h-8 w-72 max-w-full" />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] mt-6">
      <div className="surface-flat overflow-hidden"><div className="grid sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="border-b border-line p-5 sm:border-b-0 sm:border-r"><div className="skeleton h-3 w-24" /><div className="skeleton mt-4 h-7 w-20" /></div>)}</div></div>
      <div className="surface-flat p-5"><div className="skeleton h-3 w-24" /><div className="skeleton mt-3 h-5 w-40" /><div className="skeleton mt-2 h-4 w-48 max-w-full" /></div>
    </div>
    <div className="surface-flat mt-4 overflow-hidden">{[1, 2, 3, 4].map((item) => <div key={item} className="flex items-center gap-4 border-b border-line p-4 last:border-b-0"><div className="skeleton h-4 w-56 max-w-full" /><div className="skeleton ml-auto h-5 w-20" /></div>)}</div>
  </div>;
}

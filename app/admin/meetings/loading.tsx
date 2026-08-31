export default function MeetingsLoading() {
  return <div className="page-wrap" aria-label="Loading meetings">
    <div className="skeleton h-3 w-20" />
    <div className="skeleton mt-3 h-8 w-44" />
    <div className="metric-strip metric-strip-3 mt-6">{[1, 2, 3].map((item) => <div key={item} className="metric-item"><div className="skeleton h-3 w-20" /><div className="skeleton mt-3 h-7 w-10" /></div>)}</div>
    <div className="surface-flat mt-4 overflow-hidden">{[1, 2, 3].map((item) => <div key={item} className="flex items-center gap-4 border-b border-line p-4 last:border-b-0"><div className="skeleton h-4 w-52 max-w-full" /><div className="skeleton ml-auto h-4 w-28" /></div>)}</div>
  </div>;
}

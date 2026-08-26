export default function AdminLoading() {
  return <div className="page-wrap animate-pulse"><div className="h-3 w-24 rounded bg-[#dfe5eb]" /><div className="mt-4 h-9 w-56 rounded bg-[#dfe5eb]" /><div className="mt-8 grid gap-4 md:grid-cols-3">{[1,2,3].map((item) => <div key={item} className="h-28 rounded-2xl bg-[#e7ebf0]" />)}</div><div className="mt-5 h-80 rounded-2xl bg-[#e7ebf0]" /></div>;
}

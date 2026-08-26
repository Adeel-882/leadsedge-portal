export default function PortalLoading() {
  return <div className="animate-pulse"><div className="h-40 rounded-3xl bg-[#dfe5eb]" /><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-24 rounded-2xl bg-[#e7ebf0]" />)}</div><div className="mt-6 h-72 rounded-2xl bg-[#e7ebf0]" /></div>;
}

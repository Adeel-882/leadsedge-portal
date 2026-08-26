export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[#ced7e2] bg-white p-10 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#edf7f5] text-xl text-teal">◇</div><h3 className="font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

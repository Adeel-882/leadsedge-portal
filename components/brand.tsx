import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return <Link href={href} className="flex items-center gap-3" aria-label="Leadsedge Portal home"><span className="brand-mark">L</span><span><span className="block font-bold tracking-[-.02em] text-ink">Leadsedge</span><span className="block text-[10px] font-bold uppercase tracking-[.2em] text-muted">Portal</span></span></Link>;
}

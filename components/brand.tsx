import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return <Link href={href} className="brand-link" aria-label="Leadsedge Portal home"><span className="brand-mark">LE</span><span className="min-w-0"><span className="brand-wordmark">Leadsedge</span><span className="brand-subtitle">Portal</span></span></Link>;
}

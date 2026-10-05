import Image from 'next/image';
import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return <Link prefetch={false} href={href} className="brand-link" aria-label="Leadsedge Portal home"><span className="brand-mark"><Image src="/brand/leadsedge.jpg" width={34} height={34} alt="" /></span><span className="min-w-0"><span className="brand-wordmark">Leadsedge</span><span className="brand-subtitle">Portal</span></span></Link>;
}

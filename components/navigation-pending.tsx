'use client';
import { useLinkStatus } from 'next/link';

/** Router-owned pending state: never substitutes for destination authorization. */
export function NavigationPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span role="status" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-brand" data-navigation-pending><span className="sr-only">Loading page…</span></span>;
}

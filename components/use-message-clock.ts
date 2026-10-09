'use client';
import { useSyncExternalStore } from 'react';

function snapshot() {
  const now = new Date();
  return `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
function subscribe(change: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const refresh = () => {
    change();
    clearTimeout(timer);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
  };
  refresh();
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
}
const serverSnapshot = () => null;

/** SSR and initial hydration omit local dates; the browser then supplies its timezone. */
export function useMessageClock() { return useSyncExternalStore(subscribe, snapshot, serverSnapshot); }

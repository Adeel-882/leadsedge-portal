import { safeInternalPath } from './auth-flow';

/** Historical meeting notifications remain readable but no longer open booking UI. */
export function clientNotificationDestination(value: string) {
  const path = safeInternalPath(value, '/portal');
  const pathname = new URL(path, 'https://portal.invalid').pathname;
  return pathname === '/portal/meetings' || pathname.startsWith('/portal/meetings/') ? '/portal' : path;
}

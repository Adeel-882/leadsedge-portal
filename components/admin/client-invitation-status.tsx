import { clientInvitationStatus } from '@/lib/client-invitation-status';
import { getClientInvitationOverview, type InvitationOverview } from '@/lib/client-invitation-query';
import { formatDate } from '@/lib/format';

const labels = { signed_in: 'Signed In Successfully', awaiting: 'Awaiting Sign-In', expired: 'Invitation Expired', failed: 'Invitation Delivery Failed', unavailable: 'Delivery status unavailable' };
const tones = { signed_in: 'bg-success-soft text-success', awaiting: 'bg-warning-soft text-warning', expired: 'bg-danger-soft text-danger', failed: 'bg-danger-soft text-danger', unavailable: 'bg-surface-subtle text-muted' };
const date = (value: string) => formatDate(value, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export function ClientInvitationStatusView({ overview }: { overview: InvitationOverview }) {
  const { attempt, legacy, lastLogin, unavailable } = overview;
  // A later untracked send (e.g. an old app during rollout) must not display an older success as its own.
  const newerLegacy = legacy && attempt && legacy.id !== attempt.email_delivery_id && Date.parse(legacy.created_at) > Date.parse(attempt.created_at);
  const tracked = attempt && !newerLegacy ? attempt : null;
  const status = tracked ? clientInvitationStatus(tracked) : null;
  return <div className="mt-2 space-y-2 text-xs leading-5" aria-live="polite">
    {tracked && status ? <>
      <span className={`status-badge ${tones[status]}`}>{labels[status]}</span>
      {tracked.sent_at && <p className="text-muted">Invitation Sent: <time dateTime={tracked.sent_at}>{date(tracked.sent_at)}</time></p>}
      {tracked.signed_in_at ? <p className="text-muted">Signed In: <time dateTime={tracked.signed_in_at}>{date(tracked.signed_in_at)}</time></p>
        : tracked.delivery_status === 'sent' && <p className="text-muted">Expected expiry: <time dateTime={tracked.expires_at}>{date(tracked.expires_at)}</time></p>}
      {status === 'awaiting' && <p className="text-muted">Accepted by the email provider; sign-in not yet confirmed. A newer link may invalidate this one before its expected expiry.</p>}
      {status === 'unavailable' && <p className="text-muted">Delivery could not be confirmed. Check email history before resending.</p>}
    </> : legacy ? <><span className={`status-badge ${legacy.status === 'failed' ? tones.failed : tones.unavailable}`}>{legacy.status === 'failed' ? labels.failed : 'Invitation Sent — Sign-In Not Tracked'}</span><p className="text-muted">Recorded: <time dateTime={legacy.created_at}>{date(legacy.created_at)}</time></p></> : <p className="text-muted">{unavailable ? 'Invitation status is temporarily unavailable.' : 'No invitation history available.'}</p>}
    {unavailable && legacy && <p className="text-muted">Detailed sign-in tracking is temporarily unavailable.</p>}
    {lastLogin && <p className="border-t border-line pt-2 text-muted">Last Login (any link): <time dateTime={lastLogin}>{date(lastLogin)}</time></p>}
  </div>;
}

export async function ClientInvitationStatus({ projectId, clientId }: { projectId: string; clientId: string }) {
  return <ClientInvitationStatusView overview={await getClientInvitationOverview(projectId, clientId)} />;
}

'use client';
import Link from 'next/link';
import { InviteButton } from './invite-button';
import type { ProjectCreationResult } from '@/lib/project-creation';

export function ProjectCreatedNotice({ result }: { result: ProjectCreationResult }) {
  return <section role="status" className="mb-4 rounded-lg border border-line bg-surface p-5">
    <h2 className="text-base font-bold text-success">Project was created</h2>
    <p className="mt-2 break-words font-semibold">{result.projectName}</p>
    <p className="mt-1 break-all text-xs text-muted">Project ID: {result.projectId}</p>
    <p className="mt-3 text-sm">{result.invitationStatus === 'not_sent' ? 'The invitation was NOT sent.' : result.invitationStatus === 'sent' ? 'The invitation was accepted by the email provider.' : result.invitationStatus === 'not_requested' ? 'The existing client remains linked. No new invitation was requested.' : 'Invitation delivery is not yet confirmed. Check this project before resending.'}</p>
    {result.warning && <p className="mt-2 text-sm text-warning">{result.warning}</p>}
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"><Link prefetch={false} className="button-primary" href={`/admin/projects/${result.projectId}`}>Open project</Link>
      {result.invitationStatus !== 'sent' && result.invitationStatus !== 'pending' && <div><InviteButton projectId={result.projectId} /></div>}
    </div>
  </section>;
}

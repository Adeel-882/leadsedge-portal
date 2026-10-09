import { z } from 'zod';

export const administratorInvitationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();
export const administratorInvitationActionSchema = z.object({ action: z.enum(['resend', 'revoke']) }).strict();
export const invitationIdSchema = z.string().uuid();

export function administratorInvitationDestination(id: string) {
  return `/admin?admin_invitation=${invitationIdSchema.parse(id)}`;
}
export function administratorInvitationId(next: string | null | undefined): string | null {
  const match = next?.match(/^\/admin\?admin_invitation=([0-9a-f-]+)$/i);
  const result = invitationIdSchema.safeParse(match?.[1]);
  return result.success ? result.data : null;
}

export type AdministratorEntry = { id: string; fullName: string; email: string; status: 'Active' | 'Pending' | 'Expired'; addedAt: string; invitedBy: string | null; deliveryFailed?: boolean };
export type AdministratorsResponse = { administrators: AdministratorEntry[]; invitations: AdministratorEntry[]; available: boolean; error?: string };

export type ProjectCreationResult = {
  projectId: string;
  projectName: string;
  invitationStatus: 'sent' | 'not_sent' | 'unknown' | 'not_requested' | 'pending';
  warning?: string;
};

/** A committed identity always takes priority over a delivery warning. */
export function committedProjectResult(value: unknown): ProjectCreationResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<ProjectCreationResult>;
  if (typeof result.projectId !== 'string' || !/^[0-9a-f-]{36}$/i.test(result.projectId)) return null;
  const statuses = ['sent', 'not_sent', 'unknown', 'not_requested', 'pending'];
  return { projectId: result.projectId, projectName: result.projectName || 'Created project',
    invitationStatus: statuses.includes(result.invitationStatus || '') ? result.invitationStatus! : 'unknown',
    ...(typeof result.warning === 'string' ? { warning: result.warning } : {}) };
}

import { cache } from 'react';
import { isDemoMode } from './env';
import { createSupabaseServerClient } from './supabase/server';
import type { Role, Viewer } from './types';

export type PortalBootstrap = {
  viewer: Viewer;
  authorization: { disabled: false };
  shell: { primaryProjectId: string | null; projectName: string | null };
  unread: { messages: number; notifications: number };
};

type BootstrapPayload = {
  viewer?: { id?: unknown; role?: unknown; displayName?: unknown };
  authorization?: { disabled?: unknown };
  shell?: { primaryProjectId?: unknown; projectName?: unknown };
  unread?: { messages?: unknown; notifications?: unknown };
};

function parseBootstrap(value: unknown): PortalBootstrap | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as BootstrapPayload;
  const id = payload.viewer?.id;
  const role = payload.viewer?.role;
  const displayName = payload.viewer?.displayName;
  if (typeof id !== 'string' || (role !== 'admin' && role !== 'client') || typeof displayName !== 'string') return null;
  if (payload.authorization?.disabled !== false) return null;
  const primaryProjectId = payload.shell?.primaryProjectId;
  const projectName = payload.shell?.projectName;
  if (primaryProjectId !== null && typeof primaryProjectId !== 'string') return null;
  if (projectName !== null && typeof projectName !== 'string') return null;
  return {
    viewer: { id, role: role as Role, fullName: displayName, email: '', avatarUrl: null },
    authorization: { disabled: false },
    shell: { primaryProjectId, projectName },
    unread: {
      messages: Math.max(0, Number(payload.unread?.messages || 0)),
      notifications: Math.max(0, Number(payload.unread?.notifications || 0)),
    },
  };
}

// Prepared for the reviewed migration gate. This is intentionally not wired
// into authentication or layouts until the RPC has been explicitly approved,
// applied, and verified against an isolated/local database or the live target.
export const getPortalBootstrap = cache(async (): Promise<PortalBootstrap | null> => {
  if (isDemoMode()) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_portal_bootstrap');
  if (error) throw new Error('Unable to load the authenticated portal bootstrap.');
  return parseBootstrap(data);
});

export const bootstrapInternals = { parseBootstrap };

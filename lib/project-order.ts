/**
 * The single definition of which project a client is "in" by default.
 *
 * This mirrors `get_portal_bootstrap()`, whose membership lateral orders by
 * `is_primary desc, created_at` and takes the first row. The portal used to
 * disagree with that RPC — `getClientProjects()` ordered by `created_at desc`,
 * so the shell considered the oldest primary project current while
 * /portal/messages rendered the newest one. A client whose conversation lived
 * in the primary project saw an unread badge over an empty page.
 *
 * Keep the two in step: changing the order here means changing the RPC too.
 */
export type ClientProjectOrdering = {
  isPrimary: boolean;
  createdAt: string;
};

export function compareClientProjects(a: ClientProjectOrdering, b: ClientProjectOrdering) {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}

export function orderClientProjects<T extends ClientProjectOrdering>(projects: T[]): T[] {
  return [...projects].sort(compareClientProjects);
}

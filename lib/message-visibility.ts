/** Retain conversation existence without exposing soft-deleted content. */
export async function visibleActivity<T extends { body: string; created_at: string; deleted_at?: string | null; sender?: unknown }>(
  rows: T[], key: (row: T) => string, fetchRemaining: (ids: string[], offset: number) => Promise<T[]>, pageSize: number,
): Promise<T[]> {
  const latest = new Map<string, T>();
  const empty = new Map<string, T>();
  for (const row of rows) {
    if (!empty.has(key(row))) empty.set(key(row), {...row, body: '', created_at: '', sender: null});
    if (!row.deleted_at && !latest.has(key(row))) latest.set(key(row), row);
  }
  const missing = [...empty.keys()].filter(id => !latest.has(id));
  // Only deletion-heavy samples need this fallback. Batch resource IDs, not N+1
  // individual conversation reads. Fetch visible rows only, under the same RLS.
  if (missing.length) {
    for (let offset = 0; ; offset += pageSize) {
      const page = await fetchRemaining(missing, offset);
      for (const row of page) if (!row.deleted_at && !latest.has(key(row))) latest.set(key(row), row);
      if (missing.every(id => latest.has(id)) || page.length < pageSize) break;
    }
  }
  return [...empty].map(([id, fallback]) => latest.get(id) || fallback);
}

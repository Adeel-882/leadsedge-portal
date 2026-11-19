/** Stable across retries/reloads; persist a hash and UUID, never client details. */
export async function projectCreationRequestKey(body: string, storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const name = `leadsedge:project-create:${hash}`;
  const existing = storage.getItem(name);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const key = crypto.randomUUID();
  storage.setItem(name, key);
  return key;
}

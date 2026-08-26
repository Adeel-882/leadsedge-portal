export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function hasServiceRoleEnv() {
  return Boolean(hasSupabaseEnv() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isDemoMode() {
  return process.env.LEADSEDGE_DEMO_MODE !== 'false' && !hasSupabaseEnv();
}

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

export function hasSupabaseEnv() {
  return hasValue(process.env.NEXT_PUBLIC_SUPABASE_URL) && hasValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function hasServiceRoleEnv() {
  return hasSupabaseEnv() && hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasEmailEnv() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  return Boolean(apiKey && fromEmail && apiKey !== 're_your_key' && !fromEmail.includes('your-domain.com'));
}

export function hasGoogleCalendarEnv() {
  return hasValue(process.env.GOOGLE_CLIENT_ID)
    && hasValue(process.env.GOOGLE_CLIENT_SECRET)
    && hasValue(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY);
}

export function hasAutomationSecret() {
  return hasValue(process.env.CRON_SECRET);
}

export function allowMinuteFeedbackDelays() {
  return process.env.LEADSEDGE_ENABLE_MINUTE_FEEDBACK_DELAYS?.trim().toLowerCase() === 'true';
}

/** Demo data is an explicit opt-in. Missing backend configuration must fail closed. */
export function isDemoMode() {
  return process.env.LEADSEDGE_DEMO_MODE?.trim().toLowerCase() === 'true';
}

export function getServerEnvironmentStatus() {
  const missingSupabaseVariables = [
    ['NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
  ].filter(([, value]) => !hasValue(value)).map(([name]) => name);

  const missingEmailVariables = [
    ['RESEND_API_KEY', process.env.RESEND_API_KEY],
    ['RESEND_FROM_EMAIL', process.env.RESEND_FROM_EMAIL],
  ].filter(([, value]) => !hasValue(value)).map(([name]) => name);

  return {
    demoMode: isDemoMode(),
    supabaseConfigured: missingSupabaseVariables.length === 0,
    emailConfigured: hasEmailEnv(),
    googleCalendarConfigured: hasGoogleCalendarEnv(),
    automationSecretConfigured: hasAutomationSecret(),
    missingSupabaseVariables,
    missingEmailVariables,
  };
}

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

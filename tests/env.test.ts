import { afterEach, describe, expect, it } from 'vitest';
import { getServerEnvironmentStatus, isDemoMode } from '@/lib/env';

const original = { ...process.env };

afterEach(() => {
  for (const key of ['LEADSEDGE_DEMO_MODE', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL']) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('environment mode selection', () => {
  it('enables demo records only for an explicit true flag', () => {
    for (const value of [undefined, '', 'false', 'FALSE', '0']) {
      if (value === undefined) delete process.env.LEADSEDGE_DEMO_MODE;
      else process.env.LEADSEDGE_DEMO_MODE = value;
      expect(isDemoMode()).toBe(false);
    }
    process.env.LEADSEDGE_DEMO_MODE = ' true ';
    expect(isDemoMode()).toBe(true);
  });

  it('keeps email configuration independent from Supabase', () => {
    process.env.LEADSEDGE_DEMO_MODE = 'false';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    expect(getServerEnvironmentStatus()).toMatchObject({ demoMode: false, supabaseConfigured: true, emailConfigured: false });
  });
});

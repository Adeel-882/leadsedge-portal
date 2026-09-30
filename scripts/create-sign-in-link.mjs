// Creates one local sign-in link for the Frankfurt staging project, bypassing
// email entirely. Use it while the built-in Supabase mailer still sends its own
// direct verification URL (see docs/authentication-root-cause-and-fix.md).
//
//   npm run signin:frankfurt -- adeelahmed@broadigo.com
//   npm run signin:frankfurt -- eliters8820@gmail.com
//
// The link is written to work/sign-in-link.txt (gitignored, owner-only) instead
// of being printed, so a one-time token never lands in a terminal transcript.
//
// This helper deliberately does NOT use properties.action_link. That link points
// at Supabase's own /auth/v1/verify, which consumes the token server-side and
// then redirects back with a PKCE authorization code (or an implicit-flow URL
// fragment). A PKCE code can only be exchanged by the browser holding the code
// verifier cookie, and a terminal cannot create one -- so an action_link is
// unusable as a hand-carried demo link. The hashed token is used directly
// instead, which needs no verifier and keeps the scanner-resistant Continue step.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Types the /auth/confirm route accepts, keyed by what generateLink reports. */
const otpTypeForVerificationType = {
  magiclink: 'magiclink',
  invite: 'invite',
  signup: 'email',
};

/**
 * Builds the local confirmation URL from a generateLink response.
 *
 * Exported so tests can prove the shape without contacting Supabase. The OTP
 * type always comes from the response's verification_type; hard-coding `email`
 * or `magiclink` would silently mismatch the token source.
 */
export function buildDemoSignInUrl({ properties, role, origin }) {
  const tokenHash = properties?.hashed_token;
  if (typeof tokenHash !== 'string' || !tokenHash) {
    throw new Error('Supabase did not return a hashed_token for this identity.');
  }

  const type = otpTypeForVerificationType[properties.verification_type];
  if (!type) {
    throw new Error(`Unsupported verification_type "${properties.verification_type}" for the portal confirmation route.`);
  }

  const next = role === 'admin' ? '/admin' : '/portal';
  const url = new URL('/auth/confirm', origin);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  url.searchParams.set('next', next);
  return { url: url.toString(), type, next };
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');

  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run signin:frankfurt -- <email>');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase configuration. Run this through npm run signin:frankfurt so --env-file=.env.frankfurt.local applies.');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: profile, error: profileError } = await admin.from('users').select('id,role').eq('email', email).maybeSingle();
  if (profileError) throw profileError;
  if (!profile || (profile.role !== 'admin' && profile.role !== 'client')) {
    console.error(`No admin or client profile is linked to ${email} in this project.`);
    process.exit(1);
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties?.hashed_token) {
    console.error('Supabase could not generate a link:', error?.code || 'no hashed_token returned');
    process.exit(1);
  }

  const { url, type, next } = buildDemoSignInUrl({ properties: data.properties, role: profile.role, origin });

  const outputDirectory = 'work';
  fs.mkdirSync(outputDirectory, { recursive: true });
  const destination = path.join(outputDirectory, 'sign-in-link.txt');
  fs.writeFileSync(destination, `${url}\n`, { encoding: 'utf8', mode: 0o600 });

  console.log(`Project        : ${supabaseUrl.replace('https://', '').split('.')[0]}`);
  console.log(`Identity       : ${email} (${profile.role})`);
  console.log(`Token type     : ${data.properties.verification_type} -> verifyOtp type "${type}"`);
  console.log(`Landing page   : ${origin}${next}`);
  console.log(`Link written to: ${destination}`);
  console.log('\nOpen that URL in your browser, then click "Continue to portal".');
  console.log('It needs no PKCE verifier, so it works from a freshly opened browser.');
  console.log('It is single use: generating another link invalidates this one.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}

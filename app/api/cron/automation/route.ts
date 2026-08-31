import { NextResponse } from 'next/server';
import { processAutomationWork } from '@/lib/automation';
import { hasAutomationSecret } from '@/lib/env';

async function run(request: Request) {
  if (!hasAutomationSecret()) return NextResponse.json({ error: 'Automation endpoint is not configured.' }, { status: 503 });
  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await processAutomationWork()) });
}
export const GET = run;
export const POST = run;

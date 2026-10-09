import type { NextRequest } from 'next/server';
import { resolveRequestOrigin } from './request-origin';

export function isAdministratorMutation(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return false;
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (origin && origin !== 'null') return origin === resolveRequestOrigin(request as NextRequest) && (!site || site === 'same-origin');
  return site === 'same-origin';
}

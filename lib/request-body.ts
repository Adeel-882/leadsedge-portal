export const MAX_FEEDBACK_BODY_BYTES = 512 * 1024;

export class RequestBodyError extends Error {
  constructor(public readonly status: 400 | 413) {
    super(status === 413 ? 'Your response is too large. Please shorten it and try again.' : 'The form response is invalid.');
  }
}

/** Count streamed bytes as well as checking Content-Length; never trust the header alone. */
export async function readLimitedJson(request: Request, maximum = MAX_FEEDBACK_BODY_BYTES): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maximum) {
    await request.body?.cancel();
    throw new RequestBodyError(413);
  }
  if (!request.body) throw new RequestBodyError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new RequestBodyError(413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400);
  } finally {
    reader.releaseLock();
  }
}

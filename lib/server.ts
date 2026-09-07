import { authorizationError } from './auth.ts';
export const getKey = () => process.env.OPENROUTER_API_KEY;
export const jsonError = (message: string, status: number) =>
  Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
export async function requestError(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return jsonError('This request must come from Videogram.', 403);
  if (!request.headers.get('content-type')?.includes('application/json'))
    return jsonError('Send a JSON request.', 415);
  const auth = await authorizationError(request);
  return auth ? jsonError(auth.message, auth.status) : null;
}
export async function readInput(request: Request, maxBytes = 16000) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('The request is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('The request is too long.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('The request could not be read.');
  }
}

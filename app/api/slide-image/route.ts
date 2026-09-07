import { getKey, jsonError, readInput, requestError } from '@/lib/server';
import {
  GenerationError,
  providerFailure,
  requestOpenRouter,
} from '@/lib/openrouter';
import {
  decodeSlideImage,
  imageRequest,
  validateImageInput,
} from '@/lib/slide-images';
export async function POST(request: Request) {
  const error = await requestError(request);
  if (error) return error;
  let input;
  try {
    input = validateImageInput(await readInput(request));
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
  const key = getKey();
  if (!key)
    return jsonError('Connect OpenRouter to generate slide images.', 503);
  try {
    const response = await requestOpenRouter(
      'images',
      imageRequest(input),
      key,
      request.signal,
    );
    if (!response.ok) throw providerFailure(response.status);
    const result = (await response.json()) as { error?: { code?: number } };
    if (result.error) throw providerFailure(result.error.code || 502);
    const { bytes, type, cost } = decodeSlideImage(result);
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        ...(cost !== undefined ? { 'X-Generation-Cost': String(cost) } : {}),
      },
    });
  } catch (e) {
    return jsonError(
      e instanceof GenerationError
        ? e.message
        : 'This slide image could not be completed. Retry this slide to keep the rest of your lesson.',
      e instanceof GenerationError ? e.status : 502,
    );
  }
}

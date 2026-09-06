import { validateSpeech } from '@/lib/validation';
import { getKey, jsonError, requestError, readInput } from '@/lib/server';
import {
  GenerationError,
  providerFailure,
  requestOpenRouter,
  speechRequest,
} from '@/lib/openrouter';
export async function POST(request: Request) {
  const error = requestError(request);
  if (error) return error;
  let input;
  try {
    input = validateSpeech(await readInput(request));
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
  const key = getKey();
  if (!key)
    return jsonError(
      'An OpenRouter API connection is needed to voice new or edited narration. The original example includes a ready-to-play demo voice.',
      503,
    );
  if (!request.headers.get('oai-authenticated-user-id'))
    return jsonError('Sign in to Videogram to use the AI connection.', 401);
  try {
    const response = await requestOpenRouter(
      'audio/speech',
      speechRequest(input),
      key,
      request.signal,
    );
    if (!response.ok) throw providerFailure(response.status);
    // Do not pass a JSON provider error to the player as if it were MP3 audio.
    if (
      !response.headers.get('content-type')?.includes('audio/mpeg') ||
      !response.body
    )
      throw new GenerationError(
        'OpenRouter did not return playable narration. Please try again.',
      );
    return new Response(response.body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return jsonError(
      e instanceof GenerationError
        ? e.message
        : 'The voiceover could not be completed. Please try again.',
      e instanceof GenerationError ? e.status : 502,
    );
  }
}

import { validateGeneration } from '@/lib/validation';
import { getKey, jsonError, requestError, readInput } from '@/lib/server';
import {
  GenerationError,
  lessonRequest,
  parseLessonResponse,
  providerFailure,
  requestOpenRouter,
} from '@/lib/openrouter';
export async function POST(request: Request) {
  const error = requestError(request);
  if (error) return error;
  let input;
  try {
    input = validateGeneration(await readInput(request));
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
  const key = getKey();
  if (!key)
    return jsonError(
      'AI generation is not connected yet. You can explore, play, and export the example lesson. Connect an OpenRouter API key to create answers to new questions.',
      503,
    );
  if (!request.headers.get('oai-authenticated-user-id'))
    return jsonError('Sign in to Videogram to use the AI connection.', 401);
  try {
    const response = await requestOpenRouter(
      'chat/completions',
      lessonRequest(input),
      key,
      request.signal,
    );
    if (!response.ok) throw providerFailure(response.status);
    return Response.json(
      parseLessonResponse(await response.json(), input.count),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return jsonError(
      e instanceof GenerationError
        ? e.message
        : 'The lesson could not be completed. Please try again.',
      e instanceof GenerationError ? e.status : 502,
    );
  }
}

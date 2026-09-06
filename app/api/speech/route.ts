import { validateSpeech } from '@/lib/validation';
import {
  getKey,
  jsonError,
  requestError,
  readInput,
  openAI,
  providerError,
} from '@/lib/server';
export async function POST(request: Request) {
  const error = requestError(request);
  if (error) return error;
  let input;
  try {
    input = validateSpeech(await readInput(request));
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
  if (!getKey())
    return jsonError(
      'An OpenAI API connection is needed to voice new or edited narration. The original example includes a ready-to-play demo voice.',
      503,
    );
  if (!request.headers.get('oai-authenticated-user-id'))
    return jsonError('Sign in to Videogram to use the AI connection.', 401);
  try {
    const response = await openAI(
      'audio/speech',
      {
        model: 'gpt-4o-mini-tts',
        voice: input.voice,
        input: input.text,
        instructions:
          'Speak as a warm, thoughtful educator. Use clear pronunciation, natural emphasis, and a measured conversational pace.',
        response_format: 'mp3',
        speed: 1,
      },
      request.signal,
    );
    if (!response.ok) return providerError(response.status);
    return new Response(response.body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch {
    return jsonError(
      'The voiceover could not be completed. Please try again.',
      502,
    );
  }
}

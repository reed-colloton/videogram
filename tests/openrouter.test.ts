import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demo } from '../lib/deck.ts';
import { DEFAULT_VOICE, VOICE_OPTIONS } from '../lib/voices.ts';
import {
  GenerationError,
  lessonRequest,
  parseLessonResponse,
  providerFailure,
  requestOpenRouter,
  speechRequest,
} from '../lib/openrouter.ts';
const plannedDemo = {
  ...demo,
  slides: demo.slides.map((slide) => ({
    ...slide,
    visualBrief: 'An accurate diagram explaining the three key ideas.',
  })),
};
const validResponse = () => ({
  choices: [
    {
      finish_reason: 'stop',
      message: { content: JSON.stringify(plannedDemo) },
    },
  ],
});
test('OpenRouter lesson request uses strict chat schema and compatible routing', () => {
  const request = lessonRequest({
    question: 'Why is the sky blue?',
    count: 2,
    audience: 'kids',
  });
  assert.equal(request.model, 'google/gemini-3.8-flash');
  assert.deepEqual(request.reasoning, { effort: 'high', exclude: true });
  assert.equal(request.messages[1].content, 'Why is the sky blue?');
  assert.match(request.messages[0].content, /children ages 8 to 12/);
  assert.equal(request.provider.require_parameters, true);
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(
    request.response_format.json_schema.schema.properties.slides.maxItems,
    2,
  );
});
test('speech maps both UI voices to the selected speech model and MP3', () => {
  for (const voice of VOICE_OPTIONS) {
    const request = speechRequest({ text: ' Hello ', voice: voice.value });
    assert.equal(request.model, voice.model);
    assert.equal(request.voice, voice.value);
    assert.equal(request.input, 'Hello');
    assert.equal(request.response_format, 'mp3');
  }
  assert.throws(() => speechRequest({ text: 'Hello', voice: 'marin' }));
  assert.equal(DEFAULT_VOICE, VOICE_OPTIONS[0].value);
});
test('parses completed lessons and validates exact slide count', () => {
  assert.deepEqual(parseLessonResponse(validResponse(), 5), plannedDemo);
  assert.throws(
    () => parseLessonResponse(validResponse(), 2),
    /requested slides/,
  );
});
test('handles errors even in HTTP 200 bodies and rejects incomplete answers', () => {
  assert.throws(
    () => parseLessonResponse({ error: { code: 402 } }, 5),
    (e: unknown) => e instanceof GenerationError && e.status === 402,
  );
  assert.throws(
    () =>
      parseLessonResponse(
        { choices: [{ error: { code: 429 }, finish_reason: 'error' }] },
        5,
      ),
    (e: unknown) => e instanceof GenerationError && e.status === 429,
  );
  for (const finish_reason of ['length', 'content_filter', 'error', null])
    assert.throws(() =>
      parseLessonResponse(
        {
          choices: [
            {
              finish_reason,
              message: { content: JSON.stringify(plannedDemo) },
            },
          ],
        },
        5,
      ),
    );
  for (const response of [
    null,
    {},
    { choices: [] },
    {
      choices: [
        { finish_reason: 'stop', message: { content: 'invalid JSON' } },
      ],
    },
    {
      choices: [
        {
          finish_reason: 'stop',
          message: { refusal: 'I cannot answer', content: null },
        },
      ],
    },
  ])
    assert.throws(() => parseLessonResponse(response, 5));
});
test('billing and access errors remain actionable without exposing provider bodies', () => {
  assert.equal(providerFailure(402).status, 402);
  assert.match(providerFailure(402).message, /credits/);
  assert.match(providerFailure(401).message, /API key/);
  assert.equal(providerFailure(503).status, 503);
});
test('transport sends the key only to OpenRouter and preserves cancellation', async (t) => {
  let seenUrl = '';
  let seen: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    seenUrl = url;
    seen = init;
    return new Response('{}', { status: 200 });
  });
  const controller = new AbortController();
  await requestOpenRouter(
    'chat/completions',
    { model: 'test' },
    'test-secret',
    controller.signal,
  );
  assert.equal(seenUrl, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(
    new Headers(seen!.headers).get('Authorization'),
    'Bearer test-secret',
  );
  assert.equal(seen!.body, '{"model":"test"}');
  controller.abort();
  assert.equal(seen!.signal!.aborted, true);
});

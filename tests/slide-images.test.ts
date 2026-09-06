import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demo } from '../lib/deck.ts';
import { validateDeck } from '../lib/validation.ts';
import {
  decodeSlideImage,
  imageRequest,
  validateImageInput,
  visibleSlideChanged,
} from '../lib/slide-images.ts';
import { generateSlideImages, loadSlideImage } from '../lib/image-loading.ts';
const input = {
  title: demo.title,
  slide: {
    ...demo.slides[0],
    visualBrief: 'A packet moving between connected network nodes.',
  },
  index: 0,
  count: 5,
};
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('requests exact GPT Image 2 with a finished 16:9 slide and medium quality', () => {
  const request = imageRequest(input);
  assert.equal(request.model, 'openai/gpt-image-2');
  assert.equal(request.aspect_ratio, '16:9');
  assert.equal(request.quality, 'medium');
  assert.equal(request.n, 1);
  assert.match(request.prompt, /packet moving/);
  assert.ok(request.prompt.includes(demo.slides[0].body));
});
test('bounds slide requests and strips external image URLs from model output', () => {
  for (const bad of [
    null,
    { ...input, index: -1 },
    { ...input, index: 5 },
    { ...input, count: 11 },
    { ...input, slide: { ...input.slide, visualBrief: 'x'.repeat(901) } },
  ])
    assert.throws(() => validateImageInput(bad));
  const clean = validateDeck(
    {
      ...demo,
      slides: demo.slides.map((s) => ({
        ...s,
        imageUrl: 'https://untrusted.example/track',
      })),
    },
    5,
  );
  assert.ok(clean.slides.every((s) => !s.imageUrl));
});
test('decodes genuine image bytes and rejects unsupported or malformed payloads', () => {
  const result = decodeSlideImage({
    data: [{ b64_json: png }],
    usage: { cost: 0.04 },
  });
  assert.equal(result.type, 'image/png');
  assert.equal(result.cost, 0.04);
  assert.equal(result.bytes[0], 137);
  for (const value of [
    {},
    null,
    { data: [{ b64_json: 'not base64!' }] },
    { data: [{ b64_json: btoa('<svg>invalid</svg>') }] },
    { data: [{ url: 'https://untrusted.example' }] },
  ])
    assert.throws(() => decodeSlideImage(value));
});
test('only visible edits invalidate an already generated slide', () => {
  const slide = { ...input.slide, imageUrl: 'blob:existing' };
  assert.equal(
    visibleSlideChanged(slide, { ...slide, narration: 'A new voiceover.' }),
    false,
  );
  assert.equal(
    visibleSlideChanged(slide, { ...slide, title: 'A changed title' }),
    true,
  );
  assert.equal(
    visibleSlideChanged(slide, { ...slide, points: ['new', 'set', 'here'] }),
    true,
  );
});
test('image loading refuses external images that could taint export', async () => {
  await assert.rejects(
    loadSlideImage('https://example.com/a.png'),
    /local generated asset/,
  );
});
test('image generation caps concurrency, keeps successes, and retries only missing slides', async (t) => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      if (value) queueMicrotask(() => this.onload?.());
    }
  }
  Object.defineProperty(globalThis, 'Image', {
    value: FakeImage,
    configurable: true,
  });
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'Image');
  });
  let inFlight = 0,
    maxInFlight = 0,
    failOnce = true;
  const calls: number[] = [];
  const urls: string[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      calls.push(body.index);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (body.index === 1 && failOnce) {
        failOnce = false;
        return Response.json({ error: 'Try again' }, { status: 502 });
      }
      return new Response(
        new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
        { headers: { 'Content-Type': 'image/png' } },
      );
    },
  );
  const deck = structuredClone(demo);
  const receive = (index: number, url: string) => {
    urls.push(url);
    deck.slides[index].imageUrl = url;
  };
  const failures = await generateSlideImages(
    deck,
    new AbortController().signal,
    receive,
    () => {},
  );
  assert.equal(maxInFlight, 2);
  assert.deepEqual(
    failures.map((f) => f.index),
    [1],
  );
  assert.equal(deck.slides.filter((s) => s.imageUrl).length, 4);
  calls.length = 0;
  assert.deepEqual(
    await generateSlideImages(
      deck,
      new AbortController().signal,
      receive,
      () => {},
    ),
    [],
  );
  assert.deepEqual(calls, [1]);
  urls.forEach((url) => URL.revokeObjectURL(url));
});
test('cancelled generation does not submit new image requests', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    generateSlideImages(
      demo,
      controller.signal,
      () => {},
      () => {},
    ),
    { name: 'AbortError' },
  );
});

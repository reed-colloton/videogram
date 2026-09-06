import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGeneration,
  validateSpeech,
  validateDeck,
  lessonSchema,
} from '../lib/validation.ts';
import { demo } from '../lib/deck.ts';
test('generation accepts 2–10 slides and trims the question', () => {
  for (let count = 2; count <= 10; count++)
    assert.deepEqual(
      validateGeneration({
        question: '  Why do we dream?  ',
        count,
        audience: 'curious',
      }),
      { question: 'Why do we dream?', count, audience: 'curious' },
    );
});
test('generation rejects malformed and oversized requests', () => {
  for (const input of [
    null,
    {},
    { question: 'hi', count: 5, audience: 'kids' },
    { question: 'Valid question', count: 1, audience: 'kids' },
    { question: 'Valid question', count: 11, audience: 'kids' },
    { question: 'Valid question', count: 2.5, audience: 'kids' },
    { question: 'Valid question', count: '5', audience: 'kids' },
    { question: 'Valid question', count: 5, audience: 'anything' },
    { question: 'x'.repeat(1501), count: 5, audience: 'kids' },
  ])
    assert.throws(() => validateGeneration(input));
});
test('speech enforces input limits and voice allowlist', () => {
  assert.deepEqual(validateSpeech({ text: ' Hello ', voice: 'marin' }), {
    text: 'Hello',
    voice: 'marin',
  });
  for (const input of [
    null,
    { text: '', voice: 'marin' },
    { text: 'x'.repeat(1801), voice: 'marin' },
    { text: 'hello', voice: 'untrusted' },
  ])
    assert.throws(() => validateSpeech(input));
});
test('validates output count and malformed model output', () => {
  assert.equal(validateDeck(demo, 5), demo);
  assert.throws(() => validateDeck(demo, 4));
  const bad = structuredClone(demo);
  bad.slides[0].points = ['one'];
  assert.throws(() => validateDeck(bad, 5));
  const long = structuredClone(demo);
  long.slides[0].narration = 'x'.repeat(1801);
  assert.throws(() => validateDeck(long, 5));
});
test('schema enforces requested count and forbids extra fields', () => {
  const schema = lessonSchema(7);
  assert.equal(schema.properties.slides.minItems, 7);
  assert.equal(schema.properties.slides.maxItems, 7);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.slides.items.additionalProperties, false);
});

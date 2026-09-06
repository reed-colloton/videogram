import type { Deck, Slide } from './deck';
import { VOICE_OPTIONS } from './voices.ts';
export const VOICES = VOICE_OPTIONS.map((voice) => voice.value);
export const AUDIENCES = ['curious', 'kids', 'advanced'] as const;
export function validateGeneration(input: unknown) {
  if (!input || typeof input !== 'object')
    throw new Error('Please enter a question.');
  const { question, count, audience } = input as Record<string, unknown>;
  if (
    typeof question !== 'string' ||
    question.trim().length < 5 ||
    question.length > 1500
  )
    throw new Error('Enter a question between 5 and 1,500 characters.');
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 10
  )
    throw new Error('Choose between 2 and 10 slides.');
  if (
    typeof audience !== 'string' ||
    !AUDIENCES.includes(audience as (typeof AUDIENCES)[number])
  )
    throw new Error('Choose an audience.');
  return { question: question.trim(), count, audience };
}
export function validateSpeech(input: unknown) {
  if (!input || typeof input !== 'object')
    throw new Error('Narration is required.');
  const { text, voice } = input as Record<string, unknown>;
  if (typeof text !== 'string' || !text.trim() || text.length > 1800)
    throw new Error('Narration must contain 1–1,800 characters.');
  if (
    typeof voice !== 'string' ||
    !VOICES.includes(voice as (typeof VOICES)[number])
  )
    throw new Error('Choose a supported voice.');
  return { text: text.trim(), voice };
}
export function validateDeck(input: unknown, count: number): Deck {
  if (!input || typeof input !== 'object')
    throw new Error('The lesson was incomplete. Please try again.');
  const value = input as Record<string, unknown>;
  if (
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 100 ||
    !Array.isArray(value.slides) ||
    value.slides.length !== count
  )
    throw new Error(
      'The lesson did not contain the requested slides. Please try again.',
    );
  for (const s of value.slides as Slide[]) {
    if (
      !s ||
      typeof s.title !== 'string' ||
      !s.title.trim() ||
      s.title.length > 75 ||
      typeof s.eyebrow !== 'string' ||
      s.eyebrow.length > 40 ||
      typeof s.body !== 'string' ||
      s.body.length > 150 ||
      typeof s.narration !== 'string' ||
      !s.narration.trim() ||
      s.narration.length > 1800 ||
      !Array.isArray(s.points) ||
      s.points.length !== 3 ||
      s.points.some((p) => typeof p !== 'string' || !p.trim() || p.length > 35)
    )
      throw new Error('One slide needs another pass. Please try again.');
  }
  return value as Deck;
}
export function lessonSchema(count: number) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'slides'],
    properties: {
      title: { type: 'string', maxLength: 100 },
      slides: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'eyebrow', 'body', 'points', 'narration'],
          properties: {
            title: { type: 'string', maxLength: 75 },
            eyebrow: { type: 'string', maxLength: 40 },
            body: { type: 'string', maxLength: 150 },
            points: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: { type: 'string', maxLength: 35 },
            },
            narration: { type: 'string', maxLength: 1800 },
          },
        },
      },
    },
  };
}

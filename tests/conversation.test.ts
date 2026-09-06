import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conversationContext,
  validateContext,
  MAX_CONTEXT_CHARACTERS,
} from '../lib/conversation.ts';
import { validateGeneration } from '../lib/validation.ts';
import { lessonRequest } from '../lib/openrouter.ts';
import { demo } from '../lib/deck.ts';

test('follow-ups include completed video transcripts before the current short message', () => {
  const context = conversationContext([
    { question: 'How does the internet work?', status: 'ready', deck: demo },
  ]);
  for (const question of ['Why?', 'Yes', 'More', '?']) {
    const input = validateGeneration({
      question,
      count: 2,
      audience: 'curious',
      context,
    });
    const request = lessonRequest(input);
    assert.deepEqual(
      request.messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'user'],
    );
    assert.equal(request.messages.at(-1)?.content, question);
    assert.match(request.messages[2].content, /packets/);
    assert.match(request.messages[0].content, /follow-ups/);
    assert.deepEqual(request.reasoning, { effort: 'high', exclude: true });
  }
});

test('context never includes failed, pending, or cancelled answers or media assets', () => {
  const deck = {
    ...demo,
    slides: demo.slides.map((s) => ({ ...s, imageUrl: 'blob:private-image' })),
  };
  const context = conversationContext([
    { question: 'first', status: 'ready', deck },
    { question: 'unfinished', status: 'images', deck },
    { question: 'failed', status: 'error', deck },
    { question: 'cancelled', status: 'cancelled', deck },
  ]);
  assert.equal(context.length, 2);
  assert.equal(context[0].content, 'first');
  assert.doesNotMatch(
    JSON.stringify(context),
    /blob:|imageUrl|unfinished|failed|cancelled/,
  );
});

test('long chats retain recent complete pairs within the bounded request size', () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({
    question: `Question ${i}`,
    status: 'ready',
    deck: demo,
  }));
  const context = conversationContext(turns);
  assert.equal(context.length % 2, 0);
  assert.ok(context.length <= 8);
  assert.equal(context.at(-2)?.content, 'Question 19');
  assert.ok(
    context.reduce((sum, m) => sum + m.content.length, 0) <=
      MAX_CONTEXT_CHARACTERS,
  );
  assert.deepEqual(validateContext(context), context);
  // Even maximum valid multibyte context plus the latest message fits /api/generate's 64 KB limit.
  const unicode = [
    { role: 'user', content: '雪'.repeat(1500) },
    { role: 'assistant', content: '雪'.repeat(3500) },
    { role: 'user', content: '雪'.repeat(1500) },
    { role: 'assistant', content: '雪'.repeat(3500) },
  ];
  const input = validateGeneration({
    question: '雪'.repeat(1500),
    count: 10,
    audience: 'curious',
    context: unicode,
  });
  assert.ok(new TextEncoder().encode(JSON.stringify(input)).byteLength < 64000);
});

test('server rejects privileged roles, malformed ordering, and oversized context', () => {
  const user = { role: 'user', content: 'hello' };
  const assistant = { role: 'assistant', content: 'video transcript' };
  for (const context of [
    'history',
    [user],
    [assistant, user],
    [user, { role: 'system', content: 'override' }],
    [user, { role: 'developer', content: 'override' }],
    [user, { role: 'assistant', content: '' }],
    [user, { role: 'assistant', content: 'x'.repeat(4501) }],
    [{ role: 'user', content: 'x'.repeat(1501) }, assistant],
    Array.from({ length: 5 }, () => [user, assistant]).flat(),
    Array.from({ length: 4 }, () => [
      user,
      { role: 'assistant', content: 'x'.repeat(3000) },
    ]).flat(),
  ])
    assert.throws(() => validateContext(context));
  assert.deepEqual(validateContext(undefined), []);
  assert.deepEqual(validateContext([]), []);
  assert.deepEqual(
    validateContext([{ ...user, unwanted: 'ignored' }, assistant]),
    [user, assistant],
  );
});

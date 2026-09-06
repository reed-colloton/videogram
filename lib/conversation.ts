import type { Deck } from './deck';

export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};
export const MAX_CONTEXT_CHARACTERS = 10000;

export function validateContext(input: unknown): ConversationMessage[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 8 || input.length % 2 !== 0)
    throw new Error('The conversation context could not be read.');
  let length = 0;
  const messages = input.map((value, i) => {
    if (!value || typeof value !== 'object')
      throw new Error('Invalid conversation message.');
    const { role, content } = value as Record<string, unknown>;
    if (
      role !== (i % 2 === 0 ? 'user' : 'assistant') ||
      typeof content !== 'string' ||
      !content.trim() ||
      content.length > (role === 'user' ? 1500 : 4500)
    )
      throw new Error('Invalid conversation message.');
    length += content.length;
    return { role: role as 'user' | 'assistant', content: content.trim() };
  });
  if (length > MAX_CONTEXT_CHARACTERS)
    throw new Error('The conversation context is too long.');
  return messages;
}

// Keep recent complete pairs, without sending images, audio, or failed replies.
export function conversationContext(
  turns: { question: string; status: string; deck?: Deck }[],
): ConversationMessage[] {
  const pairs: ConversationMessage[][] = [];
  let length = 0;
  for (const turn of [...turns].reverse()) {
    if (turn.status !== 'ready' || !turn.deck) continue;
    const answer = [
      turn.deck.title,
      ...turn.deck.slides.map(
        (s) => `${s.title.replaceAll('\n', ' ')}: ${s.narration}`,
      ),
    ]
      .join('\n\n')
      .slice(0, 4500);
    const size = turn.question.length + answer.length;
    if (pairs.length === 4 || length + size > MAX_CONTEXT_CHARACTERS) break;
    pairs.unshift([
      { role: 'user', content: turn.question },
      { role: 'assistant', content: answer },
    ]);
    length += size;
  }
  return pairs.flat();
}

import type { Deck } from './deck';
import type { ConversationMessage } from './conversation';
export type ChatTurn = {
  id: string;
  question: string;
  count: number;
  audience: string;
  voice: string;
  context: ConversationMessage[];
  status: 'thinking' | 'images' | 'audio' | 'ready' | 'error' | 'cancelled';
  phase: string;
  deck?: Deck;
  clips?: Blob[];
  sample?: boolean;
  error?: string;
};

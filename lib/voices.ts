export const SPEECH_MODEL = 'minimax/speech-2.8-hd';
export const VOICE_OPTIONS = [
  { value: 'English_expressive_narrator', label: 'Narrator' },
  { value: 'English_CaptivatingStoryteller', label: 'Storyteller' },
] as const;
export const DEFAULT_VOICE = VOICE_OPTIONS[0].value;

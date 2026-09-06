export const VOICE_OPTIONS = [
  {
    value: 'longanlingxin',
    label: 'Warm · Qwen',
    model: 'qwen/qwen-audio-3.0-tts-plus',
  },
  {
    value: 'longanlufeng',
    label: 'Bright · Qwen',
    model: 'qwen/qwen-audio-3.0-tts-plus',
  },
  {
    value: 'English_expressive_narrator',
    label: 'Narrator · MiniMax',
    model: 'minimax/speech-2.8-hd',
  },
  {
    value: 'English_CaptivatingStoryteller',
    label: 'Storyteller · MiniMax',
    model: 'minimax/speech-2.8-hd',
  },
] as const;
export const DEFAULT_VOICE = VOICE_OPTIONS[0].value;
export function speechModel(voice: string) {
  const choice = VOICE_OPTIONS.find((option) => option.value === voice);
  if (!choice) throw new Error('Choose a supported voice.');
  return choice.model;
}

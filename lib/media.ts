import type { Deck } from './deck';
import { demo } from './deck';
import { drawSlide } from './render';
const audioCache = new Map<string, Blob>();
export async function getNarration(
  deck: Deck,
  voice: string,
  sample: boolean,
  signal: AbortSignal,
  progress?: (i: number) => void,
) {
  const clips: Blob[] = [];
  for (let i = 0; i < deck.slides.length; i++) {
    signal.throwIfAborted();
    const narration = deck.slides[i].narration;
    const isOriginal = sample && narration === demo.slides[i]?.narration;
    const key = `${isOriginal ? 'demo' : voice}:${narration}`;
    let blob = audioCache.get(key);
    if (!blob) {
      const response = await fetch(
        isOriginal ? `/demo/slide-${i + 1}.mp3` : '/api/speech',
        isOriginal
          ? { signal }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: narration, voice }),
              signal,
            },
      );
      if (!response.ok) {
        const error = (await response
          .json()
          .catch(() => ({ error: 'The narration could not be loaded.' }))) as {
          error?: string;
        };
        throw new Error(error.error || 'The narration could not be loaded.');
      }
      blob = await response.blob();
      audioCache.set(key, blob);
      if (audioCache.size > 50)
        audioCache.delete(audioCache.keys().next().value!);
    }
    clips.push(blob);
    progress?.(i + 1);
  }
  return clips;
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export const filename = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'videogram';
export function recordingType() {
  if (typeof MediaRecorder === 'undefined')
    throw new Error(
      'Video export needs a browser with MediaRecorder support, such as current Chrome, Edge, or Safari.',
    );
  return [
    'video/mp4;codecs=avc1.64003E,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find((t) => MediaRecorder.isTypeSupported(t));
}
export async function exportVideo(
  deck: Deck,
  clips: Blob[],
  context: AudioContext,
  signal: AbortSignal,
  progress: (percent: number, index: number) => void,
): Promise<Blob> {
  if (!HTMLCanvasElement.prototype.captureStream)
    throw new Error(
      'This browser cannot export canvas video. Try Chrome or Edge.',
    );
  const type = recordingType();
  const buffers = await Promise.all(
    clips.map(async (clip) =>
      context.decodeAudioData(await clip.arrayBuffer()),
    ),
  );
  signal.throwIfAborted();
  if (document.hidden)
    throw new Error(
      'Keep Videogram visible while exporting. Return to this tab and try again.',
    );
  const canvas = document.createElement('canvas');
  drawSlide(canvas, deck.slides[0], 0, deck.slides.length);
  const dest = context.createMediaStreamDestination();
  const video = canvas.captureStream(30);
  const stream = new MediaStream([
    ...video.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  const sources: AudioBufferSourceNode[] = [];
  let raf = 0;
  let recorder: MediaRecorder | undefined;
  try {
    recorder = new MediaRecorder(stream, {
      ...(type ? { mimeType: type } : {}),
      videoBitsPerSecond: 4000000,
      audioBitsPerSecond: 128000,
    });
    const recording = recorder;
    return await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      let finished = false;
      let current = -1;
      const offsets: number[] = [];
      let duration = 0.15;
      buffers.forEach((b) => {
        offsets.push(duration);
        duration += b.duration + 0.25;
      });
      const start = context.currentTime;
      const cleanup = () => {
        cancelAnimationFrame(raf);
        signal.removeEventListener('abort', abort);
        document.removeEventListener('visibilitychange', visibility);
      };
      const fail = (error: Error) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (recording.state !== 'inactive') recording.stop();
        reject(error);
      };
      const abort = () =>
        fail(new DOMException('Export cancelled.', 'AbortError'));
      const visibility = () => {
        if (document.hidden)
          fail(
            new Error(
              'Export paused because this tab was hidden. Keep Videogram visible and export again.',
            ),
          );
      };
      signal.addEventListener('abort', abort, { once: true });
      document.addEventListener('visibilitychange', visibility);
      recording.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recording.onerror = () =>
        fail(
          new Error(
            'The browser could not finish recording. Try a shorter lesson.',
          ),
        );
      recording.onstop = () => {
        if (finished) return;
        finished = true;
        cleanup();
        if (chunks.length)
          resolve(new Blob(chunks, { type: recording.mimeType }));
        else reject(new Error('The recording was empty. Please try again.'));
      };
      recording.start(1000);
      buffers.forEach((buffer, i) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(dest);
        source.start(start + offsets[i]);
        sources.push(source);
      });
      const tick = () => {
        if (finished) return;
        const elapsed = context.currentTime - start;
        let i = offsets.findLastIndex((t) => elapsed >= t);
        i = Math.max(0, i);
        if (i !== current) {
          current = i;
          drawSlide(canvas, deck.slides[i], i, deck.slides.length);
        }
        progress(Math.min(100, Math.round((elapsed / duration) * 100)), i);
        if (elapsed >= duration) {
          recording.stop();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    });
  } finally {
    cancelAnimationFrame(raf);
    for (const source of sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    for (const track of stream.getTracks()) track.stop();
    dest.disconnect();
    if (recorder?.state === 'recording') recorder.stop();
  }
}

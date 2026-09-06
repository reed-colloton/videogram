import type { Deck, Slide } from './deck';
// Blob URLs are produced by this app from its authenticated image endpoint.
export function loadSlideImage(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  if (!url.startsWith('blob:'))
    return Promise.reject(
      new Error('The slide image is not a local generated asset.'),
    );
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      image.src = '';
      reject(new DOMException('Cancelled.', 'AbortError'));
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(
        new Error(
          'A slide image could not be loaded. Regenerate that slide and try again.',
        ),
      );
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    image.src = url;
  });
}
export async function requestSlideImage(
  deck: Deck,
  index: number,
  signal: AbortSignal,
) {
  const { imageUrl: _previous, ...slide } = deck.slides[index];
  const response = await fetch('/api/slide-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: deck.title,
      slide,
      index,
      count: deck.slides.length,
    }),
    signal,
  });
  if (!response.ok) {
    const result = (await response
      .json()
      .catch(() => ({ error: 'The slide image could not be generated.' }))) as {
      error?: string;
    };
    throw new Error(result.error || 'The slide image could not be generated.');
  }
  if (!response.headers.get('content-type')?.startsWith('image/'))
    throw new Error('No slide image was returned.');
  const url = URL.createObjectURL(await response.blob());
  try {
    await loadSlideImage(url, signal);
    return url;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
export async function generateSlideImages(
  deck: Deck,
  signal: AbortSignal,
  onImage: (index: number, url: string) => void,
  onProgress: (done: number) => void,
) {
  let cursor = 0,
    done = 0;
  const failures: { index: number; message: string }[] = [];
  const worker = async () => {
    while (cursor < deck.slides.length) {
      signal.throwIfAborted();
      const index = cursor++;
      if (deck.slides[index].imageUrl) {
        done++;
        onProgress(done);
        continue;
      }
      try {
        const url = await requestSlideImage(deck, index, signal);
        onImage(index, url);
      } catch (e) {
        if (signal.aborted) throw e;
        failures.push({
          index,
          message: e instanceof Error ? e.message : 'Image generation failed.',
        });
      }
      done++;
      onProgress(done);
    }
  };
  // Limit paid requests and memory use; successful slides survive later failures.
  const results = await Promise.allSettled([worker(), worker()]);
  signal.throwIfAborted();
  const rejected = results.find((r) => r.status === 'rejected');
  if (rejected?.status === 'rejected') throw rejected.reason;
  return failures;
}
export const hasMissingImages = (slides: Slide[]) =>
  slides.some((s) => !s.imageUrl);

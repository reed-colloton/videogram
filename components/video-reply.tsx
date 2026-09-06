'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  LoaderCircle,
  Maximize,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { type Slide, estimatedDuration, formatTime } from '@/lib/deck';
import { drawSlide } from '@/lib/render';
import { download, exportVideo, filename } from '@/lib/media';
import { loadSlideImage } from '@/lib/image-loading';
import type { ChatTurn } from '@/lib/chat';

function SlideView({
  slide,
  index,
  count,
}: {
  slide: Slide;
  index: number;
  count: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!slide.imageUrl && canvas.current)
      drawSlide(canvas.current, slide, index, count);
  }, [slide, index, count]);
  return slide.imageUrl ? (
    <img
      className="slide-image"
      src={slide.imageUrl}
      alt={`${slide.title}. ${slide.body}. ${slide.points.join('. ')}`}
    />
  ) : (
    <canvas
      ref={canvas}
      width={1280}
      height={720}
      className="slide-image"
      role="img"
      aria-label={`${slide.title}. ${slide.body}. ${slide.points.join('. ')}`}
    />
  );
}

export function VideoReply({
  turn,
  locked,
  playingId,
  onPlaying,
  onExporting,
  onRetry,
  onCancel,
  onEdit,
}: {
  turn: ChatTurn;
  locked: boolean;
  playingId: string | null;
  onPlaying: (id: string | null) => void;
  onExporting: (active: boolean) => void;
  onRetry: () => void;
  onCancel: () => void;
  onEdit: (index: number, slide: Slide, redesign?: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [position, setPosition] = useState(0);
  const [active, setActive] = useState(0);
  const [durations, setDurations] = useState<number[]>([]);
  const [measured, setMeasured] = useState(false);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<{
    blob: Blob;
    url: string;
    name: string;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Slide | null>(null);
  const [editError, setEditError] = useState('');
  const playback = useRef<{
    context: AudioContext;
    sources: AudioBufferSourceNode[];
    controller: AbortController;
    frame: number;
  } | null>(null);
  const renderController = useRef<AbortController | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const nativeVideo = useRef<HTMLVideoElement>(null);
  const ready = turn.status === 'ready' && Boolean(turn.deck && turn.clips);
  const pending = ['thinking', 'images', 'audio'].includes(turn.status);
  const total = durations.reduce((sum, n) => sum + n, 0);
  const stop = useCallback(() => {
    const current = playback.current;
    playback.current = null;
    if (current) {
      current.controller.abort();
      cancelAnimationFrame(current.frame);
      for (const source of current.sources) {
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
      void current.context.close().catch(() => {});
    }
    nativeVideo.current?.pause();
    setPlaying(false);
    setPreparing(false);
  }, []);
  useEffect(() => {
    stop();
    setPosition(0);
    setActive(0);
    setVideo(null);
    setMeasured(false);
    setDurations(turn.deck?.slides.map(estimatedDuration) || []);
    return () => {
      stop();
      renderController.current?.abort();
    };
  }, [turn.deck, turn.clips, stop]);
  useEffect(() => {
    if (playingId !== turn.id) stop();
  }, [playingId, turn.id, stop]);
  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );
  function seek(value: number) {
    stop();
    setPosition(value);
    let sum = 0;
    const index = durations.findIndex((d) => {
      sum += d;
      return value < sum;
    });
    setActive(index < 0 ? Math.max(0, durations.length - 1) : index);
  }
  async function play() {
    if (playing || preparing) {
      stop();
      return;
    }
    if (!ready || locked || !turn.deck || !turn.clips) return;
    stop();
    onPlaying(turn.id);
    setError('');
    setPreparing(true);
    const controller = new AbortController();
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch {
      setError('Audio playback is unavailable in this browser.');
      setPreparing(false);
      return;
    }
    const session = {
      context,
      controller,
      sources: [] as AudioBufferSourceNode[],
      frame: 0,
    };
    playback.current = session;
    try {
      await context.resume();
      const [buffers] = await Promise.all([
        Promise.all(
          turn.clips.map(async (clip) =>
            context.decodeAudioData(await clip.arrayBuffer()),
          ),
        ),
        Promise.all(
          turn.deck.slides.map((slide) =>
            slide.imageUrl
              ? loadSlideImage(slide.imageUrl, controller.signal)
              : Promise.resolve(),
          ),
        ),
      ]);
      controller.signal.throwIfAborted();
      const lengths = buffers.map((b) => b.duration);
      const duration = lengths.reduce((sum, n) => sum + n, 0);
      const oldStart = durations
        .slice(0, active)
        .reduce((sum, n) => sum + n, 0);
      let from =
        lengths.slice(0, active).reduce((sum, n) => sum + n, 0) +
        Math.max(0, position - oldStart);
      if (from >= duration - 0.1) from = 0;
      setDurations(lengths);
      setMeasured(true);
      const start = context.currentTime;
      let offset = 0;
      for (const buffer of buffers) {
        if (offset + buffer.duration > from) {
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          source.start(
            start + Math.max(0, offset - from),
            Math.max(0, from - offset),
          );
          session.sources.push(source);
        }
        offset += buffer.duration;
      }
      setPreparing(false);
      setPlaying(true);
      const tick = () => {
        if (controller.signal.aborted) return;
        const elapsed = Math.min(duration, from + context.currentTime - start);
        setPosition(elapsed);
        let sum = 0;
        const index = lengths.findIndex((d) => {
          sum += d;
          return elapsed < sum;
        });
        setActive(index < 0 ? lengths.length - 1 : index);
        if (elapsed >= duration) {
          stop();
          return;
        }
        session.frame = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'This video could not play.');
      if (playback.current === session) stop();
    }
  }
  async function saveVideo() {
    if (video) {
      download(video.blob, video.name);
      return;
    }
    if (
      !turn.deck ||
      !turn.clips ||
      !ready ||
      locked ||
      renderController.current
    )
      return;
    stop();
    onPlaying(null);
    onExporting(true);
    setError('');
    setRendering(true);
    setProgress(0);
    const controller = new AbortController();
    renderController.current = controller;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      await context.resume();
      const blob = await exportVideo(
        turn.deck,
        turn.clips,
        context,
        controller.signal,
        (p) => setProgress(p),
        (lengths) => {
          setDurations(lengths);
          setMeasured(true);
        },
      );
      controller.signal.throwIfAborted();
      const name = `${filename(turn.deck.title)}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      setVideo({ blob, url: URL.createObjectURL(blob), name });
      download(blob, name);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : 'The download could not be prepared.',
        );
    } finally {
      await context?.close().catch(() => {});
      renderController.current = null;
      setRendering(false);
      onExporting(false);
    }
  }
  if (!ready)
    return (
      <div
        className={`reply-pending ${pending ? '' : 'reply-failed'}`}
        role="status"
        aria-live="polite"
      >
        <div className="pending-visual">
          {pending ? (
            <>
              <span />
              <span />
              <span />
              <span />
              <span />
            </>
          ) : (
            <RotateCcw size={25} />
          )}
        </div>
        <div>
          <strong>
            {pending
              ? 'Making your video reply'
              : turn.status === 'cancelled'
                ? 'Response stopped'
                : 'Your video hit a snag'}
          </strong>
          <p>{pending ? turn.phase : turn.error}</p>
          {!pending && turn.deck && (
            <p className="saved-progress">
              The work completed so far is saved here.
            </p>
          )}
          {pending ? (
            <button className="text-button" onClick={onCancel}>
              Stop response
            </button>
          ) : (
            <button
              className="text-button retry-button"
              disabled={locked}
              onClick={onRetry}
            >
              <RotateCcw size={14} />
              {turn.deck ? 'Continue video' : 'Try again'}
            </button>
          )}
        </div>
      </div>
    );
  const deck = turn.deck!;
  const slide = deck.slides[active] || deck.slides[0];
  function applyEdit(redesign = false) {
    if (!draft) return;
    try {
      onEdit(active, draft, redesign);
      setEditError('');
      setEditOpen(false);
    } catch (e) {
      setEditError(
        e instanceof Error ? e.message : 'Check the slide before saving.',
      );
    }
  }
  return (
    <div className="video-reply">
      <div className="reply-video" ref={frame}>
        {video ? (
          <video
            ref={nativeVideo}
            src={video.url}
            controls
            playsInline
            preload="metadata"
            aria-label={deck.title}
            onPlay={() => onPlaying(turn.id)}
          />
        ) : (
          <>
            <div className="video-picture">
              <SlideView
                slide={slide}
                index={active}
                count={deck.slides.length}
              />
              {!playing && (
                <button
                  className="video-play-overlay"
                  onClick={() => void play()}
                  disabled={locked}
                  aria-label={
                    preparing
                      ? 'Cancel loading playback'
                      : `Play video: ${deck.title}`
                  }
                >
                  {preparing ? (
                    <LoaderCircle size={26} className="spinning" />
                  ) : (
                    <Play size={26} fill="currentColor" />
                  )}
                  <span>
                    {preparing
                      ? 'Loading…'
                      : position > 0 && position < total - 0.1
                        ? 'Resume'
                        : 'Watch answer'}
                  </span>
                </button>
              )}
            </div>
            <div className="video-controls">
              <button
                className="player-button"
                onClick={() => void play()}
                disabled={locked}
                aria-label={playing ? 'Pause video' : 'Play video'}
              >
                {playing ? (
                  <Pause size={17} fill="currentColor" />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
              </button>
              <span className="video-time">
                {formatTime(position)} / {!measured && '≈'}
                {formatTime(total)}
              </span>
              <input
                type="range"
                className="video-scrubber"
                min={0}
                max={Math.max(total, 1)}
                step={0.1}
                value={position}
                onChange={(e) => seek(Number(e.target.value))}
                disabled={locked}
                aria-label="Seek video"
                aria-valuetext={`${formatTime(position)} of ${formatTime(total)}`}
              />
              <Volume2
                size={17}
                className="volume-icon"
                aria-label="Narrated video"
              />
              <button
                className="player-button"
                aria-label="Fullscreen video"
                onClick={() => {
                  if (document.fullscreenElement)
                    void document.exitFullscreen().catch(() => {});
                  else
                    void frame.current
                      ?.requestFullscreen?.()
                      .catch(() =>
                        setError('Fullscreen is unavailable in this browser.'),
                      );
                }}
              >
                <Maximize size={17} />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="reply-caption">
        <h2>{deck.title}</h2>
        <span>
          {deck.slides.length} slides ·{' '}
          {turn.sample ? 'Example narration' : 'AI narration'}
        </span>
      </div>
      <div className="reply-actions">
        <details className="transcript">
          <summary>
            <FileText size={15} />
            Transcript
            <ChevronDown size={13} />
          </summary>
          <div className="transcript-content">
            {deck.slides.map((s, i) => (
              <section key={i}>
                <button
                  className="transcript-chapter"
                  onClick={() => {
                    const time = durations
                      .slice(0, i)
                      .reduce((sum, n) => sum + n, 0);
                    if (nativeVideo.current)
                      nativeVideo.current.currentTime = 0.15 + time + i * 0.25;
                    else seek(time);
                  }}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {s.title.replaceAll('\n', ' ')}
                </button>
                <p>{s.narration}</p>
              </section>
            ))}
            <button
              className="text-button"
              onClick={() =>
                download(
                  new Blob(
                    [
                      deck.slides
                        .map((s, i) => `${i + 1}. ${s.title}\n\n${s.narration}`)
                        .join('\n\n'),
                    ],
                    { type: 'text/plain' },
                  ),
                  `${filename(deck.title)}-transcript.txt`,
                )
              }
            >
              <Download size={14} />
              Save transcript
            </button>
          </div>
        </details>
        <button
          className="text-button"
          disabled={locked}
          onClick={() => {
            stop();
            setEditError('');
            setDraft({ ...slide, points: [...slide.points] });
            setEditOpen(true);
          }}
        >
          <Pencil size={15} />
          Edit
        </button>
        <button
          className="text-button download-video"
          disabled={locked}
          onClick={() => void saveVideo()}
        >
          <Download size={15} />
          Download
        </button>
      </div>
      {rendering && (
        <div className="download-progress" role="status">
          <div>
            <LoaderCircle size={15} className="spinning" />
            <span>Preparing download · {progress}%</span>
            <button onClick={() => renderController.current?.abort()}>
              Cancel
            </button>
          </div>
          <Progress
            value={progress}
            aria-label="Download preparation progress"
          />
          <p>
            Keep this tab visible. Preparing the file takes the video’s
            duration.
          </p>
        </div>
      )}
      {error && (
        <p className="reply-error" role="alert">
          {error}
        </p>
      )}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="edit-dialog">
          <DialogTitle>Edit this reply</DialogTitle>
          <DialogDescription>
            Change a slide or its narration, then update the video.
          </DialogDescription>
          <div className="edit-navigation">
            <button
              className="icon-button"
              disabled={active === 0}
              aria-label="Previous slide"
              onClick={() => {
                seek(
                  durations.slice(0, active - 1).reduce((sum, n) => sum + n, 0),
                );
                setDraft({
                  ...deck.slides[active - 1],
                  points: [...deck.slides[active - 1].points],
                });
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              Slide {active + 1} of {deck.slides.length}
            </span>
            <button
              className="icon-button"
              disabled={active === deck.slides.length - 1}
              aria-label="Next slide"
              onClick={() => {
                seek(
                  durations.slice(0, active + 1).reduce((sum, n) => sum + n, 0),
                );
                setDraft({
                  ...deck.slides[active + 1],
                  points: [...deck.slides[active + 1].points],
                });
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {draft && (
            <form
              className="slide-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                applyEdit();
              }}
            >
              <label>
                Title
                <input
                  required
                  maxLength={75}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Label
                <input
                  maxLength={40}
                  value={draft.eyebrow}
                  onChange={(e) =>
                    setDraft({ ...draft, eyebrow: e.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={2}
                  maxLength={150}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </label>
              <div className="point-fields">
                {draft.points.map((point, i) => (
                  <label key={i}>
                    Key idea {i + 1}
                    <input
                      required
                      maxLength={35}
                      value={point}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          points: draft.points.map((p, j) =>
                            i === j ? e.target.value : p,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                Narration
                <textarea
                  required
                  rows={4}
                  maxLength={1800}
                  value={draft.narration}
                  onChange={(e) =>
                    setDraft({ ...draft, narration: e.target.value })
                  }
                />
              </label>
              {!turn.sample && (
                <label>
                  Visual direction
                  <textarea
                    required
                    rows={3}
                    maxLength={900}
                    value={draft.visualBrief || ''}
                    onChange={(e) =>
                      setDraft({ ...draft, visualBrief: e.target.value })
                    }
                  />
                </label>
              )}
              {editError && (
                <p className="reply-error" role="alert">
                  {editError}
                </p>
              )}
              <div className="edit-footer">
                {!turn.sample && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={locked}
                    onClick={(e) => {
                      if (e.currentTarget.form?.reportValidity())
                        applyEdit(true);
                    }}
                  >
                    <RotateCcw size={14} />
                    Redesign slide
                  </button>
                )}
                <button
                  className="primary-button"
                  disabled={locked}
                  type="submit"
                >
                  Update video
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

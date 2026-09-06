'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  Pause,
  Sparkles,
  Layers,
  AudioLines,
  SlidersHorizontal,
  Download,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LoaderCircle,
  Check,
  X,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  demo,
  formatTime,
  estimatedDuration,
  type Deck,
  type Slide,
} from '@/lib/deck';
import { drawSlide } from '@/lib/render';
import { download, exportVideo, filename, getNarration } from '@/lib/media';
import { validateGeneration } from '@/lib/validation';

const demoDurations = [13.429, 14.354, 14.946, 16.521, 17.135];
type Registry = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
function Choice({
  label,
  value,
  onChange,
  items,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(v) => v && onChange(v)}
      items={items}
    >
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function SlideCanvas({
  slide,
  index,
  count,
}: {
  slide: Slide;
  index: number;
  count: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawSlide(ref.current, slide, index, count);
  }, [slide, index, count]);
  return (
    <canvas
      ref={ref}
      width={1280}
      height={720}
      className="slide-canvas"
      role="img"
      aria-label={`${slide.title}. ${slide.body}. ${slide.points.join('. ')}`}
    />
  );
}
export default function Home() {
  const [question, setQuestion] = useState('');
  const [count, setCount] = useState('5');
  const [voice, setVoice] = useState('marin');
  const [audience, setAudience] = useState('curious');
  const [deck, setDeck] = useState<Deck>(demo);
  const [sample, setSample] = useState(true);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('slides');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [help, setHelp] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [durations, setDurations] = useState(demoDurations);
  const [exportOpen, setExportOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<{
    blob: Blob;
    url: string;
    name: string;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Slide | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const raf = useRef(0);
  const offset = useRef(0);
  const aborter = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const slide = deck.slides[active];
  const total = durations.reduce((a, b) => a + b, 0);
  const locked = Boolean(busy);
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    for (const source of sources.current) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    sources.current = [];
    if (audioContext.current) {
      void audioContext.current.close().catch(() => {});
      audioContext.current = null;
    }
    setPlaying(false);
  }, []);
  const invalidateVideo = () => setVideo(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/status', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setConnected((d as { connected: boolean }).connected))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(
    () => () => {
      aborter.current?.abort();
      stop();
    },
    [stop],
  );
  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );
  function chooseSlide(index: number) {
    stop();
    setActive(index);
    offset.current = durations.slice(0, index).reduce((a, b) => a + b, 0);
    setPosition(offset.current);
  }
  const generate = useCallback(
    async (input: { question: string; count: number; audience: string }) => {
      const valid = validateGeneration(input);
      if (busyRef.current)
        throw new Error('Please wait for the current operation.');
      busyRef.current = true;
      stop();
      setError('');
      setBusy('Writing your story…');
      const controller = new AbortController();
      aborter.current = controller;
      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(valid),
          signal: controller.signal,
        });
        const result = (await response.json()) as Deck & { error?: string };
        if (!response.ok)
          throw new Error(result.error || 'The lesson could not be created.');
        const next = result as Deck;
        setDeck(next);
        setQuestion(valid.question);
        setCount(String(valid.count));
        setAudience(valid.audience);
        setActive(0);
        setPosition(0);
        offset.current = 0;
        setSample(false);
        setVideo(null);
        setDurations(next.slides.map(estimatedDuration));
        setConnected(true);
        return {
          title: next.title,
          slideCount: next.slides.length,
          status: 'slides_created',
        };
      } finally {
        busyRef.current = false;
        setBusy('');
        aborter.current = null;
      }
    },
    [stop],
  );
  const actions = useRef({ generate });
  actions.current = { generate };
  useEffect(() => {
    const registry = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (!registry) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        registry.registerTool(
          {
            name: 'create_videogram_slides',
            title: 'Create a Videogram lesson',
            description:
              'Generate and show 2–10 editable educational slides with a narration script. Voiceover and video export are separate actions in the workspace. Requires the site AI connection.',
            inputSchema: {
              type: 'object',
              properties: {
                question: { type: 'string', minLength: 5, maxLength: 1500 },
                count: { type: 'integer', minimum: 2, maximum: 10 },
                audience: {
                  type: 'string',
                  enum: ['curious', 'kids', 'advanced'],
                },
              },
              required: ['question', 'count', 'audience'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: async (input) => {
              const valid = validateGeneration(input);
              return actions.current.generate(valid);
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  function report(e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    setError(
      e instanceof Error
        ? e.message
        : 'Something went wrong. Please try again.',
    );
  }
  async function togglePlayback() {
    if (playing) {
      stop();
      return;
    }
    if (locked) return;
    setError('');
    setBusy('Preparing narration…');
    busyRef.current = true;
    const controller = new AbortController();
    aborter.current = controller;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      audioContext.current = context;
      await context.resume();
      const clips = await getNarration(
        deck,
        voice,
        sample,
        controller.signal,
        (i) => setBusy(`Preparing narration ${i} of ${deck.slides.length}…`),
      );
      const buffers = await Promise.all(
        clips.map(async (b) => context!.decodeAudioData(await b.arrayBuffer())),
      );
      controller.signal.throwIfAborted();
      const nextDurations = buffers.map((b) => b.duration);
      setDurations(nextDurations);
      const nextTotal = nextDurations.reduce((a, b) => a + b, 0);
      // Preserve slide selection when estimates are replaced by measured audio lengths.
      const oldStart = durations.slice(0, active).reduce((a, b) => a + b, 0);
      let from =
        nextDurations.slice(0, active).reduce((a, b) => a + b, 0) +
        Math.max(0, offset.current - oldStart);
      if (from >= nextTotal - 0.05) from = 0;
      offset.current = from;
      const start = context.currentTime;
      let cumulative = 0;
      buffers.forEach((buffer) => {
        const end = cumulative + buffer.duration;
        if (end > from) {
          const source = context!.createBufferSource();
          source.buffer = buffer;
          source.connect(context!.destination);
          source.start(
            start + Math.max(0, cumulative - from),
            Math.max(0, from - cumulative),
          );
          sources.current.push(source);
        }
        cumulative = end;
      });
      setPlaying(true);
      const clock = context;
      const tick = () => {
        const elapsed = Math.min(nextTotal, from + clock.currentTime - start);
        offset.current = elapsed;
        setPosition(elapsed);
        let sum = 0,
          index = 0;
        for (let i = 0; i < nextDurations.length; i++) {
          sum += nextDurations[i];
          index = i;
          if (elapsed < sum) break;
        }
        setActive(index);
        if (elapsed >= nextTotal) {
          stop();
          return;
        }
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      stop();
      report(e);
    } finally {
      setBusy('');
      busyRef.current = false;
      aborter.current = null;
    }
  }
  async function makeVideo() {
    stop();
    setError('');
    setVideo(null);
    setExportOpen(true);
    setProgress(0);
    setBusy('Preparing voiceover…');
    busyRef.current = true;
    const controller = new AbortController();
    aborter.current = controller;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      await context.resume();
      const clips = await getNarration(
        deck,
        voice,
        sample,
        controller.signal,
        (i) => setBusy(`Preparing voiceover ${i} of ${deck.slides.length}…`),
      );
      setBusy('Rendering your video…');
      const blob = await exportVideo(
        deck,
        clips,
        context,
        controller.signal,
        (p, index) => {
          setProgress(p);
          setActive(index);
        },
      );
      const name = `${filename(deck.title)}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      setVideo({ blob, url: URL.createObjectURL(blob), name });
      setProgress(100);
    } catch (e) {
      report(e);
      setExportOpen(false);
    } finally {
      if (context) await context.close().catch(() => {});
      setBusy('');
      busyRef.current = false;
      aborter.current = null;
      offset.current = 0;
      setPosition(0);
      setActive(0);
    }
  }
  function updateSlide(next: Slide) {
    stop();
    setDeck((current) => ({
      ...current,
      slides: current.slides.map((s, i) => (i === active ? next : s)),
    }));
    setVideo(null);
    if (next.narration !== slide.narration)
      setDurations((current) =>
        current.map((d, i) => (i === active ? estimatedDuration(next) : d)),
      );
    offset.current = 0;
    setPosition(0);
  }
  function resetExample() {
    stop();
    setDeck(demo);
    setSample(true);
    setActive(0);
    offset.current = 0;
    setPosition(0);
    setDurations(demoDurations);
    setVideo(null);
    setError('');
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-symbol">
            <Play fill="currentColor" size={17} />
          </span>
          videogram<span className="beta">BETA</span>
        </a>
        <div className="header-center">
          A little curiosity. A whole new perspective.
        </div>
        <button onClick={() => setHelp(true)} className="quiet-button">
          <CircleHelp size={17} /> How it works
        </button>
      </header>
      <main className="workspace">
        <aside className="creator">
          <div className="creator-heading">
            <span className="section-kicker">YOUR NEXT AHA MOMENT</span>
            <h1>
              What are you
              <br />
              curious about<span>?</span>
            </h1>
            <p>Ask a question. Get an answer you can watch.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              generate({ question, count: Number(count), audience }).catch(
                report,
              );
            }}
          >
            <div className="question-box">
              <textarea
                aria-label="Your question"
                disabled={locked}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Why do we dream? How does the internet work? What makes a great story?"
                maxLength={1500}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (!locked)
                      generate({
                        question,
                        count: Number(count),
                        audience,
                      }).catch(report);
                  }
                }}
              />
              <div className="question-bottom">
                <span>
                  <Sparkles size={14} /> Start with any question
                </span>
                <span>{question.length}/1500</span>
              </div>
            </div>
            <div className="settings-heading">
              <SlidersHorizontal size={15} />
              <h2>Make it yours</h2>
            </div>
            <div className="setting-row">
              <label>Presentation length</label>
              <Choice
                disabled={locked}
                label="Slide count"
                value={count}
                onChange={setCount}
                items={Array.from({ length: 9 }, (_, i) => ({
                  value: String(i + 2),
                  label: `${i + 2} slides`,
                }))}
              />
            </div>
            <div className="setting-row">
              <label>Narrator</label>
              <Choice
                disabled={locked}
                label="Narrator"
                value={voice}
                onChange={(v) => {
                  stop();
                  setVoice(v);
                  invalidateVideo();
                }}
                items={[
                  { value: 'marin', label: 'Marin · Warm' },
                  { value: 'cedar', label: 'Cedar · Clear' },
                ]}
              />
            </div>
            <div className="setting-row">
              <label>Explain it for</label>
              <Choice
                disabled={locked}
                label="Audience"
                value={audience}
                onChange={setAudience}
                items={[
                  { value: 'curious', label: 'Curious minds' },
                  { value: 'kids', label: 'Young learners' },
                  { value: 'advanced', label: 'Deep thinkers' },
                ]}
              />
            </div>
            <button
              disabled={locked || question.trim().length < 5}
              type="submit"
              className="primary-button create-button"
            >
              {busy.startsWith('Writing') ? (
                <LoaderCircle className="spinning" size={17} />
              ) : (
                <Sparkles size={17} />
              )}{' '}
              Create videogram <ArrowRight size={18} />
            </button>
            <p className="creation-note">
              One question. A script, slides, and a voice.
            </p>
          </form>
          {connected === false && (
            <button onClick={() => setHelp(true)} className="connection-note">
              <span className="status-dot pending" /> AI connection needed for
              new questions <ArrowUpRight size={13} />
            </button>
          )}
          <div className="try-example">
            <span className="section-kicker">NEED A SPARK?</span>
            <button
              disabled={locked}
              onClick={() => {
                setQuestion('How does the internet work?');
                resetExample();
              }}
            >
              How does the internet work?{' '}
              <span className="example-label">
                Try example <ArrowUpRight size={14} />
              </span>
            </button>
            <button
              disabled={locked}
              onClick={() => setQuestion('Why do we dream?')}
            >
              Why do we dream? <ArrowUpRight size={15} />
            </button>
            <button
              disabled={locked}
              onClick={() => setQuestion('Explain black holes to a beginner.')}
            >
              What’s inside a black hole? <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="creator-footer">
            <span className="tiny-logo">
              <Play size={11} fill="currentColor" />
            </span>{' '}
            Less scrolling. More understanding.
          </div>
        </aside>
        <section className="studio" aria-label="Video workspace">
          <div className="studio-heading">
            <div>
              <div className="section-kicker">
                THE VIDEO WORKSPACE{' '}
                {sample && <span className="sample-badge">EXAMPLE</span>}
              </div>
              <h2>{deck.title}</h2>
            </div>
            <button
              disabled={locked}
              onClick={makeVideo}
              className="outline-button"
            >
              <Download size={16} /> Export video
            </button>
          </div>
          {error && (
            <div className="error-notice" role="alert">
              <span>{error}</span>
              <button aria-label="Dismiss message" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {busy && !exportOpen && (
            <div className="busy-notice" role="status">
              <LoaderCircle className="spinning" size={16} />
              <span>{busy}</span>
              <button onClick={() => aborter.current?.abort()}>Cancel</button>
            </div>
          )}
          <div className="video-frame canvas-frame">
            <SlideCanvas
              slide={slide}
              index={active}
              count={deck.slides.length}
            />
            {!playing && !locked && (
              <button
                className="preview-play"
                onClick={togglePlayback}
                aria-label="Play narrated lesson"
              >
                <Play fill="currentColor" size={20} />
              </button>
            )}
          </div>
          <div className="playback">
            <button
              disabled={locked}
              onClick={togglePlayback}
              className="play-button"
              aria-label={playing ? 'Pause video' : 'Play video'}
            >
              {playing ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>
            <span className="time">
              {formatTime(position)} <span>/ {formatTime(total)}</span>
            </span>
            <Progress
              value={total ? (position / total) * 100 : 0}
              aria-label="Playback progress"
              className="playback-progress"
            />
            <span className="playback-meta">
              <AudioLines size={16} />
              {sample ? 'Demo voice' : 'AI narration'}
            </span>
            <button
              disabled={locked || active === 0}
              aria-label="Previous slide"
              onClick={() => chooseSlide(active - 1)}
              className="icon-button"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              disabled={locked || active === deck.slides.length - 1}
              aria-label="Next slide"
              onClick={() => chooseSlide(active + 1)}
              className="icon-button"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(String(v))}
            className="editor-tabs"
          >
            <div className="editor-top">
              <TabsList variant="line">
                <TabsTrigger value="slides">
                  <Layers /> Slides{' '}
                  <span className="tab-count">{deck.slides.length}</span>
                </TabsTrigger>
                <TabsTrigger value="script">
                  <AudioLines /> Script & voiceover
                </TabsTrigger>
              </TabsList>
              <button
                disabled={locked}
                onClick={() => {
                  stop();
                  setDraft({ ...slide, points: [...slide.points] });
                  setEditOpen(true);
                }}
                className="quiet-button edit-slide"
              >
                <Pencil size={14} /> Edit slide
              </button>
            </div>
            <TabsContent value="slides">
              <div
                className="slide-strip"
                style={{
                  gridTemplateColumns: `repeat(${deck.slides.length}, minmax(130px, 1fr))`,
                }}
              >
                {deck.slides.map((s, i) => (
                  <button
                    disabled={locked}
                    aria-label={`Select slide ${i + 1}: ${s.title}`}
                    aria-pressed={active === i}
                    key={i}
                    onClick={() => chooseSlide(i)}
                    className={`slide-thumbnail ${active === i ? 'selected' : ''}`}
                  >
                    <div className="thumbnail-canvas">
                      <SlideCanvas
                        slide={s}
                        index={i}
                        count={deck.slides.length}
                      />
                    </div>
                    <div className="thumbnail-meta">
                      <span>
                        <b>{String(i + 1).padStart(2, '0')}</b>{' '}
                        {i === 0
                          ? 'Overview'
                          : i === deck.slides.length - 1
                            ? 'Takeaway'
                            : `Chapter ${i}`}
                      </span>
                      <span>{formatTime(durations[i])}</span>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="script">
              <div className="script-editor">
                <div className="script-heading">
                  <label htmlFor="narration" className="section-kicker">
                    SLIDE {active + 1} · NARRATION
                  </label>
                  <button
                    className="quiet-button"
                    onClick={() =>
                      download(
                        new Blob(
                          [
                            deck.slides
                              .map(
                                (s, i) =>
                                  `SLIDE ${i + 1}: ${s.title}\n\n${s.narration}`,
                              )
                              .join('\n\n---\n\n'),
                          ],
                          { type: 'text/plain' },
                        ),
                        `${filename(deck.title)}-script.txt`,
                      )
                    }
                  >
                    <Download size={14} /> Download script
                  </button>
                </div>
                <textarea
                  id="narration"
                  disabled={locked || playing}
                  value={slide.narration}
                  maxLength={1800}
                  onChange={(e) =>
                    updateSlide({ ...slide, narration: e.target.value })
                  }
                />
                <div className="script-meta">
                  <span>
                    {sample
                      ? 'The example uses a recorded demo voice. Edited narration needs an AI connection.'
                      : 'Narration is AI-generated. Edits are voiced when you play or export.'}
                  </span>
                  <span>{slide.narration.length}/1800</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <div className="studio-bottom">
            <span>
              <span className="status-dot" />
              {sample
                ? 'Explore an example, then make it your own.'
                : `${deck.slides.length} slides · Ready for your voiceover`}
            </span>
            <span>
              16:9 <span className="dot-separator">·</span> 720p
            </span>
          </div>
          {sample && (
            <button
              disabled={locked}
              className="reset-example"
              onClick={resetExample}
            >
              <RotateCcw size={12} /> Reset example
            </button>
          )}
        </section>
      </main>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="help-dialog">
          <DialogTitle>From a question to a videogram.</DialogTitle>
          <DialogDescription>
            A short explanation you can watch, edit, and keep.
          </DialogDescription>
          <ol className="how-steps">
            <li>
              <span>01</span>
              <div>
                <strong>Follow your curiosity</strong>
                <p>
                  Ask a question, choose 2–10 slides, and pick your audience.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Make the answer yours</strong>
                <p>
                  Review the slides and edit the script. Choose Marin or Cedar
                  for natural AI narration.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Watch it. Take it with you.</strong>
                <p>
                  Play the lesson or export a narrated 720p video. Export runs
                  in real time; keep this tab visible. The format is MP4 or
                  WebM, depending on your browser.
                </p>
              </div>
            </li>
          </ol>
          {connected !== true && (
            <div className="setup-box">
              <strong>Try the example now</strong>
              <p>
                The five-slide internet lesson has a ready-to-play demo voice
                and can be exported. New questions and edited narration need an
                OpenAI API connection, which the site owner must configure.
              </p>
            </div>
          )}
          <p className="help-footnote">
            Generated lessons may contain mistakes. Review the script before
            sharing.
          </p>
          <button className="primary-button" onClick={() => setHelp(false)}>
            Back to the workspace <ArrowRight size={16} />
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={exportOpen}
        onOpenChange={(open) => {
          if (!open && locked) aborter.current?.abort();
          setExportOpen(open);
        }}
      >
        <DialogContent className="export-dialog">
          <DialogTitle>
            {video ? 'Your videogram is ready.' : 'Putting it all together.'}
          </DialogTitle>
          <DialogDescription>
            {video
              ? 'Your slides and voiceover, in one video.'
              : 'Keep this tab visible while we render the slides and narration.'}
          </DialogDescription>
          {video ? (
            <>
              <video src={video.url} controls className="export-player" />
              <div className="export-details">
                <span>
                  <Check size={14} />{' '}
                  {video.blob.type.includes('mp4') ? 'MP4' : 'WebM'} · 720p
                </span>
                <span>{(video.blob.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
              <button
                className="primary-button"
                onClick={() => download(video.blob, video.name)}
              >
                <Download size={16} /> Download video
              </button>
            </>
          ) : (
            <>
              <div className="export-animation">
                <AudioLines size={38} />
              </div>
              <div role="status" className="export-status">
                <span>{busy}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} aria-label="Video export progress" />
              <button
                className="outline-button cancel-export"
                onClick={() => aborter.current?.abort()}
              >
                Cancel export
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="edit-dialog">
          <DialogTitle>Edit slide {active + 1}</DialogTitle>
          <DialogDescription>
            Keep each slide focused on one idea.
          </DialogDescription>
          {draft && (
            <form
              className="slide-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                updateSlide(draft);
                setEditOpen(false);
              }}
            >
              <label>
                Eyebrow
                <input
                  required
                  maxLength={40}
                  value={draft.eyebrow}
                  onChange={(e) =>
                    setDraft({ ...draft, eyebrow: e.target.value })
                  }
                />
              </label>
              <label>
                Title
                <textarea
                  required
                  maxLength={75}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Supporting sentence
                <input
                  required
                  maxLength={150}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </label>
              <fieldset>
                <legend>Three key ideas</legend>
                {draft.points.map((p, i) => (
                  <input
                    key={i}
                    required
                    aria-label={`Key idea ${i + 1}`}
                    maxLength={35}
                    value={p}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        points: draft.points.map((v, n) =>
                          n === i ? e.target.value : v,
                        ),
                      })
                    }
                  />
                ))}
              </fieldset>
              <button className="primary-button" type="submit">
                <Check size={16} /> Save slide
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

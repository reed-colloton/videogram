'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  ChevronDown,
  CircleHelp,
  LoaderCircle,
  MessageCircle,
  Plus,
  Play,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { VideoReply } from '@/components/video-reply';
import { demo, type Deck, type Slide } from '@/lib/deck';
import { getNarration } from '@/lib/media';
import { validateDeck, validateGeneration } from '@/lib/validation';
import { conversationContext } from '@/lib/conversation';
import { DEFAULT_VOICE, VOICE_OPTIONS } from '@/lib/voices';
import { generateSlideImages } from '@/lib/image-loading';
import { visibleSlideChanged } from '@/lib/slide-images';
import type { ChatTurn } from '@/lib/chat';

function Choice({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)} items={items}>
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Home() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const turnsRef = useRef<ChatTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [count, setCount] = useState('4');
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  const [audience, setAudience] = useState('curious');
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const job = useRef<{ id: string; controller: AbortController } | null>(null);
  const exporting = useRef<string | null>(null);
  const urls = useRef(new Set<string>());
  const viewport = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const locked = Boolean(busyId || exportingId);
  const replace = useCallback((next: ChatTurn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);
  const update = useCallback((id: string, patch: Partial<ChatTurn>) => {
    const next = turnsRef.current.map((turn) =>
      turn.id === id ? { ...turn, ...patch } : turn,
    );
    turnsRef.current = next;
    setTurns(next);
  }, []);
  const release = useCallback(() => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);
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
      job.current?.controller.abort();
      release();
    },
    [release],
  );
  const scrollDown = useCallback(() => {
    const element = viewport.current;
    if (element)
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    setAtBottom(true);
  }, []);
  useEffect(() => {
    if (atBottom) {
      const frame = requestAnimationFrame(() =>
        viewport.current?.scrollTo({
          top: viewport.current.scrollHeight,
          behavior: 'smooth',
        }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [turns, atBottom]);
  useEffect(() => {
    const element = textarea.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
    }
  }, [question]);

  const runTurn = useCallback(
    async (turn: ChatTurn) => {
      if (job.current || exporting.current)
        throw new Error('Please wait for the current video.');
      const controller = new AbortController();
      job.current = { id: turn.id, controller };
      setBusyId(turn.id);
      setPlayingId(null);
      update(turn.id, {
        error: undefined,
        status: turn.deck ? 'images' : 'thinking',
        phase: 'Thinking about your question…',
      });
      try {
        let deck = turn.deck;
        if (!deck) {
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: turn.question,
              count: turn.count,
              audience: turn.audience,
              context: turn.context,
            }),
            signal: controller.signal,
          });
          const result = (await response.json()) as Deck & { error?: string };
          if (!response.ok)
            throw new Error(
              result.error || 'Your answer could not be created.',
            );
          controller.signal.throwIfAborted();
          deck = result;
          update(turn.id, { deck });
          setConnected(true);
        }
        const working: Deck = { ...deck, slides: [...deck.slides] };
        if (!turn.sample) {
          update(turn.id, { status: 'images', phase: 'Creating the visuals…' });
          const failures = await generateSlideImages(
            working,
            controller.signal,
            (index, url) => {
              if (controller.signal.aborted) {
                URL.revokeObjectURL(url);
                return;
              }
              urls.current.add(url);
              working.slides[index] = {
                ...working.slides[index],
                imageUrl: url,
              };
              update(turn.id, {
                deck: { ...working, slides: [...working.slides] },
              });
            },
            (done) =>
              update(turn.id, {
                phase: `Creating the visuals · ${done} of ${working.slides.length}`,
              }),
          );
          if (failures.length)
            throw new Error(
              `${failures.length} visual${failures.length === 1 ? '' : 's'} could not finish. ${failures[0].message}`,
            );
        }
        update(turn.id, { status: 'audio', phase: 'Adding the voice…' });
        const clips = await getNarration(
          working,
          turn.voice,
          Boolean(turn.sample),
          controller.signal,
          (done) =>
            update(turn.id, {
              phase: `Adding the voice · ${done} of ${working.slides.length}`,
            }),
        );
        controller.signal.throwIfAborted();
        update(turn.id, { deck: working, clips, status: 'ready', phase: '' });
        return {
          title: working.title,
          slideCount: working.slides.length,
          status: 'video_reply_ready',
        };
      } catch (e) {
        update(turn.id, {
          status: controller.signal.aborted ? 'cancelled' : 'error',
          phase: '',
          error: controller.signal.aborted
            ? 'Response stopped. You can continue from here.'
            : e instanceof Error
              ? e.message
              : 'Something went wrong. Please try again.',
        });
        return { status: controller.signal.aborted ? 'cancelled' : 'error' };
      } finally {
        if (job.current?.controller === controller) {
          job.current = null;
          setBusyId(null);
        }
      }
    },
    [update],
  );

  const send = useCallback(
    async (
      input: { question: string; count: number; audience: string },
      example = false,
    ) => {
      const valid = validateGeneration(input);
      if (job.current || exporting.current)
        throw new Error('Please wait for the current video.');
      const turn: ChatTurn = {
        id: crypto.randomUUID(),
        ...valid,
        voice,
        context: conversationContext(turnsRef.current),
        status: 'thinking',
        phase: 'Thinking about your question…',
        ...(example ? { deck: demo, sample: true, count: 5 } : {}),
      };
      replace([...turnsRef.current, turn]);
      setQuestion('');
      setError('');
      setAtBottom(true);
      return runTurn(turn);
    },
    [voice, replace, runTurn],
  );
  const actions = useRef({ send });
  actions.current = { send };
  useEffect(() => {
    type Registry = {
      registerTool: (
        tool: object,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const registry = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (!registry) return;
    const controller = new AbortController();
    try {
      void Promise.resolve(
        registry.registerTool(
          {
            name: 'ask_videogram',
            title: 'Ask Videogram',
            description:
              'Send a message in the current conversation and wait for a narrated video reply. Earlier completed replies provide context for follow-up questions. Requires the site AI connection.',
            inputSchema: {
              type: 'object',
              properties: {
                question: { type: 'string', minLength: 1, maxLength: 1500 },
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
            execute: (input: unknown) =>
              actions.current.send(validateGeneration(input)),
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  function submit(text = question, example = false) {
    void send(
      { question: text, count: Number(count), audience },
      example,
    ).catch((e) =>
      setError(e instanceof Error ? e.message : 'Please try again.'),
    );
  }
  function newChat() {
    if (job.current || exporting.current) return;
    setPlayingId(null);
    replace([]);
    release();
    setQuestion('');
    setError('');
    setAtBottom(true);
    textarea.current?.focus();
  }
  function revise(id: string, index: number, slide: Slide, redesign = false) {
    if (job.current || exporting.current) return;
    const turn = turnsRef.current.find((t) => t.id === id);
    if (!turn?.deck) return;
    validateDeck(
      {
        ...turn.deck,
        slides: turn.deck.slides.map((s, i) => (i === index ? slide : s)),
      },
      turn.deck.slides.length,
    );
    if (!turn.sample && !slide.visualBrief?.trim())
      throw new Error('Add a visual direction before updating this reply.');
    const previous = turn.deck.slides[index];
    let next = slide;
    if (!turn.sample && (redesign || visibleSlideChanged(previous, slide))) {
      if (previous.imageUrl) {
        URL.revokeObjectURL(previous.imageUrl);
        urls.current.delete(previous.imageUrl);
      }
      next = { ...slide, imageUrl: undefined };
    }
    const changed = {
      ...turn,
      clips: undefined,
      deck: {
        ...turn.deck,
        slides: turn.deck.slides.map((s, i) => (i === index ? next : s)),
      },
    };
    update(id, changed);
    void runTurn(changed);
  }
  return (
    <div className="chat-app">
      <header className="chat-header">
        <a className="brand" href="/" aria-label="Videogram home">
          <span className="brand-symbol">
            <Play size={17} fill="currentColor" />
          </span>
          videogram
        </a>
        <span className="conversation-title">
          {turns.length ? turns[0].question : 'New conversation'}
        </span>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="About Videogram"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="text-button new-chat"
            disabled={locked || !turns.length}
            onClick={newChat}
          >
            <Plus size={18} />
            <span>New chat</span>
          </button>
        </div>
      </header>
      <main
        className="conversation-scroll"
        ref={viewport}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
        }}
      >
        {!turns.length ? (
          <section className="chat-welcome" aria-label="Start a conversation">
            <div className="welcome-mark">
              <AudioLines size={34} strokeWidth={1.5} />
            </div>
            <h1>
              What would you like
              <br />
              to understand?
            </h1>
            <p>Ask anything. I’ll answer with a video.</p>
            <div className="prompt-suggestions">
              {[
                'Why do we dream?',
                'Explain black holes simply.',
                'How do airplanes stay in the air?',
              ].map((text) => (
                <button
                  key={text}
                  onClick={() => {
                    setQuestion(text);
                    textarea.current?.focus();
                  }}
                >
                  <MessageCircle size={16} />
                  {text}
                </button>
              ))}
            </div>
            <button
              className="example-link"
              onClick={() => submit('How does the internet work?', true)}
            >
              <Play size={13} fill="currentColor" /> Watch an example
              conversation
            </button>
          </section>
        ) : (
          <div className="conversation" aria-label="Conversation">
            {turns.map((turn) => (
              <section
                key={turn.id}
                className="exchange"
                aria-label="Conversation turn"
              >
                <div className="user-message">
                  <span className="sr-only">You: </span>
                  {turn.question}
                </div>
                <div className="assistant-message">
                  <div className="assistant-label">
                    <span className="assistant-mark">
                      <Play size={11} fill="currentColor" />
                    </span>
                    Videogram
                    {turn.sample && (
                      <span className="example-tag">Example</span>
                    )}
                  </div>
                  <VideoReply
                    turn={turn}
                    locked={locked}
                    playingId={playingId}
                    onPlaying={setPlayingId}
                    onExporting={(active) => {
                      exporting.current = active ? turn.id : null;
                      setExportingId(active ? turn.id : null);
                    }}
                    onRetry={() => {
                      const latest = turnsRef.current.find(
                        (t) => t.id === turn.id,
                      );
                      if (latest) void runTurn(latest);
                    }}
                    onCancel={() =>
                      job.current?.id === turn.id &&
                      job.current.controller.abort()
                    }
                    onEdit={(index, slide, redesign) =>
                      revise(turn.id, index, slide, redesign)
                    }
                  />
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <div className="composer-dock">
        {!atBottom && turns.length > 0 && (
          <button
            className="jump-latest"
            onClick={scrollDown}
            aria-label="Jump to latest message"
          >
            <ChevronDown size={19} />
          </button>
        )}
        {error && (
          <div className="composer-error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {connected === false && (
          <p className="connection-note">
            The AI connection needs setup. You can still watch the example.
          </p>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={textarea}
            rows={1}
            autoFocus
            aria-label="Message Videogram"
            value={question}
            maxLength={1500}
            placeholder={
              turns.length ? 'Ask a follow-up…' : 'Message Videogram…'
            }
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (!locked && question.trim()) submit();
              }
            }}
          />
          <div className="composer-toolbar">
            <button
              type="button"
              className="settings-button"
              onClick={() => setSettings(true)}
            >
              <SlidersHorizontal size={16} />
              <span>{count} slides</span>
              <span className="setting-divider">·</span>
              <span>
                {
                  VOICE_OPTIONS.find((v) => v.value === voice)?.label.split(
                    ' · ',
                  )[0]
                }{' '}
                voice
              </span>
            </button>
            {busyId ? (
              <button
                type="button"
                className="send-button stop-button"
                aria-label="Stop response"
                onClick={() => job.current?.controller.abort()}
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="send-button"
                disabled={locked || !question.trim()}
                aria-label="Send message"
              >
                {exportingId ? (
                  <LoaderCircle size={20} className="spinning" />
                ) : (
                  <ArrowUp size={21} />
                )}
              </button>
            )}
          </div>
        </form>
        <p className="composer-footnote">
          AI videos can make mistakes. Chat clears on refresh.
        </p>
      </div>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="settings-dialog">
          <DialogTitle>Video replies</DialogTitle>
          <DialogDescription>
            These choices apply to your next message.
          </DialogDescription>
          <div className="setting-row">
            <label>Length</label>
            <Choice
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
            <label>Voice</label>
            <Choice
              label="Narrator"
              value={voice}
              onChange={setVoice}
              items={[...VOICE_OPTIONS]}
            />
          </div>
          <div className="setting-row">
            <label>Explain it for</label>
            <Choice
              label="Audience"
              value={audience}
              onChange={setAudience}
              items={[
                { value: 'curious', label: 'Curious minds' },
                { value: 'kids', label: 'Young learners' },
                { value: 'advanced', label: 'Deeper understanding' },
              ]}
            />
          </div>
          <button className="primary-button" onClick={() => setSettings(false)}>
            Done
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="help-dialog">
          <DialogTitle>A conversation you can watch.</DialogTitle>
          <DialogDescription>
            Send a message and Videogram replies with a short narrated video.
            Ask a follow-up to go deeper, make it simpler, or explore something
            new.
          </DialogDescription>
          <p>
            Play answers right in the conversation. The transcript, slide
            editing, and video download are available beneath each reply.
          </p>
          <p>
            Gemini 3.8 Flash uses high reasoning to plan each answer. GPT Image
            2 creates the visuals, with Qwen or MiniMax AI narration.
          </p>
          <p>
            Recent completed answers provide context for follow-ups. Refreshing
            or starting a new chat clears this conversation. Download any videos
            you want to keep.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

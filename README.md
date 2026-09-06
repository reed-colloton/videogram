# Videogram

An educational video chatbot: question → 2–10 slides and script → narration → a downloadable 720p video.

The workspace includes a fully narrated, five-slide example about the internet, editable slide text and scripts, playback, and browser video export. New questions use OpenRouter structured outputs (`openai/gpt-5.4-mini`); voiceover uses MiniMax Speech 2.8 HD (`minimax/speech-2.8-hd`) through the same OpenRouter connection. The two built-in voices are Narrator (`English_expressive_narrator`) and Storyteller (`English_CaptivatingStoryteller`). Narration is disclosed in the interface. The example audio is macOS Samantha, not OpenAI speech.

## Run locally

```sh
npm install
cp .dev.vars.example .dev.vars
# Set OPENROUTER_API_KEY in .dev.vars to enable live generation.
npm run dev
```

For local live generation, visit `/signin-with-chatgpt?return_to=/` once to activate the local Sites identity. Hosted requests use the platform-provided signed-in user identity; both paid endpoints reject missing identity.

No API key is required for the original example’s playback or export. New or edited narration requires the API connection. Keep all keys server-side. For the hosted Site, configure `OPENROUTER_API_KEY` as a runtime secret through Sites. The site is private to its owner.

## Video export

Slides render to a shared 1280×720 canvas for preview and export. The browser combines its video track with decoded narration through Web Audio and MediaRecorder. It chooses MP4 when supported, otherwise WebM. Export takes the lesson’s real duration and cancels if the tab is hidden. The resulting video can be previewed and downloaded. No microphone or screen recording permission is needed.

## Verification

```sh
npx tsc --noEmit
npm run build
node --experimental-strip-types --test tests/*.test.ts
```

Live OpenRouter verification on September 6, 2026 passed through the app’s authenticated API routes: a two-slide lesson and MP3 narration with both voice choices. Eleven unit tests and TypeScript checks passed. Live API calls require a funded OpenRouter key. Browser playback and MediaRecorder export need validation in the target browser. WebMCP registration is feature-detected; unsupported browsers work normally.

## Boundaries

This version retains the current lesson in memory. Refreshing resets to the example. It does not include accounts, saved lesson history, or background rendering. Review generated material for accuracy. Public access would require usage limits and abuse protections before exposing the paid generation endpoints to untrusted users.

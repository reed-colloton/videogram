# Videogram

An educational video chatbot: question → 2–10 slides and script → narration → a downloadable 720p video.

The workspace includes a narrated example, editable slide text and scripts, playback, and browser video export. All AI requests use one server-side OpenRouter key.

- **Script and visual planning:** `google/gemini-3.8-flash`, explicitly `reasoning.effort: high` with reasoning excluded from the user response. No model fallback or reasoning downgrade.
- **Finished slide images:** `openai/gpt-image-2`, 16:9, medium quality, one image per slide. The browser requests up to two images at once and retains completed images if another fails. Editing visible slide text or its visual brief clears the old image and requires regeneration; narration-only edits preserve the image. The same generated images appear in previews and video exports.
- **Default speech:** `qwen/qwen-audio-3.0-tts-plus`, Warm (`longanlingxin`) and Bright (`longanlufeng`). MiniMax Speech 2.8 HD remains available as Narrator and Storyteller. Both providers' voices are disclosed as AI narration. The original example audio is macOS Samantha.

## Speech quality and cost

As checked September 6, 2026, [Artificial Analysis's provider-voice leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard/provider-voice?tab=leaderboard) scores Qwen Plus higher than MiniMax HD; MiniMax HD is close to Eleven v3. This is preference evidence across provider-native voices, not a guarantee for every script or language. [OpenRouter's speech catalog](https://openrouter.ai/api/v1/models?output_modalities=speech) prices Qwen Plus at $20/M characters and MiniMax HD at $100/M. A 1,500–3,500-character narration is roughly $0.03–$0.07 with Qwen or $0.15–$0.35 with MiniMax, per synthesis pass. Image and text generation are additional. The two medium 16:9 slide images in the verification run cost about $0.035 each.

## Run locally

```sh
npm install
cp .dev.vars.example .dev.vars
# Set OPENROUTER_API_KEY in .dev.vars to enable live generation.
npm run dev
```

For local live generation, visit `/signin-with-chatgpt?return_to=/` once to activate the local Sites identity. Hosted requests use the platform-provided signed-in user identity; both paid endpoints reject missing identity.

No API key is required for the original example’s playback or export. New lessons, slide images, and new or edited narration require the API connection. Keep all keys server-side. For the hosted Site, configure `OPENROUTER_API_KEY` as a runtime secret through Sites. The site is private to its owner.

## Video export

Generated slide images are decoded before recording and painted onto a shared 1280×720 canvas for preview and export. Incomplete images block playback/export until finished. The example retains its built-in template renderer. The browser combines its video track with decoded narration through Web Audio and MediaRecorder. It chooses MP4 when supported, otherwise WebM. Export takes the lesson’s real duration and cancels if the tab is hidden. The resulting video can be previewed and downloaded. No microphone or screen recording permission is needed.

## Verification

```sh
npx tsc --noEmit
npm run build
node --experimental-strip-types --test tests/*.test.ts
```

Live OpenRouter verification on September 6, 2026 passed through the app's authenticated API routes: a two-slide lesson using Gemini 3.8 Flash with high reasoning, two GPT Image 2 slides (1536×864), and MP3 narration with both Qwen voice choices. Both MiniMax voices were also verified in the earlier integration. TypeScript and regression tests cover high reasoning, image decoding, exact model routing, image concurrency, partial failure/retry, cancellation, and invalidation after edits. Browser MediaRecorder export still needs testing in the target browser; generated images have been visually inspected as standalone assets. WebMCP remains feature-detected and has not been verified in a supported browser context.

## Boundaries

This version retains the current lesson and generated image blob URLs in memory. Image URLs are revoked when replaced, reset, or unmounted. Refreshing resets to the example. It does not include accounts, saved lesson history, or background rendering. Review generated material for accuracy. Public access would require usage limits and abuse protections before exposing the paid generation endpoints to untrusted users.

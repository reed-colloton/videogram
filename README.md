# Videogram

A chatbot that answers with videos. Ask a question, watch a narrated 2–10 slide explanation, and ask follow-ups in the same conversation.

Includes editable slides, transcripts, voice choices, and MP4/WebM downloads. Built with React, TypeScript, Vinext, and Cloudflare Workers.

All AI runs through OpenRouter: Gemini 3.8 Flash with high reasoning for scripts, GPT Image 2 for slides, and Qwen or MiniMax for narration.

## Run locally

Requires Node.js 22.13+.

```sh
npm ci
cp .dev.vars.example .dev.vars
```

Set `OPENROUTER_API_KEY` in `.dev.vars`, then run `npm run dev`. The key stays server-side; local secret files are ignored by Git.

Open the local URL and visit `/signin-with-chatgpt?return_to=/` once to enable local generation. The included example works without an API key.

Chats clear on refresh. Downloads render in real time, so keep the tab visible.

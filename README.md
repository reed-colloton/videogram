# Videogram

A chatbot that answers with narrated videos. Ask a question, watch a 2–10 slide explanation, and ask follow-ups in the same conversation.

Includes editable slides, transcripts, voice choices, and MP4/WebM downloads. Uses React, TypeScript, and Vinext on Node.js. OpenRouter powers Gemini scripts, GPT Image 2 slides, and Qwen or MiniMax narration.

## Run locally

Use Node.js 24 (`nvm use`), then:

```sh
npm ci
cp .env.example .env.local
# Set OPENROUTER_API_KEY in .env.local
npm run dev
```

No sign-in is needed locally. The example works without a key. Chats clear on refresh; keep the tab visible while downloading videos.

## App Engine

Ready for App Engine Standard: Node.js 24, Secret Manager, and Google IAP. See [setup and deployment instructions](docs/app-engine.md). Nothing deploys automatically.

Run `npm run check` to validate the app.

import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  // Prebundle the chat controls together to avoid mixed React chunks during
  // the development preview's first dependency discovery.
  environments: {
    client: {
      optimizeDeps: {
        include: [
          '@base-ui/react/button',
          '@base-ui/react/dialog',
          '@base-ui/react/progress',
          '@base-ui/react/select',
        ],
      },
    },
  },
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  plugins: [vinext()],
});

import { configureRuntime } from './runtime.mjs';
import { loadDotenv } from 'vinext/internal/config/dotenv';

try {
  if (!process.env.GAE_ENV)
    loadDotenv({ root: process.cwd(), mode: 'production' });
  const options = await configureRuntime();
  // Import after configuration: Vinext reads proxy settings at module load.
  const { startProdServer } = await import('vinext/server/prod-server');
  const { server } = await startProdServer(options);
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, 25000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  // Do not print SDK errors or environment values, which may contain secrets.
  console.error(
    'Videogram could not start. Check runtime configuration, Secret Manager access, and the production build.',
  );
  process.exitCode = 1;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureRuntime } from '../scripts/runtime.mjs';

test('App Engine boot derives identity, retrieves the secret once, and honors PORT', async () => {
  const env = {
    GAE_ENV: 'standard',
    GOOGLE_CLOUD_PROJECT: 'videogram-test',
    PORT: '8080',
  };
  const calls = [];
  const options = await configureRuntime({
    env,
    readMetadata: async (path) => {
      calls.push(path);
      return '123456789';
    },
    readSecret: async (name) => {
      calls.push(name);
      return 'test-key';
    },
  });
  assert.deepEqual(options, { port: 8080, host: '0.0.0.0' });
  assert.deepEqual(calls, [
    'project/numeric-project-id',
    'projects/videogram-test/secrets/videogram-openrouter-api-key/versions/latest',
  ]);
  assert.equal(env.IAP_AUDIENCE, '/projects/123456789/apps/videogram-test');
  assert.equal(env.OPENROUTER_API_KEY, 'test-key');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.VINEXT_TRUST_PROXY, '1');
  await configureRuntime({
    env,
    readMetadata: async () => assert.fail('unnecessary metadata read'),
    readSecret: async () => assert.fail('unnecessary secret read'),
  });
});

test('non-GCP startup never contacts Google and binds only to loopback', async () => {
  const env = { PORT: '8123' };
  assert.deepEqual(
    await configureRuntime({
      env,
      readMetadata: async () =>
        assert.fail('Google should not be contacted locally'),
      readSecret: async () =>
        assert.fail('Google should not be contacted locally'),
    }),
    { port: 8123, host: '127.0.0.1' },
  );
});

test('startup rejects malformed config and secret failures instead of starting an unconfigured instance', async () => {
  for (const env of [
    { PORT: 'not-a-port' },
    { PORT: '0' },
    { PORT: '65536' },
    { GAE_ENV: 'standard' },
  ])
    await assert.rejects(configureRuntime({ env }));
  const env = { GAE_ENV: 'standard', GOOGLE_CLOUD_PROJECT: 'videogram-test' };
  await assert.rejects(
    configureRuntime({ env: { ...env }, readMetadata: async () => 'bad' }),
    /project number/,
  );
  await assert.rejects(
    configureRuntime({
      env: { ...env },
      readMetadata: async () => '123',
      readSecret: async () => '',
    }),
    /empty/,
  );
  await assert.rejects(
    configureRuntime({
      env: { ...env },
      readMetadata: async () => {
        throw new Error('metadata down');
      },
    }),
    /IAP audience/,
  );
});

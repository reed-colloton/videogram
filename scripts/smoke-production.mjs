import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

// Reserve an available loopback port without probing unrelated services.
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const audience = '/projects/123456789/apps/videogram-test';
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(
  JSON.stringify({ alg: 'ES256', kid: 'fixture' }),
).toString('base64url');
const payload = Buffer.from(
  JSON.stringify({
    iss: 'https://cloud.google.com/iap',
    aud: audience,
    sub: 'test-user',
    iat: now,
    exp: now + 600,
  }),
).toString('base64url');
const signed = `${header}.${payload}`;
const jwt = `${signed}.${sign('sha256', Buffer.from(signed), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
const child = spawn(
  process.execPath,
  [
    '--import',
    new URL('../tests/production-fixture.mjs', import.meta.url).href,
    'scripts/start.mjs',
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      GAE_ENV: '',
      PORT: String(port),
      OPENROUTER_API_KEY: 'test-placeholder',
      IAP_AUDIENCE: audience,
      VINEXT_TRUST_PROXY: '1',
      VIDEOGRAM_TEST_PUBLIC_KEY: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let logs = '';
child.stdout.on('data', (chunk) => {
  logs += chunk;
});
child.stderr.on('data', (chunk) => {
  logs += chunk;
});
const exited = once(child, 'exit');
const origin = `http://127.0.0.1:${port}`;
async function post(path, body, extra = {}) {
  // Use node:http so the test can reproduce Google's external Host header.
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'videogram.example',
          Origin: 'https://videogram.example',
          'X-Forwarded-Proto': 'https',
          'x-goog-iap-jwt-assertion': jwt,
          ...extra,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              headers: response.headers,
            }),
          ),
        );
      },
    );
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}
try {
  let started = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Production startup failed:\n${logs}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) {
        started = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  assert.ok(started, 'Production server did not start');
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const html = await page.text();
  const asset = html.match(/src="([^"\s]+\.js)"/);
  assert.ok(asset, 'Built client script is present');
  assert.equal((await fetch(new URL(asset[1], origin))).status, 200);
  const audio = await fetch(`${origin}/demo/slide-1.mp3`, {
    headers: { Range: 'bytes=0-99' },
  });
  assert.equal(audio.status, 206);
  assert.equal((await audio.arrayBuffer()).byteLength, 100);
  for (const path of ['/api/generate', '/api/speech', '/api/slide-image']) {
    const denied = await post(path, {}, { 'x-goog-iap-jwt-assertion': '' });
    assert.equal(
      denied.status,
      401,
      `${path} denies unsigned requests: ${await denied.text()}`,
    );
    const forged = await post(
      path,
      {},
      {
        'x-goog-iap-jwt-assertion': 'forged',
        'oai-authenticated-user-id': 'forged',
      },
    );
    assert.equal(forged.status, 401);
  }
  assert.equal(
    (await post('/api/generate', {}, { Origin: 'https://untrusted.example' }))
      .status,
    403,
  );
  const response = await post('/api/generate', {
    question: 'Why?',
    count: 2,
    audience: 'curious',
    context: [
      { role: 'user', content: 'Why does ice float?' },
      { role: 'assistant', content: 'Ice is less dense than liquid water.' },
    ],
  });
  assert.equal(response.status, 200, await response.clone().text());
  const deck = await response.json();
  assert.equal(deck.slides.length, 2);
  const speech = await post('/api/speech', {
    text: deck.slides[0].narration,
    voice: 'longanlingxin',
  });
  assert.equal(speech.status, 200);
  assert.equal(speech.headers.get('content-type'), 'audio/mpeg');
  const image = await post('/api/slide-image', {
    title: deck.title,
    slide: deck.slides[0],
    index: 0,
    count: 2,
  });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  console.log(
    'Production smoke passed: startup, assets, audio ranges, HTTPS proxy origin, signed IAP, denied access, and all three AI routes. External AI calls were mocked.',
  );
} finally {
  child.kill('SIGTERM');
  const force = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(force);
}

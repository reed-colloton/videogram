import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { authorizationError, verifyIapToken, IAP_ISSUER } from '../lib/auth.ts';

const audience = '/projects/123456789/apps/videogram-test';
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const keys = {
  fixture: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
};
function token(overrides = {}, headerOverrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: 'fixture', ...headerOverrides }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: IAP_ISSUER,
      aud: audience,
      sub: 'test-user',
      iat: now,
      exp: now + 600,
      ...overrides,
    }),
  ).toString('base64url');
  const signed = `${header}.${payload}`;
  return `${signed}.${sign('sha256', Buffer.from(signed), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const verify = (jwt: string, aud: string) => verifyIapToken(jwt, aud, keys);

test('local development needs no login, while production and App Engine never bypass auth', async () => {
  const request = new Request('http://localhost:3000/api/generate');
  assert.equal(
    await authorizationError(request, { NODE_ENV: 'development' }, verify),
    null,
  );
  assert.equal(
    (await authorizationError(request, { NODE_ENV: 'production' }, verify))
      ?.status,
    503,
  );
  assert.equal(
    (
      await authorizationError(
        request,
        { NODE_ENV: 'development', GAE_ENV: 'standard' },
        verify,
      )
    )?.status,
    503,
  );
  assert.equal(
    (
      await authorizationError(
        request,
        { NODE_ENV: 'production', IAP_AUDIENCE: audience },
        verify,
      )
    )?.status,
    401,
  );
});

test('production accepts a cryptographically valid IAP assertion for this app', async () => {
  const request = new Request('https://app.example/api/generate', {
    headers: { 'x-goog-iap-jwt-assertion': token() },
  });
  assert.equal(
    await authorizationError(
      request,
      { NODE_ENV: 'production', IAP_AUDIENCE: audience },
      verify,
    ),
    null,
  );
});

test('IAP validation rejects wrong audiences, issuers, expiry, signature, algorithm, and missing subject', async () => {
  const now = Math.floor(Date.now() / 1000);
  const good = token();
  const invalidSignature = `${good.slice(0, good.lastIndexOf('.') + 1)}${Buffer.alloc(64).toString('base64url')}`;
  for (const jwt of [
    token({ aud: '/projects/9/apps/other-app' }),
    token({ iss: 'https://example.com' }),
    token({ exp: now - 40, iat: now - 100 }),
    token({ iat: now + 40 }),
    token({ exp: now + 1000 }),
    token({ sub: '' }),
    token({}, { alg: 'none' }),
    token({}, { kid: 'unknown' }),
    invalidSignature,
  ]) {
    await assert.rejects(verify(jwt, audience));
    const result = await authorizationError(
      new Request('https://app.example/api/generate', {
        headers: { 'x-goog-iap-jwt-assertion': jwt },
      }),
      { NODE_ENV: 'production', IAP_AUDIENCE: audience },
      verify,
    );
    assert.equal(result?.status, 401);
    assert.ok(!JSON.stringify(result).includes(jwt));
  }
});

test('unsigned identity headers and former Sites headers grant no access', async () => {
  const request = new Request('https://app.example/api/generate', {
    headers: {
      'x-goog-authenticated-user-email':
        'accounts.google.com:owner@example.com',
      'oai-authenticated-user-id': 'forged',
    },
  });
  assert.equal(
    (
      await authorizationError(
        request,
        { NODE_ENV: 'production', IAP_AUDIENCE: audience },
        verify,
      )
    )?.status,
    401,
  );
});

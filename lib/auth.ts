import { OAuth2Client } from 'google-auth-library';

export const IAP_ISSUER = 'https://cloud.google.com/iap';
const client = new OAuth2Client();
type PublicKeys = Record<string, string>;
let cachedKeys: { keys: PublicKeys; expires: number } | undefined;
let loadingKeys: Promise<PublicKeys> | undefined;

async function publicKeys(): Promise<PublicKeys> {
  if (cachedKeys && cachedKeys.expires > Date.now()) return cachedKeys.keys;
  if (!loadingKeys) {
    loadingKeys = (async () => {
      const response = await fetch(
        'https://www.gstatic.com/iap/verify/public_key',
        {
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw new Error('IAP public keys unavailable.');
      const keys = (await response.json()) as PublicKeys;
      if (
        !keys ||
        typeof keys !== 'object' ||
        Array.isArray(keys) ||
        Object.values(keys).some((key) => typeof key !== 'string')
      )
        throw new Error('Invalid IAP public keys.');
      // Short cache, shared across simultaneous slide and speech requests.
      cachedKeys = { keys, expires: Date.now() + 60000 };
      return keys;
    })().finally(() => {
      loadingKeys = undefined;
    });
  }
  return loadingKeys;
}

export async function verifyIapToken(
  token: string,
  audience: string,
  keys?: PublicKeys,
) {
  if (token.length > 16384) throw new Error('Invalid IAP token.');
  const header = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
  );
  if (header.alg !== 'ES256' || typeof header.kid !== 'string')
    throw new Error('Invalid IAP token.');
  const ticket = await client.verifySignedJwtWithCertsAsync(
    token,
    keys || (await publicKeys()),
    audience,
    [IAP_ISSUER],
  );
  const claims = ticket.getPayload();
  const now = Date.now() / 1000;
  // IAP's bounds are tighter than the library's generic five-minute clock skew.
  if (
    !claims ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number' ||
    claims.iat > now + 30 ||
    claims.exp < now - 30 ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 660
  )
    throw new Error('Invalid IAP claims.');
}

export async function authorizationError(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  verify: (token: string, audience: string) => Promise<void> = verifyIapToken,
): Promise<{ status: number; message: string } | null> {
  // Only the explicitly started development server has no login requirement.
  // App Engine never bypasses auth, even if NODE_ENV is misconfigured.
  if (env.NODE_ENV === 'development' && !env.GAE_ENV) return null;
  const audience = env.IAP_AUDIENCE;
  if (!audience || !/^\/projects\/\d+\/apps\/[a-z][a-z0-9-]+$/.test(audience))
    return {
      status: 503,
      message:
        'Hosted access is not configured. Set up Google IAP, or use npm run dev for local development.',
    };
  const token = request.headers.get('x-goog-iap-jwt-assertion');
  if (!token)
    return {
      status: 401,
      message: 'Sign in through Google IAP to use Videogram.',
    };
  try {
    await verify(token, audience);
    return null;
  } catch {
    // JWT library errors can contain the token; never return or log them.
    return {
      status: 401,
      message: 'Your Google IAP session could not be verified. Sign in again.',
    };
  }
}

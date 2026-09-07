import { GoogleAuth } from 'google-auth-library';

async function metadata(path) {
  const response = await fetch(
    `http://metadata.google.internal/computeMetadata/v1/${path}`,
    {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok || response.headers.get('metadata-flavor') !== 'Google')
    throw new Error('App Engine project metadata is unavailable.');
  return (await response.text()).trim();
}

export async function accessSecret(name) {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const response = await client.request({
      url: `https://secretmanager.googleapis.com/v1/${name}:access`,
      timeout: 10000,
    });
    const encoded = response.data?.payload?.data;
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      throw new Error('Invalid secret payload.');
    const key = Buffer.from(encoded, 'base64').toString('utf8').trim();
    if (!key || key.length > 4096) throw new Error('Invalid secret value.');
    return key;
  } catch {
    // Google API errors can include credentials or response bodies.
    throw new Error(
      'Could not load the OpenRouter key from Secret Manager. Check the secret name and runtime service account access.',
    );
  }
}

export async function configureRuntime({
  env = process.env,
  readMetadata = metadata,
  readSecret = accessSecret,
} = {}) {
  env.NODE_ENV = 'production';
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be between 1 and 65535.');
  if (env.GAE_ENV) {
    const project = env.GOOGLE_CLOUD_PROJECT;
    if (!project || !/^[a-z][a-z0-9-]+$/.test(project))
      throw new Error('GOOGLE_CLOUD_PROJECT is required on App Engine.');
    if (!env.IAP_AUDIENCE) {
      let number;
      try {
        number = await readMetadata('project/numeric-project-id');
      } catch {
        throw new Error(
          'Could not determine the IAP audience. Set IAP_AUDIENCE explicitly or check App Engine metadata access.',
        );
      }
      if (!/^\d+$/.test(number))
        throw new Error('App Engine returned an invalid project number.');
      env.IAP_AUDIENCE = `/projects/${number}/apps/${project}`;
    }
    if (!/^\/projects\/\d+\/apps\/[a-z][a-z0-9-]+$/.test(env.IAP_AUDIENCE))
      throw new Error('IAP_AUDIENCE must identify your App Engine app.');
    if (!env.OPENROUTER_API_KEY?.trim()) {
      const secret =
        env.OPENROUTER_SECRET_NAME || 'videogram-openrouter-api-key';
      if (!/^[A-Za-z0-9_-]+$/.test(secret))
        throw new Error(
          'OPENROUTER_SECRET_NAME must be a Secret Manager secret ID.',
        );
      env.OPENROUTER_API_KEY = await readSecret(
        `projects/${project}/secrets/${secret}/versions/latest`,
      );
      if (!env.OPENROUTER_API_KEY?.trim())
        throw new Error('The OpenRouter secret is empty.');
    }
    // Google terminates HTTPS before forwarding to the Node server. This lets
    // same-origin checks see the external HTTPS origin; forwarded hosts stay untrusted.
    env.VINEXT_TRUST_PROXY = '1';
  }
  return { port, host: env.GAE_ENV ? '0.0.0.0' : '127.0.0.1' };
}

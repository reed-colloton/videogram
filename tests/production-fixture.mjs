// Test-only external-service boundary. Never loaded by npm start or deployed.
const nativeFetch = globalThis.fetch;
const fixtureSlide = {
  title: 'Water expands',
  eyebrow: 'WHY ICE FLOATS',
  body: 'Ice is less dense than liquid water.',
  points: ['Hydrogen bonds', 'Open structure', 'Lower density'],
  narration:
    'Water molecules form an open crystal structure when they freeze. The same mass takes up more space, so ice is less dense than liquid water and floats.',
  visualBrief:
    'A diagram comparing closely packed liquid water with an open ice lattice.',
};
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url === 'https://www.gstatic.com/iap/verify/public_key')
    return Response.json({ fixture: process.env.VIDEOGRAM_TEST_PUBLIC_KEY });
  if (url.startsWith('https://openrouter.ai/api/v1/')) {
    const body = JSON.parse(init.body);
    if (url.endsWith('/chat/completions')) {
      const count =
        body.response_format.json_schema.schema.properties.slides.minItems;
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                title: 'Why ice floats',
                slides: Array.from({ length: count }, () => fixtureSlide),
              }),
            },
          },
        ],
      });
    }
    if (url.endsWith('/audio/speech'))
      return new Response(new Uint8Array([73, 68, 51, 4, 0, 0]), {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    if (url.endsWith('/images'))
      return Response.json({
        data: [
          {
            b64_json:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
          },
        ],
      });
    throw new Error('Unexpected OpenRouter test route.');
  }
  return nativeFetch(input, init);
};

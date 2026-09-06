import { getKey } from '@/lib/server';
export function GET() {
  return Response.json(
    { connected: Boolean(getKey()) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

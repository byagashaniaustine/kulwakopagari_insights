import { serveDir } from 'jsr:@std/http/file-server';

const KULWA_BASE    = Deno.env.get('KULWA_BASE_URL') ?? '';
const KULWA_API_KEY = Deno.env.get('KULWA_API_KEY')  ?? '';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname.startsWith('/kulwa-api/')) {
    const path = url.pathname.replace('/kulwa-api', '') + url.search;
    const proxyHeaders = new Headers(req.headers);
    if (KULWA_API_KEY) proxyHeaders.set('X-Insights-Key', KULWA_API_KEY);
    return fetch(`${KULWA_BASE}${path}`, {
      method: req.method,
      headers: proxyHeaders,
    });
  }

  const resp = await serveDir(req, { fsRoot: 'dist', quiet: true });

  if (resp.status === 404) {
    const html = await Deno.readFile('./dist/index.html');
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  return resp;
});

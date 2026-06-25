export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const reqUrl = new URL(request.url);

    // 1. Handle CORS instantly
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }
      });
    }

    // 2. Map route (e.g., worker.dev/search -> apiv2.gaana.com/search)
    const targetUrl = `https://apiv2.gaana.com${reqUrl.pathname}${reqUrl.search}`;

    // 3. Edge Caching Setup
    const cache = caches.default;
    const cacheKey = new Request(targetUrl, request);

    // 4. Return cached response instantly (~10ms) if available
    let response = await cache.match(cacheKey);
    if (response) {
      return response;
    }

    // 5. Fetch from Gaana if not in cache
    try {
      const gaanaResponse = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'deviceType': 'GaanaAndroidApp',
          'appVersion': 'V5',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://gaana.com',
          'Referer': 'https://gaana.com/'
        }
      });

      if (!gaanaResponse.ok) {
        return Response.json({
          success: false,
          error: `Gaana blocked request: ${gaanaResponse.status}`,
          url_attempted: targetUrl
        }, { status: gaanaResponse.status, headers: { 'Access-Control-Allow-Origin': '*' } });
      }

      // 6. Wrap data
      const gaanaData = await gaanaResponse.json();
      const finalResponse = Response.json({
        success: true,
        source_url: targetUrl,
        data: gaanaData
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 's-maxage=3600' // Cache at Cloudflare Edge for 1 Hour
        }
      });

      // 7. Save to cache in the background (Non-blocking)
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));

      return finalResponse;

    } catch (error: any) {
      return Response.json({
        success: false,
        error: 'Internal Server Error',
        message: error.message || String(error)
      }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
  },
};

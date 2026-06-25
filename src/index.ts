export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const reqUrl = new URL(request.url);

    // 1. Instant CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }
      });
    }

    const targetUrl = `https://apiv2.gaana.com${reqUrl.pathname}${reqUrl.search}`;

    // 2. Setup Cache
    const cache = caches.default;
    const cacheKey = new Request(targetUrl, request);

    // 3. Cache HIT: Return instantly
    let response = await cache.match(cacheKey);
    if (response) {
      // We clone it to add a header so you can debug if cache is working!
      const cachedResponse = new Response(response.body, response);
      cachedResponse.headers.set('X-Proxy-Cache', 'HIT');
      return cachedResponse;
    }

    try {
      // 4. Cache MISS: Fetch from Gaana
      const gaanaResponse = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'deviceType': 'GaanaAndroidApp',
          'appVersion': 'V5',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Encoding': 'gzip, deflate, br', // 🔥 CRITICAL: Forces Gaana to send compressed, fast data
          'Origin': 'https://gaana.com',
          'Referer': 'https://gaana.com/'
        }
      });

      if (!gaanaResponse.ok) {
        return new Response(await gaanaResponse.text(), { 
          status: gaanaResponse.status, 
          headers: { 'Access-Control-Allow-Origin': '*' } 
        });
      }

      // 5. 🔥 THE SPEED UP: STREAMING 🔥
      // Instead of waiting for .json(), we pass gaanaResponse.body directly!
      // This routes the network stream directly to the user instantly.
      const finalResponse = new Response(gaanaResponse.body, {
        status: gaanaResponse.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': gaanaResponse.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'public, s-maxage=3600', // Cache at edge for 1 hour
          'X-Proxy-Cache': 'MISS'
        }
      });

      // 6. Non-blocking cache put
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));

      return finalResponse;

    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } 
      });
    }
  },
};

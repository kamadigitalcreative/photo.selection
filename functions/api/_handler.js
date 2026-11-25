if (typeof globalThis.__dirname === 'undefined') {
  globalThis.__dirname = '/';
}
if (typeof globalThis.__filename === 'undefined') {
  globalThis.__filename = '/index.js';
}

const supabaseHandler = require('../../api/supabase');

export async function handleRequest(context) {
  const { request, env } = context;

  // Sync Cloudflare environment variables to process.env
  if (typeof process === 'undefined') {
    globalThis.process = { env: {} };
  }
  if (!globalThis.process.env) {
    globalThis.process.env = {};
  }
  if (env && typeof env === 'object') {
    Object.assign(globalThis.process.env, env);
  }

  // Preflight OPTIONS handling
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Token',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  // Extract query parameters and URL
  const parsedUrl = new URL(request.url);
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // Extract body reliably
  let body = {};
  let rawBody = '';
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      rawBody = await request.text();
      if (rawBody && rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch (_) {
          try {
            const params = new URLSearchParams(rawBody);
            const parsedObj = Object.fromEntries(params.entries());
            if (Object.keys(parsedObj).length > 0) {
              body = parsedObj;
            } else {
              body = rawBody;
            }
          } catch (_) {
            body = rawBody;
          }
        }
      }
    } catch (err) {
      console.error('Error reading request body in Cloudflare Pages:', err);
      body = {};
    }
  }

  // Headers object (lowercase keys)
  const headers = {};
  for (const [k, v] of request.headers.entries()) {
    headers[k.toLowerCase()] = v;
  }

  let statusCode = 200;
  const resHeaders = new Headers();
  let responseData = null;

  const mockRes = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(key, value) {
      resHeaders.set(key, value);
      return this;
    },
    getHeader(key) {
      return resHeaders.get(key);
    },
    json(data) {
      if (!resHeaders.has('content-type')) {
        resHeaders.set('content-type', 'application/json');
      }
      responseData = JSON.stringify(data);
      return this;
    },
    send(data) {
      responseData = data;
      return this;
    },
    end(data) {
      if (data) responseData = data;
      return this;
    },
    writeHead(code, headObj) {
      statusCode = code;
      if (headObj && typeof headObj === 'object') {
        for (const [hk, hv] of Object.entries(headObj)) {
          resHeaders.set(hk, hv);
        }
      }
      return this;
    },
    redirect(statusOrUrl, maybeUrl) {
      const redirectUrl = maybeUrl || statusOrUrl;
      statusCode = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
      resHeaders.set('location', redirectUrl);
      responseData = null;
      return this;
    }
  };

  const mockReq = {
    method: request.method,
    headers,
    query,
    body,
    rawBody,
    url: parsedUrl.pathname + parsedUrl.search,
    ip: request.headers.get('cf-connecting-ip') || '127.0.0.1'
  };

  try {
    await supabaseHandler(mockReq, mockRes);
  } catch (err) {
    console.error('Cloudflare Pages API Bridge Error:', err);
    if (!responseData) {
      statusCode = 500;
      resHeaders.set('content-type', 'application/json');
      responseData = JSON.stringify({ status: 'error', message: 'Internal Server Error' });
    }
  }

  return new Response(responseData, {
    status: statusCode,
    headers: resHeaders
  });
}

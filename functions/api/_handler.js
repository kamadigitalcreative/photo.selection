import { PassThrough, Readable } from 'node:stream';

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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Token, Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Disposition',
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

  // Create streamable mock response that supports both direct JSON/send and pipeline/streaming
  const pt = new PassThrough();
  pt.statusCode = 200;
  pt.headersSent = false;
  pt.resHeaders = new Headers();
  pt.responseData = null;
  pt.isStreaming = false;

  pt.status = function(code) {
    this.statusCode = code;
    return this;
  };

  pt.setHeader = function(key, value) {
    this.resHeaders.set(key, value);
    return this;
  };

  pt.getHeader = function(key) {
    return this.resHeaders.get(key);
  };

  pt.writeHead = function(code, headersObj) {
    this.statusCode = code;
    this.headersSent = true;
    this.isStreaming = true;
    if (headersObj && typeof headersObj === 'object') {
      for (const [hk, hv] of Object.entries(headersObj)) {
        this.resHeaders.set(hk, hv);
      }
    }
    return this;
  };

  pt.json = function(data) {
    this.headersSent = true;
    this.isStreaming = false;
    if (!this.resHeaders.has('content-type')) {
      this.resHeaders.set('content-type', 'application/json');
    }
    this.responseData = JSON.stringify(data);
    this.end();
    return this;
  };

  pt.send = function(data) {
    this.headersSent = true;
    this.isStreaming = false;
    this.responseData = data;
    this.end();
    return this;
  };

  pt.redirect = function(statusOrUrl, maybeUrl) {
    this.headersSent = true;
    this.isStreaming = false;
    const redirectUrl = maybeUrl || statusOrUrl;
    this.statusCode = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
    this.resHeaders.set('location', redirectUrl);
    this.responseData = null;
    this.end();
    return this;
  };

  const originalWrite = pt.write.bind(pt);
  pt.write = function(chunk, encoding, callback) {
    this.headersSent = true;
    this.isStreaming = true;
    return originalWrite(chunk, encoding, callback);
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
    await supabaseHandler(mockReq, pt);
  } catch (err) {
    console.error('Cloudflare Pages API Bridge Error:', err);
    if (!pt.headersSent) {
      pt.statusCode = 500;
      pt.resHeaders.set('content-type', 'application/json');
      return new Response(JSON.stringify({ status: 'error', message: 'Internal Server Error' }), {
        status: 500,
        headers: pt.resHeaders
      });
    }
  }

  // Return Web Response: either buffered string/JSON or Web ReadableStream for authentic file download
  if (!pt.isStreaming && pt.responseData !== null) {
    return new Response(pt.responseData, {
      status: pt.statusCode,
      headers: pt.resHeaders
    });
  }

  // Streaming mode (file downloads, proxy thumbnails)
  return new Response(Readable.toWeb(pt), {
    status: pt.statusCode,
    headers: pt.resHeaders
  });
}

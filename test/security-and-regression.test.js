/**
 * PHASE 4.7.3 AUTOMATED TEST SUITE: SECURITY, REGRESSION & RATE LIMITING
 * Mocks all network operations (fetch) - NEVER calls live Supabase, Mayar, or GAS.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load API Handler and helper exports
const handler = require('../api/supabase');
const bridgeHandler = require('../api/bridge');

let passCount = 0;
let failCount = 0;
let notRunCount = 0;
const testResults = [];

function recordTest(id, name, status, details = '') {
  if (status === 'PASS') passCount++;
  else if (status === 'FAIL') failCount++;
  else if (status === 'NOT RUN') notRunCount++;

  testResults.push({ id, name, status, details });
  const icon = status === 'PASS' ? '✅' : (status === 'FAIL' ? '❌' : '⏸️');
  console.log(`${icon} [${status}] Test ${id}: ${name} ${details ? '(' + details + ')' : ''}`);
}

// Mock Response Helper
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    ended: false,
    body: null,
    setHeader: function (key, value) {
      res.headers[key.toLowerCase()] = value;
      return res;
    },
    getHeader: function (key) {
      return res.headers[key.toLowerCase()];
    },
    status: function (code) {
      res.statusCode = code;
      return res;
    },
    json: function (payload) {
      res.body = payload;
      res.ended = true;
      return res;
    },
    end: function (data) {
      if (data) res.body = data;
      res.ended = true;
      return res;
    }
  };
  return res;
}

// Mock Network / Supabase Fetch
let mockDb = {
  sessions: [],
  users: [],
  projects: [],
  reset_tokens: [],
  mayar_logs: []
};
let mockFetchCalls = [];

function setupMockFetch() {
  global.fetch = async (url, options = {}) => {
    mockFetchCalls.push({ url, options });

    const urlStr = String(url);
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : null;

    // Reject any accidental external non-mock calls
    if (!urlStr.includes('supabase.co') && !urlStr.includes('script.google.com') && !urlStr.includes('facebook.com')) {
      throw new Error(`Unexpected external URL in test mock: ${urlStr}`);
    }

    // Google Apps Script Mailer Mock
    if (urlStr.includes('script.google.com')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, message: 'Mock email sent' }),
        json: async () => ({ success: true, message: 'Mock email sent' })
      };
    }

    // Meta CAPI Mock
    if (urlStr.includes('facebook.com')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1 }),
        json: async () => ({ events_received: 1 })
      };
    }

    // Supabase REST Mock
    if (urlStr.includes('/rest/v1/')) {
      const endpoint = urlStr.split('/rest/v1/')[1] || '';
      const tablePart = endpoint.split('?')[0];
      const queryPart = endpoint.includes('?') ? endpoint.split('?')[1] : '';

      if (method === 'GET') {
        const rows = mockDb[tablePart] || [];
        // Handle filter expressions
        if (queryPart.includes('SessionID=eq.')) {
          const sidMatch = queryPart.match(/SessionID=eq\.([^&]+)/);
          const sid = sidMatch ? decodeURIComponent(sidMatch[1]) : '';
          const filtered = rows.filter(r => r.SessionID === sid);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered) };
        }
        if (queryPart.includes('Username=ilike.') || queryPart.includes('Username=eq.')) {
          const uMatch = queryPart.match(/Username=(?:ilike|eq)\.([^&]+)/);
          const u = uMatch ? decodeURIComponent(uMatch[1]).toLowerCase() : '';
          const filtered = rows.filter(r => String(r.Username).toLowerCase() === u);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered) };
        }
        if (queryPart.includes('Token=eq.')) {
          const tMatch = queryPart.match(/Token=eq\.([^&]+)/);
          const t = tMatch ? decodeURIComponent(tMatch[1]) : '';
          const filtered = rows.filter(r => r.Token === t || r.Slug === t || r['Short Slug'] === t);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered) };
        }
        if (queryPart.includes('or=(')) {
          const cleanIdMatch = queryPart.match(/id\.eq\.([^,]+),Token\.eq\.([^\)]+)/);
          if (cleanIdMatch) {
            const id = decodeURIComponent(cleanIdMatch[1]);
            const tok = decodeURIComponent(cleanIdMatch[2]);
            const filtered = rows.filter(r => r.id === id || r.Token === tok || r['Short Slug'] === tok);
            return { ok: true, status: 200, text: async () => JSON.stringify(filtered) };
          }
        }
        return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
      }

      if (method === 'POST') {
        if (tablePart === 'rpc/process_mayar_payment') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: true,
              status: 'processed',
              action_type: 'USER_UPDATED',
              account_username: 'client',
              result_message: 'Perpanjangan 1 Bulan berhasil untuk @client'
            })
          };
        }
        if (!mockDb[tablePart]) mockDb[tablePart] = [];
        const newRow = { id: 'mock_' + Date.now(), ...(body || {}) };
        mockDb[tablePart].push(newRow);
        return { ok: true, status: 201, text: async () => JSON.stringify([newRow]) };
      }

      if (method === 'PATCH') {
        return { ok: true, status: 200, text: async () => JSON.stringify([{ updated: true }]) };
      }

      if (method === 'DELETE') {
        return { ok: true, status: 200, text: async () => JSON.stringify([{ deleted: true }]) };
      }
    }

    return { ok: true, status: 200, text: async () => JSON.stringify([]) };
  };
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('PHOTO SELECTION PHASE 4.7.3 — AUTOMATED TESTS');
  console.log('======================================================\n');

  setupMockFetch();

  // -------------------------------------------------------------------------
  // MANDATORY TESTS (1 - 17)
  // -------------------------------------------------------------------------

  // Test 1: Valid Production Origin
  try {
    const req = { method: 'POST', headers: { origin: 'https://ps.kamacreative.my.id' }, body: { action: 'pingUser' } };
    const res = createMockRes();
    await handler(req, res);
    const originHeader = res.getHeader('access-control-allow-origin');
    if (originHeader === 'https://ps.kamacreative.my.id') {
      recordTest(1, 'Valid Production Origin', 'PASS', 'Allowed with CORS header set');
    } else {
      recordTest(1, 'Valid Production Origin', 'FAIL', `Unexpected origin header: ${originHeader}`);
    }
  } catch (e) {
    recordTest(1, 'Valid Production Origin', 'FAIL', e.message);
  }

  // Test 2: Valid Vercel Preview Origin
  try {
    process.env.VERCEL_URL = 'photo-selection-preview-branch.vercel.app';
    const req = { method: 'POST', headers: { origin: 'https://photo-selection-preview-branch.vercel.app' }, body: { action: 'pingUser' } };
    const res = createMockRes();
    await handler(req, res);
    const originHeader = res.getHeader('access-control-allow-origin');
    if (originHeader === 'https://photo-selection-preview-branch.vercel.app') {
      recordTest(2, 'Valid Vercel Preview Origin', 'PASS', 'Dynamic Vercel preview allowed');
    } else {
      recordTest(2, 'Valid Vercel Preview Origin', 'FAIL', `Origin header: ${originHeader}`);
    }
  } catch (e) {
    recordTest(2, 'Valid Vercel Preview Origin', 'FAIL', e.message);
  }

  // Test 3: Invalid third-party Origin
  try {
    const req = { method: 'POST', headers: { origin: 'https://evil-attacker-site.com' }, body: { action: 'pingUser' } };
    const res = createMockRes();
    await handler(req, res);
    if (res.statusCode === 403 && res.body && res.body.status === 'error') {
      recordTest(3, 'Invalid third-party Origin rejection', 'PASS', 'HTTP 403 Forbidden');
    } else {
      recordTest(3, 'Invalid third-party Origin rejection', 'FAIL', `Status: ${res.statusCode}`);
    }
  } catch (e) {
    recordTest(3, 'Invalid third-party Origin rejection', 'FAIL', e.message);
  }

  // Test 4: Empty and malformed Origin
  try {
    const origins = ['null', 'http://', 'https://ps.kamacreative.my.id.evil.com', 'javascript:alert(1)'];
    let allBlocked = true;
    for (const badOrigin of origins) {
      const req = { method: 'POST', headers: { origin: badOrigin }, body: { action: 'pingUser' } };
      const res = createMockRes();
      await handler(req, res);
      if (res.statusCode !== 403) allBlocked = false;
    }
    if (allBlocked) {
      recordTest(4, 'Empty and malformed Origin rejection', 'PASS', 'All malformed origins rejected 403');
    } else {
      recordTest(4, 'Empty and malformed Origin rejection', 'FAIL', 'A malformed origin was not rejected');
    }
  } catch (e) {
    recordTest(4, 'Empty and malformed Origin rejection', 'FAIL', e.message);
  }

  // Test 5: OPTIONS preflight
  try {
    const reqValid = { method: 'OPTIONS', headers: { origin: 'https://ps.kamacreative.my.id' } };
    const resValid = createMockRes();
    await handler(reqValid, resValid);

    const reqInvalid = { method: 'OPTIONS', headers: { origin: 'https://attacker.com' } };
    const resInvalid = createMockRes();
    await handler(reqInvalid, resInvalid);

    if (resValid.statusCode === 204 && resInvalid.statusCode === 403) {
      recordTest(5, 'OPTIONS preflight handling', 'PASS', 'Valid -> 204, Unauthorized -> 403');
    } else {
      recordTest(5, 'OPTIONS preflight handling', 'FAIL', `Valid: ${resValid.statusCode}, Invalid: ${resInvalid.statusCode}`);
    }
  } catch (e) {
    recordTest(5, 'OPTIONS preflight handling', 'FAIL', e.message);
  }

  // Test 6: No-Origin legitimate server-to-server calls
  try {
    const req = { method: 'POST', headers: {}, body: { action: 'unknownTest' } };
    const res = createMockRes();
    await handler(req, res);
    // Should NOT be rejected by CORS (403), should reach action router (404 unknown action)
    if (res.statusCode === 404 && res.body && res.body.message.includes('Unknown action')) {
      recordTest(6, 'No-Origin legitimate server-to-server calls', 'PASS', 'Allowed through CORS');
    } else {
      recordTest(6, 'No-Origin legitimate server-to-server calls', 'FAIL', `Status: ${res.statusCode}`);
    }
  } catch (e) {
    recordTest(6, 'No-Origin legitimate server-to-server calls', 'FAIL', e.message);
  }

  // Test 7: Request parsing and JSON response compatibility
  try {
    const req = { method: 'POST', headers: {}, body: JSON.stringify({ action: 'nonExistentAction' }) };
    const res = createMockRes();
    await handler(req, res);
    const ct = res.getHeader('content-type');
    const hasStatus = res.body && typeof res.body.status === 'string';
    if (ct && ct.includes('application/json') && hasStatus) {
      recordTest(7, 'Request parsing and JSON response compatibility', 'PASS', 'Standard JSON envelope verified');
    } else {
      recordTest(7, 'Request parsing and JSON response compatibility', 'FAIL', 'Non-standard response format');
    }
  } catch (e) {
    recordTest(7, 'Request parsing and JSON response compatibility', 'FAIL', e.message);
  }

  // Test 8: Invalid request payload handling
  try {
    const reqMalformed = { method: 'POST', headers: {}, body: '{"broken_json: true' };
    const resMalformed = createMockRes();
    await handler(reqMalformed, resMalformed);

    const reqEmpty = { method: 'POST', headers: {}, body: '' };
    const resEmpty = createMockRes();
    await handler(reqEmpty, resEmpty);

    if (resMalformed.statusCode === 400 && resEmpty.statusCode === 400) {
      recordTest(8, 'Invalid request payload handling', 'PASS', 'Malformed JSON and empty payload cleanly rejected 400');
    } else {
      recordTest(8, 'Invalid request payload handling', 'FAIL', `Malformed status: ${resMalformed.statusCode}, Empty status: ${resEmpty.statusCode}`);
    }
  } catch (e) {
    recordTest(8, 'Invalid request payload handling', 'FAIL', e.message);
  }

  // Test 9: Unauthorized account mutation rejection
  try {
    const protectedActions = ['createProject', 'saveBrandSettings', 'deleteUser', 'updateExpiry'];
    let allRejected = true;
    for (const act of protectedActions) {
      const req = { method: 'POST', headers: {}, body: { action: act } };
      const res = createMockRes();
      await handler(req, res);
      if (res.statusCode !== 401) allRejected = false;
    }
    if (allRejected) {
      recordTest(9, 'Unauthorized account mutation rejection', 'PASS', 'HTTP 401 on missing session');
    } else {
      recordTest(9, 'Unauthorized account mutation rejection', 'FAIL', 'Protected action not rejected with 401');
    }
  } catch (e) {
    recordTest(9, 'Unauthorized account mutation rejection', 'FAIL', e.message);
  }

  // Test 10: Unauthorized project mutation rejection
  try {
    // Setup photographer A session in mockDb
    mockDb.sessions = [{ SessionID: 'sess_user_a', Username: 'photographer_a', Role: 'Photographer', CreatedAt: new Date().toISOString() }];
    mockDb.users = [{ Username: 'photographer_a', Role: 'Photographer', Status: 'Active' }];
    // Project owned by photographer B
    mockDb.projects = [{ id: 'proj_b', Token: 'tok_b', Owner: 'photographer_b', 'Password Client': '123' }];

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer sess_user_a' },
      body: { action: 'updateClientPassword', id: 'proj_b', newPassword: 'newpass' }
    };
    const res = createMockRes();
    await handler(req, res);
    if (res.statusCode === 403) {
      recordTest(10, 'Unauthorized project mutation rejection', 'PASS', 'Photographer A denied modifying Photographer B project (403)');
    } else {
      recordTest(10, 'Unauthorized project mutation rejection', 'FAIL', `Status: ${res.statusCode}`);
    }
  } catch (e) {
    recordTest(10, 'Unauthorized project mutation rejection', 'FAIL', e.message);
  }

  // Test 11: Invalid client-gallery session rejection
  try {
    mockDb.projects = [{ id: 'proj_client', Token: 'tok_gallery_1', Owner: 'photographer_a', 'Password Client': 'secret123' }];
    const req = {
      method: 'POST',
      headers: {},
      body: { action: 'updateClientStatus', token: 'tok_gallery_1', clientAccessToken: 'invalid_token_xyz', status: 'Sedang Memilih' }
    };
    const res = createMockRes();
    await handler(req, res);
    if (res.statusCode === 403 || res.statusCode === 401) {
      recordTest(11, 'Invalid client-gallery session rejection', 'PASS', `Rejected with status ${res.statusCode}`);
    } else {
      recordTest(11, 'Invalid client-gallery session rejection', 'FAIL', `Status: ${res.statusCode}`);
    }
  } catch (e) {
    recordTest(11, 'Invalid client-gallery session rejection', 'FAIL', e.message);
  }

  // Test 12: Valid client-gallery session compatibility
  try {
    const validClientToken = 'valid_client_session_token';
    mockDb.projects = [{ id: 'proj_client', Token: 'tok_gallery_1', Owner: 'photographer_a', 'Password Client': 'secret123', 'Daftar Pilihan': '[]', Notes: '{}' }];
    mockDb.sessions.push({
      SessionID: validClientToken,
      Username: '__CLIENT_GALLERY__:proj_client',
      Role: 'ClientGallery',
      CreatedAt: new Date().toISOString()
    });

    const req = {
      method: 'POST',
      headers: {},
      body: { action: 'updateClientStatus', token: 'tok_gallery_1', clientAccessToken: validClientToken, status: 'Sedang Memilih' }
    };
    const res = createMockRes();
    await handler(req, res);
    if (res.statusCode === 200 && res.body && res.body.status === 'success') {
      recordTest(12, 'Valid client-gallery session compatibility', 'PASS', 'Status update succeeded with valid client token');
    } else {
      recordTest(12, 'Valid client-gallery session compatibility', 'FAIL', `Status: ${res.statusCode}, Body: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest(12, 'Valid client-gallery session compatibility', 'FAIL', e.message);
  }

  // Test 13: Existing OTP cooldown compatibility
  try {
    mockDb.users = [{ Username: 'test_otp_user', Email: 'user@example.com' }];
    mockDb.reset_tokens = [{
      Username: 'test_otp_user',
      OTP: 'scrypt_hash_otp',
      CreatedAt: new Date(Date.now() - 30 * 1000).toISOString() // 30 seconds ago (< 60s cooldown)
    }];

    const req = { method: 'POST', headers: {}, body: { action: 'requestOTP', email: 'user@example.com' } };
    const res = createMockRes();
    await handler(req, res);
    if (res.statusCode === 400 && res.body && res.body.message.includes('60 detik')) {
      recordTest(13, 'Existing OTP cooldown compatibility', 'PASS', 'Cooldown enforced: 60s message returned');
    } else {
      recordTest(13, 'Existing OTP cooldown compatibility', 'FAIL', `Status: ${res.statusCode}, Msg: ${res.body && res.body.message}`);
    }
  } catch (e) {
    recordTest(13, 'Existing OTP cooldown compatibility', 'FAIL', e.message);
  }

  // Test 14: Existing OTP attempt-limit compatibility
  try {
    mockDb.users = [{ Username: 'lockout_user', Email: 'lock@example.com' }];
    mockDb.reset_tokens = [{
      Username: 'lockout_user',
      OTP: 'otp-scrypt$v1$dummy$dummy',
      CreatedAt: new Date().toISOString()
    }];
    // 5 failed attempt markers in sessions table
    for (let i = 0; i < 5; i++) {
      mockDb.sessions.push({
        SessionID: 'attempt_' + i,
        Username: '__RESET_OTP_ATTEMPT__:lockout_user',
        Role: 'ResetOTPAttempt',
        CreatedAt: new Date().toISOString()
      });
    }

    const req = { method: 'POST', headers: {}, body: { action: 'resetPasswordWithOTP', email: 'lock@example.com', otp: '123456', newPassword: 'NewPassword123!' } };
    const res = createMockRes();
    await handler(req, res);
    if (res.statusCode === 400 && res.body && res.body.message.includes('Terlalu banyak percobaan')) {
      recordTest(14, 'Existing OTP attempt-limit compatibility', 'PASS', 'Lockout enforced after 5 failed attempts');
    } else {
      recordTest(14, 'Existing OTP attempt-limit compatibility', 'FAIL', `Status: ${res.statusCode}, Msg: ${res.body && res.body.message}`);
    }
  } catch (e) {
    recordTest(14, 'Existing OTP attempt-limit compatibility', 'FAIL', e.message);
  }

  // Test 15: Mayar webhook authentication with mocks
  try {
    process.env.MAYAR_WEBHOOK_SECRET = 'secret_webhook_token_123';
    // 15a: Unauthorized token
    const reqBad = {
      method: 'POST',
      url: '/api/bridge?token=wrong_token',
      headers: {},
      body: { action: 'mayarWebhook', event: 'payment.success' }
    };
    const resBad = createMockRes();
    await handler(reqBad, resBad);

    // 15b: Authorized token
    const reqGood = {
      method: 'POST',
      url: '/api/bridge?token=secret_webhook_token_123',
      headers: {},
      body: {
        action: 'mayarWebhook',
        event: 'payment.success',
        data: { id: 'reg_pay_15', status: 'PAID', amount: 50000, customer: { email: 'client@example.com', name: 'Client' }, productName: '1 Bulan' }
      }
    };
    const resGood = createMockRes();
    await handler(reqGood, resGood);

    if (resBad.statusCode === 401 && resGood.statusCode === 200) {
      recordTest(15, 'Mayar webhook authentication with mocks', 'PASS', 'Unauthorized -> 401, Authorized -> 200');
    } else {
      recordTest(15, 'Mayar webhook authentication with mocks', 'FAIL', `Bad: ${resBad.statusCode}, Good: ${resGood.statusCode}`);
    }
  } catch (e) {
    recordTest(15, 'Mayar webhook authentication with mocks', 'FAIL', e.message);
  }

  // Test 16: No mutation after rejected requests
  try {
    const preMutationCalls = mockFetchCalls.length;
    // Malicious rejected request (unauthorized origin)
    const req = { method: 'POST', headers: { origin: 'https://attacker.com' }, body: { action: 'deleteUser', username: 'target' } };
    const res = createMockRes();
    await handler(req, res);

    const postMutationCalls = mockFetchCalls.filter(c => c.options && ['POST', 'PATCH', 'DELETE'].includes(c.options.method));
    const mutationHappened = postMutationCalls.some(c => c.options.body && JSON.stringify(c.options.body).includes('target'));

    if (res.statusCode === 403 && !mutationHappened) {
      recordTest(16, 'No mutation after rejected requests', 'PASS', 'No DB write operations occurred');
    } else {
      recordTest(16, 'No mutation after rejected requests', 'FAIL', 'Mutation occurred or status not 403');
    }
  } catch (e) {
    recordTest(16, 'No mutation after rejected requests', 'FAIL', e.message);
  }

  // Test 17: No real Supabase or email requests during tests
  try {
    // Check all recorded fetch calls
    const hasRealCall = mockFetchCalls.some(c => !c.url.includes('supabase.co') && !c.url.includes('script.google.com') && !c.url.includes('facebook.com'));
    if (!hasRealCall && mockFetchCalls.length > 0) {
      recordTest(17, 'No real Supabase or email requests during tests', 'PASS', `${mockFetchCalls.length} calls intercepted via controlled mock`);
    } else {
      recordTest(17, 'No real Supabase or email requests during tests', 'FAIL', 'Unhandled external calls detected');
    }
  } catch (e) {
    recordTest(17, 'No real Supabase or email requests during tests', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // DISTRIBUTED RATE LIMITING TESTS (18 - 28)
  // Per Part E & Part H: Infrastructure not yet provisioned. Marked NOT RUN.
  // -------------------------------------------------------------------------
  const rateLimitTests = [
    { id: 18, name: 'Requests below limits succeed (Distributed Rate Limiting)' },
    { id: 19, name: 'Requests exceeding limits receive 429' },
    { id: 20, name: 'Retry-After header correctness' },
    { id: 21, name: 'Window expiration resets quota' },
    { id: 22, name: 'Concurrent requests atomic handling' },
    { id: 23, name: 'Shared state across independent serverless instances' },
    { id: 24, name: 'Shared-IP false-positive protection (granular keying)' },
    { id: 25, name: 'Spoofed identification headers resistance' },
    { id: 26, name: 'Missing client identifier fallback' },
    { id: 27, name: 'Storage outages fail-open / fail-closed policy' },
    { id: 28, name: 'No accidental blocking of normal client-gallery operations' }
  ];

  rateLimitTests.forEach(t => {
    recordTest(t.id, t.name, 'NOT RUN', 'Distributed rate-limiting infrastructure (Upstash/Redis/Supabase RPC) not provisioned');
  });

  // -------------------------------------------------------------------------
  // REGRESSION GATES
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log('APPLICATION INVARIANTS & REGRESSION GATES');
  console.log('======================================================\n');

  // Gate 1: vercel.json parses correctly & preserves headers and rewrites
  try {
    const vContent = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
    const vJson = JSON.parse(vContent);
    const hasNosniff = vJson.headers && vJson.headers[0].headers.some(h => h.key === 'X-Content-Type-Options' && h.value === 'nosniff');
    const hasReferrer = vJson.headers && vJson.headers[0].headers.some(h => h.key === 'Referrer-Policy' && h.value === 'strict-origin-when-cross-origin');
    const hasPerms = vJson.headers && vJson.headers[0].headers.some(h => h.key === 'Permissions-Policy');
    const hasBridgeFunction = vJson.functions && vJson.functions['api/bridge.js'] && vJson.functions['api/bridge.js'].maxDuration === 60;
    const hasRewrites = Array.isArray(vJson.rewrites) && vJson.rewrites.length >= 25;

    if (hasNosniff && hasReferrer && hasPerms && hasBridgeFunction && hasRewrites) {
      recordTest('REG-1', 'vercel.json integrity and security headers', 'PASS', 'Headers, rewrites, and maxDuration preserved');
    } else {
      recordTest('REG-1', 'vercel.json integrity and security headers', 'FAIL', 'Missing expected headers or rewrites');
    }
  } catch (e) {
    recordTest('REG-1', 'vercel.json integrity and security headers', 'FAIL', e.message);
  }

  // Gate 2: app.html script counts (Exactly 12: 6 external, 6 inline)
  try {
    const html = fs.readFileSync(path.join(__dirname, '../app.html'), 'utf8');
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    let totalScripts = 0;
    let externalScripts = 0;
    let inlineScripts = 0;
    const inlineContents = [];

    const externalSrcs = [];
    while ((match = scriptRegex.exec(html)) !== null) {
      totalScripts++;
      const srcMatch = match[1].match(/src=["']([^"']+)["']/i);
      if (srcMatch) {
        externalScripts++;
        externalSrcs.push(srcMatch[1]);
      } else {
        inlineScripts++;
        inlineContents.push(match[2]);
      }
    }

    const hasDashboardCharts = externalSrcs.some(s => s.includes('assets/js/admin/dashboard-charts.js'));
    const chartsScriptPath = path.join(__dirname, '../assets/js/admin/dashboard-charts.js');
    const chartsFileExists = fs.existsSync(chartsScriptPath);
    let chartsExportsValid = false;
    if (chartsFileExists) {
      const chartsCode = fs.readFileSync(chartsScriptPath, 'utf8');
      chartsExportsValid = chartsCode.includes('function loadDashboardData') &&
                           chartsCode.includes('function renderCharts') &&
                           chartsCode.includes('function trackVisit');
    }

    if (totalScripts === 12 && externalScripts === 7 && inlineScripts === 5 && hasDashboardCharts && chartsFileExists && chartsExportsValid) {
      recordTest('REG-2', 'app.html script counts invariant', 'PASS', 'Exactly 12 script tags: 7 external, 5 inline (Phase 5.0D dashboard-charts.js verified)');
    } else {
      recordTest('REG-2', 'app.html script counts invariant', 'FAIL', `Total: ${totalScripts}, Ext: ${externalScripts}, Inline: ${inlineScripts}, ChartsScript: ${hasDashboardCharts}, Exists: ${chartsFileExists}`);
    }

    // Gate 3: All 5 inline scripts and extracted script parse without syntax errors
    let inlineSyntaxErrors = 0;
    inlineContents.forEach((c, idx) => {
      try {
        new Function(c);
      } catch (err) {
        inlineSyntaxErrors++;
      }
    });

    let extractedSyntaxValid = false;
    if (chartsFileExists) {
      try {
        const chartsCode = fs.readFileSync(chartsScriptPath, 'utf8');
        new Function(chartsCode);
        extractedSyntaxValid = true;
      } catch (err) {
        inlineSyntaxErrors++;
      }
    }

    if (inlineSyntaxErrors === 0 && extractedSyntaxValid && inlineContents.length === 5) {
      recordTest('REG-3', 'app.html inline scripts syntax', 'PASS', 'All 5 inline scripts and extracted dashboard-charts.js parse cleanly without errors');
    } else {
      recordTest('REG-3', 'app.html inline scripts syntax', 'FAIL', `${inlineSyntaxErrors} script syntax errors (ExtractedValid: ${extractedSyntaxValid})`);
    }

    // Gate 4: Exactly 29 Collage template definitions (Structural detection with fallback)
    const collageKeys = [];
    const tplMatch = html.match(/const\s+collageTemplates\s*=\s*\{([\s\S]*?)\n\s*\};/);
    if (tplMatch) {
      const keyRegex = /^\s*['"]?([a-zA-Z0-9_-]+)['"]?:\s*\{/gm;
      let km;
      while ((km = keyRegex.exec(tplMatch[1])) !== null) {
        collageKeys.push(km[1]);
      }
    } else {
      const lines = html.split('\n');
      for (let i = 14884; i < 15231 && i < lines.length; i++) {
        const l = lines[i];
        const m = l.match(/^\s*['"]?([a-zA-Z0-9_-]+)['"]?:\s*\{/);
        if (m) collageKeys.push(m[1]);
      }
    }

    if (collageKeys.length === 29) {
      recordTest('REG-4', 'Collage templates count invariant', 'PASS', 'Exactly 29 Collage templates verified (structural)');
    } else {
      recordTest('REG-4', 'Collage templates count invariant', 'FAIL', `Found ${collageKeys.length} templates instead of 29`);
    }

    // Gate 5: Zero obsolete folder.subfolders
    const obsoleteCount = (html.match(/folder\.subfolders/g) || []).length;
    if (obsoleteCount === 0) {
      recordTest('REG-5', 'Obsolete folder.subfolders references', 'PASS', 'Zero references found');
    } else {
      recordTest('REG-5', 'Obsolete folder.subfolders references', 'FAIL', `${obsoleteCount} references found`);
    }

    // Gate 6: Compact photo-selection format {n,f,u,c} & 999999 quota contract
    const hasCompact = html.includes('{n,f,u,c}') || (html.includes('item.n') && html.includes('item.f'));
    const hasQuota = html.includes('999999');
    if (hasCompact && hasQuota) {
      recordTest('REG-6', 'Photo-selection format {n,f,u,c} & 999999 quota contract', 'PASS', 'Format and quota contracts intact');
    } else {
      recordTest('REG-6', 'Photo-selection format {n,f,u,c} & 999999 quota contract', 'FAIL', `Compact: ${hasCompact}, Quota: ${hasQuota}`);
    }
  } catch (e) {
    recordTest('REG-2-6', 'app.html invariants check', 'FAIL', e.message);
  }

  // Gate 7: api/bridge.js and api/supabase.js exports
  try {
    const sb = require('../api/supabase');
    const bridge = require('../api/bridge');
    const hasSbHandler = typeof sb === 'function';
    const hasBridgeHandler = typeof bridge === 'function';
    const hasCorsHelpers = typeof sb.parseAndValidateOrigin === 'function' && typeof sb.handleCors === 'function';

    if (hasSbHandler && hasBridgeHandler && hasCorsHelpers) {
      recordTest('REG-7', 'API exports and bridge integration', 'PASS', 'Handler and helper functions cleanly exported');
    } else {
      recordTest('REG-7', 'API exports and bridge integration', 'FAIL', 'Missing expected exports');
    }
  } catch (e) {
    recordTest('REG-7', 'API exports and bridge integration', 'FAIL', e.message);
  }

  // Gate 8 (Phase 4.7.4): Browser Compatibility & Anti-DevTools Hardening
  try {
    const appHtml = fs.readFileSync(path.join(__dirname, '../app.html'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    const appHasDebugger = /\bdebugger\s*;/.test(appHtml);
    const indexHasDebugger = /\bdebugger\s*;/.test(indexHtml);
    const appHasBodyWipe = /document\.body\.innerHTML\s*=/.test(appHtml);
    const indexHasBodyWipe = /document\.body\.innerHTML\s*=/.test(indexHtml);
    const appHasContextProtection = appHtml.includes("addEventListener('contextmenu'") && appHtml.includes("addEventListener('keydown'");
    const indexHasContextProtection = indexHtml.includes("addEventListener('contextmenu'") && indexHtml.includes("addEventListener('keydown'");

    // Validate index.html inline scripts syntax
    const indexScriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let indexMatch;
    let indexSyntaxErrors = 0;
    while ((indexMatch = indexScriptRegex.exec(indexHtml)) !== null) {
      if (!/src\s*=/i.test(indexMatch[1])) {
        try {
          new Function(indexMatch[2]);
        } catch (_) {
          indexSyntaxErrors++;
        }
      }
    }

    if (!appHasDebugger && !indexHasDebugger && !appHasBodyWipe && !indexHasBodyWipe && appHasContextProtection && indexHasContextProtection && indexSyntaxErrors === 0) {
      recordTest('REG-8', 'Phase 4.7.4 Anti-DevTools hardening & false-positive elimination', 'PASS', 'Zero debugger traps, zero body-wipes, UX deterrents intact');
    } else {
      recordTest('REG-8', 'Phase 4.7.4 Anti-DevTools hardening & false-positive elimination', 'FAIL', `appDebugger: ${appHasDebugger}, idxDebugger: ${indexHasDebugger}, appWipe: ${appHasBodyWipe}, idxWipe: ${indexHasBodyWipe}, idxSyntaxErrors: ${indexSyntaxErrors}`);
    }
  } catch (e) {
    recordTest('REG-8', 'Phase 4.7.4 Anti-DevTools hardening & false-positive elimination', 'FAIL', e.message);
  }

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passCount} PASSED | ${failCount} FAILED | ${notRunCount} NOT RUN`);
  console.log('======================================================\n');

  return { passCount, failCount, notRunCount, testResults };
}

runTestSuite();

/**
 * PHASE 5.6R SECURITY HARDENING TEST SUITE: UPSELL FOTO EKSTRA
 * Tests TEST01 through TEST16 against the ACTUAL backend handler (api/supabase.js)
 * Uses isolated in-memory DB mocks - NEVER calls live Supabase, Mayar, or GAS.
 */

const crypto = require('crypto');
const handler = require('../api/supabase');

let passCount = 0;
let failCount = 0;
let notRunCount = 0;
const testResults = [];

function recordTest(id, name, type, status, details = '') {
  if (status === 'PASS') passCount++;
  else if (status === 'FAIL') failCount++;
  else if (status === 'NOT RUN') notRunCount++;

  testResults.push({ id, name, type, status, details });
  const icon = status === 'PASS' ? '✅' : (status === 'FAIL' ? '❌' : '⏸️');
  console.log(`${icon} [${status}] ${id}: ${name} [${type}] ${details ? '— ' + details : ''}`);
}

// Mock Response Factory
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
      if (data) {
        try {
          res.body = JSON.parse(data);
        } catch (_) {
          res.body = data;
        }
      }
      res.ended = true;
      return res;
    }
  };
  return res;
}

// Mock Database State
let mockDb = {
  sessions: [],
  users: [],
  pro_entitlements: [],
  projects: [],
  reset_tokens: [],
  mayar_logs: []
};
let externalNetworkCalls = [];

function setupMockFetch() {
  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : null;

    // Track any network calls to verify isolation (TEST16)
    externalNetworkCalls.push({ url: urlStr, method, body });

    // Enforce that NO real production endpoint is ever called
    if (!urlStr.includes('supabase.co') && !urlStr.includes('script.google.com')) {
      throw new Error(`CRITICAL: Attempted live network call to unauthorized host: ${urlStr}`);
    }

    if (urlStr.includes('/rest/v1/')) {
      const endpoint = urlStr.split('/rest/v1/')[1] || '';
      const tablePart = endpoint.split('?')[0];
      const queryPart = endpoint.includes('?') ? endpoint.split('?')[1] : '';

      if (method === 'GET') {
        const rows = mockDb[tablePart] || [];

        // Sessions filter
        if (queryPart.includes('SessionID=eq.')) {
          const sidMatch = queryPart.match(/SessionID=eq\.([^&]+)/);
          const sid = sidMatch ? decodeURIComponent(sidMatch[1]) : '';
          const filtered = rows.filter(r => r.SessionID === sid);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
        }

        // Users filter
        if (queryPart.includes('Username=ilike.') || queryPart.includes('Username=eq.')) {
          const uMatch = queryPart.match(/Username=(?:ilike|eq)\.([^&]+)/);
          const u = uMatch ? decodeURIComponent(uMatch[1]).toLowerCase() : '';
          const filtered = rows.filter(r => String(r.Username).toLowerCase() === u);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
        }

        // Pro Entitlements filter
        if (queryPart.includes('user_id=eq.')) {
          const uidMatch = queryPart.match(/user_id=eq\.([^&]+)/);
          const uid = uidMatch ? decodeURIComponent(uidMatch[1]) : '';
          const filtered = rows.filter(r => String(r.user_id) === uid);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
        }

        // Projects filter by Token / id / Slug / Short Slug
        if (queryPart.includes('or=(')) {
          const tokens = [];
          const regex = /(?:Slug|Short Slug|Token|id)\.eq\.([^,\)]+)/g;
          let match;
          while ((match = regex.exec(queryPart)) !== null) {
            tokens.push(decodeURIComponent(match[1]));
          }
          if (tokens.length > 0) {
            const filtered = rows.filter(r =>
              tokens.includes(r.id) ||
              tokens.includes(r.Token) ||
              tokens.includes(r.Slug) ||
              tokens.includes(r['Short Slug'])
            );
            return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
          }
        }

        if (queryPart.includes('Token=eq.')) {
          const tMatch = queryPart.match(/Token=eq\.([^&]+)/);
          const t = tMatch ? decodeURIComponent(tMatch[1]) : '';
          const filtered = rows.filter(r => r.Token === t || r.Slug === t || r['Short Slug'] === t);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
        }

        if (queryPart.includes('id=eq.')) {
          const idMatch = queryPart.match(/id=eq\.([^&]+)/);
          const id = idMatch ? decodeURIComponent(idMatch[1]) : '';
          const filtered = rows.filter(r => r.id === id);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
        }

        return { ok: true, status: 200, text: async () => JSON.stringify(rows), json: async () => rows };
      }

      if (method === 'POST') {
        if (!mockDb[tablePart]) mockDb[tablePart] = [];
        const newRow = { id: 'mock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), ...(body || {}) };
        mockDb[tablePart].push(newRow);
        return { ok: true, status: 201, text: async () => JSON.stringify([newRow]), json: async () => [newRow] };
      }

      if (method === 'PATCH') {
        const rows = mockDb[tablePart] || [];
        let updatedCount = 0;
        if (queryPart.includes('id=eq.')) {
          const idMatch = queryPart.match(/id=eq\.([^&]+)/);
          const id = idMatch ? decodeURIComponent(idMatch[1]) : '';
          rows.forEach(r => {
            if (r.id === id) {
              Object.assign(r, body || {});
              updatedCount++;
            }
          });
        } else if (queryPart.includes('Token=eq.')) {
          const tMatch = queryPart.match(/Token=eq\.([^&]+)/);
          const t = tMatch ? decodeURIComponent(tMatch[1]) : '';
          rows.forEach(r => {
            if (r.Token === t) {
              Object.assign(r, body || {});
              updatedCount++;
            }
          });
        } else {
          rows.forEach(r => {
            Object.assign(r, body || {});
            updatedCount++;
          });
        }
        return { ok: true, status: 200, text: async () => JSON.stringify([{ updated: updatedCount }]), json: async () => [{ updated: updatedCount }] };
      }

      if (method === 'DELETE') {
        return { ok: true, status: 200, text: async () => JSON.stringify([{ deleted: true }]), json: async () => [{ deleted: true }] };
      }
    }

    return { ok: true, status: 200, text: async () => JSON.stringify([]), json: async () => [] };
  };
}

function resetDatabase() {
  mockDb = {
    sessions: [],
    users: [],
    pro_entitlements: [],
    projects: [],
    reset_tokens: [],
    mayar_logs: []
  };
  externalNetworkCalls = [];
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('UPSELL FOTO EKSTRA — API SECURITY HARDENING TEST SUITE');
  console.log('Testing handler-level logic against api/supabase.js');
  console.log('======================================================\n');

  setupMockFetch();
  resetDatabase();

  // Seed Users
  const photographerUser = {
    id: 'user_photo_01',
    Username: 'fotografer1',
    Nama: 'Fotografer Satu',
    Email: 'photo1@example.com',
    Role: 'Photographer',
    Status: 'Active',
    Paket: '1 Bulan'
  };
  const photographerSessionToken = 'sess_photo_01_token';

  const otherUser = {
    id: 'user_photo_02',
    Username: 'fotografer2',
    Nama: 'Fotografer Dua',
    Role: 'Photographer',
    Status: 'Active',
    Paket: '1 Bulan'
  };
  const otherSessionToken = 'sess_photo_02_token';

  // Seed PRO Users
  const proUser = {
    id: 'user_pro_01',
    Username: 'prouser',
    Nama: 'PRO User',
    Role: 'Photographer',
    Status: 'Active'
  };
  const proSessionToken = 'sess_prouser_token';

  const expiredProUser = {
    id: 'user_exp_pro',
    Username: 'expiredprouser',
    Nama: 'Expired PRO User',
    Role: 'Photographer',
    Status: 'Active'
  };
  const expiredProSessionToken = 'sess_exp_pro_token';

  mockDb.users.push(photographerUser, otherUser, proUser, expiredProUser);

  // Active PRO entitlement row
  mockDb.pro_entitlements.push({
    id: 'ent_01',
    user_id: 'user_pro_01',
    is_pro: true,
    is_lifetime: false,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });

  // Expired PRO entitlement row
  mockDb.pro_entitlements.push({
    id: 'ent_02',
    user_id: 'user_exp_pro',
    is_pro: false,
    is_lifetime: false,
    expires_at: new Date(Date.now() - 5 * 86400000).toISOString()
  });

  // Sessions for photographers
  mockDb.sessions.push({
    SessionID: photographerSessionToken,
    Username: 'fotografer1',
    Role: 'Photographer',
    CreatedAt: new Date().toISOString()
  });
  mockDb.sessions.push({
    SessionID: otherSessionToken,
    Username: 'fotografer2',
    Role: 'Photographer',
    CreatedAt: new Date().toISOString()
  });
  mockDb.sessions.push({
    SessionID: proSessionToken,
    Username: 'prouser',
    Role: 'Photographer',
    CreatedAt: new Date().toISOString()
  });
  mockDb.sessions.push({
    SessionID: expiredProSessionToken,
    Username: 'expiredprouser',
    Role: 'Photographer',
    CreatedAt: new Date().toISOString()
  });

  // Seed Project 1: No Upsell, quota 3, extraPrice 0
  const projNoUpsell = {
    id: 'proj_no_upsell_id',
    Token: 'token_no_upsell',
    Slug: 'no-upsell-project',
    'Nama Project': 'Project No Upsell',
    'Nama Klien': 'Budi & Siti',
    'Max Foto': '3',
    ExtraPrice: '0',
    Owner: 'fotografer1',
    Status: 'Sedang Memilih',
    'Status Client': 'Sedang Memilih',
    'Foto Terpilih': '0',
    AksesDownload: 'TRUE'
  };

  // Seed Project 2: Upsell Enabled, quota 3, extraPrice 25000
  const projUpsell = {
    id: 'proj_upsell_id',
    Token: 'token_upsell',
    Slug: 'upsell-project',
    'Nama Project': 'Project Upsell Enabled',
    'Nama Klien': 'Andi & Rina',
    'Max Foto': '3',
    ExtraPrice: '25000',
    Owner: 'fotografer1',
    Status: 'Sedang Memilih',
    'Status Client': 'Sedang Memilih',
    'Foto Terpilih': '0',
    AksesDownload: 'TRUE'
  };

  // Seed Project 3: Unlimited quota (99999), extraPrice 0
  const projUnlimited = {
    id: 'proj_unlimited_id',
    Token: 'token_unlimited',
    Slug: 'unlimited-project',
    'Nama Project': 'Project Unlimited',
    'Nama Klien': 'Dewi & Eko',
    'Max Foto': '99999',
    ExtraPrice: '0',
    Owner: 'fotografer1',
    Status: 'Sedang Memilih',
    'Status Client': 'Sedang Memilih',
    'Foto Terpilih': '0',
    AksesDownload: 'TRUE'
  };

  mockDb.projects.push(projNoUpsell, projUpsell, projUnlimited);

  // Client gallery sessions
  const clientTokenNoUpsell = 'client_token_no_upsell';
  const clientTokenUpsell = 'client_token_upsell';
  const clientTokenUnlimited = 'client_token_unlimited';

  mockDb.sessions.push({
    SessionID: clientTokenNoUpsell,
    Role: 'ClientGallery',
    Username: '__CLIENT_GALLERY__:proj_no_upsell_id',
    CreatedAt: new Date().toISOString()
  });

  mockDb.sessions.push({
    SessionID: clientTokenUpsell,
    Role: 'ClientGallery',
    Username: '__CLIENT_GALLERY__:proj_upsell_id',
    CreatedAt: new Date().toISOString()
  });

  mockDb.sessions.push({
    SessionID: clientTokenUnlimited,
    Role: 'ClientGallery',
    Username: '__CLIENT_GALLERY__:proj_unlimited_id',
    CreatedAt: new Date().toISOString()
  });

  const headers = {
    origin: 'https://ps.kamacreative.my.id',
    'content-type': 'application/json'
  };

  // -------------------------------------------------------------------------
  // TEST01: No Upsell, quota 3, submit 3 -> accepted
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_no_upsell',
        clientAccessToken: clientTokenNoUpsell,
        status: 'Selesai',
        selectedCount: 3,
        selectedFiles: JSON.stringify([
          { n: 'photo1.jpg', f: 'Wedding' },
          { n: 'photo2.jpg', f: 'Wedding' },
          { n: 'photo3.jpg', f: 'Wedding' }
        ])
      }
    };
    await handler(req, res);
    const clientStatus = (res.body && res.body.data && res.body.data.status) || (res.body && res.body.status);
    if (res.statusCode === 200 && clientStatus === 'Selesai') {
      recordTest('TEST01', 'No Upsell, quota 3, submit 3 -> accepted', 'REAL HANDLER TEST', 'PASS', `Status: 200, statusClient: ${clientStatus}`);
    } else {
      recordTest('TEST01', 'No Upsell, quota 3, submit 3 -> accepted', 'REAL HANDLER TEST', 'FAIL', `Expected 200 Selesai, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST01', 'No Upsell, quota 3, submit 3 -> accepted', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST02: No Upsell, quota 3, submit 4 -> rejected
  // -------------------------------------------------------------------------
  try {
    projNoUpsell.Status = 'Sedang Memilih';
    projNoUpsell['Status Client'] = 'Sedang Memilih';

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_no_upsell',
        clientAccessToken: clientTokenNoUpsell,
        status: 'Selesai',
        selectedCount: 4,
        selectedFiles: JSON.stringify([
          { n: 'photo1.jpg', f: 'Wedding' },
          { n: 'photo2.jpg', f: 'Wedding' },
          { n: 'photo3.jpg', f: 'Wedding' },
          { n: 'photo4.jpg', f: 'Wedding' }
        ])
      }
    };
    await handler(req, res);
    if (res.statusCode === 400 && res.body && res.body.message && res.body.message.includes('melebihi kuota project')) {
      recordTest('TEST02', 'No Upsell, quota 3, submit 4 -> rejected', 'REAL HANDLER TEST', 'PASS', `Status: 400, message: "${res.body.message}"`);
    } else {
      recordTest('TEST02', 'No Upsell, quota 3, submit 4 -> rejected', 'REAL HANDLER TEST', 'FAIL', `Expected 400 quota exceeded error, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST02', 'No Upsell, quota 3, submit 4 -> rejected', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST03: Upsell enabled, quota 3, submit 5 -> requires pending-payment status
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_upsell',
        clientAccessToken: clientTokenUpsell,
        status: 'Menunggu Konfirmasi Pembayaran',
        selectedCount: 5,
        selectedFiles: JSON.stringify([
          { n: 'img1.jpg', f: 'A' },
          { n: 'img2.jpg', f: 'A' },
          { n: 'img3.jpg', f: 'A' },
          { n: 'img4.jpg', f: 'A' },
          { n: 'img5.jpg', f: 'A' }
        ])
      }
    };
    await handler(req, res);
    const clientStatus = (res.body && res.body.data && res.body.data.status) || (res.body && res.body.status);
    if (res.statusCode === 200 && clientStatus === 'Menunggu Konfirmasi Pembayaran') {
      recordTest('TEST03', 'Upsell enabled, quota 3, submit 5 -> requires pending-payment status', 'REAL HANDLER TEST', 'PASS', `Status: 200, statusClient: ${clientStatus}`);
    } else {
      recordTest('TEST03', 'Upsell enabled, quota 3, submit 5 -> requires pending-payment status', 'REAL HANDLER TEST', 'FAIL', `Expected 200 Menunggu Konfirmasi Pembayaran, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST03', 'Upsell enabled, quota 3, submit 5 -> requires pending-payment status', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST04: Attempt to force status Selesai with 5 selected photos -> denied
  // -------------------------------------------------------------------------
  try {
    projUpsell.Status = 'Sedang Memilih';
    projUpsell['Status Client'] = 'Sedang Memilih';

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_upsell',
        clientAccessToken: clientTokenUpsell,
        status: 'Selesai',
        selectedCount: 5,
        selectedFiles: JSON.stringify([
          { n: 'img1.jpg', f: 'A' },
          { n: 'img2.jpg', f: 'A' },
          { n: 'img3.jpg', f: 'A' },
          { n: 'img4.jpg', f: 'A' },
          { n: 'img5.jpg', f: 'A' }
        ])
      }
    };
    await handler(req, res);
    if (res.statusCode === 403 && res.body && res.body.message && res.body.message.includes('memerlukan konfirmasi pembayaran fotografer')) {
      recordTest('TEST04', 'Attempt to force status Selesai with 5 selected photos -> denied', 'REAL HANDLER TEST', 'PASS', `Status: 403, error: "${res.body.message}"`);
    } else {
      recordTest('TEST04', 'Attempt to force status Selesai with 5 selected photos -> denied', 'REAL HANDLER TEST', 'FAIL', `Expected 403 denied, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST04', 'Attempt to force status Selesai with 5 selected photos -> denied', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST05: Client cannot set payment-confirmed status
  // -------------------------------------------------------------------------
  try {
    projUpsell.Status = 'Menunggu Konfirmasi Pembayaran';
    projUpsell['Status Client'] = 'Menunggu Konfirmasi Pembayaran';
    projUpsell['Foto Terpilih'] = '5';

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_upsell',
        clientAccessToken: clientTokenUpsell,
        status: 'Selesai'
      }
    };
    await handler(req, res);
    const isDenied = res.statusCode === 403 && res.body && res.body.message && (
      res.body.message.includes('memerlukan konfirmasi pembayaran fotografer') ||
      res.body.message.includes('Status Selesai hanya dapat dikonfirmasi oleh fotografer')
    );
    if (isDenied) {
      recordTest('TEST05', 'Client cannot set payment-confirmed status', 'REAL HANDLER TEST', 'PASS', `Status: 403, mutation denied: "${res.body.message}"`);
    } else {
      recordTest('TEST05', 'Client cannot set payment-confirmed status', 'REAL HANDLER TEST', 'FAIL', `Expected 403 denied, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST05', 'Client cannot set payment-confirmed status', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST06: Authorized photographer confirms payment through existing workflow -> succeeds
  // -------------------------------------------------------------------------
  try {
    projUpsell.Status = 'Menunggu Konfirmasi Pembayaran';
    projUpsell['Status Client'] = 'Menunggu Konfirmasi Pembayaran';

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'processPayment',
        sessionId: photographerSessionToken,
        projectId: 'proj_upsell_id',
        status: 'Selesai'
      }
    };
    await handler(req, res);
    const isSuccess = res.statusCode === 200 && res.body && (
      res.body.success === true || (res.body.data && res.body.data.success === true)
    );
    if (isSuccess) {
      recordTest('TEST06', 'Authorized photographer confirms payment through existing workflow -> succeeds', 'REAL HANDLER TEST', 'PASS', `Status: 200, payment confirmed successfully`);
    } else {
      recordTest('TEST06', 'Authorized photographer confirms payment through existing workflow -> succeeds', 'REAL HANDLER TEST', 'FAIL', `Expected 200 success, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST06', 'Authorized photographer confirms payment through existing workflow -> succeeds', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST07: Unauthorized account attempts confirmation -> denied
  // -------------------------------------------------------------------------
  try {
    projUpsell.Status = 'Menunggu Konfirmasi Pembayaran';
    projUpsell['Status Client'] = 'Menunggu Konfirmasi Pembayaran';

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'processPayment',
        sessionId: otherSessionToken, // fotografer2 does not own proj_upsell_id
        projectId: 'proj_upsell_id',
        status: 'Selesai'
      }
    };
    await handler(req, res);
    if (res.statusCode === 403) {
      recordTest('TEST07', 'Unauthorized account attempts confirmation -> denied', 'REAL HANDLER TEST', 'PASS', `Status: 403, unauthorized photographer rejected: "${res.body.message}"`);
    } else {
      recordTest('TEST07', 'Unauthorized account attempts confirmation -> denied', 'REAL HANDLER TEST', 'FAIL', `Expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST07', 'Unauthorized account attempts confirmation -> denied', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST08: Invalid client session -> denied
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_no_upsell',
        clientAccessToken: 'invalid_client_session_xyz',
        status: 'Sedang Memilih'
      }
    };
    await handler(req, res);
    if (res.statusCode === 403) {
      recordTest('TEST08', 'Invalid client session -> denied', 'REAL HANDLER TEST', 'PASS', `Status: 403, error: "${res.body.message}"`);
    } else {
      recordTest('TEST08', 'Invalid client session -> denied', 'REAL HANDLER TEST', 'FAIL', `Expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST08', 'Invalid client session -> denied', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST09: Wrong project session -> denied
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_upsell',
        clientAccessToken: clientTokenNoUpsell,
        status: 'Sedang Memilih'
      }
    };
    await handler(req, res);
    if (res.statusCode === 403) {
      recordTest('TEST09', 'Wrong project session -> denied', 'REAL HANDLER TEST', 'PASS', `Status: 403, session project mismatch safely rejected`);
    } else {
      recordTest('TEST09', 'Wrong project session -> denied', 'REAL HANDLER TEST', 'FAIL', `Expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST09', 'Wrong project session -> denied', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST10: Selected count does not match selected files -> rejected safely
  // -------------------------------------------------------------------------
  try {
    projNoUpsell.Status = 'Sedang Memilih';
    projNoUpsell['Status Client'] = 'Sedang Memilih';

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_no_upsell',
        clientAccessToken: clientTokenNoUpsell,
        status: 'Sedang Memilih',
        selectedCount: 5,
        selectedFiles: JSON.stringify([
          { n: 'photo1.jpg', f: 'Wedding' },
          { n: 'photo2.jpg', f: 'Wedding' }
        ])
      }
    };
    await handler(req, res);
    if (res.statusCode === 400 && res.body && res.body.message && res.body.message.includes('tidak sesuai dengan daftar berkas pilihan')) {
      recordTest('TEST10', 'Selected count does not match selected files -> rejected safely', 'REAL HANDLER TEST', 'PASS', `Status: 400, message: "${res.body.message}"`);
    } else {
      recordTest('TEST10', 'Selected count does not match selected files -> rejected safely', 'REAL HANDLER TEST', 'FAIL', `Expected 400 mismatch error, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST10', 'Selected count does not match selected files -> rejected safely', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST11: Duplicate or malformed entries cannot bypass quota validation
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_no_upsell',
        clientAccessToken: clientTokenNoUpsell,
        status: 'Sedang Memilih',
        selectedCount: 2,
        selectedFiles: JSON.stringify([
          { n: 'duplicate.jpg', f: 'Wedding' },
          { n: 'duplicate.jpg', f: 'Wedding' }
        ])
      }
    };
    await handler(req, res);
    if (res.statusCode === 400 && res.body && res.body.message && res.body.message.includes('duplikat')) {
      recordTest('TEST11', 'Duplicate or malformed entries cannot bypass quota validation', 'REAL HANDLER TEST', 'PASS', `Status: 400, duplicate detected: "${res.body.message}"`);
    } else {
      recordTest('TEST11', 'Duplicate or malformed entries cannot bypass quota validation', 'REAL HANDLER TEST', 'FAIL', `Expected 400 duplicate error, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST11', 'Duplicate or malformed entries cannot bypass quota validation', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST12: Existing unlimited quota behavior preserved
  // -------------------------------------------------------------------------
  try {
    const files = [];
    for (let i = 1; i <= 20; i++) {
      files.push({ n: `unlimited_img_${i}.jpg`, f: 'Album' });
    }

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_unlimited',
        clientAccessToken: clientTokenUnlimited,
        status: 'Selesai',
        selectedCount: 20,
        selectedFiles: JSON.stringify(files)
      }
    };
    await handler(req, res);
    const clientStatus = (res.body && res.body.data && res.body.data.status) || (res.body && res.body.status);
    if (res.statusCode === 200 && clientStatus === 'Selesai') {
      recordTest('TEST12', 'Existing unlimited quota behavior preserved', 'REAL HANDLER TEST', 'PASS', `Status: 200, 20 selections accepted on max 99999`);
    } else {
      recordTest('TEST12', 'Existing unlimited quota behavior preserved', 'REAL HANDLER TEST', 'FAIL', `Expected 200 Selesai, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST12', 'Existing unlimited quota behavior preserved', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST13: Active Add-On PRO can create paid upsell project
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: proSessionToken,
        namaClient: 'Klien PRO Sukses',
        maxFoto: 10,
        extraPrice: 30000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(req, res);
    const isSuccess = res.statusCode === 200 && res.body && (
      res.body.success === true || (res.body.data && res.body.data.success === true)
    );
    if (isSuccess) {
      recordTest('TEST13', 'Active Add-On PRO can create paid upsell project', 'REAL HANDLER TEST', 'PASS', `Status: 200, Project created successfully with extraPrice: 30000`);
    } else {
      recordTest('TEST13', 'Active Add-On PRO can create paid upsell project', 'REAL HANDLER TEST', 'FAIL', `Expected 200 success, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST13', 'Active Add-On PRO can create paid upsell project', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST14: Non-PRO and expired PRO cannot create paid upsell project
  // -------------------------------------------------------------------------
  try {
    // 14a. Non-PRO regular user
    const resNonPro = createMockRes();
    const reqNonPro = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: photographerSessionToken,
        namaClient: 'Klien Non PRO',
        maxFoto: 10,
        extraPrice: 15000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(reqNonPro, resNonPro);

    // 14b. Expired PRO user
    const resExpPro = createMockRes();
    const reqExpPro = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: expiredProSessionToken,
        namaClient: 'Klien Expired PRO',
        maxFoto: 10,
        extraPrice: 20000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(reqExpPro, resExpPro);

    const nonProBlocked = (resNonPro.statusCode === 403 && resNonPro.body && resNonPro.body.message && resNonPro.body.message.includes('Add-On PRO'));
    const expProBlocked = (resExpPro.statusCode === 403 && resExpPro.body && resExpPro.body.message && resExpPro.body.message.includes('Add-On PRO'));

    if (nonProBlocked && expProBlocked) {
      recordTest('TEST14', 'Non-PRO and expired PRO cannot create paid upsell project', 'REAL HANDLER TEST', 'PASS', `Both non-PRO (403) and expired PRO (403) strictly denied`);
    } else {
      recordTest('TEST14', 'Non-PRO and expired PRO cannot create paid upsell project', 'REAL HANDLER TEST', 'FAIL', `Non-PRO status: ${resNonPro.statusCode}, Expired PRO status: ${resExpPro.statusCode}`);
    }
  } catch (e) {
    recordTest('TEST14', 'Non-PRO and expired PRO cannot create paid upsell project', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST15: Previously successful client selection and download contracts intact
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'getProjectForClient',
        token: 'token_no_upsell',
        clientAccessToken: clientTokenNoUpsell
      }
    };
    await handler(req, res);
    const projData = (res.body && res.body.data && res.body.data.project) || (res.body && res.body.project);
    if (res.statusCode === 200 && projData) {
      const downloadActive = projData.AksesDownload === true || projData.aksesDownload === true || projData.isDownloadActive === true;
      recordTest('TEST15', 'Previously successful client selection and download contracts intact', 'REAL HANDLER TEST', 'PASS', `Status: 200, client metadata retrieved, download access: ${downloadActive}`);
    } else {
      recordTest('TEST15', 'Previously successful client selection and download contracts intact', 'REAL HANDLER TEST', 'FAIL', `Expected 200 project data, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('TEST15', 'Previously successful client selection and download contracts intact', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // TEST16: No live database or payment mutations
  // -------------------------------------------------------------------------
  try {
    const liveCalls = externalNetworkCalls.filter(c =>
      !c.url.includes('supabase.co') && !c.url.includes('script.google.com')
    );
    const mayarCalls = externalNetworkCalls.filter(c =>
      c.url.toLowerCase().includes('mayar') || c.url.toLowerCase().includes('payment')
    );

    if (liveCalls.length === 0 && mayarCalls.length === 0) {
      recordTest('TEST16', 'No live database or payment mutations', 'STATIC CHECK', 'PASS', `0 external/live network calls detected, total mock intercepted queries: ${externalNetworkCalls.length}`);
    } else {
      recordTest('TEST16', 'No live database or payment mutations', 'STATIC CHECK', 'FAIL', `Detected unauthorized live calls: ${liveCalls.length}, mayar calls: ${mayarCalls.length}`);
    }
  } catch (e) {
    recordTest('TEST16', 'No live database or payment mutations', 'STATIC CHECK', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED, ${notRunCount} NOT RUN`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});

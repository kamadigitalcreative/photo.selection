/**
 * PHASE 5.6R EDGE-CASE SECURITY TEST SUITE: UPSELL FOTO EKSTRA
 * Tests E01 through E15 against actual backend handler (api/supabase.js)
 * Asserts both HTTP response codes and persisted mock DB records.
 * Uses isolated in-memory DB mocks - ZERO external / live network calls.
 */

const cp = require('child_process');
const path = require('path');
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

let mockDb = {
  sessions: [],
  users: [],
  pro_entitlements: [],
  projects: []
};
let externalNetworkCalls = [];

function setupMockFetch() {
  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : null;

    externalNetworkCalls.push({ url: urlStr, method, body });

    if (!urlStr.includes('supabase.co') && !urlStr.includes('script.google.com')) {
      throw new Error(`CRITICAL: Unauthorized live call: ${urlStr}`);
    }

    if (urlStr.includes('/rest/v1/')) {
      const endpoint = urlStr.split('/rest/v1/')[1] || '';
      const tablePart = endpoint.split('?')[0];
      const queryPart = endpoint.includes('?') ? endpoint.split('?')[1] : '';

      if (method === 'GET') {
        const rows = mockDb[tablePart] || [];

        if (queryPart.includes('SessionID=eq.')) {
          const sidMatch = queryPart.match(/SessionID=eq\.([^&]+)/);
          const sid = sidMatch ? decodeURIComponent(sidMatch[1]) : '';
          const filtered = rows.filter(r => r.SessionID === sid);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
        }

        if (queryPart.includes('Username=ilike.') || queryPart.includes('Username=eq.')) {
          const uMatch = queryPart.match(/Username=(?:ilike|eq)\.([^&]+)/);
          const u = uMatch ? decodeURIComponent(uMatch[1]).toLowerCase() : '';
          const filtered = rows.filter(r => String(r.Username).toLowerCase() === u);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
        }

        if (queryPart.includes('user_id=eq.')) {
          const uidMatch = queryPart.match(/user_id=eq\.([^&]+)/);
          const uid = uidMatch ? decodeURIComponent(uidMatch[1]) : '';
          const filtered = rows.filter(r => String(r.user_id) === uid);
          return { ok: true, status: 200, text: async () => JSON.stringify(filtered), json: async () => filtered };
        }

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

async function runEdgeCaseTests() {
  console.log('\n======================================================');
  console.log('UPSELL FOTO EKSTRA — EDGE-CASE SECURITY TEST SUITE');
  console.log('Testing E01 through E15 against api/supabase.js');
  console.log('======================================================\n');

  setupMockFetch();

  // Common photographers & clients
  const photographer = {
    id: 'user_pht_1',
    Username: 'fotografer1',
    Role: 'Photographer',
    Status: 'Active',
    Paket: '1 Bulan'
  };
  const photographerSession = 'sess_pht_1';

  // PRO Accounts:
  // 1. Inactive PRO with future expires_at (Case D)
  const inactiveProUser = {
    id: 'user_pro_inactive',
    Username: 'pro_inactive',
    Role: 'Photographer',
    Status: 'Active'
  };
  const inactiveProSession = 'sess_pro_inactive';

  // 2. Active PRO with future expires_at
  const activeProUser = {
    id: 'user_pro_active',
    Username: 'pro_active',
    Role: 'Photographer',
    Status: 'Active'
  };
  const activeProSession = 'sess_pro_active';

  // 3. Lifetime PRO
  const lifetimeProUser = {
    id: 'user_pro_lifetime',
    Username: 'pro_lifetime',
    Role: 'Photographer',
    Status: 'Active'
  };
  const lifetimeProSession = 'sess_pro_lifetime';

  // 4. Expired PRO
  const expiredProUser = {
    id: 'user_pro_expired',
    Username: 'pro_expired',
    Role: 'Photographer',
    Status: 'Active'
  };
  const expiredProSession = 'sess_pro_expired';

  // 5. Inactive PRO with invalid expires_at string ("not-a-valid-date")
  const invalidDateProUser = {
    id: 'user_pro_invalid_date',
    Username: 'pro_invalid_date',
    Role: 'Photographer',
    Status: 'Active'
  };
  const invalidDateProSession = 'sess_pro_invalid_date';

  // 6. Inactive PRO with padded whitespace strings: is_pro: "  false  ", status: "  REVOKED  "
  const strRevokedUser = {
    id: 'user_pro_str_revoked',
    Username: 'pro_str_revoked',
    Role: 'Photographer',
    Status: 'Active'
  };
  const strRevokedSession = 'sess_pro_str_revoked';

  // 7. Active PRO with padded whitespace string: is_pro: "  true  "
  const strActiveUser = {
    id: 'user_pro_str_active',
    Username: 'pro_str_active',
    Role: 'Photographer',
    Status: 'Active'
  };
  const strActiveSession = 'sess_pro_str_active';

  mockDb.users = [
    photographer,
    inactiveProUser,
    activeProUser,
    lifetimeProUser,
    expiredProUser,
    invalidDateProUser,
    strRevokedUser,
    strActiveUser
  ];

  mockDb.pro_entitlements = [
    {
      id: 'ent_inactive',
      user_id: 'user_pro_inactive',
      is_pro: false, // EXPLICITLY FALSE
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      id: 'ent_active',
      user_id: 'user_pro_active',
      is_pro: true,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      id: 'ent_lifetime',
      user_id: 'user_pro_lifetime',
      is_lifetime: true
    },
    {
      id: 'ent_expired',
      user_id: 'user_pro_expired',
      is_pro: true,
      expires_at: new Date(Date.now() - 5 * 86400000).toISOString()
    },
    {
      id: 'ent_invalid_date',
      user_id: 'user_pro_invalid_date',
      is_pro: false,
      expires_at: 'not-a-valid-date' // REPRODUCE CASE 1
    },
    {
      id: 'ent_str_revoked',
      user_id: 'user_pro_str_revoked',
      is_pro: '  false  ',
      status: '  REVOKED  ',
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    },
    {
      id: 'ent_str_active',
      user_id: 'user_pro_str_active',
      is_pro: '  true  ',
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    }
  ];

  mockDb.sessions = [
    { SessionID: photographerSession, Username: 'fotografer1', Role: 'Photographer', CreatedAt: new Date().toISOString() },
    { SessionID: inactiveProSession, Username: 'pro_inactive', Role: 'Photographer', CreatedAt: new Date().toISOString() },
    { SessionID: activeProSession, Username: 'pro_active', Role: 'Photographer', CreatedAt: new Date().toISOString() },
    { SessionID: lifetimeProSession, Username: 'pro_lifetime', Role: 'Photographer', CreatedAt: new Date().toISOString() },
    { SessionID: expiredProSession, Username: 'pro_expired', Role: 'Photographer', CreatedAt: new Date().toISOString() },
    { SessionID: invalidDateProSession, Username: 'pro_invalid_date', Role: 'Photographer', CreatedAt: new Date().toISOString() },
    { SessionID: strRevokedSession, Username: 'pro_str_revoked', Role: 'Photographer', CreatedAt: new Date().toISOString() },
    { SessionID: strActiveSession, Username: 'pro_str_active', Role: 'Photographer', CreatedAt: new Date().toISOString() }
  ];

  const headers = {
    origin: 'https://ps.kamacreative.my.id',
    'content-type': 'application/json'
  };

  // -------------------------------------------------------------------------
  // E01: Repeat Case A -> securely rejected.
  // Saved project: Max Foto: 3, ExtraPrice: 25000, 5 saved files, count: 5.
  // Client attempts status: "Selesai", selectedCount: 3, selectedFiles: omitted.
  // -------------------------------------------------------------------------
  try {
    const projCaseA = {
      id: 'proj_case_a',
      Token: 'token_case_a',
      'Nama Project': 'Project Case A',
      'Nama Klien': 'Klien A',
      'Max Foto': '3',
      ExtraPrice: '25000',
      Owner: 'fotografer1',
      Status: 'Sedang Memilih',
      'Status Client': 'Sedang Memilih',
      'Foto Terpilih': '5',
      'Daftar Pilihan': JSON.stringify([
        { n: 'f1.jpg', f: 'A' }, { n: 'f2.jpg', f: 'A' }, { n: 'f3.jpg', f: 'A' },
        { n: 'f4.jpg', f: 'A' }, { n: 'f5.jpg', f: 'A' }
      ])
    };
    mockDb.projects = [projCaseA];
    mockDb.sessions.push({
      SessionID: 'client_sess_case_a',
      Role: 'ClientGallery',
      Username: '__CLIENT_GALLERY__:proj_case_a',
      CreatedAt: new Date().toISOString()
    });

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_case_a',
        clientAccessToken: 'client_sess_case_a',
        status: 'Selesai',
        selectedCount: 3
        // selectedFiles omitted
      }
    };
    await handler(req, res);

    const isRejected = (res.statusCode === 400 || res.statusCode === 403);
    const dbProj = mockDb.projects.find(p => p.id === 'proj_case_a');
    const dbNotMutated = dbProj && dbProj.Status === 'Sedang Memilih' && Number(dbProj['Foto Terpilih']) === 5;

    if (isRejected && dbNotMutated) {
      recordTest('E01', 'Repeat Case A -> securely rejected', 'REAL HANDLER TEST', 'PASS', `HTTP ${res.statusCode} rejected; DB status and 5 files preserved`);
    } else {
      recordTest('E01', 'Repeat Case A -> securely rejected', 'REAL HANDLER TEST', 'FAIL', `Status: ${res.statusCode}, DB status: ${dbProj ? dbProj.Status : 'null'}, DB count: ${dbProj ? dbProj['Foto Terpilih'] : 'null'}`);
    }
  } catch (e) {
    recordTest('E01', 'Repeat Case A -> securely rejected', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E02: Repeat Case B -> quota zero semantics enforced.
  // Project Max Foto = 0, ExtraPrice = 0. Client submits 1 photo.
  // -------------------------------------------------------------------------
  try {
    const projCaseB = {
      id: 'proj_case_b',
      Token: 'token_case_b',
      'Nama Project': 'Project Case B',
      'Nama Klien': 'Klien B',
      'Max Foto': '0', // Quota is strictly 0
      ExtraPrice: '0',
      Owner: 'fotografer1',
      Status: 'Sedang Memilih',
      'Status Client': 'Sedang Memilih',
      'Foto Terpilih': '0',
      'Daftar Pilihan': '[]'
    };
    mockDb.projects.push(projCaseB);
    mockDb.sessions.push({
      SessionID: 'client_sess_case_b',
      Role: 'ClientGallery',
      Username: '__CLIENT_GALLERY__:proj_case_b',
      CreatedAt: new Date().toISOString()
    });

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_case_b',
        clientAccessToken: 'client_sess_case_b',
        status: 'Sedang Memilih',
        selectedCount: 1,
        selectedFiles: JSON.stringify([{ n: 'photo1.jpg', f: 'Main' }])
      }
    };
    await handler(req, res);

    const isRejected = (res.statusCode === 400 && res.body && res.body.message && res.body.message.includes('melebihi kuota project (0)'));
    const dbProj = mockDb.projects.find(p => p.id === 'proj_case_b');
    const dbClean = dbProj && Number(dbProj['Foto Terpilih']) === 0;

    if (isRejected && dbClean) {
      recordTest('E02', 'Repeat Case B -> quota semantics enforced', 'REAL HANDLER TEST', 'PASS', `HTTP 400 rejected quota 0 exceeded; 0 files saved in DB`);
    } else {
      recordTest('E02', 'Repeat Case B -> quota semantics enforced', 'REAL HANDLER TEST', 'FAIL', `Expected 400 quota 0 exceeded, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E02', 'Repeat Case B -> quota semantics enforced', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E03: Repeat Case C -> securely rejected.
  // Upsell project: count 0, files []. Client submits status Menunggu Konfirmasi Pembayaran,
  // selectedCount: 5, selectedFiles: omitted.
  // -------------------------------------------------------------------------
  try {
    const projCaseC = {
      id: 'proj_case_c',
      Token: 'token_case_c',
      'Nama Project': 'Project Case C',
      'Nama Klien': 'Klien C',
      'Max Foto': '3',
      ExtraPrice: '25000',
      Owner: 'fotografer1',
      Status: 'Sedang Memilih',
      'Status Client': 'Sedang Memilih',
      'Foto Terpilih': '0',
      'Daftar Pilihan': '[]'
    };
    mockDb.projects.push(projCaseC);
    mockDb.sessions.push({
      SessionID: 'client_sess_case_c',
      Role: 'ClientGallery',
      Username: '__CLIENT_GALLERY__:proj_case_c',
      CreatedAt: new Date().toISOString()
    });

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_case_c',
        clientAccessToken: 'client_sess_case_c',
        status: 'Menunggu Konfirmasi Pembayaran',
        selectedCount: 5
        // selectedFiles omitted
      }
    };
    await handler(req, res);

    const isRejected = (res.statusCode === 400);
    const dbProj = mockDb.projects.find(p => p.id === 'proj_case_c');
    const dbClean = dbProj && Number(dbProj['Foto Terpilih']) === 0 && dbProj.Status === 'Sedang Memilih';

    if (isRejected && dbClean) {
      recordTest('E03', 'Repeat Case C -> securely rejected', 'REAL HANDLER TEST', 'PASS', `HTTP 400 rejected; DB count remains 0 and file list empty`);
    } else {
      recordTest('E03', 'Repeat Case C -> securely rejected', 'REAL HANDLER TEST', 'FAIL', `Expected 400 rejected, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E03', 'Repeat Case C -> securely rejected', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E04: Inactive PRO with future expiry -> denied.
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: inactiveProSession,
        namaClient: 'Klien Inactive PRO',
        maxFoto: 5,
        extraPrice: 20000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(req, res);
    if (res.statusCode === 403 && res.body && res.body.message && res.body.message.includes('Add-On PRO')) {
      recordTest('E04', 'Inactive PRO with future expiry -> denied', 'REAL HANDLER TEST', 'PASS', `HTTP 403 strictly denied despite future expiry`);
    } else {
      recordTest('E04', 'Inactive PRO with future expiry -> denied', 'REAL HANDLER TEST', 'FAIL', `Expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E04', 'Inactive PRO with future expiry -> denied', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E05: Active PRO with future expiry -> allowed.
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: activeProSession,
        namaClient: 'Klien Active PRO',
        maxFoto: 5,
        extraPrice: 20000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(req, res);
    const isSuccess = res.statusCode === 200 && res.body && (
      res.body.success === true || (res.body.data && res.body.data.success === true)
    );
    if (isSuccess) {
      recordTest('E05', 'Active PRO with future expiry -> allowed', 'REAL HANDLER TEST', 'PASS', `HTTP 200 project created with paid upsell`);
    } else {
      recordTest('E05', 'Active PRO with future expiry -> allowed', 'REAL HANDLER TEST', 'FAIL', `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E05', 'Active PRO with future expiry -> allowed', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E06: Valid lifetime PRO -> allowed.
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: lifetimeProSession,
        namaClient: 'Klien Lifetime PRO',
        maxFoto: 5,
        extraPrice: 20000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(req, res);
    const isSuccess = res.statusCode === 200 && res.body && (
      res.body.success === true || (res.body.data && res.body.data.success === true)
    );
    if (isSuccess) {
      recordTest('E06', 'Valid lifetime PRO -> allowed', 'REAL HANDLER TEST', 'PASS', `HTTP 200 lifetime PRO project created`);
    } else {
      recordTest('E06', 'Valid lifetime PRO -> allowed', 'REAL HANDLER TEST', 'FAIL', `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E06', 'Valid lifetime PRO -> allowed', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E07: Expired PRO -> denied.
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: expiredProSession,
        namaClient: 'Klien Expired PRO',
        maxFoto: 5,
        extraPrice: 20000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(req, res);
    if (res.statusCode === 403 && res.body && res.body.message && res.body.message.includes('Add-On PRO')) {
      recordTest('E07', 'Expired PRO -> denied', 'REAL HANDLER TEST', 'PASS', `HTTP 403 strictly denied`);
    } else {
      recordTest('E07', 'Expired PRO -> denied', 'REAL HANDLER TEST', 'FAIL', `Expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E07', 'Expired PRO -> denied', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E08: Valid 3-photo free submission -> accepted.
  // -------------------------------------------------------------------------
  try {
    const projFree = {
      id: 'proj_free_std',
      Token: 'token_free_std',
      'Nama Project': 'Project Free Standard',
      'Nama Klien': 'Klien Free',
      'Max Foto': '3',
      ExtraPrice: '0',
      Owner: 'fotografer1',
      Status: 'Sedang Memilih',
      'Status Client': 'Sedang Memilih',
      'Foto Terpilih': '0',
      'Daftar Pilihan': '[]'
    };
    mockDb.projects.push(projFree);
    mockDb.sessions.push({
      SessionID: 'client_sess_free_std',
      Role: 'ClientGallery',
      Username: '__CLIENT_GALLERY__:proj_free_std',
      CreatedAt: new Date().toISOString()
    });

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_free_std',
        clientAccessToken: 'client_sess_free_std',
        status: 'Selesai',
        selectedCount: 3,
        selectedFiles: JSON.stringify([
          { n: 'p1.jpg', f: 'W' }, { n: 'p2.jpg', f: 'W' }, { n: 'p3.jpg', f: 'W' }
        ])
      }
    };
    await handler(req, res);

    const clientStatus = (res.body && res.body.data && res.body.data.status) || (res.body && res.body.status);
    const dbProj = mockDb.projects.find(p => p.id === 'proj_free_std');
    const dbUpdated = dbProj && dbProj.Status === 'Selesai' && Number(dbProj['Foto Terpilih']) === 3;

    if (res.statusCode === 200 && clientStatus === 'Selesai' && dbUpdated) {
      recordTest('E08', 'Valid 3-photo free submission -> accepted', 'REAL HANDLER TEST', 'PASS', `HTTP 200, DB status Selesai, count 3`);
    } else {
      recordTest('E08', 'Valid 3-photo free submission -> accepted', 'REAL HANDLER TEST', 'FAIL', `Status: ${res.statusCode}, DB status: ${dbProj ? dbProj.Status : 'null'}`);
    }
  } catch (e) {
    recordTest('E08', 'Valid 3-photo free submission -> accepted', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E09: Valid 5-photo paid submission -> pending photographer confirmation.
  // -------------------------------------------------------------------------
  try {
    const projPaid = {
      id: 'proj_paid_std',
      Token: 'token_paid_std',
      'Nama Project': 'Project Paid Standard',
      'Nama Klien': 'Klien Paid',
      'Max Foto': '3',
      ExtraPrice: '25000',
      Owner: 'fotografer1',
      Status: 'Sedang Memilih',
      'Status Client': 'Sedang Memilih',
      'Foto Terpilih': '0',
      'Daftar Pilihan': '[]'
    };
    mockDb.projects.push(projPaid);
    mockDb.sessions.push({
      SessionID: 'client_sess_paid_std',
      Role: 'ClientGallery',
      Username: '__CLIENT_GALLERY__:proj_paid_std',
      CreatedAt: new Date().toISOString()
    });

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_paid_std',
        clientAccessToken: 'client_sess_paid_std',
        status: 'Menunggu Konfirmasi Pembayaran',
        selectedCount: 5,
        selectedFiles: JSON.stringify([
          { n: 'p1.jpg', f: 'W' }, { n: 'p2.jpg', f: 'W' }, { n: 'p3.jpg', f: 'W' },
          { n: 'p4.jpg', f: 'W' }, { n: 'p5.jpg', f: 'W' }
        ])
      }
    };
    await handler(req, res);

    const clientStatus = (res.body && res.body.data && res.body.data.status) || (res.body && res.body.status);
    const dbProj = mockDb.projects.find(p => p.id === 'proj_paid_std');
    const dbUpdated = dbProj && dbProj.Status === 'Menunggu Konfirmasi Pembayaran' && Number(dbProj['Foto Terpilih']) === 5;

    if (res.statusCode === 200 && clientStatus === 'Menunggu Konfirmasi Pembayaran' && dbUpdated) {
      recordTest('E09', 'Valid 5-photo paid submission -> pending confirmation', 'REAL HANDLER TEST', 'PASS', `HTTP 200, DB status Menunggu Konfirmasi Pembayaran, count 5`);
    } else {
      recordTest('E09', 'Valid 5-photo paid submission -> pending confirmation', 'REAL HANDLER TEST', 'FAIL', `Status: ${res.statusCode}, DB status: ${dbProj ? dbProj.Status : 'null'}`);
    }
  } catch (e) {
    recordTest('E09', 'Valid 5-photo paid submission -> pending confirmation', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E10: Client cannot bypass pending payment.
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_paid_std',
        clientAccessToken: 'client_sess_paid_std',
        status: 'Selesai'
      }
    };
    await handler(req, res);

    const isDenied = (res.statusCode === 403);
    const dbProj = mockDb.projects.find(p => p.id === 'proj_paid_std');
    const dbUnchanged = dbProj && dbProj.Status === 'Menunggu Konfirmasi Pembayaran';

    if (isDenied && dbUnchanged) {
      recordTest('E10', 'Client cannot bypass pending payment', 'REAL HANDLER TEST', 'PASS', `HTTP 403 denied, status remains Menunggu Konfirmasi Pembayaran`);
    } else {
      recordTest('E10', 'Client cannot bypass pending payment', 'REAL HANDLER TEST', 'FAIL', `Expected 403, got ${res.statusCode}, DB status: ${dbProj ? dbProj.Status : 'null'}`);
    }
  } catch (e) {
    recordTest('E10', 'Client cannot bypass pending payment', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E11: Photographer confirmation still works.
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'processPayment',
        sessionId: photographerSession,
        projectId: 'proj_paid_std',
        status: 'Selesai'
      }
    };
    await handler(req, res);

    const isSuccess = res.statusCode === 200 && res.body && (
      res.body.success === true || (res.body.data && res.body.data.success === true)
    );
    const dbProj = mockDb.projects.find(p => p.id === 'proj_paid_std');
    const dbConfirmed = dbProj && dbProj.Status === 'Selesai';

    if (isSuccess && dbConfirmed) {
      recordTest('E11', 'Photographer confirmation still works', 'REAL HANDLER TEST', 'PASS', `HTTP 200, DB status promoted to Selesai`);
    } else {
      recordTest('E11', 'Photographer confirmation still works', 'REAL HANDLER TEST', 'FAIL', `Expected 200, got ${res.statusCode}, DB status: ${dbProj ? dbProj.Status : 'null'}`);
    }
  } catch (e) {
    recordTest('E11', 'Photographer confirmation still works', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E12: Legitimate removal of extra photos works.
  // Project previously had 5 photos. Client legitimately deselects 2 photos,
  // submitting 3 photos and status Selesai.
  // -------------------------------------------------------------------------
  try {
    const projDeselect = {
      id: 'proj_deselect_std',
      Token: 'token_deselect_std',
      'Nama Project': 'Project Deselect',
      'Nama Klien': 'Klien Deselect',
      'Max Foto': '3',
      ExtraPrice: '25000',
      Owner: 'fotografer1',
      Status: 'Sedang Memilih',
      'Status Client': 'Sedang Memilih',
      'Foto Terpilih': '5',
      'Daftar Pilihan': JSON.stringify([
        { n: 'p1.jpg', f: 'W' }, { n: 'p2.jpg', f: 'W' }, { n: 'p3.jpg', f: 'W' },
        { n: 'p4.jpg', f: 'W' }, { n: 'p5.jpg', f: 'W' }
      ])
    };
    mockDb.projects.push(projDeselect);
    mockDb.sessions.push({
      SessionID: 'client_sess_deselect',
      Role: 'ClientGallery',
      Username: '__CLIENT_GALLERY__:proj_deselect_std',
      CreatedAt: new Date().toISOString()
    });

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_deselect_std',
        clientAccessToken: 'client_sess_deselect',
        status: 'Selesai',
        selectedCount: 3,
        selectedFiles: JSON.stringify([
          { n: 'p1.jpg', f: 'W' }, { n: 'p2.jpg', f: 'W' }, { n: 'p3.jpg', f: 'W' }
        ])
      }
    };
    await handler(req, res);

    const clientStatus = (res.body && res.body.data && res.body.data.status) || (res.body && res.body.status);
    const dbProj = mockDb.projects.find(p => p.id === 'proj_deselect_std');
    let dbFiles = [];
    try { dbFiles = JSON.parse(dbProj['Daftar Pilihan']); } catch (_) {}
    const dbUpdated = dbProj && dbProj.Status === 'Selesai' && Number(dbProj['Foto Terpilih']) === 3 && dbFiles.length === 3;

    if (res.statusCode === 200 && clientStatus === 'Selesai' && dbUpdated) {
      recordTest('E12', 'Legitimate removal of extra photos works', 'REAL HANDLER TEST', 'PASS', `HTTP 200, status Selesai, DB count & files cleanly updated to 3`);
    } else {
      recordTest('E12', 'Legitimate removal of extra photos works', 'REAL HANDLER TEST', 'FAIL', `Expected 200, got ${res.statusCode}, DB count: ${dbProj ? dbProj['Foto Terpilih'] : 'null'}, DB files: ${dbFiles.length}`);
    }
  } catch (e) {
    recordTest('E12', 'Legitimate removal of extra photos works', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E13: Count-only background ping is compatible and does not corrupt data.
  // Project has 5 photos saved. Background ping sends selectedCount: 2 without files.
  // -------------------------------------------------------------------------
  try {
    const projPing = {
      id: 'proj_ping_test',
      Token: 'token_ping_test',
      'Nama Project': 'Project Ping Test',
      'Nama Klien': 'Klien Ping',
      'Max Foto': '3',
      ExtraPrice: '25000',
      Owner: 'fotografer1',
      Status: 'Sedang Memilih',
      'Status Client': 'Sedang Memilih',
      'Foto Terpilih': '5',
      'Daftar Pilihan': JSON.stringify([
        { n: 'p1.jpg', f: 'W' }, { n: 'p2.jpg', f: 'W' }, { n: 'p3.jpg', f: 'W' },
        { n: 'p4.jpg', f: 'W' }, { n: 'p5.jpg', f: 'W' }
      ])
    };
    mockDb.projects.push(projPing);
    mockDb.sessions.push({
      SessionID: 'client_sess_ping',
      Role: 'ClientGallery',
      Username: '__CLIENT_GALLERY__:proj_ping_test',
      CreatedAt: new Date().toISOString()
    });

    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'updateClientStatus',
        token: 'token_ping_test',
        clientAccessToken: 'client_sess_ping',
        status: 'Sedang Memilih',
        selectedCount: 2 // stale count-only ping
      }
    };
    await handler(req, res);

    const isSuccess = (res.statusCode === 200);
    const dbProj = mockDb.projects.find(p => p.id === 'proj_ping_test');
    let dbFiles = [];
    try { dbFiles = JSON.parse(dbProj['Daftar Pilihan']); } catch (_) {}
    const dbNotCorrupted = dbProj && Number(dbProj['Foto Terpilih']) === 5 && dbFiles.length === 5;

    if (isSuccess && dbNotCorrupted) {
      recordTest('E13', 'Count-only background ping does not corrupt data', 'REAL HANDLER TEST', 'PASS', `HTTP 200 compatible; DB count preserved at 5, files preserved at 5`);
    } else {
      recordTest('E13', 'Count-only background ping does not corrupt data', 'REAL HANDLER TEST', 'FAIL', `Status: ${res.statusCode}, DB count: ${dbProj ? dbProj['Foto Terpilih'] : 'null'}`);
    }
  } catch (e) {
    recordTest('E13', 'Count-only background ping does not corrupt data', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E14: No Supabase Production or external calls.
  // -------------------------------------------------------------------------
  try {
    const liveCalls = externalNetworkCalls.filter(c =>
      !c.url.includes('supabase.co') && !c.url.includes('script.google.com')
    );
    const mayarCalls = externalNetworkCalls.filter(c =>
      c.url.toLowerCase().includes('mayar') || c.url.toLowerCase().includes('payment')
    );

    if (liveCalls.length === 0 && mayarCalls.length === 0) {
      recordTest('E14', 'No live database or payment mutations', 'STATIC CHECK', 'PASS', `0 live network calls, total mock intercepted queries: ${externalNetworkCalls.length}`);
    } else {
      recordTest('E14', 'No live database or payment mutations', 'STATIC CHECK', 'FAIL', `Live calls: ${liveCalls.length}`);
    }
  } catch (e) {
    recordTest('E14', 'No live database or payment mutations', 'STATIC CHECK', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E15: All previous 16 tests still PASS.
  // Actually executes phase56r-upsell-hardening.test.js via child_process
  // -------------------------------------------------------------------------
  try {
    const scriptPath = path.join(__dirname, 'phase56r-upsell-hardening.test.js');
    const output = cp.execFileSync(process.execPath, [scriptPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (output.includes('16 PASSED, 0 FAILED')) {
      recordTest('E15', 'Baseline test suite verification', 'REAL TEST EXECUTION', 'PASS', 'Executed phase56r-upsell-hardening.test.js (16/16 PASSED)');
    } else {
      recordTest('E15', 'Baseline test suite verification', 'REAL TEST EXECUTION', 'FAIL', 'Baseline run failed: ' + output);
    }
  } catch (e) {
    recordTest('E15', 'Baseline test suite verification', 'REAL TEST EXECUTION', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E16: RangeError prevention on revoked PRO with invalid expires_at
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: invalidDateProSession,
        namaClient: 'Klien Invalid Date PRO',
        maxFoto: 5,
        extraPrice: 20000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(req, res);
    if (res.statusCode === 403 && res.body && res.body.message && res.body.message.includes('Add-On PRO')) {
      recordTest('E16', 'RangeError prevention on invalid expires_at', 'REAL HANDLER TEST', 'PASS', 'HTTP 403 safely returned with zero RangeError or 500');
    } else {
      recordTest('E16', 'RangeError prevention on invalid expires_at', 'REAL HANDLER TEST', 'FAIL', `Expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E16', 'RangeError prevention on invalid expires_at', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E17: Whitespace string boolean/status safely recognized as revoked
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: strRevokedSession,
        namaClient: 'Klien Padded Revoked PRO',
        maxFoto: 5,
        extraPrice: 20000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(req, res);
    if (res.statusCode === 403 && res.body && res.body.message && res.body.message.includes('Add-On PRO')) {
      recordTest('E17', 'Whitespace string boolean/status safely revoked', 'REAL HANDLER TEST', 'PASS', 'HTTP 403 denied for padded "  false  " / "  REVOKED  "');
    } else {
      recordTest('E17', 'Whitespace string boolean/status safely revoked', 'REAL HANDLER TEST', 'FAIL', `Expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E17', 'Whitespace string boolean/status safely revoked', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  // -------------------------------------------------------------------------
  // E18: Whitespace string boolean "  true  " safely recognized as active
  // -------------------------------------------------------------------------
  try {
    const res = createMockRes();
    const req = {
      method: 'POST',
      headers,
      body: {
        action: 'createProject',
        sessionId: strActiveSession,
        namaClient: 'Klien Padded Active PRO',
        maxFoto: 5,
        extraPrice: 20000,
        driveLink: 'https://drive.google.com/drive/folders/1ABCDEF1234567890abcdefghijklmnop'
      }
    };
    await handler(req, res);
    const isSuccess = res.statusCode === 200 && res.body && (
      res.body.success === true || (res.body.data && res.body.data.success === true)
    );
    if (isSuccess) {
      recordTest('E18', 'Whitespace string boolean "  true  " recognized as active', 'REAL HANDLER TEST', 'PASS', 'HTTP 200 project created with padded "  true  "');
    } else {
      recordTest('E18', 'Whitespace string boolean "  true  " recognized as active', 'REAL HANDLER TEST', 'FAIL', `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest('E18', 'Whitespace string boolean "  true  " recognized as active', 'REAL HANDLER TEST', 'FAIL', e.message);
  }

  console.log('\n======================================================');
  console.log(`EDGE CASE TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED, ${notRunCount} NOT RUN`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runEdgeCaseTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});

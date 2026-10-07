const assert = require('assert');
const vm = require('vm');
const fs = require('fs');

console.log('=== RUNNING PHASE 4.4 CLIENT GALLERY SECURITY TEST MATRIX ===\n');

// 1. Load api/supabase.js in a mocked environment
const code = fs.readFileSync('api/supabase.js', 'utf8');

// Mock in-memory database
const mockDb = {
  users: [
    {
      id: 1,
      Username: 'photographer1',
      Role: 'Photographer',
      Status: 'Active',
      BrandName: 'Studio Satu',
      BrandLogo: 'https://example.com/logo1.png',
      BankName: 'BCA',
      BankAccount: '1234567890',
      BankAccountName: 'Studio Satu'
    },
    {
      id: 2,
      Username: 'photographer2',
      Role: 'Photographer',
      Status: 'Active',
      BrandName: 'Studio Dua',
      BrandLogo: 'https://example.com/logo2.png'
    }
  ],
  projects: [
    {
      id: 101,
      Token: 'token-proj-a',
      Slug: 'project-a',
      'Short Slug': 'pa',
      'Nama Client': 'Client A',
      'Password Client': 'correct-pass',
      'Drive Link': 'https://drive.google.com/drive/folders/folder-a',
      'Nomor WA': '628123456789',
      'Max Foto': 50,
      'Foto Terpilih': '0',
      'Daftar Pilihan': '[]',
      Notes: '{}',
      PaymentProof: 'https://example.com/proof-a.jpg',
      'Backup Drive': 'https://drive.google.com/backup-a',
      MusicUrl: 'https://example.com/music-a.mp3',
      Status: 'Belum Memilih',
      'Status Client': 'Belum Memilih',
      Owner: 'photographer1',
      AksesDownload: 'TRUE',
      AksesPilih: 'TRUE'
    },
    {
      id: 102,
      Token: 'token-proj-b',
      Slug: 'project-b',
      'Short Slug': 'pb',
      'Nama Client': 'Client B',
      'Password Client': 'pass-b',
      'Drive Link': 'https://drive.google.com/drive/folders/folder-b',
      'Nomor WA': '628987654321',
      'Max Foto': 40,
      'Foto Terpilih': '0',
      'Daftar Pilihan': '[]',
      Notes: '{}',
      PaymentProof: '',
      'Backup Drive': '',
      MusicUrl: '',
      Status: 'Belum Memilih',
      'Status Client': 'Belum Memilih',
      Owner: 'photographer2',
      AksesDownload: 'TRUE',
      AksesPilih: 'TRUE'
    },
    {
      id: 103,
      Token: 'token-proj-c',
      Slug: 'project-c',
      'Short Slug': 'pc',
      'Nama Client': 'Client C (No Password)',
      'Password Client': '', // passwordless
      'Drive Link': 'https://drive.google.com/drive/folders/folder-c',
      'Nomor WA': '62811111111',
      'Max Foto': 30,
      'Foto Terpilih': '0',
      'Daftar Pilihan': '[]',
      Notes: '{}',
      PaymentProof: '',
      'Backup Drive': '',
      MusicUrl: '',
      Status: 'Belum Memilih',
      'Status Client': 'Belum Memilih',
      Owner: 'photographer1',
      AksesDownload: 'TRUE',
      AksesPilih: 'TRUE'
    }
  ],
  sessions: [
    {
      SessionID: 'account-session-photo1',
      Username: 'photographer1',
      Role: 'Photographer',
      CreatedAt: new Date().toISOString()
    }
  ]
};

// Create mock supabaseQuery
async function mockSupabaseQuery(endpoint, options = {}) {
  const method = options.method || 'GET';
  const url = new URL('https://mock.supabase.co/rest/v1/' + endpoint);
  const table = url.pathname.replace('/rest/v1/', '').split('?')[0];

  if (!mockDb[table]) mockDb[table] = [];

  if (method === 'GET') {
    let rows = [...mockDb[table]];
    for (const [key, val] of url.searchParams.entries()) {
      if (key === 'or') {
        const parts = val.replace(/^\(|\)$/g, '').split(',');
        rows = rows.filter(r => {
          return parts.some(p => {
            const m = p.match(/("?[\w\s]+"?)(\.eq\.|\.ilike\.)(.*)/);
            if (!m) return false;
            let field = m[1].replace(/"/g, '');
            let targetVal = decodeURIComponent(m[3]);
            return String(r[field] || '').toLowerCase() === targetVal.toLowerCase();
          });
        });
      } else if (val.startsWith('eq.')) {
        const target = decodeURIComponent(val.slice(3));
        rows = rows.filter(r => String(r[key] || '') === target);
      } else if (val.startsWith('ilike.')) {
        const target = decodeURIComponent(val.slice(6)).toLowerCase();
        rows = rows.filter(r => String(r[key] || '').toLowerCase() === target);
      }
    }
    return rows;
  }

  if (method === 'POST') {
    const body = options.body;
    if (Array.isArray(body)) {
      mockDb[table].push(...body);
      return body;
    } else {
      mockDb[table].push(body);
      return [body];
    }
  }

  if (method === 'PATCH') {
    let rows = [...mockDb[table]];
    for (const [key, val] of url.searchParams.entries()) {
      if (val.startsWith('eq.')) {
        const target = decodeURIComponent(val.slice(3));
        rows = rows.filter(r => String(r[key] || '') === target);
      }
    }
    rows.forEach(r => Object.assign(r, options.body));
    return rows;
  }

  if (method === 'DELETE') {
    for (const [key, val] of url.searchParams.entries()) {
      if (val.startsWith('eq.')) {
        const target = decodeURIComponent(val.slice(3));
        mockDb[table] = mockDb[table].filter(r => String(r[key] || '') !== target);
      }
    }
    return [];
  }

  return [];
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    json(d) { this.body = d; return this; },
    end() { return this; }
  };
}

const mockModule = { exports: {} };
const sandbox = {
  module: mockModule,
  exports: mockModule.exports,
  require,
  process: {
    env: {
      SUPABASE_URL: 'https://mock.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
      MAYAR_WEBHOOK_SECRET: 'test-secret'
    }
  },
  console,
  Buffer,
  URL,
  setTimeout,
  clearTimeout
};

const script = new vm.Script(code + `
;module.exports = {
  supabaseQuery,
  verifyUserSession,
  findProjectForClient,
  issueClientGallerySession,
  verifyClientGallerySession,
  buildAuthorizedProjectData,
  handleGetProjectForClient,
  handleVerifyClientPassword,
  handleUpdateClientStatus,
  handleReleaseClientSession,
  handleUploadPaymentProof,
  handleGetProjects,
  CLIENT_GALLERY_SESSION_TTL_MS,
  defaultHandler: module.exports
};
`);

const context = vm.createContext(sandbox);
script.runInContext(context);
const mod = mockModule.exports;
context.supabaseQuery = mockSupabaseQuery;

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
    }
  }

  // --- TEST A: Pre-Auth Data Masking ---
  await asyncTest('TEST A — PRE-AUTH DATA MASKING (Project A without access token)', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a' }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'success');
    const d = res.body.data;
    assert.strictEqual(d.accessGranted, false);
    assert.strictEqual(d.hasPassword, true);
    assert.strictEqual(d.needsPassword, true);
    assert.strictEqual(d.brandName, 'Studio Satu');

    // Private fields MUST NOT be present
    const p = d.project || {};
    assert.strictEqual(p.driveLink, undefined, 'driveLink must be omitted');
    assert.strictEqual(p.nomorWA, undefined, 'nomorWA must be omitted');
    assert.strictEqual(p.bankAccount, undefined, 'bankAccount must be omitted');
    assert.strictEqual(p.bankAccountName, undefined, 'bankAccountName must be omitted');
    assert.strictEqual(p.notes, undefined, 'notes must be omitted');
    assert.strictEqual(p.selectedFiles, undefined, 'selectedFiles must be omitted');
    assert.strictEqual(p.paymentProof, undefined, 'paymentProof must be omitted');
    assert.strictEqual(p.backupDrive, undefined, 'backupDrive must be omitted');
    assert.strictEqual(p['Password Client'], undefined, 'Password Client must be omitted');
    assert.strictEqual(d['Password Client'], undefined, 'Password Client must be omitted');
  });

  // --- TEST B: Wrong Password ---
  await asyncTest('TEST B — WRONG PASSWORD (Project A, wrong password)', async () => {
    const res = createMockRes();
    await mod.handleVerifyClientPassword({ token: 'token-proj-a', passwordInput: 'wrong-pass' }, res);
    assert.strictEqual(res.statusCode, 200);
    const d = res.body.data;
    assert.strictEqual(d.valid, false);
    assert.strictEqual(d.accessGranted, false);
    assert.strictEqual(d.clientAccessToken, undefined);
    assert.strictEqual(d.project, undefined);
  });

  // --- TEST C: Correct Password ---
  let projAClientToken = '';
  await asyncTest('TEST C — CORRECT PASSWORD (Project A, correct-pass)', async () => {
    const res = createMockRes();
    await mod.handleVerifyClientPassword({ token: 'token-proj-a', passwordInput: 'correct-pass' }, res);
    assert.strictEqual(res.statusCode, 200);
    const d = res.body.data;
    assert.strictEqual(d.valid, true);
    assert.strictEqual(d.accessGranted, true);
    assert.ok(d.clientAccessToken, 'clientAccessToken must be returned');
    assert.ok(d.project, 'project data must be returned');
    assert.strictEqual(d.project.driveLink, 'https://drive.google.com/drive/folders/folder-a');
    assert.strictEqual(d.project.nomorWA, '628123456789');
    assert.strictEqual(d.project['Password Client'], undefined, 'Password Client must never be returned');
    projAClientToken = d.clientAccessToken;
  });

  // --- TEST D: Valid Session Reload ---
  await asyncTest('TEST D — VALID SESSION RELOAD (Project A with valid clientAccessToken)', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a', clientAccessToken: projAClientToken }, res);
    assert.strictEqual(res.statusCode, 200);
    const d = res.body.data;
    assert.strictEqual(d.accessGranted, true);
    assert.strictEqual(d.clientAccessToken, projAClientToken);
    assert.strictEqual(d.project.driveLink, 'https://drive.google.com/drive/folders/folder-a');
    assert.strictEqual(d.project.needsPassword, false);
  });

  // --- TEST E: Random Client Token ---
  await asyncTest('TEST E — RANDOM TOKEN (Project A with bogus token)', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a', clientAccessToken: 'bogus-random-uuid' }, res);
    assert.strictEqual(res.statusCode, 200);
    const d = res.body.data;
    assert.strictEqual(d.accessGranted, false);
    assert.strictEqual(d.hasPassword, true);
    assert.strictEqual(d.project.driveLink, undefined);
  });

  // --- TEST F: Expired Session ---
  await asyncTest('TEST F — EXPIRED TOKEN (Project A with 25h expired token)', async () => {
    const expiredToken = 'expired-session-token-123';
    mockDb.sessions.push({
      SessionID: expiredToken,
      Username: '__CLIENT_GALLERY__:101',
      Role: 'ClientGallery',
      CreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    });

    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a', clientAccessToken: expiredToken }, res);
    assert.strictEqual(res.statusCode, 200);
    const d = res.body.data;
    assert.strictEqual(d.accessGranted, false);
    assert.strictEqual(d.project.driveLink, undefined);
  });

  // --- TEST G: Cross-Gallery Token ---
  await asyncTest('TEST G — CROSS-GALLERY TOKEN (Project A token used on Project B)', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-b', clientAccessToken: projAClientToken }, res);
    assert.strictEqual(res.statusCode, 200);
    const d = res.body.data;
    assert.strictEqual(d.accessGranted, false);
    assert.strictEqual(d.project.driveLink, undefined);
  });

  // --- TEST H: Account Session as Client Token ---
  await asyncTest('TEST H — ACCOUNT SESSION AS CLIENT TOKEN (Photographer sessionId as client token)', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a', clientAccessToken: 'account-session-photo1' }, res);
    assert.strictEqual(res.statusCode, 200);
    const d = res.body.data;
    assert.strictEqual(d.accessGranted, false);
    assert.strictEqual(d.project.driveLink, undefined);
  });

  // --- TEST I: Client Token as Account Session ---
  await asyncTest('TEST I — CLIENT TOKEN AS ACCOUNT SESSION (Client token used on getProjects)', async () => {
    const authUser = await mod.verifyUserSession({ sessionId: projAClientToken });
    assert.strictEqual(authUser, null, 'verifyUserSession must reject ClientGallery session');
  });

  // --- TEST J: Passwordless Project ---
  let projCClientToken = '';
  await asyncTest('TEST J — PASSWORDLESS PROJECT (Project C auto session & full data)', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-c' }, res);
    assert.strictEqual(res.statusCode, 200);
    const d = res.body.data;
    assert.strictEqual(d.accessGranted, true);
    assert.ok(d.clientAccessToken, 'Must issue clientAccessToken automatically');
    assert.strictEqual(d.project.driveLink, 'https://drive.google.com/drive/folders/folder-c');
    projCClientToken = d.clientAccessToken;
  });

  // --- TEST K: Status Mutation without Client Session ---
  await asyncTest('TEST K — STATUS MUTATION WITHOUT CLIENT SESSION (Project A)', async () => {
    const res = createMockRes();
    await mod.handleUpdateClientStatus({ token: 'token-proj-a', status: 'Selesai' }, res);
    assert.ok(res.statusCode === 401 || res.statusCode === 403, 'Must reject mutation without clientAccessToken');
    const projA = mockDb.projects.find(p => p.Token === 'token-proj-a');
    assert.strictEqual(projA.Status, 'Belum Memilih', 'Database must remain unchanged');
  });

  // --- TEST L: Status Mutation with Wrong Project Session ---
  await asyncTest('TEST L — STATUS MUTATION WITH WRONG PROJECT SESSION (Project A token on Project B)', async () => {
    const res = createMockRes();
    await mod.handleUpdateClientStatus({ token: 'token-proj-b', clientAccessToken: projAClientToken, status: 'Selesai' }, res);
    assert.ok(res.statusCode === 401 || res.statusCode === 403, 'Must reject cross-project mutation');
    const projB = mockDb.projects.find(p => p.Token === 'token-proj-b');
    assert.strictEqual(projB.Status, 'Belum Memilih', 'Project B must remain unchanged');
  });

  // --- TEST M: Valid Status Mutation ---
  await asyncTest('TEST M — VALID STATUS MUTATION (Project A with projAClientToken)', async () => {
    const res = createMockRes();
    await mod.handleUpdateClientStatus({
      token: 'token-proj-a',
      clientAccessToken: projAClientToken,
      status: 'Sedang Memilih',
      selectedCount: 5,
      selectedFiles: [{ n: 'img1.jpg', u: 'url1' }],
      notes: { 'img1.jpg': 'Retouch this' }
    }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'success');
    const projA = mockDb.projects.find(p => p.Token === 'token-proj-a');
    assert.strictEqual(projA.Status, 'Sedang Memilih');
    assert.strictEqual(projA['Foto Terpilih'], '5');
  });

  // --- TEST N: Tab Hidden / Release Client Session ---
  await asyncTest('TEST N — TAB HIDDEN / RELEASE CLIENT SESSION (releaseClientSession preserves 24h token)', async () => {
    const res = createMockRes();
    await mod.handleReleaseClientSession({ token: 'token-proj-a', clientAccessToken: projAClientToken }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'success');

    // Verify token is still valid on reload!
    const resReload = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a', clientAccessToken: projAClientToken }, resReload);
    assert.strictEqual(resReload.body.data.accessGranted, true, 'Token must still work after releaseClientSession');
  });

  // --- TEST TTL: Token TTL Validation Edge Cases ---
  await asyncTest('TEST TTL — TOKEN TTL EDGES (malformed, missing CreatedAt)', async () => {
    const malformedToken = 'malformed-ttl-token';
    mockDb.sessions.push({
      SessionID: malformedToken,
      Username: '__CLIENT_GALLERY__:101',
      Role: 'ClientGallery',
      CreatedAt: 'not-a-valid-date'
    });
    const proj = mockDb.projects.find(p => p.Token === 'token-proj-a');
    const verifyMalformed = await mod.verifyClientGallerySession(malformedToken, proj);
    assert.strictEqual(verifyMalformed, null, 'Malformed CreatedAt must be rejected');

    const missingTtlToken = 'missing-ttl-token';
    mockDb.sessions.push({
      SessionID: missingTtlToken,
      Username: '__CLIENT_GALLERY__:101',
      Role: 'ClientGallery',
      CreatedAt: ''
    });
    const verifyMissing = await mod.verifyClientGallerySession(missingTtlToken, proj);
    assert.strictEqual(verifyMissing, null, 'Missing CreatedAt must be rejected');
  });

  // --- TEST O: Legacy Private Cache in app.html ---
  test('TEST O — LEGACY PRIVATE CACHE IN APP.HTML (localStorage cache removal & no pre-auth bypass)', () => {
    const appHtml = fs.readFileSync('app.html', 'utf8');
    assert.ok(appHtml.includes("try { localStorage.removeItem(projCacheKey); } catch(e) {}"), 'Must purge legacy localStorage cache');
    // Ensure processClientProjectData is not called before network fetch in initClientApp
    const initIdx = appHtml.indexOf('async function initClientApp');
    const fetchIdx = appHtml.indexOf('action: \'getProjectForClient\'', initIdx);
    const beforeFetch = appHtml.substring(initIdx, fetchIdx);
    assert.ok(!beforeFetch.includes('processClientProjectData'), 'processClientProjectData must not be called before fetch');
  });

  // --- TEST P & Q: Client Selection & Download Flags in app.html ---
  test('TEST P & Q — CLIENT SELECTION & DOWNLOAD FLAGS IN APP.HTML', () => {
    const appHtml = fs.readFileSync('app.html', 'utf8');
    assert.ok(appHtml.includes('ps_client_selected_'), 'Client selections key preserved');
    assert.ok(appHtml.includes('clientState.isDownloadActive'), 'Download active flag preserved');
    assert.ok(appHtml.includes('getClientAccessToken'), 'getClientAccessToken helper present');
  });

  // --- TEST R: Phase 4.1 / 4.2 / 4.3 Regression ---
  await asyncTest('TEST R — PHASE 4.1, 4.2, 4.3 REGRESSION (account session, project ownership, Mayar webhook)', async () => {
    // 4.1 Account session
    const authPhotographer = await mod.verifyUserSession({ sessionId: 'account-session-photo1' });
    assert.ok(authPhotographer, 'Photographer session must verify');
    assert.strictEqual(authPhotographer.username, 'photographer1');

    // 4.2 Project ownership
    const projOwn = mockDb.projects.find(p => p.Token === 'token-proj-a');
    assert.strictEqual(projOwn.Owner, 'photographer1');

    // 4.3 Mayar webhook check in source
    assert.ok(code.includes('verifyWebhookAuthenticity'), 'Mayar webhook verification preserved');
    assert.ok(code.includes('MAYAR_WEBHOOK_SECRET'), 'Mayar webhook secret preserved');
  });

  // --- TEST S: Collage Drive Compatibility ---
  test('TEST S — COLLAGE DRIVE COMPATIBILITY', () => {
    assert.ok(code.includes("case 'getDriveContent': return await handleGetDriveContent(payload, res);"), 'getDriveContent route intact');
    const appHtml = fs.readFileSync('app.html', 'utf8');
    assert.ok(appHtml.includes('collectCollageDrivePhotos'), 'collectCollageDrivePhotos intact');
    assert.ok(appHtml.includes('loadCollageProjectData'), 'loadCollageProjectData intact');
  });

  console.log(`\n============================================================`);
  console.log(`TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log(`============================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

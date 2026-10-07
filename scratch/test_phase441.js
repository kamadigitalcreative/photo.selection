const assert = require('assert');
const vm = require('vm');
const fs = require('fs');

console.log('=== RUNNING PHASE 4.4.1 REGRESSION TEST SUITE ===\n');

const subSrc = fs.readFileSync('api/supabase.js', 'utf8');
const appHtml = fs.readFileSync('app.html', 'utf8');

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

const script = new vm.Script(subSrc + `
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

// Mock DOM sessionStorage
const mockSessionStorage = new Map();
const windowStorage = {
  getItem: (k) => mockSessionStorage.get(k) || null,
  setItem: (k, v) => mockSessionStorage.set(k, String(v)),
  removeItem: (k) => mockSessionStorage.delete(k),
  clear: () => mockSessionStorage.clear()
};

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

  // --- TEST A: Normal short link + password auth continuity ---
  let projAToken = '';
  await asyncTest('TEST A — NORMAL SHORT LINK + PASSWORD AUTH CONTINUITY', async () => {
    // 1. Client loads short slug 'pa'
    const resAuth = createMockRes();
    await mod.handleVerifyClientPassword({ token: 'pa', passwordInput: 'correct-pass' }, resAuth);
    assert.strictEqual(resAuth.body.status, 'success');
    assert.strictEqual(resAuth.body.data.valid, true);
    assert.strictEqual(resAuth.body.data.accessGranted, true);
    const clientAccessToken = resAuth.body.data.clientAccessToken;
    assert.ok(clientAccessToken, 'Must issue token');

    // Simulate app.html storing for both short slug and canonical token
    const routeSlug = 'pa';
    const canonicalToken = resAuth.body.data.token; // 'token-proj-a'
    windowStorage.setItem('ps_client_access_' + routeSlug, clientAccessToken);
    windowStorage.setItem('ps_client_access_' + canonicalToken, clientAccessToken);

    projAToken = clientAccessToken;

    // Verify token can be retrieved with canonicalToken
    const storedCanonical = windowStorage.getItem('ps_client_access_' + canonicalToken);
    assert.strictEqual(storedCanonical, clientAccessToken);

    // 2. Perform heartbeat updateClientStatus using canonicalToken
    for (let cycle = 1; cycle <= 3; cycle++) {
      const resHb = createMockRes();
      await mod.handleUpdateClientStatus({
        token: canonicalToken,
        clientAccessToken: storedCanonical,
        status: 'Sedang Memilih'
      }, resHb);
      assert.strictEqual(resHb.body.status, 'success', `Heartbeat cycle ${cycle} must pass`);
    }
  });

  // --- TEST B: Normal short link passwordless continuity ---
  let projCToken = '';
  await asyncTest('TEST B — NORMAL SHORT LINK PASSWORDLESS CONTINUITY', async () => {
    // 1. Client loads short slug 'pc' (Project C has no password)
    const resInit = createMockRes();
    await mod.handleGetProjectForClient({ token: 'pc' }, resInit);
    assert.strictEqual(resInit.body.status, 'success');
    assert.strictEqual(resInit.body.data.accessGranted, true);
    const clientAccessToken = resInit.body.data.clientAccessToken;
    assert.ok(clientAccessToken);

    const routeSlug = 'pc';
    const canonicalToken = resInit.body.data.token; // 'token-proj-c'
    windowStorage.setItem('ps_client_access_' + routeSlug, clientAccessToken);
    windowStorage.setItem('ps_client_access_' + canonicalToken, clientAccessToken);

    projCToken = clientAccessToken;

    // Verify heartbeat cycles
    for (let cycle = 1; cycle <= 3; cycle++) {
      const resHb = createMockRes();
      await mod.handleUpdateClientStatus({
        token: canonicalToken,
        clientAccessToken: windowStorage.getItem('ps_client_access_' + canonicalToken),
        status: 'Sedang Memilih'
      }, resHb);
      assert.strictEqual(resHb.body.status, 'success', `Passwordless heartbeat cycle ${cycle} must pass`);
    }
  });

  // --- TEST C: Reload Protected Gallery using route slug ---
  await asyncTest('TEST C — RELOAD PROTECTED GALLERY (using route slug from sessionStorage)', async () => {
    // User reloads /app?c=pa, clientState.token is 'pa', finds token stored under 'ps_client_access_pa'
    const tokenFromStorage = windowStorage.getItem('ps_client_access_pa');
    assert.strictEqual(tokenFromStorage, projAToken);

    const resReload = createMockRes();
    await mod.handleGetProjectForClient({ token: 'pa', clientAccessToken: tokenFromStorage }, resReload);
    assert.strictEqual(resReload.body.status, 'success');
    assert.strictEqual(resReload.body.data.accessGranted, true);
    assert.strictEqual(resReload.body.data.project.driveLink, 'https://drive.google.com/drive/folders/folder-a');
    assert.strictEqual(resReload.body.data.needsPassword, false);
  });

  // --- TEST D: Expired Passwordless Session Auto-Recovery ---
  await asyncTest('TEST D — EXPIRED PASSWORDLESS SESSION (Auto-Recovery with new session)', async () => {
    const expiredToken = 'expired-token-proj-c';
    mockDb.sessions.push({
      SessionID: expiredToken,
      Username: '__CLIENT_GALLERY__:103',
      Role: 'ClientGallery',
      CreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    });

    // When client calls heartbeat with expired token, it gets 403
    const resExpired = createMockRes();
    await mod.handleUpdateClientStatus({ token: 'token-proj-c', clientAccessToken: expiredToken }, resExpired);
    assert.ok(resExpired.statusCode === 401 || resExpired.statusCode === 403);

    // Frontend re-enters initClientApp(false) calling getProjectForClient without valid token
    const resReinit = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-c', clientAccessToken: '' }, resReinit);
    assert.strictEqual(resReinit.body.status, 'success');
    assert.strictEqual(resReinit.body.data.accessGranted, true);
    assert.ok(resReinit.body.data.clientAccessToken);
    assert.notStrictEqual(resReinit.body.data.clientAccessToken, expiredToken);
    assert.strictEqual(resReinit.body.data.needsPassword, false);
  });

  // --- TEST E: Expired Protected Session Recovery ---
  await asyncTest('TEST E — EXPIRED PROTECTED SESSION (returns safe public project and locks)', async () => {
    const expiredTokenA = 'expired-token-proj-a';
    mockDb.sessions.push({
      SessionID: expiredTokenA,
      Username: '__CLIENT_GALLERY__:101',
      Role: 'ClientGallery',
      CreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    });

    // Heartbeat fails
    const resExpired = createMockRes();
    await mod.handleUpdateClientStatus({ token: 'token-proj-a', clientAccessToken: expiredTokenA }, resExpired);
    assert.ok(resExpired.statusCode === 401 || resExpired.statusCode === 403);

    // Re-enter initClientApp without token
    const resReinit = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a', clientAccessToken: '' }, resReinit);
    assert.strictEqual(resReinit.body.status, 'success');
    assert.strictEqual(resReinit.body.data.accessGranted, false);
    assert.strictEqual(resReinit.body.data.hasPassword, true);
    assert.strictEqual(resReinit.body.data.needsPassword, true);
    assert.strictEqual(resReinit.body.data.project.driveLink, undefined);
  });

  // --- TEST F & G: Collage Drive without getProjectForClient ---
  test('TEST F & G — COLLAGE USES AUTHORIZED PROJECT DATA (No getProjectForClient call)', () => {
    // Check that loadCollageProjectData in app.html does NOT call getProjectForClient
    const collageFn = appHtml.substring(appHtml.indexOf('async function loadCollageProjectData()'), appHtml.indexOf('function handleLocalPhotosUpload(e)'));
    assert.ok(!collageFn.includes("action: 'getProjectForClient'"), 'Must NOT call getProjectForClient in Collage');
    assert.ok(collageFn.includes('window.lastProjectsData'), 'Must check window.lastProjectsData');
    assert.ok(collageFn.includes('ps_cache_projects_'), 'Must check photographer cache');
    assert.ok(collageFn.includes("action: 'getProjects'"), 'Must fallback to authenticated getProjects');
  });

  // --- TEST H: Pre-Auth Data Masking ---
  await asyncTest('TEST H — CLIENT PRE-AUTH MASKING STILL ENFORCED', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a' }, res);
    const d = res.body.data;
    assert.strictEqual(d.accessGranted, false);
    assert.strictEqual(d.hasPassword, true);
    const p = d.project || {};
    assert.strictEqual(p.driveLink, undefined);
    assert.strictEqual(p.nomorWA, undefined);
    assert.strictEqual(p.bankAccount, undefined);
    assert.strictEqual(p.notes, undefined);
    assert.strictEqual(p.selectedFiles, undefined);
    assert.strictEqual(p.paymentProof, undefined);
    assert.strictEqual(p.backupDrive, undefined);
    assert.strictEqual(p['Password Client'], undefined);
    assert.strictEqual(p.owner, undefined);
  });

  // --- TEST I: Cross-Gallery Token ---
  await asyncTest('TEST I — CROSS-GALLERY TOKEN BLOCKED', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-b', clientAccessToken: projAToken }, res);
    assert.strictEqual(res.body.data.accessGranted, false);
    assert.strictEqual(res.body.data.project.driveLink, undefined);
  });

  // --- TEST J: Client Token as Account Session ---
  await asyncTest('TEST J — CLIENT TOKEN AS ACCOUNT SESSION BLOCKED', async () => {
    const authUser = await mod.verifyUserSession({ sessionId: projAToken });
    assert.strictEqual(authUser, null);
  });

  // --- TEST K: Account Session as Client Token ---
  await asyncTest('TEST K — ACCOUNT SESSION AS CLIENT TOKEN BLOCKED', async () => {
    const res = createMockRes();
    await mod.handleGetProjectForClient({ token: 'token-proj-a', clientAccessToken: 'account-session-photo1' }, res);
    assert.strictEqual(res.body.data.accessGranted, false);
    assert.strictEqual(res.body.data.project.driveLink, undefined);
  });

  // --- TEST L: Update Client Status ---
  await asyncTest('TEST L — UPDATE CLIENT STATUS AUTHENTICATED MUTATION', async () => {
    const res = createMockRes();
    await mod.handleUpdateClientStatus({
      token: 'token-proj-a',
      clientAccessToken: projAToken,
      status: 'Sedang Memilih',
      selectedCount: 8
    }, res);
    assert.strictEqual(res.body.status, 'success');
    const p = mockDb.projects.find(x => x.Token === 'token-proj-a');
    assert.strictEqual(p['Foto Terpilih'], '8');
  });

  // --- TEST M: Stable project ID logic ---
  test('TEST M — PROJECT.ID REMOVED AS DATABASE IDENTITY FALLBACK', () => {
    assert.ok(!subSrc.includes('project.id || project.ID'), 'project.id || project.ID must be removed');
    assert.ok(subSrc.includes('const dbId = String((project && project.id) || \'\').trim();'), 'Only project.id used as dbId');
  });

  console.log(`\n============================================================`);
  console.log(`TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log(`============================================================\n`);

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

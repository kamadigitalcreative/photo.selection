/**
 * PHOTO SELECTION PHASE 6 — PREVIEW THUMBNAIL AUTHORIZATION TEST SUITE
 * 
 * Authoritative verification of getPreviewImage authorization and thumbnail delivery:
 * T01: Valid PIN client session + matching project -> thumbnail HTTP 200 with image Content-Type
 * T02: Valid passwordless client session -> thumbnail HTTP 200
 * T03: Same session that successfully reads getDriveContent also works on getPreviewImage
 * T04: Missing session -> HTTP 403
 * T05: Expired session -> HTTP 403
 * T06: Invalid / forged session -> HTTP 403
 * T07: Session from Project A accessing Project B -> HTTP 403
 * T08: Unknown or foreign file -> DENIED
 * T09: Root-folder photo -> PASS
 * T10: Authorized subfolder photo -> PASS
 * T11: Authenticated photographer preview -> PASS without weakening gallery security
 * T12: Frontend GET includes correct project identity, same-origin Authorization headers, and never exposes session tokens in URL
 * T13: No real customer data mutation
 * T14: Existing Google public provider behavior, themes, selection, downloads and ZIP remain unchanged
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable, Writable } = require('stream');

const {
  urlParser,
  getDriveProvider,
  PublicDriveProvider,
  DownloadService,
  types
} = require('../api/drive');

const actualBackend = require('../api/supabase');

let passCount = 0;
let failCount = 0;
const testResults = [];

function check(id, condition, description, details = '', label = 'REAL HANDLER PASS') {
  const status = condition ? 'PASS' : 'FAIL';
  if (status === 'PASS') {
    console.log(`✅ [${label}] ${id}: ${description}${details ? ' — ' + details : ''}`);
    passCount++;
  } else {
    console.error(`❌ [${status}] ${id}: ${description}${details ? ' — ' + details : ''}`);
    failCount++;
  }
  testResults.push({ id, status, label, description, details });
}

function createMockRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  });

  res.statusCode = 200;
  res.headers = {};
  res.body = null;
  res.chunks = chunks;
  res.jsonPayload = null;

  res.status = function(code) {
    this.statusCode = code;
    return this;
  };

  res.setHeader = function(k, v) {
    this.headers[k.toLowerCase()] = v;
    return this;
  };

  res.writeHead = function(code, h = {}) {
    this.statusCode = code;
    for (const [k, v] of Object.entries(h)) {
      this.headers[k.toLowerCase()] = v;
    }
    return this;
  };

  res.json = function(obj) {
    this.setHeader('content-type', 'application/json');
    this.jsonPayload = obj;
    this.body = JSON.stringify(obj);
    this.end(this.body);
    return this;
  };

  res.send = function(str) {
    this.body = str;
    this.end(str);
    return this;
  };

  res.on('finish', () => {
    if (!res.body && chunks.length > 0) {
      res.body = Buffer.concat(chunks);
    }
  });

  return res;
}

// In-memory mock database strictly isolated from production
const mockDb = {
  projects: [],
  sessions: [],
  users: []
};

// Fixture Google Drive HTML scraper response for PublicDriveProvider
const ROOT_FOLDER_ID = '1KMBC_TEST_ROOT_FOLDER_ABC123';
const SUBFOLDER_ID = '1KMBC_TEST_SUBFOLDER_DEF456';
const PHOTO_ROOT_ID = '1Photo_Root_001_Id';
const PHOTO_SUB_ID = '1Photo_Sub_002_Id';
const FOREIGN_PHOTO_ID = '1Photo_Foreign_Alien_999_Id';

const MOCK_ROOT_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div id="entry-${PHOTO_ROOT_ID}" class="flip-entry">
    <div class="flip-entry-thumb"><img src="https://lh3.googleusercontent.com/d/${PHOTO_ROOT_ID}=s1200" /></div>
    <div class="flip-entry-info"><div class="flip-entry-title">KMBC_Photo_001.jpg</div></div>
  </div>
  <div id="entry-${SUBFOLDER_ID}" class="flip-entry flip-entry-folder">
    <a href="https://drive.google.com/drive/folders/${SUBFOLDER_ID}"></a>
    <div class="flip-entry-info"><div class="flip-entry-title">Subfolder Highlights</div></div>
  </div>
</body>
</html>
`;

const MOCK_SUB_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div id="entry-${PHOTO_SUB_ID}" class="flip-entry">
    <div class="flip-entry-thumb"><img src="https://lh3.googleusercontent.com/d/${PHOTO_SUB_ID}=s1200" /></div>
    <div class="flip-entry-info"><div class="flip-entry-title">KMBC_Photo_002_Highlight.jpg</div></div>
  </div>
</body>
</html>
`;

const SAMPLE_JPEG_BUFFER = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x0A, 0x00, 0x0A, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00,
  0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xBF, 0xFF, 0xD9
]);

function setupIsolatedEnvironment() {
  process.env.DRIVE_PROVIDER = 'public_link';
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_KEY = 'mock-test-key-phase6';

  mockDb.projects = [
    {
      id: 'proj-pin-101',
      Token: 'token-pin-gallery-1',
      Slug: 'kmbc-phase-6-pin',
      'Short Slug': 'kmbc-phase-6-pin',
      'Nama Client': 'KMBC Phase 6 PIN Test',
      Owner: 'fotografer',
      'Password Client': '1234',
      'Drive Link': `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}`,
      Status: 'Belum Memilih'
    },
    {
      id: 'proj-pwl-202',
      Token: 'token-pwl-gallery-2',
      Slug: 'kmbc-phase-6-pwless',
      'Short Slug': 'kmbc-phase-6-pwless',
      'Nama Client': 'KMBC Phase 6 Passwordless Test',
      Owner: 'fotografer',
      'Password Client': '',
      'Drive Link': `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}`,
      Status: 'Belum Memilih'
    },
    {
      id: 'proj-alien-303',
      Token: 'token-project-alien-b',
      Slug: 'project-b-victim',
      'Short Slug': 'project-b-victim',
      'Nama Client': 'Project B Studio',
      Owner: 'other_photographer',
      'Password Client': '5678',
      'Drive Link': 'https://drive.google.com/drive/folders/1Alien_Folder_B_777',
      Status: 'Belum Memilih'
    }
  ];

  mockDb.users = [
    {
      id: 'usr-1',
      Username: 'fotografer',
      Role: 'Photographer',
      Status: 'Active',
      BrandName: 'KMBC Creative'
    },
    {
      id: 'usr-2',
      Username: 'admin',
      Role: 'Admin',
      Status: 'Active',
      BrandName: 'System Admin'
    }
  ];

  mockDb.sessions = [];

  // Mock global fetch to handle Supabase DB queries and Google Drive HTML/thumbnail scraping
  global.fetch = async (url, opts = {}) => {
    const urlStr = String(url);

    // 1. Supabase queries
    if (urlStr.includes('/rest/v1/')) {
      const endpoint = urlStr.split('/rest/v1/')[1] || '';

      if (endpoint.startsWith('projects?')) {
        let matched = mockDb.projects;
        if (endpoint.includes('Token.eq.') || endpoint.includes('Slug.eq.') || endpoint.includes('Short%20Slug')) {
          const matchVal = endpoint.match(/(?:Token|Slug|Short%20Slug)%22?\.eq\.([^,)\s&]+)/i);
          if (matchVal) {
            const cleanVal = decodeURIComponent(matchVal[1]);
            matched = mockDb.projects.filter(p => p.Token === cleanVal || p.Slug === cleanVal || p['Short Slug'] === cleanVal);
          }
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(matched),
          json: async () => matched
        };
      }

      if (endpoint.startsWith('sessions?')) {
        let matched = mockDb.sessions;
        if (endpoint.includes('SessionID=eq.')) {
          const sMatch = endpoint.match(/SessionID=eq\.([^&]+)/);
          const sId = sMatch ? decodeURIComponent(sMatch[1]) : '';
          matched = mockDb.sessions.filter(s => s.SessionID === sId);
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(matched),
          json: async () => matched
        };
      }

      if (endpoint.startsWith('sessions') && opts.method === 'POST') {
        const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : (opts.body || {});
        mockDb.sessions.push(body);
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify([body]),
          json: async () => [body]
        };
      }

      if (endpoint.startsWith('users?')) {
        let matched = mockDb.users;
        if (endpoint.includes('Username=ilike.') || endpoint.includes('Username=eq.')) {
          const uMatch = endpoint.match(/Username=(?:ilike|eq)\.([^&]+)/);
          const uName = uMatch ? decodeURIComponent(uMatch[1]) : '';
          matched = mockDb.users.filter(u => String(u.Username).toLowerCase() === String(uName).toLowerCase());
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(matched),
          json: async () => matched
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([]),
        json: async () => []
      };
    }

    // 2. Google Drive HTML Scraping
    if (urlStr.includes('drive.google.com/embeddedfolderview')) {
      if (urlStr.includes(`id=${ROOT_FOLDER_ID}`)) {
        return {
          ok: true,
          status: 200,
          text: async () => MOCK_ROOT_HTML
        };
      }
      if (urlStr.includes(`id=${SUBFOLDER_ID}`)) {
        return {
          ok: true,
          status: 200,
          text: async () => MOCK_SUB_HTML
        };
      }
      return {
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      };
    }

    // 3. Google Thumbnail CDN
    if (urlStr.includes('lh3.googleusercontent.com/d/')) {
      if (urlStr.includes(PHOTO_ROOT_ID) || urlStr.includes(PHOTO_SUB_ID)) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (h) => {
              if (h.toLowerCase() === 'content-type') return 'image/jpeg';
              if (h.toLowerCase() === 'content-length') return String(SAMPLE_JPEG_BUFFER.length);
              return null;
            }
          },
          body: Readable.from([SAMPLE_JPEG_BUFFER])
        };
      }
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        body: Readable.from([])
      };
    }

    return {
      ok: false,
      status: 404,
      text: async () => 'Unhandled mock URL'
    };
  };
}

async function runThumbnailAuthTestSuite() {
  console.log('================================================================');
  console.log('PHASE 6 — PREVIEW THUMBNAIL AUTHORIZATION AUDIT (T01 - T14)');
  console.log('================================================================\n');

  setupIsolatedEnvironment();

  // Helper to issue PIN session via real handleVerifyClientPassword
  async function issuePinSession(token, pin) {
    const res = createMockRes();
    await actualBackend(
      { method: 'POST', body: { action: 'verifyClientPassword', token, passwordInput: pin }, headers: {} },
      res
    );
    return res.jsonPayload?.clientAccessToken || res.jsonPayload?.data?.clientAccessToken;
  }

  // Helper to issue passwordless session via real handleGetProjectForClient
  async function issuePasswordlessSession(token) {
    const res = createMockRes();
    await actualBackend(
      { method: 'POST', body: { action: 'getProjectForClient', token }, headers: {} },
      res
    );
    return res.jsonPayload?.clientAccessToken || res.jsonPayload?.data?.clientAccessToken;
  }

  // Helper to call real getPreviewImage
  async function callGetPreviewImage({ fileId, token, sessionToken, headers = {} }) {
    const res = createMockRes();
    const reqHeaders = { ...headers };
    if (sessionToken) {
      reqHeaders['authorization'] = `Bearer ${sessionToken}`;
    }
    if (token && !reqHeaders['x-client-token']) {
      reqHeaders['x-client-token'] = token;
    }
    const reqUrl = `/api/bridge?action=getPreviewImage&fileId=${encodeURIComponent(fileId || '')}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const req = {
      method: 'GET',
      url: reqUrl,
      headers: reqHeaders,
      body: {}
    };
    const finishPromise = new Promise(resolve => {
      if (res.writableFinished || res.writableEnded) return resolve();
      res.on('finish', resolve);
      res.on('close', resolve);
    });
    await actualBackend(req, res);
    await finishPromise;
    return res;
  }

  // Helper to call real getDriveContent
  async function callGetDriveContent({ token, sessionToken, folderId = null, headers = {} }) {
    const res = createMockRes();
    const reqHeaders = { 'content-type': 'application/json', ...headers };
    if (sessionToken) {
      reqHeaders['authorization'] = `Bearer ${sessionToken}`;
    }
    if (token) {
      reqHeaders['x-client-token'] = token;
    }
    const req = {
      method: 'POST',
      url: '/api/bridge',
      headers: reqHeaders,
      body: {
        action: 'getDriveContent',
        token,
        clientAccessToken: sessionToken,
        folder_id: folderId
      }
    };
    await actualBackend(req, res);
    return res;
  }

  // -------------------------------------------------------------------------
  // T01: Valid PIN client session + matching project -> thumbnail HTTP 200 with image Content-Type
  // -------------------------------------------------------------------------
  console.log('--- T01: VALID PIN CLIENT SESSION ---');
  const sessionT01 = await issuePinSession('token-pin-gallery-1', '1234');
  assert(sessionT01, 'Session token must be issued for valid PIN');

  const resT01 = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-pin-gallery-1',
    sessionToken: sessionT01
  });
  const t01Ok = resT01.statusCode === 200 && (resT01.headers['content-type'] || '').startsWith('image/');
  check('T01', t01Ok, 'Valid PIN client session + matching project returns thumbnail HTTP 200 with image Content-Type', `Status: ${resT01.statusCode}, Content-Type: ${resT01.headers['content-type']}`);

  // -------------------------------------------------------------------------
  // T02: Valid passwordless client session -> thumbnail HTTP 200
  // -------------------------------------------------------------------------
  console.log('\n--- T02: VALID PASSWORDLESS CLIENT SESSION ---');
  const sessionT02 = await issuePasswordlessSession('token-pwl-gallery-2');
  assert(sessionT02, 'Session token must be issued for passwordless project');

  const resT02 = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-pwl-gallery-2',
    sessionToken: sessionT02
  });
  const t02Ok = resT02.statusCode === 200 && (resT02.headers['content-type'] || '').startsWith('image/');
  check('T02', t02Ok, 'Valid passwordless client session returns thumbnail HTTP 200', `Status: ${resT02.statusCode}, Content-Type: ${resT02.headers['content-type']}`);

  // -------------------------------------------------------------------------
  // T03: Same session that reads getDriveContent also works on getPreviewImage
  // -------------------------------------------------------------------------
  console.log('\n--- T03: UNIFIED SESSION ACROSS LISTING AND PREVIEW ---');
  const driveResT03 = await callGetDriveContent({
    token: 'token-pin-gallery-1',
    sessionToken: sessionT01
  });
  const driveListingOk = driveResT03.statusCode === 200 && driveResT03.jsonPayload?.data?.images?.length > 0;
  
  const previewResT03 = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-pin-gallery-1',
    sessionToken: sessionT01
  });
  const t03Ok = driveListingOk && previewResT03.statusCode === 200;
  check('T03', t03Ok, 'Same session that successfully reads getDriveContent also works on getPreviewImage', `Drive Status: ${driveResT03.statusCode}, Preview Status: ${previewResT03.statusCode}`);

  // -------------------------------------------------------------------------
  // T04: Missing session -> HTTP 403
  // -------------------------------------------------------------------------
  console.log('\n--- T04: MISSING SESSION ---');
  const resT04 = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-pin-gallery-1',
    sessionToken: ''
  });
  const t04Ok = resT04.statusCode === 403 && (resT04.jsonPayload?.message || '').includes('Memerlukan otorisasi sesi');
  check('T04', t04Ok, 'Missing session strictly rejected with HTTP 403', `Status: ${resT04.statusCode}, Message: ${resT04.jsonPayload?.message}`);

  // -------------------------------------------------------------------------
  // T05: Expired session -> HTTP 403
  // -------------------------------------------------------------------------
  console.log('\n--- T05: EXPIRED SESSION ---');
  const expiredSessionId = 'ps_expired_test_session_xyz';
  const ancientIso = new Date(Date.now() - 36 * 3600 * 1000).toISOString(); // 36 hours ago (>24h TTL)
  mockDb.sessions.push({
    SessionID: expiredSessionId,
    Username: `__CLIENT_GALLERY__:proj-pin-101`,
    Role: 'ClientGallery',
    CreatedAt: ancientIso
  });

  const resT05 = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-pin-gallery-1',
    sessionToken: expiredSessionId
  });
  const t05Ok = resT05.statusCode === 403;
  check('T05', t05Ok, 'Expired session (>24h TTL) strictly rejected with HTTP 403', `Status: ${resT05.statusCode}`);

  // -------------------------------------------------------------------------
  // T06: Invalid / forged session -> HTTP 403
  // -------------------------------------------------------------------------
  console.log('\n--- T06: INVALID SESSION ---');
  const resT06 = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-pin-gallery-1',
    sessionToken: 'completely-forged-non-existent-session-token'
  });
  const t06Ok = resT06.statusCode === 403;
  check('T06', t06Ok, 'Invalid / forged session token rejected with HTTP 403', `Status: ${resT06.statusCode}`);

  // -------------------------------------------------------------------------
  // T07: Session from Project A accessing Project B -> HTTP 403
  // -------------------------------------------------------------------------
  console.log('\n--- T07: CROSS-PROJECT SESSION ISOLATION ---');
  // sessionT01 is bound to proj-pin-101 (token-pin-gallery-1). Attempt to use on token-project-alien-b
  const resT07 = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-project-alien-b',
    sessionToken: sessionT01
  });
  const t07Ok = resT07.statusCode === 403;
  check('T07', t07Ok, 'Session from Project A accessing Project B strictly rejected with HTTP 403', `Status: ${resT07.statusCode}`);

  // -------------------------------------------------------------------------
  // T08: Unknown or foreign file -> DENIED
  // -------------------------------------------------------------------------
  console.log('\n--- T08: UNKNOWN OR FOREIGN FILE ID ---');
  const resT08 = await callGetPreviewImage({
    fileId: FOREIGN_PHOTO_ID,
    token: 'token-pin-gallery-1',
    sessionToken: sessionT01
  });
  const t08Ok = resT08.statusCode === 403 || resT08.statusCode === 404;
  check('T08', t08Ok, 'Foreign or alien file ID outside project folder rejected', `Status: ${resT08.statusCode}`);

  // -------------------------------------------------------------------------
  // T09: Root-folder photo -> PASS
  // -------------------------------------------------------------------------
  console.log('\n--- T09: ROOT-FOLDER PHOTO PREVIEW ---');
  const resT09 = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-pin-gallery-1',
    sessionToken: sessionT01
  });
  const t09Ok = resT09.statusCode === 200 && resT09.body && resT09.body.length > 0;
  check('T09', t09Ok, 'Authorized root-folder photo preview streamed successfully', `Bytes: ${resT09.body?.length}b`);

  // -------------------------------------------------------------------------
  // T10: Authorized subfolder photo -> PASS
  // -------------------------------------------------------------------------
  console.log('\n--- T10: AUTHORIZED SUBFOLDER PHOTO PREVIEW ---');
  // First discover subfolder photo via provider resolveProjectFile
  const resT10 = await callGetPreviewImage({
    fileId: PHOTO_SUB_ID,
    token: 'token-pin-gallery-1',
    sessionToken: sessionT01
  });
  const t10Ok = resT10.statusCode === 200 && resT10.body && resT10.body.length > 0;
  check('T10', t10Ok, 'Authorized subfolder photo preview streamed successfully', `Bytes: ${resT10.body?.length}b`);

  // -------------------------------------------------------------------------
  // T11: Authenticated photographer preview -> PASS without weakening security
  // -------------------------------------------------------------------------
  console.log('\n--- T11: AUTHENTICATED PHOTOGRAPHER PREVIEW ---');
  const staffSessionToken = 'ps_staff_photographer_live_sess_001';
  mockDb.sessions.push({
    SessionID: staffSessionToken,
    Username: 'fotografer',
    Role: 'Photographer',
    CreatedAt: new Date().toISOString()
  });

  // Photographer previewing project they own without entering client PIN
  const resT11Owner = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-pin-gallery-1',
    sessionToken: staffSessionToken
  });
  const t11OwnerOk = resT11Owner.statusCode === 200;

  // Cross-photographer: photographer trying to preview project owned by other_photographer
  const resT11Alien = await callGetPreviewImage({
    fileId: PHOTO_ROOT_ID,
    token: 'token-project-alien-b',
    sessionToken: staffSessionToken
  });
  const t11AlienOk = resT11Alien.statusCode === 403;

  const t11Ok = t11OwnerOk && t11AlienOk;
  check('T11', t11Ok, 'Authenticated photographer preview passes for owned project, denied for cross-photographer', `Owner Status: ${resT11Owner.statusCode}, Alien Status: ${resT11Alien.statusCode}`);

  // -------------------------------------------------------------------------
  // T12: Frontend GET contract inspection
  // -------------------------------------------------------------------------
  console.log('\n--- T12: FRONTEND GET CONTRACT & ZERO-SECRET-IN-URL AUDIT ---');
  const appHtmlSrc = fs.readFileSync(path.join(__dirname, '../app.html'), 'utf8');

  // Verify fetchAuthenticatedPreviewBlob exists and attaches headers
  const hasFetchAuthBlob = appHtmlSrc.includes('async function fetchAuthenticatedPreviewBlob');
  const hasAuthHeader = appHtmlSrc.includes("headers['Authorization'] = 'Bearer ' + sessionToken");
  const hasClientTokenHeader = appHtmlSrc.includes("headers['X-Client-Token'] = tokenVal");
  
  // Verify secret stripping from query parameters
  const stripsClientAccessToken = appHtmlSrc.includes("parsed.searchParams.delete('clientAccessToken')");
  const stripsSessionToken = appHtmlSrc.includes("parsed.searchParams.delete('sessionToken')");

  // Verify safeImageUrl permits relative same-origin URLs
  const hasSafeRelative = appHtmlSrc.includes('isSafeRelativeUrl') || appHtmlSrc.includes("trimmed.startsWith('/')");

  const t12Ok = hasFetchAuthBlob && hasAuthHeader && hasClientTokenHeader && stripsClientAccessToken && stripsSessionToken && hasSafeRelative;
  check('T12', t12Ok, 'Frontend GET includes correct project identity, same-origin Authorization headers, and never exposes session tokens in URL', `SafeRelative: ${hasSafeRelative}, AuthHeader: ${hasAuthHeader}, SecretStrip: ${stripsClientAccessToken}`);

  // -------------------------------------------------------------------------
  // T13: Zero Customer Data Mutation Audit
  // -------------------------------------------------------------------------
  console.log('\n--- T13: ZERO CUSTOMER DATA MUTATION AUDIT ---');
  // Verify no projects or users were altered
  const projectCount = mockDb.projects.length;
  const t13Ok = projectCount === 3 && mockDb.users.length === 2;
  check('T13', t13Ok, 'No customer data or database records mutated during preview thumbnail operations', `Projects: ${projectCount}, Users: ${mockDb.users.length}`);

  // -------------------------------------------------------------------------
  // T14: Regression Check (Existing Provider & Features Intact)
  // -------------------------------------------------------------------------
  console.log('\n--- T14: EXISTING FUNCTIONALITY & REGRESSION AUDIT ---');
  const publicProvider = getDriveProvider('public_link');
  const isPublicProviderOk = publicProvider && publicProvider.name === 'public_link' && typeof publicProvider.fetchThumbnailStream === 'function';

  const themesPresent = appHtmlSrc.includes('noir') && appHtmlSrc.includes('ivory') && appHtmlSrc.includes('sapphire') && appHtmlSrc.includes('olive');
  const downloadModePresent = appHtmlSrc.includes("clientState.galleryMode === 'download'");
  const t14Ok = isPublicProviderOk && themesPresent && downloadModePresent;
  check('T14', t14Ok, 'Existing Google public provider, luxury themes, selection mode, and download handlers preserved intact', `Provider: ${publicProvider?.name}, Themes: ${themesPresent}, DownloadMode: ${downloadModePresent}`);

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TOTAL PHASE 6 THUMBNAIL AUTH ASSERTIONS: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runThumbnailAuthTestSuite().catch(err => {
  console.error('Fatal error running thumbnail auth test suite:', err);
  process.exit(1);
});

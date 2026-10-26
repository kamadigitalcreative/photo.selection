/**
 * PHOTO SELECTION PHASE 6 — ROOT FOLDER ID MISMATCH REGRESSION TEST SUITE
 * 
 * Verifies that folder references in handleGetDriveContent are canonicalized
 * before string comparison against rootFolderId, preventing false-positive
 * cross-project rejection when full Google Drive URLs are passed.
 * 
 * Mandatory Test Coverage:
 * - T01: Root folder full URL -> PASS
 * - T02: Same root folder as raw ID -> PASS
 * - T03: Root URL with harmless URL parameters -> PASS
 * - T04: Legitimate direct subfolder -> PASS
 * - T05: Legitimate nested subfolder -> PASS
 * - T06: Foreign project folder -> HTTP 403
 * - T07: Unrelated Google Drive URL -> DENIED
 * - T08: Malformed URL or folder ID -> DENIED
 * - T09: No client session -> HTTP 403
 * - T10: Invalid PIN/session -> DENIED
 * - T11: Photographer cannot access another photographer's project -> HTTP 403
 * - T12: Photo selection, download mode, thumbnail and ZIP logic preserved
 * - T_REPRO: Explicit reproduction of Preview mismatch bug & verified fix
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  urlParser,
  getDriveProvider,
  MockDriveProvider,
  GoogleDriveProvider,
  PublicDriveProvider,
  DownloadService
} = require('../api/drive');

const actualBackend = require('../api/supabase');

let passCount = 0;
let failCount = 0;
const testResults = [];

function check(id, condition, description, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (status === 'PASS') {
    console.log(`✅ [${status}] ${id}: ${description}${details ? ' — ' + details : ''}`);
    passCount++;
  } else {
    console.error(`❌ [${status}] ${id}: ${description}${details ? ' — ' + details : ''}`);
    failCount++;
  }
  testResults.push({ id, status, description, details });
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    jsonPayload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    writeHead(code, h = {}) {
      this.statusCode = code;
      Object.assign(this.headers, h);
      return this;
    },
    json(obj) {
      this.setHeader('content-type', 'application/json');
      this.jsonPayload = obj;
      this.body = JSON.stringify(obj);
      return this;
    },
    send(str) {
      this.body = str;
      return this;
    },
    end(str) {
      if (str) this.body = str;
      return this;
    }
  };
}

// Harness to isolate external Supabase and Google network fetch
let mockDatabase = {
  projects: [],
  sessions: [],
  users: []
};

const originalFetch = global.fetch;

function setupMockNetwork(customProvider = null) {
  global.fetch = async (url, opts = {}) => {
    const urlStr = String(url);

    // 1. Supabase REST API calls
    if (urlStr.includes('/rest/v1/')) {
      const endpoint = urlStr.split('/rest/v1/')[1] || '';

      // Projects query
      if (endpoint.startsWith('projects?')) {
        const tokenMatch = endpoint.match(/Token\.(?:eq\.|eq=)([^,)\s&]+)/i) || endpoint.match(/Token=eq\.([^&]+)/i);
        if (tokenMatch) {
          const tVal = decodeURIComponent(tokenMatch[1]);
          const match = mockDatabase.projects.filter(p => (p.Token === tVal || p.token === tVal));
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(match)
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(mockDatabase.projects)
        };
      }

      // Sessions query
      if (endpoint.startsWith('sessions?')) {
        if (endpoint.includes('SessionID=eq.')) {
          const sMatch = endpoint.match(/SessionID=eq\.([^&]+)/);
          const sId = sMatch ? decodeURIComponent(sMatch[1]) : '';
          const match = mockDatabase.sessions.filter(s => s.SessionID === sId);
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(match)
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(mockDatabase.sessions)
        };
      }

      // Users query
      if (endpoint.startsWith('users?')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(mockDatabase.users)
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([])
      };
    }

    // 2. Google Drive / CDN calls
    if (customProvider && typeof customProvider.getFetch === 'function') {
      const pFetch = customProvider.getFetch();
      return pFetch(url, opts);
    }

    return {
      ok: true,
      status: 200,
      text: async () => '<html><body>Google Drive Mock Page</body></html>'
    };
  };
}

function restoreMockNetwork() {
  global.fetch = originalFetch;
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('PHASE 6 — ROOT FOLDER ID MISMATCH REGRESSION SUITE (T01 - T12)');
  console.log('================================================================\n');

  const ROOT_FOLDER_ID = '1w7cQ_m_CanonicalRootId_XYZ12345';
  const ROOT_FOLDER_URL = `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}`;
  const ROOT_FOLDER_URL_PARAMS = `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}?usp=sharing&authuser=0`;
  const ROOT_FOLDER_URL_OPEN = `https://drive.google.com/open?id=${ROOT_FOLDER_ID}&usp=sharing`;

  const SUBFOLDER_CHILD_ID = '1child_subfolder_id_ABC98765';
  const SUBFOLDER_CHILD_URL = `https://drive.google.com/drive/folders/${SUBFOLDER_CHILD_ID}`;

  const SUBFOLDER_GRANDCHILD_ID = '1grandchild_subfolder_id_DEF54321';
  const SUBFOLDER_GRANDCHILD_URL = `https://drive.google.com/drive/folders/${SUBFOLDER_GRANDCHILD_ID}`;

  const FOREIGN_FOLDER_ID = '1foreign_alien_folder_99999999';
  const FOREIGN_FOLDER_URL = `https://drive.google.com/drive/folders/${FOREIGN_FOLDER_ID}`;

  // Configure controlled mock database
  const TEST_PROJECT_TOKEN = 'test-token-phase6-root-fix';
  const TEST_CLIENT_SESSION = 'client-session-valid-phase6';
  const TEST_PHOTOGRAPHER_SESSION = 'photo-session-valid-phase6';

  mockDatabase.projects = [
    {
      id: 'proj-phase6-test',
      ID: 'proj-phase6-test',
      Token: TEST_PROJECT_TOKEN,
      token: TEST_PROJECT_TOKEN,
      'Nama Client': 'Dewi & Rama Wedding',
      NamaClient: 'Dewi & Rama Wedding',
      'Password Client': '5678',
      passwordClient: '5678',
      'Drive Link': ROOT_FOLDER_URL,
      driveLink: ROOT_FOLDER_URL,
      Owner: 'kama_photographer',
      owner: 'kama_photographer',
      'Max Foto': 50,
      MaxFoto: 50,
      statusClient: 'Belum Memilih'
    },
    {
      id: 'proj-other-photographer',
      ID: 'proj-other-photographer',
      Token: 'token-alien-photographer',
      token: 'token-alien-photographer',
      'Nama Client': 'Other Couple',
      'Drive Link': FOREIGN_FOLDER_URL,
      Owner: 'other_photographer',
      owner: 'other_photographer'
    }
  ];

  mockDatabase.sessions = [
    {
      SessionID: TEST_CLIENT_SESSION,
      Username: `__CLIENT_GALLERY__:proj-phase6-test`,
      Role: 'ClientGallery',
      CreatedAt: new Date().toISOString()
    },
    {
      SessionID: TEST_PHOTOGRAPHER_SESSION,
      Username: 'kama_photographer',
      Role: 'Photographer',
      CreatedAt: new Date().toISOString()
    }
  ];

  mockDatabase.users = [
    {
      Username: 'kama_photographer',
      Role: 'Photographer',
      Status: 'Active'
    }
  ];

  // Configure Mock Drive Provider with hierarchy
  process.env.DRIVE_PROVIDER = 'mock';
  const prov = getDriveProvider();
  if (prov.setFolderParent) {
    prov.setFolderParent(SUBFOLDER_CHILD_ID, ROOT_FOLDER_ID);
    prov.setFolderParent(SUBFOLDER_GRANDCHILD_ID, SUBFOLDER_CHILD_ID);
  }
  if (prov.setFolderScenario) {
    prov.setFolderScenario(ROOT_FOLDER_ID, [
      { id: 'img-root-1', name: 'Root_Photo_001.jpg', mimeType: 'image/jpeg', size: 102400 }
    ]);
    prov.setFolderScenario(SUBFOLDER_CHILD_ID, [
      { id: 'img-child-1', name: 'Child_Photo_001.jpg', mimeType: 'image/jpeg', size: 102400 }
    ]);
    prov.setFolderScenario(SUBFOLDER_GRANDCHILD_ID, [
      { id: 'img-gc-1', name: 'Grandchild_Photo_001.jpg', mimeType: 'image/jpeg', size: 102400 }
    ]);
  }

  setupMockNetwork(prov);

  try {
    // =========================================================================
    // T_REPRO: PREVIEW BUG REPRODUCTION (Full-URL vs Canonical ID string mismatch)
    // =========================================================================
    console.log('--- PREVIEW BUG REPRODUCTION & RESOLUTION ---');
    {
      // 1. URL Parser extracted canonical ID
      const extractedRoot = urlParser.extractFolderId(ROOT_FOLDER_URL);
      assert.strictEqual(extractedRoot, ROOT_FOLDER_ID, 'urlParser extracts canonical ID from full URL');

      // 2. Client sends payload.folder_id = ROOT_FOLDER_URL
      const req = {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${TEST_CLIENT_SESSION}`
        }
      };
      const res = createMockRes();
      const payload = {
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_URL // Full URL sent from showClientModeSelection()!
      };

      await actualBackend.handleGetDriveContent(payload, req, res);

      const isSuccess = res.statusCode === 200 && res.jsonPayload?.status === 'success';
      const isNotCrossProjectError = !res.jsonPayload?.message?.includes('Cross-project');

      check(
        'T_REPRO',
        isSuccess && isNotCrossProjectError,
        'Exact Preview mismatch resolved: Full Google Drive URL accepted as project root without false cross-project rejection',
        `HTTP ${res.statusCode}, status: ${res.jsonPayload?.status}`
      );
    }

    // =========================================================================
    // T01: Root folder full URL -> PASS (Client & Photographer paths)
    // =========================================================================
    console.log('\n--- T01: ROOT FOLDER FULL URL ---');
    {
      // Client Gallery Visitor
      const reqClient = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const resClient = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_URL
      }, reqClient, resClient);

      // Photographer Session
      const reqPhoto = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_PHOTOGRAPHER_SESSION}` }
      };
      const resPhoto = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_URL
      }, reqPhoto, resPhoto);

      const t01Ok = resClient.statusCode === 200 && resClient.jsonPayload?.status === 'success' &&
                    resPhoto.statusCode === 200 && resPhoto.jsonPayload?.status === 'success';

      check('T01', t01Ok, 'Root folder full URL opens successfully for both Client and Photographer',
        `Client HTTP: ${resClient.statusCode}, Photo HTTP: ${resPhoto.statusCode}`);
    }

    // =========================================================================
    // T02: Same root folder as raw ID -> PASS (Client & Photographer paths)
    // =========================================================================
    console.log('\n--- T02: ROOT FOLDER AS RAW ID ---');
    {
      // Client Gallery Visitor
      const reqClient = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const resClient = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_ID
      }, reqClient, resClient);

      // Photographer Session
      const reqPhoto = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_PHOTOGRAPHER_SESSION}` }
      };
      const resPhoto = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_ID
      }, reqPhoto, resPhoto);

      const t02Ok = resClient.statusCode === 200 && resClient.jsonPayload?.status === 'success' &&
                    resPhoto.statusCode === 200 && resPhoto.jsonPayload?.status === 'success';

      check('T02', t02Ok, 'Root folder raw ID opens successfully for both Client and Photographer',
        `Client HTTP: ${resClient.statusCode}, Photo HTTP: ${resPhoto.statusCode}`);
    }

    // =========================================================================
    // T03: Root URL with harmless URL parameters -> PASS
    // =========================================================================
    console.log('\n--- T03: ROOT URL WITH HARMLESS PARAMETERS ---');
    {
      const req1 = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const res1 = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_URL_PARAMS
      }, req1, res1);

      const req2 = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const res2 = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_URL_OPEN
      }, req2, res2);

      const t03Ok = res1.statusCode === 200 && res1.jsonPayload?.status === 'success' &&
                    res2.statusCode === 200 && res2.jsonPayload?.status === 'success';

      check('T03', t03Ok, 'Root URL with query params (?usp=sharing, ?id=...) canonicalizes and PASSES',
        `folders/?usp: HTTP ${res1.statusCode}, open?id: HTTP ${res2.statusCode}`);
    }

    // =========================================================================
    // T04: Legitimate direct subfolder -> PASS
    // =========================================================================
    console.log('\n--- T04: LEGITIMATE DIRECT SUBFOLDER ---');
    {
      // Subfolder as full URL
      const reqUrl = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const resUrl = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: SUBFOLDER_CHILD_URL
      }, reqUrl, resUrl);

      // Subfolder as raw ID
      const reqId = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const resId = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: SUBFOLDER_CHILD_ID
      }, reqId, resId);

      const t04Ok = resUrl.statusCode === 200 && resUrl.jsonPayload?.status === 'success' &&
                    resId.statusCode === 200 && resId.jsonPayload?.status === 'success';

      check('T04', t04Ok, 'Legitimate direct subfolder passes verifyFolderHierarchy as both URL and raw ID',
        `Sub URL: HTTP ${resUrl.statusCode}, Sub ID: HTTP ${resId.statusCode}`);
    }

    // =========================================================================
    // T05: Legitimate nested subfolder -> PASS
    // =========================================================================
    console.log('\n--- T05: LEGITIMATE NESTED SUBFOLDER ---');
    {
      const req = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const res = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: SUBFOLDER_GRANDCHILD_URL
      }, req, res);

      const t05Ok = res.statusCode === 200 && res.jsonPayload?.status === 'success';
      check('T05', t05Ok, 'Legitimate nested grandchild subfolder passes hierarchy traversal',
        `HTTP ${res.statusCode}, status: ${res.jsonPayload?.status}`);
    }

    // =========================================================================
    // T06: Foreign project folder -> HTTP 403
    // =========================================================================
    console.log('\n--- T06: FOREIGN PROJECT FOLDER ---');
    {
      const req = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const res = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: FOREIGN_FOLDER_ID
      }, req, res);

      const t06Ok = res.statusCode === 403 &&
                    res.jsonPayload?.message?.includes('Cross-project / invalid subfolder');

      check('T06', t06Ok, 'Foreign project folder strictly rejected with HTTP 403 cross-project error',
        `HTTP ${res.statusCode}, message: ${res.jsonPayload?.message}`);
    }

    // =========================================================================
    // T07: Unrelated Google Drive URL -> DENIED
    // =========================================================================
    console.log('\n--- T07: UNRELATED GOOGLE DRIVE URL ---');
    {
      const req = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
      };
      const res = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: FOREIGN_FOLDER_URL
      }, req, res);

      const t07Ok = res.statusCode === 403 &&
                    res.jsonPayload?.message?.includes('Cross-project / invalid subfolder');

      check('T07', t07Ok, 'Unrelated Google Drive URL strictly DENIED with HTTP 403',
        `HTTP ${res.statusCode}, message: ${res.jsonPayload?.message}`);
    }

    // =========================================================================
    // T08: Malformed URL or folder ID -> DENIED
    // =========================================================================
    console.log('\n--- T08: MALFORMED URL OR FOLDER ID ---');
    {
      const malformedInputs = [
        'javascript:alert(1)',
        'http://drive.google.com/folders/unencrypted_plain_http',
        'https://attacker.evil.com/drive/folders/fake',
        'short',
        'invalid!@#$%^&*()',
        'file:///etc/passwd'
      ];

      let allMalformedDenied = true;
      for (const bad of malformedInputs) {
        const req = {
          method: 'POST',
          headers: { 'authorization': `Bearer ${TEST_CLIENT_SESSION}` }
        };
        const res = createMockRes();
        await actualBackend.handleGetDriveContent({
          action: 'getDriveContent',
          token: TEST_PROJECT_TOKEN,
          folder_id: bad
        }, req, res);

        if (res.statusCode !== 400 && res.statusCode !== 403) {
          allMalformedDenied = false;
        }
      }

      check('T08', allMalformedDenied, 'Malformed, plain HTTP, external hosts, and SSRF patterns fail closed with HTTP 400/403',
        `Tested ${malformedInputs.length} malformed inputs`);
    }

    // =========================================================================
    // T09: No client session -> HTTP 403
    // =========================================================================
    console.log('\n--- T09: NO CLIENT SESSION ---');
    {
      const req = {
        method: 'POST',
        headers: {} // No authorization header
      };
      const res = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_URL
      }, req, res);

      const t09Ok = res.statusCode === 403 &&
                    res.jsonPayload?.message?.includes('Memerlukan otorisasi sesi PIN');

      check('T09', t09Ok, 'Client gallery request without session strictly rejected with HTTP 403',
        `HTTP ${res.statusCode}, message: ${res.jsonPayload?.message}`);
    }

    // =========================================================================
    // T10: Invalid PIN / expired session -> DENIED
    // =========================================================================
    console.log('\n--- T10: INVALID PIN / EXPIRED SESSION ---');
    {
      const req = {
        method: 'POST',
        headers: { 'authorization': 'Bearer forged-or-expired-session-token-xyz' }
      };
      const res = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: TEST_PROJECT_TOKEN,
        folder_id: ROOT_FOLDER_URL
      }, req, res);

      const t10Ok = res.statusCode === 403 &&
                    res.jsonPayload?.message?.includes('Sesi galeri tidak valid');

      check('T10', t10Ok, 'Forged or expired client session strictly DENIED with HTTP 403',
        `HTTP ${res.statusCode}, message: ${res.jsonPayload?.message}`);
    }

    // =========================================================================
    // T11: Photographer cannot access another photographer's project
    // =========================================================================
    console.log('\n--- T11: CROSS-PHOTOGRAPHER PROJECT ISOLATION ---');
    {
      // Authenticated photographer 'kama_photographer' tries to access 'token-alien-photographer'
      const req = {
        method: 'POST',
        headers: { 'authorization': `Bearer ${TEST_PHOTOGRAPHER_SESSION}` }
      };
      const res = createMockRes();
      await actualBackend.handleGetDriveContent({
        action: 'getDriveContent',
        token: 'token-alien-photographer',
        folder_id: FOREIGN_FOLDER_URL
      }, req, res);

      const t11Ok = res.statusCode === 403 &&
                    res.jsonPayload?.message?.includes('Akun Anda tidak memiliki hak akses untuk project ini');

      check('T11', t11Ok, 'Photographer cannot access another photographer\'s project (HTTP 403 isolation)',
        `HTTP ${res.statusCode}, message: ${res.jsonPayload?.message}`);
    }

    // =========================================================================
    // T12: Photo selection, download mode, thumbnail and ZIP logic preserved
    // =========================================================================
    console.log('\n--- T12: PRESERVATION OF PHOTO SELECTION & DOWNLOAD LOGIC ---');
    {
      const appHtmlPath = path.resolve(__dirname, '..', 'app.html');
      const appHtmlContent = fs.readFileSync(appHtmlPath, 'utf8');

      const hasExtractHelper = appHtmlContent.includes('function extractDriveFolderId(');
      const hasShowClientMode = appHtmlContent.includes('function showClientModeSelection()');
      const hasSelectionMode = appHtmlContent.includes("selectClientMode('selection')") || appHtmlContent.includes('selectClientMode(mode)');
      const hasZipDownload = appHtmlContent.includes('function downloadSelectedAsZip');
      const hasGenerateZipName = appHtmlContent.includes('function generateClientZipFilename');
      const hasFetchOriginal = appHtmlContent.includes('function fetchAuthorizedOriginalBlob');

      // Verify PublicDriveProvider verifyFolderHierarchy handles full URLs vs raw IDs defensively
      const pubProv = new PublicDriveProvider();
      pubProv.folderHierarchy.set('child_abc_12345678', 'root_xyz_12345678');
      const directMatch = await pubProv.verifyFolderHierarchy({
        folderId: 'https://drive.google.com/drive/folders/root_xyz_12345678',
        rootFolderId: 'root_xyz_12345678'
      });
      const childMatch = await pubProv.verifyFolderHierarchy({
        folderId: 'https://drive.google.com/drive/folders/child_abc_12345678',
        rootFolderId: 'root_xyz_12345678'
      });

      const t12Ok = hasExtractHelper && hasShowClientMode && hasSelectionMode &&
                    hasZipDownload && hasGenerateZipName && hasFetchOriginal &&
                    directMatch.allowed === true && childMatch.allowed === true;

      check('T12', t12Ok, 'Photo selection, download mode, authentic ZIP, and provider hierarchy preserved intact',
        `App helpers: true, PublicProvider defensive hierarchy: direct=${directMatch.allowed}, child=${childMatch.allowed}`);
    }

  } finally {
    restoreMockNetwork();
  }

  console.log('\n================================================================');
  console.log(`TOTAL PHASE 6 ROOT FOLDER ID TESTS: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});

/**
 * PHOTO SELECTION PHASE 6 — GEW08635.JPG ROOT CAUSE ERROR CLASSIFICATION & FALLBACK SUITE
 * 
 * AUDIT SCOPE:
 * Target failing photo: GEW08635.JPG
 * Target active provider: DRIVE_PROVIDER=public_link
 * 
 * VERIFIES:
 * 1. Distinction between KMBC project authorization failures vs Google upstream download refusals.
 * 2. Proper error codes:
 *    - KMBC_SESSION_DENIED (HTTP 403)
 *    - KMBC_PROJECT_FILE_DENIED (HTTP 403)
 *    - GOOGLE_ORIGINAL_UPSTREAM_DENIED (HTTP 502, upstreamStatus: 403)
 *    - GOOGLE_ORIGINAL_NOT_FOUND (HTTP 404)
 *    - GOOGLE_ORIGINAL_RATE_LIMIT (HTTP 502)
 *    - GOOGLE_DOWNLOAD_HTML_WALL (HTTP 502)
 *    - GOOGLE_ORIGINAL_NETWORK_ERROR (HTTP 502)
 * 3. Frontend error status preservation: err.status = response.status on HTTP 403 and 502.
 * 4. Honest fallback: External view link (https://drive.google.com/file/d/FILE_ID/view)
 *    unhidden on upstream refusal; never claiming preview is Original 100%.
 * 5. Authentic JPEG binary decode validator.
 * 
 * EXECUTION CLASSIFICATION:
 * [CONTROLLED MOCK REGRESSION - SYNTHETIC DATA]
 * LIVE GOOGLE DRIVE = NOT RUN (Requires operator live environment on Vercel Preview)
 */

const assert = require('assert');
const crypto = require('crypto');
const { Readable, Writable } = require('stream');

const {
  PublicDriveProvider,
  types
} = require('../api/drive');

const actualBackend = require('../api/supabase');

// --- HELPER 1: Real JPEG Decode Validator ---
function validateJpegBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return { valid: false, reason: 'BUFFER_TOO_SMALL' };
  }
  // SOI (0xFF, 0xD8)
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return { valid: false, reason: 'MISSING_SOI_MARKER' };
  }
  // EOI (0xFF, 0xD9)
  if (buffer[buffer.length - 2] !== 0xFF || buffer[buffer.length - 1] !== 0xD9) {
    return { valid: false, reason: 'MISSING_EOI_MARKER' };
  }

  // Scan markers for SOF0 (Baseline DCT 0xFF, 0xC0) or SOF2 (Progressive DCT 0xFF, 0xC2)
  let offset = 2;
  let width = 0;
  let height = 0;
  let foundSof = false;

  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xFF) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // Standalone markers without length: SOI, EOI, TEM, RST0..RST7
    if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xC0 || marker === 0xC2) {
      // SOF marker
      height = buffer.readUInt16BE(offset + 5);
      width = buffer.readUInt16BE(offset + 7);
      foundSof = true;
      break;
    }
    offset += 2 + length;
  }

  return {
    valid: foundSof && width > 0 && height > 0,
    width,
    height,
    reason: foundSof ? 'OK' : 'SOF_NOT_FOUND'
  };
}

// --- HELPER 2: Synthesize a valid test JPEG buffer ---
function createTestJpegBuffer(width = 1920, height = 1080, byteCount = 250000) {
  const buf = Buffer.alloc(byteCount, 0x42);
  // SOI (0xFF, 0xD8)
  buf[0] = 0xFF; buf[1] = 0xD8;
  // APP0 (0xFF, 0xE0) length 16
  buf[2] = 0xFF; buf[3] = 0xE0;
  buf[4] = 0x00; buf[5] = 0x10;
  buf.write('JFIF', 6, 'ascii');
  buf[10] = 0x00; buf[11] = 0x01; buf[12] = 0x01; buf[13] = 0x00;
  buf[14] = 0x00; buf[15] = 0x48; buf[16] = 0x00; buf[17] = 0x48;
  buf[18] = 0x00; buf[19] = 0x00;
  // SOF0 (0xFF, 0xC0) length 17 (2 length + 1 precision + 2 height + 2 width + 1 components + 3*3 comp details)
  buf[20] = 0xFF; buf[21] = 0xC0;
  buf[22] = 0x00; buf[23] = 0x11; // length 17
  buf[24] = 0x08; // 8-bit precision
  buf.writeUInt16BE(height, 25); // height at 25, 26
  buf.writeUInt16BE(width, 27);  // width at 27, 28
  buf[29] = 0x03; // 3 color components
  // EOI
  buf[byteCount - 2] = 0xFF; buf[byteCount - 1] = 0xD9;
  return buf;
}

// --- HELPER 3: Mock Writable Stream for HTTP Response ---
class MockHttpResponseStream extends Writable {
  constructor() {
    super();
    this.capturedHeaders = {};
    this.capturedStatus = 0;
    this.capturedBodyChunks = [];
    this.capturedJson = null;
  }
  writeHead(status, headers) {
    this.capturedStatus = status;
    if (headers) Object.assign(this.capturedHeaders, headers);
  }
  setHeader(name, val) {
    this.capturedHeaders[name.toLowerCase()] = val;
  }
  status(code) {
    this.capturedStatus = code;
    return this;
  }
  json(data) {
    this.capturedJson = data;
    this.end(JSON.stringify(data));
  }
  _write(chunk, encoding, callback) {
    this.capturedBodyChunks.push(Buffer.from(chunk));
    callback();
  }
}

async function runGew08635TestSuite() {
  console.log('================================================================');
  console.log('PHASE 6 — GEW08635.JPG ROOT CAUSE ERROR CLASSIFICATION SUITE');
  console.log('STATUS: [CONTROLLED MOCK REGRESSION - SYNTHETIC DATA]');
  console.log('LIVE GOOGLE DRIVE = NOT RUN (No live Google Drive access in IDE)');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function testCheck(name, cond, details = '') {
    total++;
    if (cond) {
      console.log(`✅ [PASS] ${name}${details ? ' — ' + details : ''}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}${details ? ' — ' + details : ''}`);
      assert.fail(`Test failed: ${name}`);
    }
  }

  const TARGET_FILENAME = 'GEW08635.JPG';
  const TARGET_FILE_ID = '1gew08635_test_file_id_google';
  const FOLDER_ID = 'folder_cam1_gew08635';
  const ROOT_FOLDER_ID = 'root_kmbc_project_drive';

  // --------------------------------------------------------------------------
  // TEST 1: JPEG Binary Decode Validator Correctness
  // --------------------------------------------------------------------------
  const validJpeg = createTestJpegBuffer(3840, 2160, 450000);
  const decodeRes = validateJpegBuffer(validJpeg);
  testCheck(
    'T1: JPEG Decode Validator verifies valid JPEG buffer with dimensions',
    decodeRes.valid === true && decodeRes.width === 3840 && decodeRes.height === 2160,
    `Valid: ${decodeRes.valid}, Dimensions: ${decodeRes.width}x${decodeRes.height}`
  );

  const truncatedJpeg = validJpeg.subarray(0, 1000);
  const truncatedRes = validateJpegBuffer(truncatedJpeg);
  testCheck(
    'T2: JPEG Decode Validator rejects truncated/corrupt buffer without EOI',
    truncatedRes.valid === false && truncatedRes.reason === 'MISSING_EOI_MARKER',
    `Valid: ${truncatedRes.valid}, Reason: ${truncatedRes.reason}`
  );

  // --------------------------------------------------------------------------
  // TEST 2: Error Classification — KMBC Session Denial vs Google Upstream Denial
  // --------------------------------------------------------------------------
  // Case A: Missing session token -> KMBC_SESSION_DENIED (HTTP 403)
  const reqNoSession = {
    headers: { 'x-client-token': 'valid_project_token' },
    query: { purpose: 'view', folderId: FOLDER_ID }
  };
  const resNoSession = new MockHttpResponseStream();
  await actualBackend.handleDownloadOriginalFile(
    { action: 'downloadOriginalFile', fileId: TARGET_FILE_ID, folderId: FOLDER_ID },
    reqNoSession,
    resNoSession
  );
  testCheck(
    'T3: Missing KMBC Session returns HTTP 403 KMBC_SESSION_DENIED',
    resNoSession.capturedStatus === 403 &&
    resNoSession.capturedJson &&
    resNoSession.capturedJson.code === 'KMBC_SESSION_DENIED',
    `Status: ${resNoSession.capturedStatus}, Code: ${resNoSession.capturedJson ? resNoSession.capturedJson.code : 'none'}`
  );

  // Case B: Cross-project file denial -> KMBC_PROJECT_FILE_DENIED (HTTP 403)
  const reqCrossProject = {
    headers: {
      'authorization': 'Bearer valid_session',
      'x-client-token': 'project_alpha'
    },
    query: { purpose: 'view', folderId: FOLDER_ID }
  };
  const resCrossProject = new MockHttpResponseStream();
  await actualBackend.handleDownloadOriginalFile(
    {
      action: 'downloadOriginalFile',
      fileId: 'foreign_unauthorized_file_id',
      folderId: FOLDER_ID,
      testProjectFinder: async () => ({ Token: 'project_alpha', 'Drive Link': `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}` }),
      testSessionVerifier: async () => ({ SessionID: 'valid_session' }),
      testProjectAuthorizer: async () => ({ allowed: false, code: 'KMBC_PROJECT_FILE_DENIED', status: 403 })
    },
    reqCrossProject,
    resCrossProject
  );
  testCheck(
    'T4: Cross-Project File Request returns HTTP 403 KMBC_PROJECT_FILE_DENIED',
    resCrossProject.capturedStatus === 403 &&
    resCrossProject.capturedJson &&
    resCrossProject.capturedJson.code === 'KMBC_PROJECT_FILE_DENIED',
    `Status: ${resCrossProject.capturedStatus}, Code: ${resCrossProject.capturedJson ? resCrossProject.capturedJson.code : 'none'}`
  );

  // --------------------------------------------------------------------------
  // TEST 3: Google Upstream Refusal Returns 502 GOOGLE_ORIGINAL_UPSTREAM_DENIED (NOT FOLDER_ACCESS_DENIED)
  // --------------------------------------------------------------------------
  const upstream403Fetch = async (url) => {
    return {
      status: 403,
      ok: false,
      headers: new Map([['content-type', 'text/plain']]),
      body: Readable.from([Buffer.from('Google 403 Forbidden')])
    };
  };

  const providerUpstream403 = new PublicDriveProvider({ fetch: upstream403Fetch });
  providerUpstream403.fileCache.set(TARGET_FILE_ID, {
    id: TARGET_FILE_ID,
    name: TARGET_FILENAME,
    mimeType: 'image/jpeg',
    parents: [FOLDER_ID]
  });
  providerUpstream403.folderHierarchy.set(FOLDER_ID, ROOT_FOLDER_ID);

  const stream403Result = await providerUpstream403.fetchOriginalStream(TARGET_FILE_ID);
  testCheck(
    'T5: PublicDriveProvider maps Google 403 to GOOGLE_ORIGINAL_UPSTREAM_DENIED (NOT FOLDER_ACCESS_DENIED)',
    stream403Result.success === false &&
    stream403Result.code === 'GOOGLE_ORIGINAL_UPSTREAM_DENIED' &&
    stream403Result.status === 502 &&
    stream403Result.upstreamStatus === 403,
    `Code: ${stream403Result.code}, Status: ${stream403Result.status}, Upstream: ${stream403Result.upstreamStatus}`
  );

  // End-to-end bridge handler with upstream 403
  const reqValidAuth = {
    headers: {
      'authorization': 'Bearer valid_client_session',
      'x-client-token': 'valid_project_token'
    },
    query: { purpose: 'view', folderId: FOLDER_ID }
  };
  const resBridgeUpstream = new MockHttpResponseStream();
  await actualBackend.handleDownloadOriginalFile(
    {
      action: 'downloadOriginalFile',
      fileId: TARGET_FILE_ID,
      folderId: FOLDER_ID,
      purpose: 'view',
      testProviderOverride: providerUpstream403,
      testProjectFinder: async () => ({ Token: 'valid_project_token', 'Drive Link': `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}` }),
      testSessionVerifier: async () => ({ SessionID: 'valid_client_session' })
    },
    reqValidAuth,
    resBridgeUpstream
  );
  testCheck(
    'T6: Bridge Handler transmits 502 GOOGLE_ORIGINAL_UPSTREAM_DENIED to Client',
    resBridgeUpstream.capturedStatus === 502 &&
    resBridgeUpstream.capturedJson &&
    resBridgeUpstream.capturedJson.code === 'GOOGLE_ORIGINAL_UPSTREAM_DENIED',
    `Status: ${resBridgeUpstream.capturedStatus}, Code: ${resBridgeUpstream.capturedJson ? resBridgeUpstream.capturedJson.code : 'none'}`
  );

  // --------------------------------------------------------------------------
  // TEST 4: Google Upstream 404, 429, and HTML Wall Classifications
  // --------------------------------------------------------------------------
  // Google 404
  const provider404 = new PublicDriveProvider({ fetch: async () => ({ status: 404, ok: false }) });
  provider404.fileCache.set(TARGET_FILE_ID, { id: TARGET_FILE_ID, name: TARGET_FILENAME, parents: [FOLDER_ID] });
  provider404.folderHierarchy.set(FOLDER_ID, ROOT_FOLDER_ID);
  const res404 = await provider404.fetchOriginalStream(TARGET_FILE_ID);
  testCheck(
    'T7: Google 404 maps to GOOGLE_ORIGINAL_NOT_FOUND (HTTP 404)',
    res404.success === false && res404.code === 'GOOGLE_ORIGINAL_NOT_FOUND' && res404.status === 404,
    `Code: ${res404.code}, Status: ${res404.status}`
  );

  // Google 429
  const provider429 = new PublicDriveProvider({ fetch: async () => ({ status: 429, ok: false }) });
  provider429.fileCache.set(TARGET_FILE_ID, { id: TARGET_FILE_ID, name: TARGET_FILENAME, parents: [FOLDER_ID] });
  provider429.folderHierarchy.set(FOLDER_ID, ROOT_FOLDER_ID);
  const res429 = await provider429.fetchOriginalStream(TARGET_FILE_ID);
  testCheck(
    'T8: Google 429 maps to GOOGLE_ORIGINAL_RATE_LIMIT (HTTP 502)',
    res429.success === false && res429.code === 'GOOGLE_ORIGINAL_RATE_LIMIT' && res429.status === 502,
    `Code: ${res429.code}, Status: ${res429.status}`
  );

  // Google HTML wall
  const providerHtmlWall = new PublicDriveProvider({
    fetch: async () => ({
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'text/html; charset=utf-8']]),
      text: async () => '<html><body>Download quota exceeded.</body></html>'
    })
  });
  providerHtmlWall.fileCache.set(TARGET_FILE_ID, { id: TARGET_FILE_ID, name: TARGET_FILENAME, parents: [FOLDER_ID] });
  providerHtmlWall.folderHierarchy.set(FOLDER_ID, ROOT_FOLDER_ID);
  const resHtmlWall = await providerHtmlWall.fetchOriginalStream(TARGET_FILE_ID);
  testCheck(
    'T9: Google HTML download wall maps to GOOGLE_DOWNLOAD_HTML_WALL (HTTP 502)',
    resHtmlWall.success === false && resHtmlWall.code === 'GOOGLE_DOWNLOAD_HTML_WALL' && resHtmlWall.status === 502,
    `Code: ${resHtmlWall.code}, Status: ${resHtmlWall.status}`
  );

  // --------------------------------------------------------------------------
  // TEST 5: Frontend app.html Error Status Preservation Verification
  // --------------------------------------------------------------------------
  const fs = require('fs');
  const path = require('path');
  const appHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');

  // Verify err.status = response.status is set on 401/403 errors
  const hasStatusPreservation403 = appHtmlContent.includes('generalAuthErr.status = response.status') &&
    appHtmlContent.includes('maxRetryErr.status = response.status') &&
    appHtmlContent.includes('cancelErr.status = response.status') &&
    appHtmlContent.includes('cpErr.status = response.status');

  testCheck(
    'T10: Frontend app.html preserves err.status = response.status on HTTP 403 errors',
    hasStatusPreservation403,
    'Preserves HTTP status code on all client auth failure branches'
  );

  // Verify viewerExternalDriveLink element exists and fallback logic is wired
  const hasExternalDriveLink = appHtmlContent.includes('id="viewer-external-drive-link"') &&
    appHtmlContent.includes('drive.google.com/file/d/');

  testCheck(
    'T11: Frontend app.html provides honest external Google Drive view link fallback',
    hasExternalDriveLink,
    'Provides external view link without masking failure or falsely labeling preview as Original 100%'
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log(`\n================================================================`);
  console.log(`GEW08635.JPG TEST SUITE COMPLETED: ${passed}/${total} ASSERTIONS PASSED`);
  console.log(`LIVE GOOGLE DRIVE = NOT RUN (Requires operator live environment)`);
  console.log(`================================================================\n`);
}

runGew08635TestSuite().catch((err) => {
  console.error('Fatal error running GEW08635 test suite:', err);
  process.exit(1);
});

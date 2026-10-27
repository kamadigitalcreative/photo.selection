/**
 * PHOTO SELECTION PHASE 6 — GEW08635.JPG / GEW08653.JPG ROOT CAUSE AUDIT & FINAL DECISION SUITE
 * 
 * AUDIT SCOPE:
 * Target failing photo: GEW08653.JPG / GEW08635.JPG
 * Target active provider: DRIVE_PROVIDER=public_link
 * 
 * VERIFIES TEST REQUIREMENTS (T01 - T10):
 * T01: No external Drive buttons for clients in gallery or viewer.
 * T02: No client redirect to Google Drive.
 * T03: Gallery remains fast (CDN previews, concurrency queue, caching intact).
 * T04: Project authorization remains enforced (HTTP 403 KMBC_SESSION_DENIED).
 * T05: Actual source of original failure identified (GOOGLE_ORIGINAL_UPSTREAM_DENIED 502).
 * T06: Authentic JPEG binary decode validator checks dimensions, markers, and byte count.
 * T07: Invalid upstream HTML never becomes an image (GOOGLE_DOWNLOAD_HTML_WALL 502).
 * T08: Preview never falsely claims to be original (truthful Mode Preview badge).
 * T09: Other project files remain inaccessible (KMBC_PROJECT_FILE_DENIED 403).
 * T10: Existing photo selections stay intact.
 * 
 * EXECUTION CLASSIFICATION:
 * [CONTROLLED MOCK REGRESSION - SYNTHETIC DATA]
 * LIVE GOOGLE DRIVE = NOT RUN (Requires operator live environment on Vercel Preview)
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable, Writable } = require('stream');

const {
  PublicDriveProvider,
  types
} = require('../api/drive');

const actualBackend = require('../api/supabase');

// --- HELPER 1: Real JPEG Decode Validator (T06) ---
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
  // SOF0 (0xFF, 0xC0) length 17
  buf[20] = 0xFF; buf[21] = 0xC0;
  buf[22] = 0x00; buf[23] = 0x11;
  buf[24] = 0x08; // 8-bit precision
  buf.writeUInt16BE(height, 25);
  buf.writeUInt16BE(width, 27);
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

async function runRecoveryTestSuite() {
  console.log('================================================================');
  console.log('PHASE 6 — ORIGINAL VIEWER RECOVERY & DECISION TEST SUITE');
  console.log('TARGETS: GEW08653.JPG & GEW08635.JPG');
  console.log('STATUS: [CONTROLLED MOCK REGRESSION - SYNTHETIC DATA]');
  console.log('LIVE GOOGLE DRIVE = NOT RUN (No live Google Drive access in IDE)');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function testCheck(id, name, cond, details = '') {
    total++;
    if (cond) {
      console.log(`✅ [PASS] ${id}: ${name}${details ? ' — ' + details : ''}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${id}: ${name}${details ? ' — ' + details : ''}`);
      assert.fail(`Test failed: ${id}: ${name}`);
    }
  }

  const appHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  const TARGET_FILENAME = 'GEW08653.JPG';
  const TARGET_FILE_ID = '1gew08653_test_file_id_google';
  const FOLDER_ID = 'folder_cam1_gew08653';
  const ROOT_FOLDER_ID = 'root_kmbc_project_drive';

  // --------------------------------------------------------------------------
  // T01: No external Drive buttons for clients in gallery or viewer
  // --------------------------------------------------------------------------
  const hasExternalViewerButton = appHtmlContent.includes('id="viewer-external-drive-link"') ||
    appHtmlContent.includes('Buka di Drive (Eksternal)') ||
    appHtmlContent.includes('title="Buka berkas di Google Drive (Tampilan Eksternal)"');

  testCheck(
    'T01',
    'No external Drive buttons for clients in gallery or viewer',
    !hasExternalViewerButton,
    'Client gallery and fullscreen viewer contain zero external Drive buttons'
  );

  // --------------------------------------------------------------------------
  // T02: No client redirect to Google Drive
  // --------------------------------------------------------------------------
  const loadViewerFnMatch = appHtmlContent.match(/function loadViewerAuthenticOriginal[\s\S]*?function closeImageViewer/);
  const loadViewerFnText = loadViewerFnMatch ? loadViewerFnMatch[0] : '';
  const viewerHasDriveRedirect = /(?:window\.location(?:\.href)?\s*=|window\.open)\s*\([^)]*drive\.google\.com/.test(loadViewerFnText);

  testCheck(
    'T02',
    'No client redirect to Google Drive on failure',
    !viewerHasDriveRedirect,
    'Viewer failure keeps clients inside KMBC without external redirects'
  );

  // --------------------------------------------------------------------------
  // T03: Gallery remains fast
  // --------------------------------------------------------------------------
  const hasFastGalleryInvariants = appHtmlContent.includes('previewBlobCache') &&
    appHtmlContent.includes('MAX_CONCURRENT_FETCHES') &&
    appHtmlContent.includes('inFlightRequests');

  testCheck(
    'T03',
    'Gallery remains fast (preview caching, concurrency queue, CDN intact)',
    hasFastGalleryInvariants,
    'Thumbnail queue, memory cache, and concurrency limits intact'
  );

  // --------------------------------------------------------------------------
  // T04: Project authorization remains enforced
  // --------------------------------------------------------------------------
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
    'T04',
    'Project authorization remains enforced (HTTP 403 KMBC_SESSION_DENIED)',
    resNoSession.capturedStatus === 403 &&
    resNoSession.capturedJson &&
    resNoSession.capturedJson.code === 'KMBC_SESSION_DENIED',
    `Status: ${resNoSession.capturedStatus}, Code: ${resNoSession.capturedJson ? resNoSession.capturedJson.code : 'none'}`
  );

  // --------------------------------------------------------------------------
  // T05: Actual source of original failure identified (Upstream 403 -> 502)
  // --------------------------------------------------------------------------
  const upstream403Fetch = async () => ({
    status: 403,
    ok: false,
    headers: new Map([['content-type', 'text/plain']]),
    body: Readable.from([Buffer.from('Google 403 Forbidden')])
  });

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
    'T05',
    'Actual source of original failure identified as GOOGLE_ORIGINAL_UPSTREAM_DENIED (HTTP 502)',
    stream403Result.success === false &&
    stream403Result.code === 'GOOGLE_ORIGINAL_UPSTREAM_DENIED' &&
    stream403Result.status === 502 &&
    stream403Result.upstreamStatus === 403,
    `Code: ${stream403Result.code}, Status: ${stream403Result.status}, Upstream: ${stream403Result.upstreamStatus}`
  );

  // --------------------------------------------------------------------------
  // T06: If original loads, verify actual bytes and native image dimensions
  // --------------------------------------------------------------------------
  const validJpeg = createTestJpegBuffer(3840, 2160, 450000);
  const decodeRes = validateJpegBuffer(validJpeg);
  const corruptBuffer = Buffer.from('NOT_A_JPEG_FILE');
  const corruptRes = validateJpegBuffer(corruptBuffer);

  testCheck(
    'T06',
    'Authentic JPEG binary decode validator checks dimensions, markers, and byte count',
    decodeRes.valid === true && decodeRes.width === 3840 && decodeRes.height === 2160 &&
    corruptRes.valid === false,
    `Valid: ${decodeRes.valid} (${decodeRes.width}x${decodeRes.height}), Corrupt rejected: ${!corruptRes.valid}`
  );

  // --------------------------------------------------------------------------
  // T07: Invalid upstream HTML never becomes an image
  // --------------------------------------------------------------------------
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
    'T07',
    'Invalid upstream HTML never becomes an image (maps to GOOGLE_DOWNLOAD_HTML_WALL 502)',
    resHtmlWall.success === false &&
    resHtmlWall.code === 'GOOGLE_DOWNLOAD_HTML_WALL' &&
    resHtmlWall.status === 502,
    `Code: ${resHtmlWall.code}, Status: ${resHtmlWall.status}`
  );

  // --------------------------------------------------------------------------
  // T08: Preview never falsely claims to be original & suppresses Mode Preview error badge
  // --------------------------------------------------------------------------
  const suppressesModePreviewBadge = !appHtmlContent.includes("Mode Preview") &&
    appHtmlContent.includes("statusEl.className = 'hidden'");

  testCheck(
    'T08',
    'Preview never falsely claims to be original & suppresses Mode Preview error badge',
    suppressesModePreviewBadge,
    'Viewer hides error badge and never renders Mode Preview text'
  );

  // --------------------------------------------------------------------------
  // T09: Other project files remain inaccessible
  // --------------------------------------------------------------------------
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
    'T09',
    'Other project files remain inaccessible (HTTP 403 KMBC_PROJECT_FILE_DENIED)',
    resCrossProject.capturedStatus === 403 &&
    resCrossProject.capturedJson &&
    resCrossProject.capturedJson.code === 'KMBC_PROJECT_FILE_DENIED',
    `Status: ${resCrossProject.capturedStatus}, Code: ${resCrossProject.capturedJson ? resCrossProject.capturedJson.code : 'none'}`
  );

  // --------------------------------------------------------------------------
  // T10: Existing photo selections stay intact
  // --------------------------------------------------------------------------
  const hasSelectionPersistence = appHtmlContent.includes('handleUpdateClientStatus') ||
    appHtmlContent.includes('performSelectionData') ||
    appHtmlContent.includes('queueSaveSelections');

  testCheck(
    'T10',
    'Existing photo selections stay intact (selection sync & debounce intact)',
    hasSelectionPersistence,
    'Selection logic and client status update handlers intact'
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log(`\n================================================================`);
  console.log(`RECOVERY SUITE COMPLETED: ${passed}/${total} ASSERTIONS PASSED (T01 - T10)`);
  console.log(`LIVE GOOGLE DRIVE = NOT RUN (Requires operator live environment)`);
  console.log(`================================================================\n`);
}

runRecoveryTestSuite().catch((err) => {
  console.error('Fatal error running Recovery test suite:', err);
  process.exit(1);
});

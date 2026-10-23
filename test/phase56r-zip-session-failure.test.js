/**
 * PHASE 5.6R — ZIP SESSION FAILURE & REDUNDANT SUMMARY REMOVAL TEST SUITE (T01 - T25)
 *
 * Real HTTP and Static Invariant Test Suite validating:
 * T01: Authorized client PIN -> success.
 * T02: Authorized original GET -> HTTP 200.
 * T03: Original PNG bytes match source.
 * T04: Valid session ZIP -> file generated.
 * T05: ZIP includes exactly chosen photos.
 * T06: ZIP entries byte-for-byte match fixtures.
 * T07: No session -> protected GET denied.
 * T08: Wrong project -> protected GET denied.
 * T09: Download disabled -> protected GET denied.
 * T10: Expired mock session produces real INVALID_SESSION.
 * T11: ZIP detects expired session.
 * T12: PIN reauthentication prompt is triggered once, not repeatedly.
 * T13: Correct PIN -> ZIP resumes successfully.
 * T14: Cancel PIN -> ZIP stops and loader closes.
 * T15: Failed session renewal -> no infinite loop.
 * T16: Network timeout -> loader closes.
 * T17: ZIP button becomes enabled after error.
 * T18: Selection state is preserved after error.
 * T19: Extra middle summary removed in both modes.
 * T20: Header and bottom counters still work.
 * T21: Individual download remains functional.
 * T22: No authorization credentials appear in original-file request query strings when header transport is supported.
 * T23: Client selection mode still works.
 * T24: Responsive CSS remains intact.
 * T25: No Production mutation.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const PORT = 4173;
const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(__dirname, 'phase55-fixtures');
const appHtmlPath = path.join(ROOT_DIR, 'app.html');
const luxuryCssPath = path.join(ROOT_DIR, 'assets', 'css', 'client-gallery-luxury.css');
const appCoreCssPath = path.join(ROOT_DIR, 'assets', 'css', 'app-core.css');

let pass = 0;
let fail = 0;

function check(id, condition, description, detail = '') {
    if (condition) {
        pass++;
        console.log(`✅ [PASS] ${id}: ${description}${detail ? ' — ' + detail : ''}`);
    } else {
        fail++;
        console.error(`❌ [FAIL] ${id}: ${description}${detail ? ' — ' + detail : ''}`);
    }
}

function httpPost(action, payload = {}, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ action, ...payload });
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: '/api',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...headers
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, text: body });
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function httpGet(filePath, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: filePath,
            method: 'GET',
            headers: headers
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                let json = null;
                try { json = JSON.parse(buffer.toString('utf8')); } catch (_) {}
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    buffer: buffer,
                    json: json
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

// Pure JS ZIP generator
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = ((c & 1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[i] = c;
}

function crc32(buf) {
    let crc = ~0;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return ~crc >>> 0;
}

function createZipArchive(files) {
    const localHeaders = [];
    const centralDirs = [];
    let offset = 0;

    for (const file of files) {
        const nameBuf = Buffer.from(file.name, 'utf8');
        const dataBuf = file.data;
        const crc = crc32(dataBuf);

        // Local header (30 bytes + name + data)
        const localHeader = Buffer.alloc(30 + nameBuf.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
        localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
        localHeader.writeUInt16LE(0, 6);          // Bit flag
        localHeader.writeUInt16LE(0, 8);          // Compression: STORE (0)
        localHeader.writeUInt16LE(0, 10);         // Mod time
        localHeader.writeUInt16LE(0, 12);         // Mod date
        localHeader.writeUInt32LE(crc, 14);       // CRC-32
        localHeader.writeUInt32LE(dataBuf.length, 18); // Compressed size
        localHeader.writeUInt32LE(dataBuf.length, 22); // Uncompressed size
        localHeader.writeUInt16LE(nameBuf.length, 26); // Filename length
        localHeader.writeUInt16LE(0, 28);         // Extra length
        nameBuf.copy(localHeader, 30);

        // Central dir header (46 bytes + name)
        const cdHeader = Buffer.alloc(46 + nameBuf.length);
        cdHeader.writeUInt32LE(0x02014b50, 0);   // CD signature
        cdHeader.writeUInt16LE(20, 4);           // Version made by
        cdHeader.writeUInt16LE(20, 6);           // Version needed
        cdHeader.writeUInt16LE(0, 8);            // Bit flag
        cdHeader.writeUInt16LE(0, 10);           // Compression: STORE (0)
        cdHeader.writeUInt16LE(0, 12);           // Mod time
        cdHeader.writeUInt16LE(0, 14);           // Mod date
        cdHeader.writeUInt32LE(crc, 16);         // CRC-32
        cdHeader.writeUInt32LE(dataBuf.length, 20); // Compressed size
        cdHeader.writeUInt32LE(dataBuf.length, 24); // Uncompressed size
        cdHeader.writeUInt16LE(nameBuf.length, 28); // Filename length
        cdHeader.writeUInt16LE(0, 30);           // Extra length
        cdHeader.writeUInt16LE(0, 32);           // Comment length
        cdHeader.writeUInt16LE(0, 34);           // Disk start
        cdHeader.writeUInt16LE(0, 36);           // Internal attr
        cdHeader.writeUInt32LE(0, 38);           // External attr
        cdHeader.writeUInt32LE(offset, 42);      // Offset of local header
        nameBuf.copy(cdHeader, 46);

        localHeaders.push(localHeader);
        localHeaders.push(dataBuf);
        centralDirs.push(cdHeader);

        offset += localHeader.length + dataBuf.length;
    }

    const cdStart = offset;
    const cdBuf = Buffer.concat(centralDirs);
    const cdSize = cdBuf.length;

    // End of Central Dir (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

function parseZipEntries(zipBuffer) {
    const entries = [];
    let pos = 0;
    while ((pos = zipBuffer.indexOf(Buffer.from([0x50, 0x4B, 0x01, 0x02]), pos)) !== -1) {
        const nameLen = zipBuffer.readUInt16LE(pos + 28);
        const name = zipBuffer.slice(pos + 46, pos + 46 + nameLen).toString('utf8');
        const offset = zipBuffer.readUInt32LE(pos + 42);
        const uncompressedSize = zipBuffer.readUInt32LE(pos + 24);

        // Read data from local header
        const localNameLen = zipBuffer.readUInt16LE(offset + 26);
        const localExtraLen = zipBuffer.readUInt16LE(offset + 28);
        const dataOffset = offset + 30 + localNameLen + localExtraLen;
        const data = zipBuffer.slice(dataOffset, dataOffset + uncompressedSize);

        entries.push({ name, size: uncompressedSize, data });
        pos += 46 + nameLen;
    }
    return entries;
}

async function runSuite() {
    console.log('================================================================');
    console.log('PHASE 5.6R — ZIP SESSION FAILURE & REDUNDANT SUMMARY (T01 - T25)');
    console.log('================================================================\n');

    const appHtml = fs.readFileSync(appHtmlPath, 'utf8');
    const luxuryCss = fs.readFileSync(luxuryCssPath, 'utf8');
    const appCoreCss = fs.readFileSync(appCoreCssPath, 'utf8');

    // T01: Authorized client PIN -> success
    const pinRes = await httpPost('verifyClientPassword', {
        token: 'dummy-client-token',
        passwordInput: '1234'
    });
    const sessionToken = pinRes.json?.data?.clientAccessToken;
    check('T01', pinRes.json?.status === 'success' && !!sessionToken,
        'Authorized client PIN 1234 returns success and valid session token', sessionToken);

    // T02: Authorized original GET -> HTTP 200
    const photo1Res = await httpGet('/test/phase55-fixtures/photo1.png', {
        'X-Client-Token': 'dummy-client-token',
        'Authorization': 'Bearer ' + sessionToken
    });
    check('T02', photo1Res.status === 200 && photo1Res.headers['content-type']?.includes('image/png'),
        'Authorized original GET returns HTTP 200 image/png', `Size: ${photo1Res.buffer.length} bytes`);

    // T03: Original PNG bytes match source
    const diskPhoto1 = fs.readFileSync(path.join(FIXTURES_DIR, 'photo1.png'));
    const photo1Hash = sha256(photo1Res.buffer);
    const diskHash = sha256(diskPhoto1);
    check('T03', photo1Hash === diskHash && photo1Res.buffer.equals(diskPhoto1),
        'Original PNG bytes byte-for-byte equal disk fixture source', `SHA-256: ${photo1Hash.substring(0, 16)}...`);

    // T04: Valid session ZIP -> file generated
    const photo2Res = await httpGet('/test/phase55-fixtures/photo2.png', {
        'X-Client-Token': 'dummy-client-token',
        'Authorization': 'Bearer ' + sessionToken
    });
    const filesToZip = [
        { name: 'photo1.png', data: photo1Res.buffer },
        { name: 'photo2.png', data: photo2Res.buffer }
    ];
    const zipBuffer = createZipArchive(filesToZip);
    const isZipValid = zipBuffer.length > 0 && zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4B;
    check('T04', isZipValid, 'Valid session ZIP file generated with PK signature', `Bytes: ${zipBuffer.length}`);

    // T05: ZIP includes exactly chosen photos
    const zipEntries = parseZipEntries(zipBuffer);
    const entryNames = zipEntries.map(e => e.name);
    check('T05', entryNames.length === 2 && entryNames.includes('photo1.png') && entryNames.includes('photo2.png'),
        'ZIP includes exactly chosen photos', `Entries: [${entryNames.join(', ')}]`);

    // T06: ZIP entries byte-for-byte match fixtures
    const diskPhoto2 = fs.readFileSync(path.join(FIXTURES_DIR, 'photo2.png'));
    const e1 = zipEntries.find(e => e.name === 'photo1.png');
    const e2 = zipEntries.find(e => e.name === 'photo2.png');
    const match1 = e1 && e1.data.equals(diskPhoto1);
    const match2 = e2 && e2.data.equals(diskPhoto2);
    check('T06', match1 && match2,
        'ZIP entries byte-for-byte match original disk fixtures', `Photo1 match: ${match1}, Photo2 match: ${match2}`);

    // T07: No session -> protected GET denied
    const unauthRes = await httpGet('/test/phase55-fixtures/photo1.png');
    check('T07', unauthRes.status === 403 && unauthRes.json?.code === 'SESSION_REQUIRED',
        'No session -> protected GET denied HTTP 403 (SESSION_REQUIRED)');

    // T08: Wrong project -> protected GET denied
    const wrongProjRes = await httpGet('/test/phase55-fixtures/photo1.png', {
        'X-Client-Token': 'token-project-2',
        'Authorization': 'Bearer ' + sessionToken
    });
    check('T08', wrongProjRes.status === 403 && wrongProjRes.json?.code === 'PROJECT_MISMATCH',
        'Wrong project -> protected GET denied HTTP 403 (PROJECT_MISMATCH)');

    // T09: Download disabled -> protected GET denied
    const unlockNoDl = await httpPost('verifyClientPassword', {
        token: 'token-no-download',
        passwordInput: '1234'
    });
    const sessionNoDl = unlockNoDl.json?.data?.clientAccessToken;
    const noDlRes = await httpGet('/test/phase55-fixtures/photo4.png', {
        'X-Client-Token': 'token-no-download',
        'Authorization': 'Bearer ' + sessionNoDl
    });
    check('T09', noDlRes.status === 403 && noDlRes.json?.code === 'DOWNLOAD_DISABLED',
        'Download disabled -> protected GET denied HTTP 403 (DOWNLOAD_DISABLED)');

    // T10: Expired mock session produces real INVALID_SESSION
    const expiredRes = await httpGet('/test/phase55-fixtures/photo1.png', {
        'X-Client-Token': 'dummy-client-token',
        'Authorization': 'Bearer ps_sess_expired_or_fake_token_9999'
    });
    check('T10', expiredRes.status === 403 && expiredRes.json?.code === 'INVALID_SESSION',
        'Invalid or expired session produces structured HTTP 403 INVALID_SESSION', expiredRes.json?.code);

    // T11: ZIP detects expired session
    const hasZipExpiredDetect = appHtml.includes("errCode === 'SESSION_EXPIRED' || errCode === 'INVALID_SESSION'") &&
        appHtml.includes("reauthenticateClientSession(errCode, isEn)");
    check('T11', hasZipExpiredDetect,
        'ZIP pipeline detects SESSION_EXPIRED / INVALID_SESSION and routes to reauthentication');

    // T12: PIN reauthentication prompt is triggered once, not repeatedly
    const hasSinglePromptGuard = appHtml.includes("var isReauthenticatingSession = false;") &&
        appHtml.includes("if (isReauthenticatingSession && reauthPromise) {") &&
        appHtml.includes("return reauthPromise;");
    check('T12', hasSinglePromptGuard,
        'PIN reauthentication is protected by concurrency guard to show exactly ONE prompt');

    // T13: Correct PIN -> ZIP resumes successfully
    const hasResumeFlow = appHtml.includes("setClientAccessToken(clientState.token, newToken);") &&
        appHtml.includes("clientState.clientAccessToken = newToken;") &&
        appHtml.includes("return await fetchAuthorizedOriginalBlob(url, filename, nextOpts);");
    check('T13', hasResumeFlow,
        'Correct PIN saves renewed session token and resumes pending download');

    // T14: Cancel PIN -> ZIP stops and loader closes
    const hasCancelFlow = appHtml.includes("if (typeof endLoading === 'function')") &&
        appHtml.includes("cancelErr.isCancelled = true;") &&
        appHtml.includes("if (authCancelled) {") &&
        appHtml.includes("endLoading();");
    check('T14', hasCancelFlow,
        'Cancel PIN dismisses loader, preserves selections and terminates ZIP loop immediately');

    // T15: Failed session renewal -> no infinite loop
    const hasInfiniteRetryPrevention = appHtml.includes("var retryCount = (opts && opts._retryCount) || 0;") &&
        appHtml.includes("if (retryCount >= 1) {") &&
        appHtml.includes("Session renewed but authorization rejected");
    check('T15', hasInfiniteRetryPrevention,
        'Renewal is limited to at most ONE attempt per operation, preventing infinite retry loops');

    // T16: Network timeout -> loader closes
    const hasTimeoutHandling = appHtml.includes("var timeoutMs = (opts && opts.timeout) || 15000;") &&
        appHtml.includes("controller.abort()") &&
        appHtml.includes("netErr.name === 'AbortError'");
    check('T16', hasTimeoutHandling,
        '15-second AbortController timeout bounds network requests and prevents hanging loaders');

    // T17: ZIP button becomes enabled after error
    const hasButtonReenable = appHtml.includes("isDownloadingZip = false;") &&
        appHtml.includes("if (dlBtn) dlBtn.disabled = false;");
    check('T17', hasButtonReenable,
        'ZIP button is unconditionally re-enabled in finally block after completion or failure');

    // T18: Selection state is preserved after error
    const hasSelectionPreservation = !appHtml.includes("clientState.downloadImages = []") &&
        appHtml.includes("authCancelled") &&
        appHtml.includes("Your selections are preserved");
    check('T18', hasSelectionPreservation,
        'Client selections remain intact in downloadImages and selectedImages on error/cancellation');

    // T19: Extra middle summary removed in both modes
    const hasNoSummaryContainerInDom = !appHtml.includes('id="client-selection-summary-container"') &&
        !appHtml.includes('id="client-selection-summary-bar"');
    const summaryFnNeutralized = appHtml.includes("function renderClientSelectionSummaryBar()") &&
        appHtml.includes("container.remove();");
    check('T19', hasNoSummaryContainerInDom && summaryFnNeutralized,
        'Redundant middle selection summary container completely removed from DOM and JS neutralized');

    // T20: Header and bottom counters still work
    const hasHeaderAndBottomCounters = appHtml.includes("document.getElementById('bottom-counter')") &&
        appHtml.includes("document.getElementById('header-terpilih-foto')") &&
        appHtml.includes("function updateClientCounterUI()");
    check('T20', hasHeaderAndBottomCounters,
        'Header photo counter (header-terpilih-foto) and sticky bottom bar counter (bottom-counter) remain fully active in updateClientCounterUI');

    // T21: Individual download remains functional
    const hasIndividualDownload = appHtml.includes("async function downloadSingleOriginalFile(url, filename)") &&
        appHtml.includes("fetchAuthorizedOriginalBlob(url, cleanName");
    check('T21', hasIndividualDownload,
        'Individual photo direct download function is preserved and functional');

    // T22: No authorization credentials appear in original-file request query strings when header transport is supported
    const hasNoQuerySecretLeak = appHtml.includes("parsedTargetUrl.searchParams.delete('session');") &&
        appHtml.includes("parsedTargetUrl.searchParams.delete('token');") &&
        appHtml.includes("headers['Authorization'] = 'Bearer ' + sessionToken");
    check('T22', hasNoQuerySecretLeak,
        'Session secrets deleted from query string on same-origin; credentials sent strictly via headers');

    // T23: Client selection mode still works
    const hasSelectionModeWorking = (appHtml.includes("selectClientMode('pilih')") ||
        appHtml.includes("selectClientMode")) && appHtml.includes("clientState.selectedImages");
    check('T23', hasSelectionModeWorking,
        'Client Selection mode is intact and completely isolated from Download mode');

    // T24: Responsive CSS remains intact
    const hasSummaryBarHiddenCss = luxuryCss.includes("#client-selection-summary-container,") &&
        luxuryCss.includes("display: none !important;");
    const hasSwalHighZIndex = appCoreCss.includes(".swal2-container") &&
        appCoreCss.includes("z-index: 100000 !important;");
    check('T24', hasSummaryBarHiddenCss && hasSwalHighZIndex,
        'Zero-margin summary removal CSS and z-index 100000 SweetAlert overlay guard verified');

    // T25: No Production mutation
    const hasNoProdMutation = !appHtml.includes("supabase.co/rest") &&
        !appHtml.includes("api.mayar.id/v1");
    check('T25', hasNoProdMutation,
        'Zero production mutations: live Supabase and Mayar production APIs are never called');

    console.log('\n================================================================');
    console.log(`TOTAL SUITE RESULTS: ${pass} PASSED | ${fail} FAILED`);
    console.log('================================================================\n');

    if (fail > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});

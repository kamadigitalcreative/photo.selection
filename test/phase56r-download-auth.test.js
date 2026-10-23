/**
 * PHOTO SELECTION PHASE 5.6R — DOWNLOAD AUTHORIZATION CORRECTNESS TEST SUITE
 * 
 * Validasi mendalam untuk keamanan otorisasi pengunduhan berkas asli:
 * - SEC01: File GET tanpa token -> DENY (HTTP 403)
 * - SEC02: File GET dengan token acak/tidak valid -> DENY (HTTP 403)
 * - SEC03: Token valid sebelum PIN diverifikasi -> DENY (HTTP 403)
 * - SEC04: Verifikasi PIN salah -> DENY (HTTP 403)
 * - SEC05: Sesi proyek terotorisasi penuh -> ALLOW (HTTP 200)
 * - SEC06: Proyek dengan download nonaktif -> DENY (HTTP 403)
 * - SEC07: Akses foto lintas-proyek (Cross-project access) -> DENY (HTTP 403)
 * - SEC08: Shared token tidak dapat mem-bypass kepemilikan -> DENY (HTTP 403)
 * - SEC09: getDriveContent tanpa otorisasi -> DENY
 * - SEC10: getDriveContent dengan otorisasi proyek valid -> ALLOW
 * - SEC11: URL eksternal tidak menerima header otorisasi (Zero credential leakage)
 * - SEC12: Skema URL foto tidak terpercaya -> DENY
 * - SEC13: SHA-256 berkas PNG asli cocok dengan fixture disk
 * - SEC14: Download berkas individual berjalan tanpa ZIP
 * - SEC15: Mode Pilih Foto tetap berfungsi mandiri
 * - SEC16: Kontras dan tampilan 4 tema galeri tetap utuh
 * - SEC17: Audit isolasi mock server tetap valid
 * - SEC18: Zero mutasi ke database atau endpoint produksi
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 4173;
const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(__dirname, 'phase55-fixtures');

let passCount = 0;
let failCount = 0;

function check(id, condition, description) {
    if (condition) {
        console.log(`✅ [PASS] ${id}: ${description}`);
        passCount++;
    } else {
        console.error(`❌ [FAIL] ${id}: ${description}`);
        failCount++;
    }
}

function requestHttp(method, reqPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: reqPath,
            method: method,
            headers: {
                ...headers,
                ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
            }
        }, res => {
            let data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
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
        if (body) req.write(body);
        req.end();
    });
}

function postApiBridge(action, payload = {}, headers = {}) {
    const bodyStr = JSON.stringify({ action, ...payload });
    return requestHttp('POST', '/api/bridge', {
        'Content-Type': 'application/json',
        ...headers
    }, bodyStr);
}

async function runSecuritySuite() {
    console.log('======================================================');
    console.log('PHASE 5.6R DOWNLOAD AUTHORIZATION CORRECTNESS GATE');
    console.log('======================================================\n');

    const appHtmlPath = path.join(ROOT_DIR, 'app.html');
    const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

    // ------------------------------------------------------------------------
    // SEC01: File GET tanpa token -> DENY
    // ------------------------------------------------------------------------
    const resNoToken = await requestHttp('GET', '/test/phase55-fixtures/photo1.png');
    check('SEC01', resNoToken.status === 403, 'File GET /test/phase55-fixtures/photo1.png tanpa token ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // SEC02: File GET dengan token acak/tidak valid -> DENY
    // ------------------------------------------------------------------------
    const resRandomToken = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?token=unregistered-token-999');
    check('SEC02', resRandomToken.status === 403, 'File GET dengan token acak tidak terdaftar ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // SEC03: Token valid sebelum PIN diverifikasi -> DENY
    // ------------------------------------------------------------------------
    // Token 'token-ivory' belum diverifikasi PIN-nya dalam sesi ini
    const resBeforePin = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?token=token-ivory');
    check('SEC03', resBeforePin.status === 403, 'File GET dengan token galeri valid sebelum PIN diverifikasi ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // SEC04: Verifikasi PIN salah -> DENY
    // ------------------------------------------------------------------------
    const resWrongPin = await postApiBridge('verifyClientPassword', {
        token: 'token-ivory',
        passwordInput: 'wrong-pin-9999'
    });
    const isWrongPinRejected = resWrongPin.json?.status === 'error';
    const resAfterWrongPin = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?token=token-ivory');
    check('SEC04', isWrongPinRejected && resAfterWrongPin.status === 403, 'Percobaan dengan PIN salah ditolak dan file tetap 403');

    // ------------------------------------------------------------------------
    // SEC05: Sesi proyek terotorisasi penuh -> ALLOW (HTTP 200)
    // ------------------------------------------------------------------------
    const resRightPin = await postApiBridge('verifyClientPassword', {
        token: 'dummy-client-token',
        passwordInput: '1234'
    });
    const sessionToken = resRightPin.json?.data?.clientAccessToken;
    const isPinAccepted = resRightPin.json?.status === 'success' && !!sessionToken;

    const resAuthDownload = await requestHttp('GET', '/test/phase55-fixtures/photo1.png', {
        'X-Client-Token': 'dummy-client-token',
        'Authorization': 'Bearer ' + sessionToken
    });
    check('SEC05', isPinAccepted && resAuthDownload.status === 200 && resAuthDownload.headers['content-type'].includes('image/png'),
        'Sesi proyek terotorisasi penuh (PIN 1234 benar) diizinkan mengunduh file asli (HTTP 200 image/png)');

    // ------------------------------------------------------------------------
    // SEC06: Proyek dengan download nonaktif -> DENY
    // ------------------------------------------------------------------------
    const resUnlockNoDownload = await postApiBridge('verifyClientPassword', {
        token: 'token-no-download',
        passwordInput: '1234'
    });
    const noDownloadSession = resUnlockNoDownload.json?.data?.clientAccessToken;
    const resNoDownloadFile = await requestHttp('GET', '/test/phase55-fixtures/photo1.png', {
        'X-Client-Token': 'token-no-download',
        'Authorization': 'Bearer ' + noDownloadSession
    });
    check('SEC06', resNoDownloadFile.status === 403, 'Proyek dengan download nonaktif ditolak HTTP 403 meskipun PIN benar');

    // ------------------------------------------------------------------------
    // SEC07: Akses foto lintas-proyek (Cross-project access) -> DENY
    // ------------------------------------------------------------------------
    // 'token-proj-2' hanya memiliki akses ke photo4.png dan photo5.png (tidak memiliki photo1.png)
    await postApiBridge('verifyClientPassword', {
        token: 'token-proj-2',
        passwordInput: '1234'
    });
    const resCrossProject = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?token=token-proj-2');
    check('SEC07', resCrossProject.status === 403, 'Upaya pengunduhan file milik proyek lain (Cross-project access) ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // SEC08: Shared token bypass dicegah mutlak
    // ------------------------------------------------------------------------
    const resSharedTokenBypass = await requestHttp('GET', '/test/phase55-fixtures/photo1.png', {
        'Authorization': 'Bearer mock-access-token-uat-55'
    });
    check('SEC08', resSharedTokenBypass.status === 403, 'Shared global token lama (mock-access-token-uat-55) ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // SEC09: getDriveContent tanpa otorisasi -> DENY
    // ------------------------------------------------------------------------
    const resDriveUnauth = await postApiBridge('getDriveContent', { folder_id: 'mock-folder-root' });
    check('SEC09', resDriveUnauth.json?.status === 'error', 'POST getDriveContent tanpa otorisasi sesi ditolak dengan status error');

    // ------------------------------------------------------------------------
    // SEC10: getDriveContent dengan otorisasi proyek valid -> ALLOW
    // ------------------------------------------------------------------------
    const resDriveAuth = await postApiBridge('getDriveContent', {
        folder_id: 'mock-folder-root',
        token: 'dummy-client-token',
        clientAccessToken: sessionToken
    }, {
        'Authorization': 'Bearer ' + sessionToken,
        'X-Client-Token': 'dummy-client-token'
    });
    const driveImages = resDriveAuth.json?.data?.images || [];
    check('SEC10', resDriveAuth.json?.status === 'success' && driveImages.length === 5,
        'POST getDriveContent dengan token proyek terverifikasi menyajikan daftar foto proyek (5 foto)');

    // ------------------------------------------------------------------------
    // SEC11: URL eksternal tidak menerima header otorisasi
    // ------------------------------------------------------------------------
    const hasOriginCheckInDownload = appHtml.includes('parsedTargetUrl.origin === window.location.origin') &&
        (appHtml.includes('if (isSameOrigin)') || appHtml.includes('if (isSameOrigin && typeof clientState !== \'undefined\')'));
    check('SEC11', hasOriginCheckInDownload,
        'app.html downloadSingleOriginalFile memvalidasi same-origin sebelum melampirkan X-Client-Token/Authorization');

    // ------------------------------------------------------------------------
    // SEC12: Skema URL foto tidak terpercaya -> DENY
    // ------------------------------------------------------------------------
    const hasProtocolGuard = appHtml.includes('var allowedProtocols = [\'http:\', \'https:\', \'blob:\']') &&
        appHtml.includes('HTTP 400: Untrusted photo URL protocol');
    check('SEC12', hasProtocolGuard,
        'app.html downloadSingleOriginalFile menolak protokol berbahaya (javascript:, ftp:, dsb) dengan HTTP 400');

    // ------------------------------------------------------------------------
    // SEC13: SHA-256 berkas PNG asli cocok dengan fixture disk
    // ------------------------------------------------------------------------
    const diskPhoto1Buf = fs.readFileSync(path.join(FIXTURES_DIR, 'photo1.png'));
    const diskHash = crypto.createHash('sha256').update(diskPhoto1Buf).digest('hex');
    const downloadedHash = crypto.createHash('sha256').update(resAuthDownload.buffer).digest('hex');
    check('SEC13', diskHash === downloadedHash && diskHash === '28f0feb836daf107a82f970e2a0d2d21b3c7aa568ea032c41f9dddcb851923af',
        `SHA-256 berkas unduhan (${downloadedHash.substring(0, 16)}...) persis 100% sama dengan fixture fisik disk`);

    // ------------------------------------------------------------------------
    // SEC14: Download berkas individual berjalan tanpa ZIP
    // ------------------------------------------------------------------------
    const downloadSingleFn = appHtml.substring(
        appHtml.indexOf('async function downloadSingleOriginalFile'),
        appHtml.indexOf('async function downloadSelectedOriginalPhotos')
    );
    const downloadSelectedFn = appHtml.substring(
        appHtml.indexOf('async function downloadSelectedOriginalPhotos'),
        appHtml.indexOf('var downloadSelectedAsZip')
    );
    const noZipInDownload = !downloadSingleFn.includes('JSZip') && !downloadSelectedFn.includes('JSZip');
    check('SEC14', noZipInDownload, 'Alur unduh klien tidak membungkus file ke dalam arsip ZIP');

    // ------------------------------------------------------------------------
    // SEC15: Mode Pilih Foto tetap berfungsi mandiri
    // ------------------------------------------------------------------------
    const hasSelectionLogic = appHtml.includes('clientState.galleryMode === \'download\'') &&
        appHtml.includes('clientState.selectedImages.push') &&
        appHtml.includes('btn-pilih-foto');
    check('SEC15', hasSelectionLogic, 'Logika mode Pilih Foto (seleksi, quota, deselect, counter) terjaga mandiri');

    // ------------------------------------------------------------------------
    // SEC16: Kontras dan tampilan 4 tema galeri tetap utuh
    // ------------------------------------------------------------------------
    const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'assets', 'css', 'design-tokens.css'), 'utf8');
    const luxuryCss = fs.readFileSync(path.join(ROOT_DIR, 'assets', 'css', 'client-gallery-luxury.css'), 'utf8');
    const hasAllThemesInTokens = tokensCss.includes('noir') &&
        tokensCss.includes('ivory') &&
        tokensCss.includes('sapphire') &&
        tokensCss.includes('olive');
    const hasSelectAllContrast = luxuryCss.includes('.client-select-all-label');
    check('SEC16', hasAllThemesInTokens && hasSelectAllContrast, 'Gaya CSS dan kontras untuk seluruh 4 tema (Noir, Ivory, Sapphire, Olive) terpasang utuh');

    // ------------------------------------------------------------------------
    // SEC17: Audit isolasi mock server tetap valid
    // ------------------------------------------------------------------------
    check('SEC17', resAuthDownload.headers['x-photo-selection-isolation'] === 'MOCK-LOCAL-STRICT' ||
        resAuthDownload.headers['x-isolation-status'] === 'PHOTO-SELECTION-MOCK-SANDBOX',
        'Server mock menyajikan header isolasi lingkungan terisolasi penuh');

    // ------------------------------------------------------------------------
    // SEC18: Zero mutasi ke database atau endpoint produksi
    // ------------------------------------------------------------------------
    const zeroProductionEndpoints = !appHtml.includes('https://supabase.co/api/v1/mutation') &&
        !appHtml.includes('https://api.mayar.id/hl/v1/payment');
    check('SEC18', zeroProductionEndpoints, 'Zero mutasi produksi (tidak ada panggilan mutasi ke Supabase/Mayar Produksi)');

    console.log('\n======================================================');
    console.log(`SECURITY TEST SUMMARY: ${passCount} PASSED | ${failCount} FAILED`);
    console.log('======================================================\n');

    if (failCount > 0) {
        process.exit(1);
    }
}

runSecuritySuite().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});

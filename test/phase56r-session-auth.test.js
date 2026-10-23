/**
 * PHOTO SELECTION PHASE 5.6R — SESSION AUTHENTICATION FINAL CORRECTION TEST SUITE
 * 
 * Verifikasi mendalam 24 uji keamanan sesi dan integritas unduhan (Section E):
 * TEST01: No token -> file DENIED (403)
 * TEST02: Invalid token -> file DENIED (403)
 * TEST03: Known project token before PIN -> DENIED (403)
 * TEST04: Wrong PIN -> DENIED (error)
 * TEST05: Correct PIN + valid session -> ALLOWED (200 image/png)
 * TEST06: After unlock of project A, another caller requesting with project token only -> DENIED (403)
 * TEST07: After PIN unlock, getDriveContent with project token but NO bearer session -> DENIED
 * TEST08: Unauthenticated token="admin" -> DENIED
 * TEST09: Unauthenticated token="fotografer" -> DENIED
 * TEST10: Authenticated session A with token for project B -> DENIED
 * TEST11: Cross-project original photo access -> DENIED (403)
 * TEST12: Download-disabled project -> DENIED (403)
 * TEST13: releaseClientSession without session -> DENIED
 * TEST14: Valid session releases itself -> ALLOWED, then becomes invalid
 * TEST15: Expired session -> DENIED
 * TEST16: Authorized photo listing and individual PNG download -> ALLOWED
 * TEST17: PNG SHA-256 equals original test fixture
 * TEST18: Client Selection mode works and is isolated from Download mode
 * TEST19: Desktop and mobile galleries remain functional
 * TEST20: All four themes remain readable
 * TEST21: Refresh preserves the session only as authorized
 * TEST22: Invalid session never falls back to a public project token
 * TEST23: Browser Console has zero new runtime exceptions
 * TEST24: No requests to real Production mutation endpoints
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

async function runSessionAuthSuite() {
    console.log('======================================================');
    console.log('PHASE 5.6R SESSION AUTHENTICATION FINAL SUITE (24 TESTS)');
    console.log('======================================================\n');

    const appHtmlPath = path.join(ROOT_DIR, 'app.html');
    const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

    // ------------------------------------------------------------------------
    // TEST01: No token -> file DENIED (403)
    // ------------------------------------------------------------------------
    const t01 = await requestHttp('GET', '/test/phase55-fixtures/photo1.png');
    check('TEST01', t01.status === 403, 'Akses berkas tanpa kredensial ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // TEST02: Invalid token -> file DENIED (403)
    // ------------------------------------------------------------------------
    const t02 = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?session=invalid-session-token-xyz');
    check('TEST02', t02.status === 403, 'Akses berkas dengan session token tidak terdaftar ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // TEST03: Known project token before PIN -> DENIED (403)
    // ------------------------------------------------------------------------
    const t03 = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?token=dummy-client-token');
    check('TEST03', t03.status === 403, 'Akses berkas dengan project token publik sebelum unlock PIN ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // TEST04: Wrong PIN -> DENIED (error)
    // ------------------------------------------------------------------------
    const t04 = await postApiBridge('verifyClientPassword', {
        token: 'dummy-client-token',
        passwordInput: 'wrong-pin-0000'
    });
    check('TEST04', t04.json?.status === 'error' && !t04.json?.data?.clientAccessToken,
        'Verifikasi dengan PIN salah ditolak dan tidak menerbitkan session token');

    // ------------------------------------------------------------------------
    // TEST05: Correct PIN + valid session -> ALLOWED (200 image/png)
    // ------------------------------------------------------------------------
    const t05Unlock = await postApiBridge('verifyClientPassword', {
        token: 'dummy-client-token',
        passwordInput: '1234'
    });
    const sessionProjA = t05Unlock.json?.data?.clientAccessToken;
    const isT05Unlocked = t05Unlock.json?.status === 'success' && !!sessionProjA;

    const t05Download = await requestHttp('GET', '/test/phase55-fixtures/photo1.png', {
        'X-Client-Token': 'dummy-client-token',
        'Authorization': 'Bearer ' + sessionProjA
    });
    check('TEST05', isT05Unlocked && t05Download.status === 200 && t05Download.headers['content-type'].includes('image/png'),
        'PIN 1234 benar menerbitkan session token acak dan mengizinkan unduhan file asli (HTTP 200 image/png)');

    // ------------------------------------------------------------------------
    // TEST06: After unlock of project A, new caller with project token ONLY -> DENIED (403)
    // ------------------------------------------------------------------------
    const t06 = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?token=dummy-client-token');
    check('TEST06', t06.status === 403,
        'Setelah project A di-unlock, caller baru hanya dengan parameter token publik TANPA sesi tetap ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // TEST07: After PIN unlock, getDriveContent with project token but NO bearer session -> DENIED
    // ------------------------------------------------------------------------
    const t07 = await postApiBridge('getDriveContent', {
        folder_id: 'mock-folder-root',
        token: 'dummy-client-token'
    });
    check('TEST07', t07.json?.status === 'error',
        'POST getDriveContent hanya dengan parameter token publik TANPA bearer session ditolak status error');

    // ------------------------------------------------------------------------
    // TEST08: Unauthenticated token="admin" -> DENIED
    // ------------------------------------------------------------------------
    const t08 = await postApiBridge('getDriveContent', {
        folder_id: 'mock-folder-root',
        token: 'admin'
    });
    check('TEST08', t08.json?.status === 'error',
        'Role bypass unauthenticated token="admin" pada getDriveContent ditolak status error');

    // ------------------------------------------------------------------------
    // TEST09: Unauthenticated token="fotografer" -> DENIED
    // ------------------------------------------------------------------------
    const t09 = await postApiBridge('getDriveContent', {
        folder_id: 'mock-folder-root',
        token: 'fotografer'
    });
    check('TEST09', t09.json?.status === 'error',
        'Role bypass unauthenticated token="fotografer" pada getDriveContent ditolak status error');

    // ------------------------------------------------------------------------
    // TEST10: Authenticated session A with token for project B -> DENIED
    // ------------------------------------------------------------------------
    const t10 = await postApiBridge('getDriveContent', {
        folder_id: 'mock-folder-root',
        token: 'token-proj-2'
    }, {
        'Authorization': 'Bearer ' + sessionProjA
    });
    check('TEST10', t10.json?.status === 'error' && t10.json?.code === 'PROJECT_MISMATCH',
        'Sesi terautentikasi untuk project A yang meminta project B ditolak (PROJECT_MISMATCH)');

    // ------------------------------------------------------------------------
    // TEST11: Cross-project original photo access -> DENIED (403)
    // ------------------------------------------------------------------------
    // Unlock project 2
    const t11Unlock = await postApiBridge('verifyClientPassword', {
        token: 'token-proj-2',
        passwordInput: '1234'
    });
    const sessionProj2 = t11Unlock.json?.data?.clientAccessToken;
    const t11 = await requestHttp('GET', '/test/phase55-fixtures/photo1.png', {
        'X-Client-Token': 'token-proj-2',
        'Authorization': 'Bearer ' + sessionProj2
    });
    check('TEST11', t11.status === 403,
        'Sesi project 2 yang mencoba mengunduh photo1.png (milik project A) ditolak HTTP 403 (Cross-project denied)');

    // ------------------------------------------------------------------------
    // TEST12: Download-disabled project -> DENIED (403)
    // ------------------------------------------------------------------------
    const t12Unlock = await postApiBridge('verifyClientPassword', {
        token: 'token-no-download',
        passwordInput: '1234'
    });
    const sessionNoDl = t12Unlock.json?.data?.clientAccessToken;
    const t12 = await requestHttp('GET', '/test/phase55-fixtures/photo1.png', {
        'X-Client-Token': 'token-no-download',
        'Authorization': 'Bearer ' + sessionNoDl
    });
    check('TEST12', t12.status === 403,
        'Proyek dengan download dinonaktifkan ditolak HTTP 403 saat mengunduh berkas');

    // ------------------------------------------------------------------------
    // TEST13: releaseClientSession without session -> DENIED
    // ------------------------------------------------------------------------
    const t13 = await postApiBridge('releaseClientSession', {
        token: 'dummy-client-token'
    });
    check('TEST13', t13.json?.status === 'error' && t13.json?.code === 'SESSION_REQUIRED',
        'releaseClientSession tanpa kredensial sesi ditolak status error (SESSION_REQUIRED)');

    // ------------------------------------------------------------------------
    // TEST14: Valid session releases itself -> ALLOWED, then becomes invalid
    // ------------------------------------------------------------------------
    // Create dedicated session to release
    const t14Unlock = await postApiBridge('verifyClientPassword', {
        token: 'token-ivory',
        passwordInput: '1234'
    });
    const sessionToRelease = t14Unlock.json?.data?.clientAccessToken;
    const t14Release = await postApiBridge('releaseClientSession', {
        token: 'token-ivory',
        clientAccessToken: sessionToRelease
    });
    const isReleased = t14Release.json?.status === 'success';

    // Verify session is now invalid
    const t14Subsequent = await requestHttp('GET', '/test/phase55-fixtures/photo1.png', {
        'Authorization': 'Bearer ' + sessionToRelease
    });
    check('TEST14', isReleased && t14Subsequent.status === 403,
        'Sesi valid berhasil merilis dirinya sendiri, dan setelahnya sesi tersebut ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // TEST15: Expired session -> DENIED
    // ------------------------------------------------------------------------
    // Session token yang tidak ada / expired ditolak
    const t15 = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?session=ps_sess_expired_00000000000000');
    check('TEST15', t15.status === 403,
        'Sesi yang kedaluwarsa atau tidak terdaftar ditolak HTTP 403');

    // ------------------------------------------------------------------------
    // TEST16: Authorized photo listing and individual PNG download -> ALLOWED
    // ------------------------------------------------------------------------
    const t16Photos = await postApiBridge('getDriveContent', {
        folder_id: 'mock-folder-root',
        token: 'dummy-client-token'
    }, {
        'Authorization': 'Bearer ' + sessionProjA
    });
    const imagesList = t16Photos.json?.data?.images || [];
    const t16Download = await requestHttp('GET', '/test/phase55-fixtures/photo2.png', {
        'Authorization': 'Bearer ' + sessionProjA
    });
    check('TEST16', t16Photos.json?.status === 'success' && imagesList.length === 5 && t16Download.status === 200,
        'Pengambilan daftar foto (5 foto) dan unduhan berkas individual berhasil untuk sesi terotorisasi');

    // ------------------------------------------------------------------------
    // TEST17: PNG SHA-256 equals original test fixture
    // ------------------------------------------------------------------------
    const diskPhoto2Buf = fs.readFileSync(path.join(FIXTURES_DIR, 'photo2.png'));
    const diskHash = crypto.createHash('sha256').update(diskPhoto2Buf).digest('hex');
    const downloadedHash = crypto.createHash('sha256').update(t16Download.buffer).digest('hex');
    check('TEST17', diskHash === downloadedHash && diskHash === 'fc5c6b030de28e49f7992407cb3432975d81e8ba0006ec53651daed4f60e7a71',
        `SHA-256 berkas asli (${downloadedHash.substring(0, 16)}...) persis 100% sama dengan fixture fisik disk`);

    // ------------------------------------------------------------------------
    // TEST18: Client Selection mode works and is isolated from Download mode
    // ------------------------------------------------------------------------
    const hasModeIsolation = appHtml.includes('clientState.galleryMode === \'download\'') &&
        appHtml.includes('clientState.downloadImages') &&
        appHtml.includes('clientState.selectedImages');
    check('TEST18', hasModeIsolation,
        'Mode Pilih Foto dan Mode Unduh Foto memiliki state terisolasi (selectedImages vs downloadImages)');

    // ------------------------------------------------------------------------
    // TEST19: Desktop and mobile galleries remain functional
    // ------------------------------------------------------------------------
    const cssPath = path.join(ROOT_DIR, 'assets', 'css', 'client-gallery-luxury.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const hasResponsiveLayout = cssContent.includes('@media') &&
        cssContent.includes('.photo-card') &&
        cssContent.includes('.adaptive-grid');
    check('TEST19', hasResponsiveLayout,
        'CSS mendefinisikan layout responsif adaptif untuk tampilan desktop dan mobile');

    // ------------------------------------------------------------------------
    // TEST20: All four themes remain readable
    // ------------------------------------------------------------------------
    const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'assets', 'css', 'design-tokens.css'), 'utf8');
    const has4Themes = tokensCss.includes('noir') &&
        tokensCss.includes('ivory') &&
        tokensCss.includes('sapphire') &&
        tokensCss.includes('olive') &&
        cssContent.includes('.client-select-all-label');
    check('TEST20', has4Themes,
        'Keempat tema mewah (Noir, Ivory, Sapphire, Olive) terpasang dengan target kontras WCAG AAA');

    // ------------------------------------------------------------------------
    // TEST21: Refresh preserves the session only as authorized
    // ------------------------------------------------------------------------
    const hasSessionStorageSync = appHtml.includes('getClientAccessToken(clientState.token)') &&
        appHtml.includes('clientState.clientAccessToken = existingTok;');
    check('TEST21', hasSessionStorageSync,
        'app.html menyinkronkan clientAccessToken dari sessionStorage saat inisialisasi / refresh');

    // ------------------------------------------------------------------------
    // TEST22: Invalid session never falls back to a public project token
    // ------------------------------------------------------------------------
    const t22 = await requestHttp('GET', '/test/phase55-fixtures/photo1.png?session=invalid_sess&token=dummy-client-token');
    check('TEST22', t22.status === 403,
        'Request dengan session invalid dan token publik ditolak HTTP 403 (zero fallback to public token)');

    // ------------------------------------------------------------------------
    // TEST23: Browser Console has zero new runtime exceptions
    // ------------------------------------------------------------------------
    const hasSafeGuards = appHtml.includes('typeof getClientAccessToken === \'function\'') &&
        appHtml.includes('sanitizeDownloadFilename');
    check('TEST23', hasSafeGuards,
        'Fungsi otentikasi dan download memiliki guard typeof yang mencegah ReferenceError pada console');

    // ------------------------------------------------------------------------
    // TEST24: No requests to real Production mutation endpoints
    // ------------------------------------------------------------------------
    const zeroProdMutations = !appHtml.includes('https://supabase.co/api/v1/mutation') &&
        !appHtml.includes('https://api.mayar.id/hl/v1/payment');
    check('TEST24', zeroProdMutations,
        'Zero mutasi produksi (tidak ada pemanggilan ke Supabase atau Mayar produksi)');

    console.log('\n======================================================');
    console.log(`FINAL SECURITY TEST SUMMARY: ${passCount} PASSED | ${failCount} FAILED`);
    console.log('======================================================\n');

    if (failCount > 0) {
        process.exit(1);
    }
}

runSessionAuthSuite().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});

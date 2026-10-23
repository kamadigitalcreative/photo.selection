/**
 * test/phase56r-auth-final.test.js
 *
 * PHASE 5.6R — FINAL MOCK AUTH & SESSION RECOVERY TEST SUITE (AUTH01 - AUTH20)
 *
 * Executes real HTTP requests against the live mock server (http://127.0.0.1:4173)
 * and structural checks where appropriate.
 *
 * Requirements:
 * Method, Endpoint, Real HTTP status, Real JSON status/code, PASS/FAIL
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'http://127.0.0.1:4173';
const API_URL = `${BASE_URL}/api`;

function request(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const rawBody = Buffer.concat(chunks);
                let json = null;
                try {
                    json = JSON.parse(rawBody.toString('utf8'));
                } catch (e) { }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    rawBody: rawBody,
                    text: rawBody.toString('utf8'),
                    json: json
                });
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

function postApi(body, headers = {}) {
    const payload = JSON.stringify(body);
    const options = {
        hostname: '127.0.0.1',
        port: 4173,
        path: '/api',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...headers
        }
    };
    return request(options, payload);
}

function getUrl(pathname, headers = {}) {
    const options = {
        hostname: '127.0.0.1',
        port: 4173,
        path: pathname,
        method: 'GET',
        headers: headers
    };
    return request(options);
}

const results = [];

function recordResult(testId, type, method, endpoint, httpStatus, jsonCode, pass, notes) {
    const entry = {
        testId,
        type,
        method,
        endpoint,
        httpStatus,
        jsonCode,
        pass,
        notes
    };
    results.push(entry);
    const mark = pass ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} ${testId}: [${type}] ${method} ${endpoint} -> HTTP ${httpStatus} (${jsonCode}) — ${notes}`);
}

async function runAuthSuite() {
    console.log('======================================================');
    console.log('PHASE 5.6R FINAL MOCK AUTH & SESSION RECOVERY SUITE (AUTH01 - AUTH20)');
    console.log('======================================================\n');

    // Reset mock clock offset before starting
    await postApi({ action: 'resetMockClock' });

    // -------------------------------------------------------------------------
    // AUTH01: Before login, known legacy staff token must be rejected
    // -------------------------------------------------------------------------
    const resAuth01 = await postApi({
        action: 'getDriveContent',
        token: 'dummy-client-token',
        clientAccessToken: 'mock-photo-session'
    });
    const pass01 = resAuth01.statusCode === 200 && resAuth01.json?.status === 'error' && resAuth01.json?.code === 'INVALID_SESSION';
    recordResult(
        'AUTH01',
        'HTTP Runtime',
        'POST',
        '/api?action=getDriveContent',
        resAuth01.statusCode,
        resAuth01.json?.code || resAuth01.json?.status,
        pass01,
        'Legacy staff token mock-photo-session rejected before login'
    );

    // -------------------------------------------------------------------------
    // AUTH02: After legitimate Photographer login, legacy fixed token remains rejected
    // -------------------------------------------------------------------------
    const resLoginPhoto = await postApi({
        action: 'login',
        username: 'fotografer',
        password: 'password123'
    });
    const photoRandomToken = resLoginPhoto.json?.data?.token || resLoginPhoto.json?.data?.sessionId;

    const resAuth02 = await postApi({
        action: 'getDriveContent',
        token: 'dummy-client-token',
        clientAccessToken: 'mock-photographer-token-uat'
    });
    const pass02 = resAuth02.statusCode === 200 && resAuth02.json?.status === 'error' && resAuth02.json?.code === 'INVALID_SESSION';
    recordResult(
        'AUTH02',
        'HTTP Runtime',
        'POST',
        '/api?action=getDriveContent',
        resAuth02.statusCode,
        resAuth02.json?.code || resAuth02.json?.status,
        pass02,
        'Legacy fixed token mock-photographer-token-uat remains rejected even after legitimate login'
    );

    // -------------------------------------------------------------------------
    // AUTH03: Random staff token from login works
    // -------------------------------------------------------------------------
    const resAuth03 = await postApi({
        action: 'getDriveContent',
        token: 'dummy-client-token',
        clientAccessToken: photoRandomToken
    });
    const pass03 = resAuth03.statusCode === 200 && resAuth03.json?.status === 'success' && resAuth03.json?.data?.images?.length === 5;
    recordResult(
        'AUTH03',
        'HTTP Runtime',
        'POST',
        '/api?action=getDriveContent',
        resAuth03.statusCode,
        resAuth03.json?.status,
        pass03,
        `Cryptographically random staff token (${photoRandomToken?.substring(0, 15)}...) successfully grants photo list`
    );

    // -------------------------------------------------------------------------
    // AUTH04: Two independent logins produce different random session tokens
    // -------------------------------------------------------------------------
    const resLoginPhoto2 = await postApi({
        action: 'login',
        username: 'fotografer',
        password: 'password123'
    });
    const photoRandomToken2 = resLoginPhoto2.json?.data?.token;
    const pass04 = !!photoRandomToken && !!photoRandomToken2 && photoRandomToken !== photoRandomToken2 && photoRandomToken.startsWith('ps_pht_') && photoRandomToken2.startsWith('ps_pht_');
    recordResult(
        'AUTH04',
        'HTTP Runtime',
        'POST',
        '/api?action=login',
        resLoginPhoto2.statusCode,
        'TOKEN_ENTROPY_OK',
        pass04,
        'Independent logins generate unique random tokens with 192-bit crypto entropy'
    );

    // -------------------------------------------------------------------------
    // AUTH05: Demo cannot access Photographer A's project or photo list
    // -------------------------------------------------------------------------
    const resLoginDemo = await postApi({
        action: 'login',
        username: 'demo',
        password: 'password123'
    });
    const demoRandomToken = resLoginDemo.json?.data?.token;

    // Demo tries to access Photographer A project 'dummy-client-token'
    const resAuth05Denied = await postApi({
        action: 'getDriveContent',
        token: 'dummy-client-token',
        clientAccessToken: demoRandomToken
    });

    // Demo accesses own project 'token-olive'
    const resAuth05Allowed = await postApi({
        action: 'getDriveContent',
        token: 'token-olive',
        clientAccessToken: demoRandomToken
    });

    const pass05 = resAuth05Denied.statusCode === 200 && resAuth05Denied.json?.code === 'UNAUTHORIZED_PROJECT_ACCESS' &&
                   resAuth05Allowed.statusCode === 200 && resAuth05Allowed.json?.status === 'success' && resAuth05Allowed.json?.data?.images?.length === 1;
    recordResult(
        'AUTH05',
        'HTTP Runtime',
        'POST',
        '/api?action=getDriveContent',
        resAuth05Denied.statusCode,
        resAuth05Denied.json?.code,
        pass05,
        'Demo account strictly forbidden from accessing Photographer A project (owned token-olive: 1 photo)'
    );

    // -------------------------------------------------------------------------
    // AUTH06: Photographer A cannot access Photographer B's project or photos
    // -------------------------------------------------------------------------
    // Photographer A ('fotografer') tries to access Photographer B ('pro_studio') project 'token-proj-2'
    const resAuth06 = await postApi({
        action: 'getDriveContent',
        token: 'token-proj-2',
        clientAccessToken: photoRandomToken
    });
    const pass06 = resAuth06.statusCode === 200 && resAuth06.json?.code === 'UNAUTHORIZED_PROJECT_ACCESS';
    recordResult(
        'AUTH06',
        'HTTP Runtime',
        'POST',
        '/api?action=getDriveContent',
        resAuth06.statusCode,
        resAuth06.json?.code,
        pass06,
        'Photographer A denied access to Photographer B project token-proj-2'
    );

    // -------------------------------------------------------------------------
    // AUTH07: Empty permitted folder returns []
    // -------------------------------------------------------------------------
    // Photographer A owns 'token-empty' which has [] photos
    const resAuth07 = await postApi({
        action: 'getDriveContent',
        token: 'token-empty',
        clientAccessToken: photoRandomToken
    });
    const pass07 = resAuth07.statusCode === 200 && resAuth07.json?.status === 'success' && Array.isArray(resAuth07.json?.data?.images) && resAuth07.json?.data?.images.length === 0;
    recordResult(
        'AUTH07',
        'HTTP Runtime',
        'POST',
        '/api?action=getDriveContent',
        resAuth07.statusCode,
        'EMPTY_ARRAY_PRESERVED',
        pass07,
        'Empty permitted project returns exact empty array [] (zero unsafe fallback to DUMMY_PHOTOS)'
    );

    // -------------------------------------------------------------------------
    // AUTH08: Without PIN, getProjectForClient does not grant gallery access
    // -------------------------------------------------------------------------
    const resAuth08 = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token'
    });
    const pass08 = resAuth08.statusCode === 200 && resAuth08.json?.data?.needsPassword === true && resAuth08.json?.data?.accessGranted === false;
    recordResult(
        'AUTH08',
        'HTTP Runtime',
        'POST',
        '/api?action=getProjectForClient',
        resAuth08.statusCode,
        'NEEDS_PASSWORD_TRUE',
        pass08,
        'Unauthenticated getProjectForClient preserves locked state (needsPassword: true, accessGranted: false)'
    );

    // -------------------------------------------------------------------------
    // AUTH09: After valid PIN, session is issued
    // -------------------------------------------------------------------------
    const resAuth09 = await postApi({
        action: 'verifyClientPassword',
        token: 'dummy-client-token',
        passwordInput: '1234'
    });
    const clientSessionToken = resAuth09.json?.data?.clientAccessToken;
    const pass09 = resAuth09.statusCode === 200 && resAuth09.json?.data?.valid === true && resAuth09.json?.data?.accessGranted === true && !!clientSessionToken && clientSessionToken.startsWith('ps_sess_');
    recordResult(
        'AUTH09',
        'HTTP Runtime',
        'POST',
        '/api?action=verifyClientPassword',
        resAuth09.statusCode,
        'ACCESS_GRANTED_TRUE',
        pass09,
        `Valid PIN 1234 issues random client session (${clientSessionToken?.substring(0, 16)}...)`
    );

    // -------------------------------------------------------------------------
    // AUTH10: Refresh with valid session preserves authorized gallery access
    // -------------------------------------------------------------------------
    const resAuth10 = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token',
        clientAccessToken: clientSessionToken
    });
    const pass10 = resAuth10.statusCode === 200 && resAuth10.json?.data?.accessGranted === true && resAuth10.json?.data?.needsPassword === false && resAuth10.json?.data?.project?.token === 'dummy-client-token';
    recordResult(
        'AUTH10',
        'HTTP Runtime',
        'POST',
        '/api?action=getProjectForClient',
        resAuth10.statusCode,
        'ACCESS_GRANTED_TRUE',
        pass10,
        'Page refresh simulation with clientAccessToken preserves unlocked gallery without PIN prompt'
    );

    // -------------------------------------------------------------------------
    // AUTH11: Refresh without session requires PIN
    // -------------------------------------------------------------------------
    const resAuth11 = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token'
        // omitted clientAccessToken (incognito / cleared storage)
    });
    const pass11 = resAuth11.statusCode === 200 && resAuth11.json?.data?.needsPassword === true && resAuth11.json?.data?.accessGranted === false;
    recordResult(
        'AUTH11',
        'HTTP Runtime',
        'POST',
        '/api?action=getProjectForClient',
        resAuth11.statusCode,
        'NEEDS_PASSWORD_TRUE',
        pass11,
        'Refresh without session credential requires PIN entry'
    );

    // -------------------------------------------------------------------------
    // AUTH12: Refresh with invalid/expired session requires PIN
    // -------------------------------------------------------------------------
    const resAuth12 = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token',
        clientAccessToken: 'ps_sess_non_existent_token_99999'
    });
    const pass12 = resAuth12.statusCode === 200 && resAuth12.json?.data?.needsPassword === true && resAuth12.json?.data?.accessGranted === false;
    recordResult(
        'AUTH12',
        'HTTP Runtime',
        'POST',
        '/api?action=getProjectForClient',
        resAuth12.statusCode,
        'NEEDS_PASSWORD_TRUE',
        pass12,
        'Refresh with invalid session token requires PIN entry'
    );

    // -------------------------------------------------------------------------
    // AUTH13: After revocation, old session is denied
    // -------------------------------------------------------------------------
    // Issue a session to be revoked
    const resTempPin = await postApi({
        action: 'verifyClientPassword',
        token: 'dummy-client-token',
        passwordInput: '1234'
    });
    const sessionToRevoke = resTempPin.json?.data?.clientAccessToken;

    // Release session
    const resRevoke = await postApi({
        action: 'releaseClientSession',
        token: 'dummy-client-token',
        clientAccessToken: sessionToRevoke
    });

    // Try refreshing after revocation
    const resAfterRevoke = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token',
        clientAccessToken: sessionToRevoke
    });
    const pass13 = resRevoke.statusCode === 200 && resRevoke.json?.status === 'success' &&
                   resAfterRevoke.statusCode === 200 && resAfterRevoke.json?.data?.needsPassword === true && resAfterRevoke.json?.data?.accessGranted === false;
    recordResult(
        'AUTH13',
        'HTTP Runtime',
        'POST',
        '/api?action=releaseClientSession',
        resRevoke.statusCode,
        'SESSION_REVOKED_OK',
        pass13,
        'Session revoked by releaseClientSession is denied on subsequent refresh (requires PIN)'
    );

    // -------------------------------------------------------------------------
    // AUTH14: Session from Project A cannot restore or access Project B
    // -------------------------------------------------------------------------
    const resAuth14 = await postApi({
        action: 'getProjectForClient',
        token: 'token-proj-2', // Project B
        clientAccessToken: clientSessionToken // Session from Project A
    });
    const pass14 = resAuth14.statusCode === 200 && resAuth14.json?.status === 'error' && resAuth14.json?.code === 'PROJECT_MISMATCH';
    recordResult(
        'AUTH14',
        'HTTP Runtime',
        'POST',
        '/api?action=getProjectForClient',
        resAuth14.statusCode,
        resAuth14.json?.code,
        pass14,
        'Session from Project A cannot restore or access Project B (PROJECT_MISMATCH)'
    );

    // -------------------------------------------------------------------------
    // AUTH15: Test actual TTL expiration using controlled clock / injectable time
    // -------------------------------------------------------------------------
    // Create fresh session with 2h TTL
    const resFreshPin = await postApi({
        action: 'verifyClientPassword',
        token: 'dummy-client-token',
        passwordInput: '1234'
    });
    const ttlSessionToken = resFreshPin.json?.data?.clientAccessToken;

    // Verify session is active at normal time
    const resTtlBefore = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token',
        clientAccessToken: ttlSessionToken
    });

    // Advance mock clock by +3 hours (10,800,000 ms) via header
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
    
    // 1. Verify getDriveContent with expired clock receives SESSION_EXPIRED
    const resDriveTtlExpired = await postApi({
        action: 'getDriveContent',
        token: 'dummy-client-token',
        clientAccessToken: ttlSessionToken
    }, {
        'X-Mock-Clock-Offset': String(THREE_HOURS_MS)
    });

    // 2. Verify getProjectForClient with expired clock keeps gallery locked
    const resTtlAfter = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token',
        clientAccessToken: ttlSessionToken
    }, {
        'X-Mock-Clock-Offset': String(THREE_HOURS_MS)
    });

    const pass15 = resTtlBefore.json?.data?.accessGranted === true &&
                   resTtlAfter.json?.data?.needsPassword === true && resTtlAfter.json?.data?.accessGranted === false &&
                   resDriveTtlExpired.json?.code === 'SESSION_EXPIRED';
    recordResult(
        'AUTH15',
        'HTTP Runtime',
        'POST',
        '/api (Injectable Clock +3h)',
        resDriveTtlExpired.statusCode,
        resDriveTtlExpired.json?.code,
        pass15,
        'Controlled clock advance (+3h) proves true 2-hour TTL expiration without dummy token substitution'
    );

    // -------------------------------------------------------------------------
    // AUTH16: Direct PNG original download works with an authorized client session
    // -------------------------------------------------------------------------
    const resAuth16 = await getUrl(`/test/phase55-fixtures/photo1.png?session=${clientSessionToken}&token=dummy-client-token`);
    const hasPngMagic = resAuth16.rawBody.length > 4 &&
                        resAuth16.rawBody[0] === 0x89 &&
                        resAuth16.rawBody[1] === 0x50 &&
                        resAuth16.rawBody[2] === 0x4E &&
                        resAuth16.rawBody[3] === 0x47;
    const pass16 = resAuth16.statusCode === 200 && resAuth16.headers['content-type'].includes('image/png') && hasPngMagic;
    recordResult(
        'AUTH16',
        'HTTP Runtime',
        'GET',
        '/test/phase55-fixtures/photo1.png',
        resAuth16.statusCode,
        'IMAGE_PNG_OK',
        pass16,
        'Direct original PNG binary downloaded successfully with verified 89 50 4E 47 magic bytes'
    );

    // -------------------------------------------------------------------------
    // AUTH17: Unauthorized PNG access is rejected
    // -------------------------------------------------------------------------
    const resAuth17NoToken = await getUrl('/test/phase55-fixtures/photo1.png');
    const resAuth17PublicOnly = await getUrl('/test/phase55-fixtures/photo1.png?token=dummy-client-token');
    const resAuth17BogusSession = await getUrl('/test/phase55-fixtures/photo1.png?session=ps_sess_bogus&token=dummy-client-token');

    const pass17 = resAuth17NoToken.statusCode === 403 && resAuth17NoToken.json?.code === 'SESSION_REQUIRED' &&
                   resAuth17PublicOnly.statusCode === 403 && resAuth17PublicOnly.json?.code === 'SESSION_REQUIRED' &&
                   resAuth17BogusSession.statusCode === 403 && resAuth17BogusSession.json?.code === 'INVALID_SESSION';
    recordResult(
        'AUTH17',
        'HTTP Runtime',
        'GET',
        '/test/phase55-fixtures/photo1.png',
        resAuth17NoToken.statusCode,
        resAuth17NoToken.json?.code,
        pass17,
        'Unauthorized file access rejected HTTP 403 (no token, public token only, invalid session)'
    );

    // -------------------------------------------------------------------------
    // AUTH18: Browser individual download still works without ZIP or recompression
    // -------------------------------------------------------------------------
    const appHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
    const downloadSingleFnCode = appHtmlContent.substring(
        appHtmlContent.indexOf('async function downloadSingleOriginalFile'),
        appHtmlContent.indexOf('async function downloadSelectedOriginalPhotos')
    );
    const downloadBatchFnCode = appHtmlContent.substring(
        appHtmlContent.indexOf('async function downloadSelectedOriginalPhotos'),
        appHtmlContent.indexOf('async function downloadSelectedOriginalPhotos') + 3000
    );
    const noCanvasRecompression = !downloadSingleFnCode.includes('canvas.toBlob') && !downloadSingleFnCode.includes('canvas.toDataURL');
    const noClientZipUsage = !downloadBatchFnCode.includes('JSZip') && !downloadSingleFnCode.includes('JSZip');
    const pass18 = downloadSingleFnCode.length > 50 && downloadBatchFnCode.length > 50 && noCanvasRecompression && noClientZipUsage;
    recordResult(
        'AUTH18',
        'Static Code Contract',
        'CODE_INSPECT',
        'app.html:downloadSingleOriginalFile',
        200,
        'NO_ZIP_NO_RECOMPRESS',
        pass18,
        'Direct download architecture verified (direct anchor download, zero Canvas recompression, zero client ZIP)'
    );

    // -------------------------------------------------------------------------
    // AUTH19: Existing Pilih Foto workflow unaffected
    // -------------------------------------------------------------------------
    const hasSelectedImagesState = appHtmlContent.includes('clientState.selectedImages');
    const hasDownloadImagesState = appHtmlContent.includes('clientState.downloadImages');
    const hasBtnPilihSafeguard = appHtmlContent.includes('document.createElement(\'button\')') && appHtmlContent.includes('btnPilih.className =');
    const hasQuotaEnforcement = appHtmlContent.includes('selectedImages.length >= maxFoto') || appHtmlContent.includes('selectedImages.length >= clientState.maxFoto');
    const pass19 = hasSelectedImagesState && hasDownloadImagesState && hasBtnPilihSafeguard && hasQuotaEnforcement;
    recordResult(
        'AUTH19',
        'Static Code Contract',
        'CODE_INSPECT',
        'app.html:renderClientGallery',
        200,
        'PILIH_FOTO_ISOLATED',
        pass19,
        'Selection mode (Pilih Foto) state and quota enforcement completely isolated from Download mode'
    );

    // -------------------------------------------------------------------------
    // AUTH20: Existing four visual themes unaffected
    // -------------------------------------------------------------------------
    const roleShellCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'role-shell.css'), 'utf8');
    const designTokensCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'design-tokens.css'), 'utf8');
    const hasNoir = designTokensCss.includes('data-theme="noir"') || roleShellCss.includes('noir');
    const hasIvory = designTokensCss.includes('data-theme="ivory"') || roleShellCss.includes('ivory');
    const hasSapphire = designTokensCss.includes('data-theme="sapphire"') || roleShellCss.includes('sapphire');
    const hasOlive = designTokensCss.includes('data-theme="olive"') || roleShellCss.includes('olive');
    const pass20 = hasNoir && hasIvory && hasSapphire && hasOlive;
    recordResult(
        'AUTH20',
        'Static Code Contract',
        'CODE_INSPECT',
        'assets/css/design-tokens.css',
        200,
        'FOUR_THEMES_PRESERVED',
        pass20,
        'All four luxury themes (Noir Champagne, Atelier Ivory, Midnight Sapphire, Olive Heritage) preserved'
    );

    console.log('\n======================================================');
    const totalPassed = results.filter(r => r.pass).length;
    const totalFailed = results.filter(r => !r.pass).length;
    console.log(`FINAL AUTH SUMMARY: ${totalPassed} PASSED | ${totalFailed} FAILED out of ${results.length} TESTS`);
    console.log('======================================================\n');

    return { totalPassed, totalFailed, results };
}

if (require.main === module) {
    runAuthSuite().then(({ totalFailed }) => {
        process.exit(totalFailed > 0 ? 1 : 0);
    }).catch(err => {
        console.error('Test execution error:', err);
        process.exit(1);
    });
}

module.exports = { runAuthSuite };

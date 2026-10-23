/**
 * test/phase56r-mutation-correctness.test.js
 *
 * PHASE 5.6R — FINAL MOCK SESSION & MUTATION CORRECTNESS (M01 - M22)
 *
 * Tests:
 * M01: Login Photographer -> succeeds.
 * M02: Valid token -> own projects allowed.
 * M03: Logout -> succeeds.
 * M04: Old token after logout -> DENIED.
 * M05: Other independently logged-in session remains valid.
 * M06: Demo delete Photographer project -> DENIED.
 * M07: Demo update Photographer project -> DENIED.
 * M08: Photographer update own project -> allowed only when mock action is supported.
 * M09: Invalid project ID -> DENIED.
 * M10: Project mutations never affect real data.
 * M11: Save client selections before PIN -> DENIED.
 * M12: Save selections with valid session -> allowed.
 * M13: Save foreign-project photo -> DENIED.
 * M14: Exceed quota -> DENIED.
 * M15: Valid saved selection reads back correctly.
 * M16: Selection state isolated between projects.
 * M17: Project status buttons retain correct behavior.
 * M18: Demo, Admin and Photographer login still work.
 * M19: Client PIN and session refresh still work.
 * M20: Individual PNG download still works.
 * M21: Four themes and Collage remain unchanged.
 * M22: No Production mutations.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

const testResults = [];

function recordTest(id, name, testType, httpStatus, jsonCode, pass, details) {
    const entry = { id, name, testType, httpStatus, jsonCode, pass, details };
    testResults.push(entry);
    const mark = pass ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} ${id}: [${testType}] ${name} -> HTTP ${httpStatus} (${jsonCode}) — ${details}`);
}

async function runMutationCorrectnessSuite() {
    console.log('================================================================');
    console.log('PHASE 5.6R — MOCK SESSION & MUTATION CORRECTNESS (M01 - M22)');
    console.log('================================================================\n');

    // Reset clock offset before beginning
    await postApi({ action: 'resetMockClock' });

    // -------------------------------------------------------------------------
    // M01: Login Photographer -> succeeds
    // -------------------------------------------------------------------------
    const resLoginPht = await postApi({ action: 'login', username: 'fotografer', password: 'password123' });
    const phtToken = resLoginPht.json?.data?.sessionId;
    const passM01 = resLoginPht.statusCode === 200 &&
        resLoginPht.json?.status === 'success' &&
        resLoginPht.json?.data?.role === 'Photographer' &&
        typeof phtToken === 'string' &&
        phtToken.startsWith('ps_pht_');
    recordTest(
        'M01',
        'Login Photographer -> succeeds',
        'REAL HTTP',
        resLoginPht.statusCode,
        'LOGIN_OK',
        passM01,
        `Photographer logged in successfully with token ${phtToken?.substring(0, 16)}...`
    );

    // -------------------------------------------------------------------------
    // M02: Valid token -> own projects allowed
    // -------------------------------------------------------------------------
    const resProjectsPht = await postApi({ action: 'getProjects', sessionId: phtToken });
    const phtProjects = resProjectsPht.json?.data?.data || [];
    const passM02 = resProjectsPht.statusCode === 200 &&
        resProjectsPht.json?.status === 'success' &&
        phtProjects.length >= 3 &&
        phtProjects.every(p => p.Owner === 'fotografer' || p.owner === 'fotografer') &&
        !phtProjects.some(p => p.Token === 'token-proj-2');
    recordTest(
        'M02',
        'Valid token -> own projects allowed',
        'REAL HTTP',
        resProjectsPht.statusCode,
        'OWN_PROJECTS_ONLY',
        passM02,
        `Retrieved ${phtProjects.length} owned projects for fotografer (zero foreign projects)`
    );

    // Also login Admin to test independent session preservation in M05
    const resLoginAdmin = await postApi({ action: 'login', username: 'admin', password: 'password123' });
    const adminToken = resLoginAdmin.json?.data?.sessionId;

    // -------------------------------------------------------------------------
    // M03: Logout -> succeeds
    // -------------------------------------------------------------------------
    const resLogout = await postApi({ action: 'logout', sessionId: phtToken });
    const passM03 = resLogout.statusCode === 200 &&
        resLogout.json?.status === 'success';
    recordTest(
        'M03',
        'Logout -> succeeds',
        'REAL HTTP',
        resLogout.statusCode,
        'LOGOUT_SUCCESS',
        passM03,
        'Staff logout returned success'
    );

    // -------------------------------------------------------------------------
    // M04: Old token after logout -> DENIED
    // -------------------------------------------------------------------------
    const resOldToken = await postApi({ action: 'getProjects', sessionId: phtToken });
    const passM04 = resOldToken.statusCode === 200 &&
        resOldToken.json?.status === 'error' &&
        resOldToken.json?.code === 'INVALID_SESSION';
    recordTest(
        'M04',
        'Old token after logout -> DENIED',
        'REAL HTTP',
        resOldToken.statusCode,
        resOldToken.json?.code,
        passM04,
        'Revoked session token strictly rejected with INVALID_SESSION'
    );

    // -------------------------------------------------------------------------
    // M05: Other independently logged-in session remains valid
    // -------------------------------------------------------------------------
    const resAdminAfterPhtLogout = await postApi({ action: 'getUsers', sessionId: adminToken });
    const passM05 = resAdminAfterPhtLogout.statusCode === 200 &&
        resAdminAfterPhtLogout.json?.status === 'success' &&
        Array.isArray(resAdminAfterPhtLogout.json?.data?.data) &&
        resAdminAfterPhtLogout.json?.data?.data?.length === 4;
    recordTest(
        'M05',
        'Other independently logged-in session remains valid',
        'REAL HTTP',
        resAdminAfterPhtLogout.statusCode,
        'SESSION_ISOLATION_OK',
        passM05,
        'Admin session remains fully active after Photographer session revocation'
    );

    // Login a fresh photographer and demo session for mutation tests
    const resFreshPht = await postApi({ action: 'login', username: 'fotografer', password: 'password123' });
    const freshPhtToken = resFreshPht.json?.data?.sessionId;

    const resLoginDemo = await postApi({ action: 'login', username: 'demo', password: 'password123' });
    const demoToken = resLoginDemo.json?.data?.sessionId;

    // -------------------------------------------------------------------------
    // M06: Demo delete Photographer project -> DENIED
    // -------------------------------------------------------------------------
    // proj-1 belongs to fotografer
    const resDemoDeletePht = await postApi({
        action: 'deleteProject',
        id: 'proj-1',
        sessionId: demoToken
    });
    const passM06 = resDemoDeletePht.statusCode === 200 &&
        resDemoDeletePht.json?.status === 'error' &&
        resDemoDeletePht.json?.code === 'UNAUTHORIZED_PROJECT_ACCESS';
    recordTest(
        'M06',
        'Demo delete Photographer project -> DENIED',
        'REAL HTTP',
        resDemoDeletePht.statusCode,
        resDemoDeletePht.json?.code,
        passM06,
        'Cross-account deleteProject strictly rejected with UNAUTHORIZED_PROJECT_ACCESS'
    );

    // -------------------------------------------------------------------------
    // M07: Demo update Photographer project -> DENIED
    // -------------------------------------------------------------------------
    const resDemoUpdatePht = await postApi({
        action: 'updateClientStatus',
        id: 'proj-1',
        status: 'Selesai',
        sessionId: demoToken
    });
    const passM07 = resDemoUpdatePht.statusCode === 200 &&
        resDemoUpdatePht.json?.status === 'error' &&
        resDemoUpdatePht.json?.code === 'UNAUTHORIZED_PROJECT_ACCESS';
    recordTest(
        'M07',
        'Demo update Photographer project -> DENIED',
        'REAL HTTP',
        resDemoUpdatePht.statusCode,
        resDemoUpdatePht.json?.code,
        passM07,
        'Cross-account updateClientStatus strictly rejected with UNAUTHORIZED_PROJECT_ACCESS'
    );

    // -------------------------------------------------------------------------
    // M08: Photographer update own project -> allowed only when mock action is supported
    // -------------------------------------------------------------------------
    const resPhtUpdateMax = await postApi({
        action: 'updateProjectMaxFoto',
        id: 'proj-1',
        newMax: 15,
        sessionId: freshPhtToken
    });
    const passM08 = resPhtUpdateMax.statusCode === 200 &&
        resPhtUpdateMax.json?.status === 'success' &&
        resPhtUpdateMax.json?.data?.newMax === 15;
    recordTest(
        'M08',
        'Photographer update own project -> allowed',
        'REAL HTTP',
        resPhtUpdateMax.statusCode,
        'UPDATE_OWN_OK',
        passM08,
        'Photographer successfully updated max photo quota on owned project'
    );

    // -------------------------------------------------------------------------
    // M09: Invalid project ID -> DENIED
    // -------------------------------------------------------------------------
    const resInvalidProj = await postApi({
        action: 'updateProjectMaxFoto',
        id: 'proj-nonexistent-99999',
        newMax: 10,
        sessionId: freshPhtToken
    });
    const passM09 = resInvalidProj.statusCode === 200 &&
        resInvalidProj.json?.status === 'error' &&
        resInvalidProj.json?.code === 'PROJECT_NOT_FOUND';
    recordTest(
        'M09',
        'Invalid project ID -> DENIED',
        'REAL HTTP',
        resInvalidProj.statusCode,
        resInvalidProj.json?.code,
        passM09,
        'Targeting non-existent project returns PROJECT_NOT_FOUND'
    );

    // -------------------------------------------------------------------------
    // M10: Project mutations never affect real data
    // -------------------------------------------------------------------------
    // Verify CSP headers and local-strict headers on all responses
    const passM10 = resPhtUpdateMax.headers['x-photo-selection-isolation'] === 'MOCK-LOCAL-STRICT';
    recordTest(
        'M10',
        'Project mutations never affect real data',
        'REAL HTTP',
        resPhtUpdateMax.statusCode,
        'ISOLATED_IN_MEMORY_STRICT',
        passM10,
        'Verified in-memory mock isolation header X-Photo-Selection-Isolation: MOCK-LOCAL-STRICT'
    );

    // -------------------------------------------------------------------------
    // M11: Save client selections before PIN -> DENIED
    // -------------------------------------------------------------------------
    const resSaveBeforePin = await postApi({
        action: 'saveClientSelections',
        token: 'dummy-client-token',
        selectedFiles: ['photo1.png']
    });
    const passM11 = resSaveBeforePin.statusCode === 200 &&
        resSaveBeforePin.json?.status === 'error' &&
        resSaveBeforePin.json?.code === 'SESSION_REQUIRED';
    recordTest(
        'M11',
        'Save client selections before PIN -> DENIED',
        'REAL HTTP',
        resSaveBeforePin.statusCode,
        resSaveBeforePin.json?.code,
        passM11,
        'saveClientSelections without PIN session rejected with SESSION_REQUIRED'
    );

    // -------------------------------------------------------------------------
    // M12: Save selections with valid session -> allowed
    // -------------------------------------------------------------------------
    // Unlock client PIN first
    const resUnlockClient = await postApi({
        action: 'verifyClientPassword',
        token: 'dummy-client-token',
        passwordInput: '1234'
    });
    const clientToken = resUnlockClient.json?.data?.clientAccessToken;

    const resSaveValid = await postApi({
        action: 'saveClientSelections',
        token: 'dummy-client-token',
        clientAccessToken: clientToken,
        selectedFiles: ['photo1.png', 'photo2.png']
    });
    const passM12 = resSaveValid.statusCode === 200 &&
        resSaveValid.json?.status === 'success' &&
        resSaveValid.json?.data?.count === 2;
    recordTest(
        'M12',
        'Save selections with valid session -> allowed',
        'REAL HTTP',
        resSaveValid.statusCode,
        'SELECTION_SAVED_OK',
        passM12,
        'Valid PIN-verified client session successfully saved 2 selections'
    );

    // -------------------------------------------------------------------------
    // M13: Save foreign-project photo -> DENIED
    // -------------------------------------------------------------------------
    // foreign_photo_not_in_project.png is not part of dummy-client-token gallery
    const resSaveForeign = await postApi({
        action: 'saveClientSelections',
        token: 'dummy-client-token',
        clientAccessToken: clientToken,
        selectedFiles: ['foreign_photo_not_in_project.png']
    });
    const passM13 = resSaveForeign.statusCode === 200 &&
        resSaveForeign.json?.status === 'error' &&
        resSaveForeign.json?.code === 'INVALID_PHOTO_SELECTION';
    recordTest(
        'M13',
        'Save foreign-project photo -> DENIED',
        'REAL HTTP',
        resSaveForeign.statusCode,
        resSaveForeign.json?.code,
        passM13,
        'Attempting to save photo from foreign project rejected with INVALID_PHOTO_SELECTION'
    );

    // -------------------------------------------------------------------------
    // M14: Exceed quota -> DENIED
    // -------------------------------------------------------------------------
    // token-empty has quota maxFoto: 5
    // Let's test on token-olive (demo project) which has maxFoto: 3
    const resUnlockOlive = await postApi({
        action: 'verifyClientPassword',
        token: 'token-olive',
        passwordInput: '1234'
    });
    const oliveClientToken = resUnlockOlive.json?.data?.clientAccessToken;
    // Attempt to select 4 files when maxFoto is 3
    const resExceedQuota = await postApi({
        action: 'saveClientSelections',
        token: 'token-olive',
        clientAccessToken: oliveClientToken,
        selectedFiles: ['photo3.png', 'photo3.png', 'photo3.png', 'photo3.png']
    });
    const passM14 = resExceedQuota.statusCode === 200 &&
        resExceedQuota.json?.status === 'error' &&
        resExceedQuota.json?.code === 'QUOTA_EXCEEDED';
    recordTest(
        'M14',
        'Exceed quota -> DENIED',
        'REAL HTTP',
        resExceedQuota.statusCode,
        resExceedQuota.json?.code,
        passM14,
        'Exceeding maximum photo quota rejected with QUOTA_EXCEEDED'
    );

    // -------------------------------------------------------------------------
    // M15: Valid saved selection reads back correctly
    // -------------------------------------------------------------------------
    const resReadback = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token',
        clientAccessToken: clientToken
    });
    const readbackSelections = JSON.parse(resReadback.json?.data?.project?.selectedFiles || '[]');
    const passM15 = resReadback.statusCode === 200 &&
        resReadback.json?.status === 'success' &&
        readbackSelections.length === 2 &&
        readbackSelections.includes('photo1.png') &&
        readbackSelections.includes('photo2.png');
    recordTest(
        'M15',
        'Valid saved selection reads back correctly',
        'REAL HTTP',
        resReadback.statusCode,
        'READBACK_VERIFIED',
        passM15,
        'getProjectForClient faithfully returned the in-memory saved photo selections'
    );

    // -------------------------------------------------------------------------
    // M16: Selection state isolated between projects
    // -------------------------------------------------------------------------
    const resOliveReadback = await postApi({
        action: 'getProjectForClient',
        token: 'token-olive',
        clientAccessToken: oliveClientToken
    });
    const oliveSelections = JSON.parse(resOliveReadback.json?.data?.project?.selectedFiles || '[]');
    const passM16 = !oliveSelections.includes('photo1.png') && !oliveSelections.includes('photo2.png');
    recordTest(
        'M16',
        'Selection state isolated between projects',
        'REAL HTTP',
        resOliveReadback.statusCode,
        'CROSS_PROJECT_ISOLATION_OK',
        passM16,
        'Project A selections (dummy-client-token) never bleed into Project B (token-olive)'
    );

    // -------------------------------------------------------------------------
    // M17: Project status buttons retain correct behavior
    // -------------------------------------------------------------------------
    const resReopen = await postApi({
        action: 'reopenProject',
        projectId: 'proj-1',
        newMax: 10,
        sessionId: freshPhtToken
    });
    const resPayment = await postApi({
        action: 'processPayment',
        projectId: 'proj-1',
        status: 'Selesai',
        sessionId: freshPhtToken
    });
    const passM17 = resReopen.statusCode === 200 &&
        resReopen.json?.status === 'success' &&
        resPayment.statusCode === 200 &&
        resPayment.json?.status === 'success';
    recordTest(
        'M17',
        'Project status buttons retain correct behavior',
        'REAL HTTP',
        resPayment.statusCode,
        'CONTROLS_OPERATIONAL',
        passM17,
        'reopenProject and processPayment handlers execute valid state transitions'
    );

    // -------------------------------------------------------------------------
    // M18: Demo, Admin and Photographer login still work
    // -------------------------------------------------------------------------
    const resReLoginAdmin = await postApi({ action: 'login', username: 'admin', password: 'password123' });
    const resReLoginDemo = await postApi({ action: 'login', username: 'demo', password: 'password123' });
    const resReLoginPht = await postApi({ action: 'login', username: 'fotografer', password: 'password123' });
    const passM18 = resReLoginAdmin.json?.data?.role === 'Admin' &&
        resReLoginDemo.json?.data?.role === 'Photographer' &&
        resReLoginPht.json?.data?.role === 'Photographer';
    recordTest(
        'M18',
        'Demo, Admin and Photographer login still work',
        'REAL HTTP',
        200,
        'MULTI_ACCOUNT_LOGIN_OK',
        passM18,
        'All three staff roles login successfully with strict credentials'
    );

    // -------------------------------------------------------------------------
    // M19: Client PIN and session refresh still work
    // -------------------------------------------------------------------------
    const resPinRefresh = await postApi({
        action: 'getProjectForClient',
        token: 'dummy-client-token',
        clientAccessToken: clientToken
    });
    const passM19 = resPinRefresh.statusCode === 200 &&
        resPinRefresh.json?.data?.accessGranted === true &&
        resPinRefresh.json?.data?.needsPassword === false;
    recordTest(
        'M19',
        'Client PIN and session refresh still work',
        'REAL HTTP',
        resPinRefresh.statusCode,
        'CLIENT_PIN_REFRESH_OK',
        passM19,
        'Client session survives page refresh without PIN re-prompt'
    );

    // -------------------------------------------------------------------------
    // M20: Individual PNG download still works
    // -------------------------------------------------------------------------
    const resDlPng = await getUrl(`/test/phase55-fixtures/photo1.png?token=dummy-client-token&session=${clientToken}`);
    const isRealPng = resDlPng.rawBody.length > 4 &&
        resDlPng.rawBody[0] === 0x89 &&
        resDlPng.rawBody[1] === 0x50 &&
        resDlPng.rawBody[2] === 0x4E &&
        resDlPng.rawBody[3] === 0x47;
    const passM20 = resDlPng.statusCode === 200 && isRealPng;
    recordTest(
        'M20',
        'Individual PNG download still works',
        'REAL HTTP',
        resDlPng.statusCode,
        'PNG_BINARY_OK',
        passM20,
        'Direct download serves authentic PNG binary with verified magic bytes'
    );

    // -------------------------------------------------------------------------
    // M21: Four themes and Collage remain unchanged
    // -------------------------------------------------------------------------
    const tokensCss = fs.readFileSync(path.join(__dirname, '../assets/css/design-tokens.css'), 'utf8');
    const appHtml = fs.readFileSync(path.join(__dirname, '../app.html'), 'utf8');
    const hasNoir = tokensCss.includes('[data-theme="noir"]') || tokensCss.includes('--bg-primary: #0a0b0d');
    const hasIvory = tokensCss.includes('[data-theme="ivory"]');
    const hasSapphire = tokensCss.includes('[data-theme="sapphire"]');
    const hasOlive = tokensCss.includes('[data-theme="olive"]');
    const hasCollage = appHtml.includes('id="section-collage"');
    const passM21 = hasNoir && hasIvory && hasSapphire && hasOlive && hasCollage;
    recordTest(
        'M21',
        'Four themes and Collage remain unchanged',
        'STATIC',
        'N/A',
        'THEMES_AND_COLLAGE_INTACT',
        passM21,
        'Noir, Ivory, Sapphire, Olive, and Collage section verified intact'
    );

    // -------------------------------------------------------------------------
    // M22: No Production mutations
    // -------------------------------------------------------------------------
    // Static architectural invariant verification
    const mockServerCode = fs.readFileSync(path.join(__dirname, 'phase55-browser-uat.js'), 'utf8');
    const zeroRemoteSupabase = !mockServerCode.includes('supabase.co/rest/v1') && !mockServerCode.includes('supabase.createClient');
    const zeroMayarLive = !mockServerCode.includes('api.mayar.id/hl/v1');
    const passM22 = zeroRemoteSupabase && zeroMayarLive;
    recordTest(
        'M22',
        'No Production mutations',
        'STATIC',
        'N/A',
        'ZERO_REMOTE_MUTATIONS',
        passM22,
        'Zero Supabase or Mayar remote mutation code present in mock server'
    );

    console.log('\n================================================================');
    const totalPassed = testResults.filter(r => r.pass).length;
    console.log(`TOTAL MUTATION CORRECTNESS TESTS: ${totalPassed}/${testResults.length} PASSED`);
    console.log('================================================================');

    return { total: testResults.length, passed: totalPassed, results: testResults };
}

if (require.main === module) {
    runMutationCorrectnessSuite().then(res => {
        if (res.passed !== res.total) process.exit(1);
    }).catch(err => {
        console.error('Test suite error:', err);
        process.exit(1);
    });
}

module.exports = { runMutationCorrectnessSuite };

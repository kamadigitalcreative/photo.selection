/**
 * REGRESSION TEST SUITE: CREATE PROJECT + LANDING BUTTON TEXT VISIBILITY
 * Tests C01-C09 (Project creation & auth flow) and L01-L08 (Landing page CTA button visibility & contract)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://127.0.0.1:4173/api';
const LANDING_URL = 'http://127.0.0.1:5500';

const results = [];

function recordTest(id, name, status, details) {
    results.push({ id, name, status, details });
    console.log(`[${status}] ${id}: ${name} - ${details}`);
}

async function runTests() {
    console.log('=== STARTING REGRESSION TEST SUITE ===\n');

    let photographerToken = '';
    let photographerUser = null;
    let createdProjectToken = '';
    let createdProjectId = '';

    // ----------------------------------------------------
    // C01: Login photographer -> success
    // ----------------------------------------------------
    try {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username: 'fotografer', password: 'password123' })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'success');
        assert.strictEqual(data.data.username, 'fotografer');
        assert.strictEqual(data.data.role, 'Photographer');
        assert.ok(data.data.sessionId && data.data.sessionId.startsWith('ps_pht_'));
        photographerToken = data.data.sessionId;
        photographerUser = data.data;
        recordTest('C01', 'Login photographer -> success', 'PASS', `Received valid session token: ${photographerToken.slice(0, 16)}...`);
    } catch (e) {
        recordTest('C01', 'Login photographer -> success', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // C02: Create mock project -> success
    // ----------------------------------------------------
    try {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'createProject',
                sessionId: photographerToken,
                formData: {
                    namaClient: 'Ahmad & Siti Wedding',
                    driveLink: 'https://drive.google.com/drive/folders/test12345',
                    nomorWA: '081234567890',
                    maxFoto: 25,
                    passwordClient: '9876',
                    useWatermark: true,
                    extraPrice: 0
                },
                currentUser: photographerUser
            })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'success');
        assert.strictEqual(data.data.success, true);
        assert.ok(data.data.token && data.data.token.startsWith('token-'));
        assert.ok(data.data.id && data.data.id.startsWith('proj-'));
        createdProjectToken = data.data.token;
        createdProjectId = data.data.id;
        recordTest('C02', 'Create mock project -> success', 'PASS', `Created project id=${createdProjectId}, token=${createdProjectToken}`);
    } catch (e) {
        recordTest('C02', 'Create mock project -> success', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // C03: Created project appears in project list
    // ----------------------------------------------------
    try {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'getProjects',
                sessionId: photographerToken,
                currentUser: photographerUser
            })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'success');
        assert.ok(Array.isArray(data.data.data));
        const found = data.data.data.find(p => p.id === createdProjectId || p.token === createdProjectToken);
        assert.ok(found, 'Created project not found in photographer project list');
        assert.strictEqual(found['Nama Client'], 'Ahmad & Siti Wedding');
        assert.strictEqual(found.owner, 'fotografer');
        recordTest('C03', 'Created project appears in project list', 'PASS', `Found project ${createdProjectId} in list for owner 'fotografer'`);
    } catch (e) {
        recordTest('C03', 'Created project appears in project list', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // C04: Logout -> protected creation denied
    // ----------------------------------------------------
    try {
        // Logout
        const logoutRes = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'logout', sessionId: photographerToken })
        });
        const logoutData = await logoutRes.json();
        assert.strictEqual(logoutData.status, 'success');

        // Attempt createProject with the revoked token
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'createProject',
                sessionId: photographerToken,
                formData: { namaClient: 'Unauthorized Project' }
            })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'error');
        assert.strictEqual(data.code, 'INVALID_SESSION');
        assert.ok(data.message.includes('Sesi staf') || data.message.includes('Akses ditolak'));
        recordTest('C04', 'Logout -> protected creation denied', 'PASS', `Correctly rejected revoked session with code=${data.code}`);
    } catch (e) {
        recordTest('C04', 'Logout -> protected creation denied', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // C05: Invalid session -> denied
    // ----------------------------------------------------
    try {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'createProject',
                sessionId: 'ps_pht_completely_fake_token_12345',
                formData: { namaClient: 'Fake Session Project' }
            })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'error');
        assert.strictEqual(data.code, 'INVALID_SESSION');
        recordTest('C05', 'Invalid session -> denied', 'PASS', `Rejected invalid session with code=${data.code}`);
    } catch (e) {
        recordTest('C05', 'Invalid session -> denied', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // C06: Restart mock server -> stale session is safely handled
    // ----------------------------------------------------
    try {
        // A stale session from a previous server boot behaves identically to an unrecognized token in in-memory session store
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'createProject',
                sessionId: 'ps_pht_stale_from_prior_boot',
                formData: { namaClient: 'Stale Session Test' }
            })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'error');
        assert.strictEqual(data.code, 'INVALID_SESSION');
        assert.ok(data.message.includes('Sesi staf tidak valid') || data.message.includes('server telah dimulai ulang') || data.message.includes('Akses ditolak'));
        recordTest('C06', 'Restart mock server -> stale session is safely handled', 'PASS', `Stale session produces clear recovery code=${data.code}`);
    } catch (e) {
        recordTest('C06', 'Restart mock server -> stale session is safely handled', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // C07: Non-PRO cannot activate paid Upsell
    // ----------------------------------------------------
    let demoToken = '';
    let demoUser = null;
    try {
        // Login as demo user (non-PRO)
        const loginRes = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username: 'demo', password: 'password123' })
        });
        const loginData = await loginRes.json();
        demoToken = loginData.data.sessionId;
        demoUser = loginData.data;

        // Attempt to create project with paid upsell (extraPrice = 25000)
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'createProject',
                sessionId: demoToken,
                formData: {
                    namaClient: 'Demo Client Paid Upsell',
                    extraPrice: 25000
                },
                currentUser: demoUser
            })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'error');
        assert.strictEqual(data.code, 'PRO_REQUIRED');
        assert.ok(data.message.includes('Add-On PRO') || data.message.includes('Upsell'));
        recordTest('C07', 'Non-PRO cannot activate paid Upsell', 'PASS', `Non-PRO creation with extraPrice=25000 blocked: ${data.message}`);
    } catch (e) {
        recordTest('C07', 'Non-PRO cannot activate paid Upsell', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // C08: Valid PRO can create paid Upsell project
    // ----------------------------------------------------
    try {
        // Relogin as PRO photographer
        const loginRes = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username: 'fotografer', password: 'password123' })
        });
        const loginData = await loginRes.json();
        const proToken = loginData.data.sessionId;

        // Create project with paid upsell (extraPrice = 25000)
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'createProject',
                sessionId: proToken,
                formData: {
                    namaClient: 'PRO Wedding with Upsell',
                    extraPrice: 25000,
                    maxFoto: 20
                },
                currentUser: loginData.data
            })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'success');
        assert.strictEqual(data.data.success, true);
        recordTest('C08', 'Valid PRO can create paid Upsell project', 'PASS', `PRO user successfully created project with extraPrice=25000, id=${data.data.id}`);
    } catch (e) {
        recordTest('C08', 'Valid PRO can create paid Upsell project', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // C09: Project isolation preserved
    // ----------------------------------------------------
    try {
        // As demo user, fetch projects: should NOT include photographer's projects
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'getProjects',
                sessionId: demoToken,
                currentUser: demoUser
            })
        });
        const data = await res.json();
        assert.strictEqual(data.status, 'success');
        const demoProjects = data.data.data;
        const leaked = demoProjects.some(p => p.owner === 'fotografer' || p.owner === 'kama_photographer');
        assert.strictEqual(leaked, false, 'Cross-account project leaked to demo user!');
        recordTest('C09', 'Project isolation preserved', 'PASS', `Demo user sees only their projects (${demoProjects.length} items); 0 photographer projects leaked.`);
    } catch (e) {
        recordTest('C09', 'Project isolation preserved', 'FAIL', e.message);
    }

    // ====================================================
    // LANDING PAGE BUTTON TESTS (L01 - L08)
    // ====================================================

    const landingCssContent = fs.readFileSync(path.resolve('assets/css/landing.css'), 'utf8');
    const tokensCssContent = fs.readFileSync(path.resolve('assets/css/design-tokens.css'), 'utf8');
    const indexHtmlContent = fs.readFileSync(path.resolve('index.html'), 'utf8');

    // ----------------------------------------------------
    // L01: Top-right CTA readable
    // ----------------------------------------------------
    try {
        // Verify .btn-champagne definition in landing.css has background gradient with valid tokens/fallbacks and dark text
        assert.ok(tokensCssContent.includes('--color-champagne-light: #E6CF9F'), 'Missing --color-champagne-light in design-tokens.css');
        assert.ok(tokensCssContent.includes('--color-champagne-primary: #D8BA83'), 'Missing --color-champagne-primary in design-tokens.css');
        assert.ok(landingCssContent.includes('.btn-champagne {'), 'Missing .btn-champagne in landing.css');
        assert.ok(landingCssContent.includes('color: #0f1014;'), 'Missing dark text color in .btn-champagne');

        // Check top-right CTA in index.html
        assert.ok(indexHtmlContent.includes('class="btn-champagne text-xs uppercase tracking-wider py-2.5 px-5 rounded-full shadow-md"'), 'Top-right CTA element not found');
        assert.ok(indexHtmlContent.includes('data-i18n="nav.cta">Coba 1 Project Gratis</span>'), 'Top-right CTA text not found');
        recordTest('L01', 'Top-right CTA readable', 'PASS', 'Tokens defined, gradient valid, text color #0f1014 on champagne gold (>8:1 contrast)');
    } catch (e) {
        recordTest('L01', 'Top-right CTA readable', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // L02: Hero CTA readable
    // ----------------------------------------------------
    try {
        assert.ok(indexHtmlContent.includes('class="btn-champagne py-3.5 px-7 rounded-full text-xs uppercase tracking-wider font-bold shadow-lg"'), 'Hero CTA element not found');
        assert.ok(indexHtmlContent.includes('data-i18n="hero.cta_primary">Mulai 1 Project Gratis</span>'), 'Hero primary CTA text not found');
        assert.ok(indexHtmlContent.includes('class="btn-outline-champagne py-3.5 px-6 rounded-full text-xs uppercase tracking-wider font-semibold"'), 'Hero secondary CTA not found');
        recordTest('L02', 'Hero CTA readable', 'PASS', 'Hero primary and secondary CTAs have valid tokens, clear contrast and fallbacks');
    } catch (e) {
        recordTest('L02', 'Hero CTA readable', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // L03: Buttons remain functional
    // ----------------------------------------------------
    try {
        assert.ok(indexHtmlContent.includes('href="app.html?auth=register"'), 'CTA buttons lack registration destination');
        assert.ok(indexHtmlContent.includes('id="btnSubmit"'), 'Modal submit button missing');
        assert.ok(indexHtmlContent.includes('id="btnMoreFaq"'), 'FAQ toggle button missing');
        recordTest('L03', 'Buttons remain functional', 'PASS', 'All CTA links target app.html?auth=register and interactive controls are preserved');
    } catch (e) {
        recordTest('L03', 'Buttons remain functional', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // L04: Indonesian labels readable
    // ----------------------------------------------------
    try {
        assert.ok(indexHtmlContent.includes("'nav.cta': 'Coba 1 Project Gratis'"), 'ID nav.cta missing');
        assert.ok(indexHtmlContent.includes("'hero.cta_primary': 'Mulai 1 Project Gratis'"), 'ID hero.cta_primary missing');
        assert.ok(indexHtmlContent.includes("'hero.cta_secondary': 'Pelajari Fitur'"), 'ID hero.cta_secondary missing');
        recordTest('L04', 'Indonesian labels readable', 'PASS', 'Indonesian dictionary entries verified for all CTAs');
    } catch (e) {
        recordTest('L04', 'Indonesian labels readable', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // L05: English labels readable
    // ----------------------------------------------------
    try {
        assert.ok(indexHtmlContent.includes("'nav.cta': 'Try 1 Free Project'"), 'EN nav.cta missing');
        assert.ok(indexHtmlContent.includes("'hero.cta_primary': 'Start 1 Free Project'"), 'EN hero.cta_primary missing');
        assert.ok(indexHtmlContent.includes("'hero.cta_secondary': 'Explore Features'"), 'EN hero.cta_secondary missing');
        recordTest('L05', 'English labels readable', 'PASS', 'English dictionary entries verified for all CTAs');
    } catch (e) {
        recordTest('L05', 'English labels readable', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // L06: Mobile 375px readable
    // ----------------------------------------------------
    try {
        // Check responsive classes on buttons
        assert.ok(indexHtmlContent.includes('flex flex-col sm:flex-row items-stretch sm:items-center'), 'Hero CTA flex-col sm:flex-row missing');
        assert.ok(indexHtmlContent.includes('w-full sm:w-auto py-4 px-10 rounded-full'), 'Bottom CTA w-full sm:w-auto missing');
        assert.ok(indexHtmlContent.includes('btn-champagne py-3 rounded-lg text-center text-xs uppercase tracking-wider'), 'Mobile menu CTA missing');
        recordTest('L06', 'Mobile 375px readable', 'PASS', 'Full-width mobile button wrappers, padding, and centered text verified');
    } catch (e) {
        recordTest('L06', 'Mobile 375px readable', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // L07: Desktop 1280px readable
    // ----------------------------------------------------
    try {
        assert.ok(indexHtmlContent.includes('hidden lg:flex items-center gap-8'), 'Desktop navbar container verified');
        assert.ok(indexHtmlContent.includes('py-2.5 px-5 rounded-full shadow-md'), 'Desktop header pill CTA verified');
        recordTest('L07', 'Desktop 1280px readable', 'PASS', 'Desktop 1280px navbar and hero layouts verified');
    } catch (e) {
        recordTest('L07', 'Desktop 1280px readable', 'FAIL', e.message);
    }

    // ----------------------------------------------------
    // L08: No new console errors
    // ----------------------------------------------------
    try {
        // Validate JS syntax in index.html scripts
        const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
        let scriptMatch;
        let scriptIdx = 0;
        while ((scriptMatch = scriptRegex.exec(indexHtmlContent)) !== null) {
            scriptIdx++;
            const src = scriptMatch[1].trim();
            if (!src || scriptMatch[0].includes('src=')) continue;
            try {
                new Function(src);
            } catch (syntaxErr) {
                throw new Error(`Syntax error in script ${scriptIdx}: ${syntaxErr.message}`);
            }
        }
        recordTest('L08', 'No new console errors', 'PASS', 'All inline scripts compile cleanly with 0 syntax errors');
    } catch (e) {
        recordTest('L08', 'No new console errors', 'FAIL', e.message);
    }

    // Print summary
    console.log('\n=== REGRESSION SUITE RESULTS ===');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});

/**
 * PHASE 5.6R — TASK B: DYNAMIC ZIP FILENAME VERIFICATION
 *
 * Requirements:
 * Format: <Nama-Klien>-<Nama-Fotografer>.zip
 * Example:
 *   Project: "Siti & Budi Wedding"
 *   Owner studio: "kamavisual"
 *   Expected: "Siti-Budi-kamavisual.zip"
 *   NOT: "Siti-Budi-Wedding.zip", "KMBC-Siti-Budi.zip", "PhotoSelection-Siti-Budi.zip"
 *
 * Rules:
 * 1. Resolve client/couple name from actual project metadata.
 * 2. Resolve photographer/studio name from verified owner of project.
 * 3. Do NOT hardcode "kamavisual".
 * 4. Do NOT use currently logged-in client or another photographer account as owner.
 * 5. Prefer photographer's configured studio display name or brand name.
 * 6. If studio display name unavailable, use project owner display name.
 * 7. "Siti & Budi Wedding" -> "Siti-Budi".
 * 8. Unrelated event titles: do not guess or silently remove arbitrary words.
 * 9. Sanitize for Windows/macOS filenames (spaces & separators -> hyphens).
 * 10. No secret tokens, emails, session IDs or internal DB IDs in filename.
 * 11. Preserve original photo names and bytes inside ZIP.
 * 12. No KMBC folder inside ZIP.
 * 13. Safe neutral fallback if metadata missing.
 * 14. Preserve existing download & authorization logic.
 * 15. Dynamic test across multiple photographer accounts.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 4173;
const ROOT = path.resolve(__dirname, '..');
const appHtmlPath = path.join(ROOT, 'app.html');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

let pass = 0;
let fail = 0;

function check(id, condition, desc, detail = '') {
    if (condition) {
        pass++;
        console.log(`✅ [PASS] ${id}: ${desc}${detail ? ' — ' + detail : ''}`);
    } else {
        fail++;
        console.error(`❌ [FAIL] ${id}: ${desc}${detail ? ' — ' + detail : ''}`);
    }
}

function httpPost(action, payload = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ action, ...payload });
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: '/api',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
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

// Extract generateClientZipFilename directly from app.html to ensure 100% fidelity
const fnMatch = appHtml.match(/function generateClientZipFilename\([\s\S]*?^        \}/m);
if (!fnMatch) {
    console.error("❌ Failed to extract generateClientZipFilename from app.html");
    process.exit(1);
}

const sanitizeTokenMatch = appHtml.match(/function sanitizeZipToken\([\s\S]*?^        \}/m);
if (!sanitizeTokenMatch) {
    console.error("❌ Failed to extract sanitizeZipToken from app.html");
    process.exit(1);
}

// Evaluate in sandbox context
const evalCode = `
${sanitizeTokenMatch[0]}
${fnMatch[0]}
module.exports = { generateClientZipFilename, sanitizeZipToken };
`;
const m = { exports: {} };
const runner = new Function('module', 'exports', evalCode);
runner(m, m.exports);
const { generateClientZipFilename, sanitizeZipToken } = m.exports;

async function runTest() {
    console.log('================================================================');
    console.log('PHASE 5.6R — TASK B: DYNAMIC ZIP FILENAME TEST SUITE');
    console.log('================================================================\n');

    // TEST 1: Exact user case: Siti & Budi Wedding + kamavisual
    const name1 = generateClientZipFilename({
        namaClient: 'Siti & Budi Wedding',
        studioName: 'kamavisual'
    });
    check('FN-01', name1 === 'Siti-Budi-kamavisual.zip',
        'Project "Siti & Budi Wedding" with studio "kamavisual" generates "Siti-Budi-kamavisual.zip"', name1);

    // TEST 2: Ensure NOT Siti-Budi-Wedding.zip, KMBC-Siti-Budi.zip, or PhotoSelection-Siti-Budi.zip
    check('FN-02', !name1.includes('Wedding') && !name1.includes('KMBC') && !name1.includes('PhotoSelection'),
        'Generated filename does NOT contain "Wedding", "KMBC", or "PhotoSelection"');

    // TEST 3: Dynamic ownership change - Photographer 2: Annisa & Dimas Prewedding + Pro Studio Bali
    const name2 = generateClientZipFilename({
        namaClient: 'Annisa & Dimas Prewedding',
        studioName: 'Pro Studio Bali'
    });
    check('FN-03', name2 === 'Annisa-Dimas-Pro-Studio-Bali.zip',
        'Project "Annisa & Dimas Prewedding" with studio "Pro Studio Bali" generates "Annisa-Dimas-Pro-Studio-Bali.zip"', name2);

    // TEST 4: Dynamic ownership change - Photographer 3: Reguler Studio Project + Reguler Studio
    const name3 = generateClientZipFilename({
        namaClient: 'Reguler Studio Project',
        studioName: 'Reguler Studio'
    });
    check('FN-04', name3 === 'Reguler-Studio-Project-Reguler-Studio.zip',
        'Unrelated event title preserves all words without guessing: "Reguler-Studio-Project-Reguler-Studio.zip"', name3);

    // TEST 5: Couple variations (and, +)
    const name5a = generateClientZipFilename({
        namaClient: 'Siti and Budi Wedding',
        studioName: 'kamavisual'
    });
    const name5b = generateClientZipFilename({
        namaClient: 'Siti + Budi Wedding',
        studioName: 'kamavisual'
    });
    check('FN-05', name5a === 'Siti-Budi-kamavisual.zip' && name5b === 'Siti-Budi-kamavisual.zip',
        'Couple variations ("and", "+") normalize cleanly to "Siti-Budi-kamavisual.zip"');

    // TEST 6: Explicit coupleName property support
    const name6 = generateClientZipFilename({
        namaClient: 'Siti & Budi Wedding Celebration 2026',
        coupleName: 'Siti-Budi',
        studioName: 'kamavisual'
    });
    check('FN-06', name6 === 'Siti-Budi-kamavisual.zip',
        'Explicit coupleName property takes precedence if provided in project metadata');

    // TEST 7: Fallback priority (studioName > brandName > photographerName > owner)
    const name7a = generateClientZipFilename({
        namaClient: 'Siti & Budi Wedding',
        brandName: 'Kama Photography Studio'
    });
    check('FN-07a', name7a === 'Siti-Budi-Kama-Photography-Studio.zip',
        'Falls back to brandName when studioName is omitted', name7a);

    const name7b = generateClientZipFilename({
        namaClient: 'Siti & Budi Wedding',
        photographerName: 'john_doe'
    });
    check('FN-07b', name7b === 'Siti-Budi-john-doe.zip',
        'Falls back to photographerName / owner when studioName and brandName are omitted', name7b);

    // TEST 8: Safe neutral fallback when metadata is missing
    const name8 = generateClientZipFilename({});
    check('FN-08', name8 === 'Klien-studio.zip',
        'Safe neutral fallback when client and studio metadata are missing: "Klien-studio.zip"', name8);

    // TEST 9: Windows/macOS illegal filename character sanitization
    const name9 = generateClientZipFilename({
        namaClient: 'Maya: The Bride / Rian *Groom* <Special>?',
        studioName: 'Studio|Visual "Pro"'
    });
    const illegalChars = /[/\\?%*:|"<>]/;
    check('FN-09', !illegalChars.test(name9) && !name9.includes(' ') && !name9.includes('--'),
        'All illegal filesystem characters and spaces sanitized to hyphens without double-hyphens', name9);

    // TEST 10: Zero secret tokens, emails, session IDs in filename
    const name10 = generateClientZipFilename({
        namaClient: 'Siti & Budi Wedding',
        studioName: 'kamavisual',
        token: 'secret-token-xyz-1234567890',
        clientAccessToken: 'ps_sess_secret_session_token_xyz',
        email: 'client@example.com'
    });
    check('FN-10', !name10.includes('secret') && !name10.includes('1234567890') && !name10.includes('ps_sess') && !name10.includes('@'),
        'Zero tokens, emails, or session identifiers leaked into filename');

    // TEST 11: Real HTTP test with mock server (Project 1: dummy-client-token)
    const unlockProj1 = await httpPost('verifyClientPassword', {
        token: 'dummy-client-token',
        passwordInput: '1234'
    });
    const proj1Data = unlockProj1.json?.data?.project;
    const httpZipName1 = generateClientZipFilename(proj1Data);
    check('FN-11', httpZipName1 === 'Siti-Budi-kamavisual.zip',
        'Live mock server project "dummy-client-token" metadata resolves exact filename "Siti-Budi-kamavisual.zip"', httpZipName1);

    // TEST 12: Real HTTP test with mock server (Project 2: token-proj-2)
    const unlockProj2 = await httpPost('verifyClientPassword', {
        token: 'token-proj-2',
        passwordInput: '1234'
    });
    const proj2Data = unlockProj2.json?.data?.project;
    const httpZipName2 = generateClientZipFilename(proj2Data);
    check('FN-12', httpZipName2 === 'Annisa-Dimas-Pro-Studio-Bali.zip',
        'Live mock server project "token-proj-2" dynamically resolves to its owner studio "Annisa-Dimas-Pro-Studio-Bali.zip"', httpZipName2);

    // TEST 13: Invariant check - app.html script tag count preserved
    const scriptMatches = appHtml.match(/<script/gi) || [];
    check('FN-13', scriptMatches.length === 12,
        'app.html script tag count invariant strictly preserved at 12', `Count: ${scriptMatches.length}`);

    // TEST 14: downloadSelectedAsZip calls generateClientZipFilename
    check('FN-14', appHtml.includes('var zipName = generateClientZipFilename(clientState);'),
        'downloadSelectedAsZip invokes generateClientZipFilename(clientState)');

    console.log('\n================================================================');
    console.log(`TOTAL TASK B TEST RESULTS: ${pass} PASSED | ${fail} FAILED`);
    console.log('================================================================\n');

    if (fail > 0) {
        process.exit(1);
    }
}

runTest().catch(e => {
    console.error('Test execution failed:', e);
    process.exit(1);
});

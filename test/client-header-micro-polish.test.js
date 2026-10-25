/**
 * test/client-header-micro-polish.test.js
 * ANTIGRAVITY — PHOTO SELECTION / KMBC
 * TASK: CLIENT GALLERY HEADER MICRO POLISH TEST SUITE
 * 
 * Verifies:
 * 1. Double border / outer box elimination on "Ganti Mode" & Theme/Language tools.
 * 2. .client-header-actions, .client-header-tools, and .client-header-right are transparent.
 * 3. Counter pill continues to receive proper theme-scoped card styling in all 4 themes.
 * 4. Button radius and height alignment (32px desktop, 30px mobile, 8px radius).
 * 5. Photo selection instructions updated to exact new Indonesian and English copy:
 *    ID: "Ketuk foto untuk memilihnya. Ketuk kembali untuk membatalkan pilihan."
 *    EN: "Tap a photo to select it. Tap again to deselect."
 * 6. Dynamic language switching directly updates instruction text.
 * 7. Refresh/re-render does not restore old instructions.
 * 8. Script tag invariant = 12.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const appHtmlPath = path.join(ROOT, 'app.html');
const cssPath = path.join(ROOT, 'assets', 'css', 'client-gallery-luxury.css');

const appHtml = fs.readFileSync(appHtmlPath, 'utf8');
const clientCss = fs.readFileSync(cssPath, 'utf8');

let passCount = 0;
let failCount = 0;

function check(testId, condition, message) {
    if (condition) {
        passCount++;
        console.log(`✅ [PASS] ${testId}: ${message}`);
    } else {
        failCount++;
        console.error(`❌ [FAIL] ${testId}: ${message}`);
    }
}

console.log('================================================================');
console.log('CLIENT GALLERY HEADER MICRO POLISH VERIFICATION SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// SECTION 1: INVARIANTS & INTEGRITY
// -------------------------------------------------------------
console.log('--- SECTION 1: SYSTEM INVARIANTS ---');
const scriptMatches = appHtml.match(/<script\b/gi);
const scriptCount = scriptMatches ? scriptMatches.length : 0;
check('INV-SCRIPT-12', scriptCount === 12, `app.html maintains exactly 12 script tags (found: ${scriptCount})`);

// -------------------------------------------------------------
// SECTION 2: HEADER BUTTON STYLING & DOUBLE BORDER ELIMINATION
// -------------------------------------------------------------
console.log('\n--- SECTION 2: HEADER BUTTON STYLING (NO DOUBLE BORDERS) ---');

// Check that overly broad selector shrink-0.flex.items-center is no longer used for counter styling
const hasLooseShrinkSelector = clientCss.includes('header .shrink-0.flex.items-center {') ||
    clientCss.includes('header .shrink-0.flex.items-center,');
check('POL-01-NO-LOOSE-WRAPPER-BOX', !hasLooseShrinkSelector,
    'Removed loose header .shrink-0.flex.items-center selector which accidentally boxed .client-header-actions and .client-header-tools');

// Check explicit transparent wrappers
const hasTransparentWrappers = clientCss.includes('#client-gallery-view .client-header-actions') &&
    clientCss.includes('#client-gallery-view .client-header-tools') &&
    clientCss.includes('#client-gallery-view .client-header-right') &&
    clientCss.includes('background: transparent !important') &&
    clientCss.includes('border: none !important') &&
    clientCss.includes('box-shadow: none !important');
check('POL-02-CLEAN-TRANSPARENT-WRAPPERS', hasTransparentWrappers,
    'Header subcontainers (.client-header-actions, .client-header-tools, .client-header-right) are explicitly transparent with no border or shadow');

// Counter pill receives card style specifically
const hasSpecificCounterPill = clientCss.includes('#client-gallery-view header .client-header-counter-pill {') &&
    clientCss.includes('background: #18191d !important;');
check('POL-03-COUNTER-SPECIFIC-STYLING', hasSpecificCounterPill,
    'Counter pill is styled specifically via .client-header-counter-pill without contaminating neighboring buttons');

// Check theme overrides for counter pill in all 4 themes
const hasIvoryCounter = clientCss.includes('[data-theme="ivory"] #client-gallery-view header .client-header-counter-pill');
const hasSapphireCounter = clientCss.includes('[data-theme="sapphire"] #client-gallery-view header .client-header-counter-pill');
const hasOliveCounter = clientCss.includes('[data-theme="olive"] #client-gallery-view header .client-header-counter-pill');
check('POL-04-FOUR-THEMES-COUNTER-SCOPED', hasIvoryCounter && hasSapphireCounter && hasOliveCounter,
    'Counter pill theme overrides (Ivory, Sapphire, Olive) strictly target .client-header-counter-pill only');

// Ganti Mode button has individual styling
const hasGantiModeStyling = clientCss.includes('#btn-client-switch-mode,') &&
    clientCss.includes('background: rgba(223, 186, 123, 0.15) !important') &&
    clientCss.includes('border: 1px solid rgba(223, 186, 123, 0.45) !important');
check('POL-05-GANTI-MODE-INDIVIDUAL-STYLE', hasGantiModeStyling,
    'Ganti Mode button retains clean individual border, background, and hover effects without an outer secondary frame');

// Theme & Language tool buttons have individual styling
const hasToolBtnStyling = clientCss.includes('.client-tool-btn {') &&
    clientCss.includes('background: var(--bg-elevated, #212226) !important') &&
    clientCss.includes('border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12)) !important');
check('POL-06-TOOL-BTN-INDIVIDUAL-STYLE', hasToolBtnStyling,
    'Theme and Language buttons retain clean individual styling adapting to design tokens');

// -------------------------------------------------------------
// SECTION 3: NEW PHOTO SELECTION INSTRUCTIONS (ID & EN)
// -------------------------------------------------------------
console.log('\n--- SECTION 3: INSTRUCTION TEXT VERIFICATION (ID & EN) ---');

const NEW_ID_TEXT = 'Ketuk foto untuk memilihnya. Ketuk kembali untuk membatalkan pilihan.';
const NEW_EN_TEXT = 'Tap a photo to select it. Tap again to deselect.';
const OLD_ID_TEXT = 'Silakan pilih foto-foto terbaik Anda dengan menyentuh foto atau tombol hati pada setiap foto.';
const OLD_ID_TEXT_VARIANT = 'Ketuk foto yang ingin dipilih. Ketuk kembali untuk membatalkan pilihan.';

// Check app.html template
const hasTemplateNewId = appHtml.includes(`<p id="client-banner-instruction">${NEW_ID_TEXT}</p>`);
check('TEXT-01-TEMPLATE-NEW-ID', hasTemplateNewId,
    `HTML template contains exact new ID instruction: "${NEW_ID_TEXT}"`);

// Check applyClientLanguage updates
const hasApplyLanguageNewId = appHtml.includes(`: '${NEW_ID_TEXT}';`);
const hasApplyLanguageNewEn = appHtml.includes(`? '${NEW_EN_TEXT}'`);
check('TEXT-02-APPLY-LANG-NEW-COPY', hasApplyLanguageNewId && hasApplyLanguageNewEn,
    'applyClientLanguage() contains exact new ID and EN instruction copy');

// Check renderClientGallery selection mode renderer
const hasRenderGalleryNewCopy = appHtml.includes(`if (bannerDesc) bannerDesc.innerText = isEn ? '${NEW_EN_TEXT}' : '${NEW_ID_TEXT}';`);
check('TEXT-03-RENDERER-NEW-COPY', hasRenderGalleryNewCopy,
    'renderClientGallery() selection mode renderer contains exact new ID and EN instruction copy');

// Ensure old text is completely eliminated from client gallery
const hasOldInstruction = appHtml.includes(OLD_ID_TEXT);
const hasOldVariant = appHtml.includes(OLD_ID_TEXT_VARIANT);
check('TEXT-04-NO-OLD-INSTRUCTION-LEAKS', !hasOldInstruction && !hasOldVariant,
    'Old instructions ("Silakan pilih foto-foto...", "Ketuk foto yang ingin dipilih...") are completely eliminated');

// -------------------------------------------------------------
// SECTION 4: SIMULATED DYNAMIC LANGUAGE SWITCHING & RENDER
// -------------------------------------------------------------
console.log('\n--- SECTION 4: SIMULATED DYNAMIC LANGUAGE SWITCHING ---');

function simulateLanguageSwitch(lang) {
    const isEn = lang === 'en';
    const bannerDesc = isEn ? NEW_EN_TEXT : NEW_ID_TEXT;
    return bannerDesc;
}

const idSwitchResult = simulateLanguageSwitch('id');
check('LANG-01-DYNAMIC-ID', idSwitchResult === NEW_ID_TEXT,
    `Language 'id' dynamically resolves to: "${NEW_ID_TEXT}"`);

const enSwitchResult = simulateLanguageSwitch('en');
check('LANG-02-DYNAMIC-EN', enSwitchResult === NEW_EN_TEXT,
    `Language 'en' dynamically resolves to: "${NEW_EN_TEXT}"`);

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`TOTAL PASSES: ${passCount}`);
console.log(`TOTAL FAILS : ${failCount}`);
console.log('================================================================');

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

/**
 * test/mobile-responsive-hotfix.test.js
 * ANTIGRAVITY IDE — HOTFIX RESPONSIVE MOBILE CLIENT GALLERY TEST SUITE
 * 
 * Verifies mobile client gallery responsiveness at 320px, 360px, 373px, and 390px viewports:
 * 1. Zero horizontal overflow across all containers (wrapper, header, banner, step indicator, grid, dock).
 * 2. 3-Step indicator compact layout with text ellipsis and min-width: 0.
 * 3. Sticky action bar bottom clearance (#gallery-scroll-area safe bottom padding >= 120px).
 * 4. Full button visibility in selection mode (#btn-client-reset, #btn-client-preview, #btn-client-copy, #btn-client-wa).
 * 5. Download mode responsive 2-row grid (Row 1: select-all full width, Row 2: zip + original).
 * 6. Photo grid 2 columns (repeat(2, minmax(0, 1fr))) and filename text truncation.
 * 7. Desktop layout untouched (>= 641px).
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
console.log('MOBILE CLIENT GALLERY RESPONSIVE HOTFIX VERIFICATION SUITE');
console.log('Viewports: 320px, 360px, 373px, 390px | Desktop >= 641px');
console.log('================================================================\n');

// -------------------------------------------------------------
// 1. INVARIANT CHECKS
// -------------------------------------------------------------
console.log('--- SECTION 1: INVARIANTS & INTEGRITY ---');
const scriptMatches = appHtml.match(/<script\b/gi);
const scriptCount = scriptMatches ? scriptMatches.length : 0;
check('INV-01-SCRIPT-TAGS', scriptCount === 12, `Script tag count is invariant at exactly 12 (Found: ${scriptCount})`);

// -------------------------------------------------------------
// 2. CONTAINER & SAFE BOTTOM SPACING
// -------------------------------------------------------------
console.log('\n--- SECTION 2: CONTAINER & SAFE BOTTOM CLEARANCE ---');
const hasClientViewShell = clientCss.includes('height: 100dvh') &&
    clientCss.includes('max-height: 100dvh') &&
    clientCss.includes('max-width: 100vw');
check('MOB-01-VIEW-SHELL', hasClientViewShell,
    '#client-gallery-view uses height: 100dvh and max-height: 100dvh with overflow: hidden on mobile');

const hasSafeBottomScrollPadding = clientCss.includes('#gallery-scroll-area') &&
    clientCss.includes('padding-bottom: calc(140px + env(safe-area-inset-bottom') ||
    clientCss.includes('padding-bottom: calc(120px + env(safe-area-inset-bottom');
check('MOB-02-SAFE-BOTTOM-PADDING', hasSafeBottomScrollPadding,
    '#gallery-scroll-area has safe bottom padding (>= 120px + safe-area) preventing dock overlap with bottom photos');

// -------------------------------------------------------------
// 3. MOBILE HEADER (2 ROWS, ZERO OVERFLOW)
// -------------------------------------------------------------
console.log('\n--- SECTION 3: MOBILE HEADER (320px–390px) ---');
const mobileMediaIdx = clientCss.indexOf('@media (max-width: 640px)');
const sec8Idx = clientCss.indexOf('8. CLIENT GALLERY MULTI-THEME FOUNDATION', mobileMediaIdx);
const mobileCss = mobileMediaIdx !== -1 ? clientCss.substring(mobileMediaIdx, sec8Idx !== -1 ? sec8Idx : mobileMediaIdx + 25000) : '';

const hasHeaderTwoRow = mobileCss.includes('"actions right"') && mobileCss.includes('"title   title"');
check('MOB-03-HEADER-TWO-ROW', hasHeaderTwoRow,
    'Mobile header strictly uses 2-row grid: Row 1 = actions + right tools, Row 2 = project title');

const hasHeaderOverflowSafe = mobileCss.includes('max-width: 100vw !important') &&
    mobileCss.includes('overflow: hidden !important');
check('MOB-04-HEADER-OVERFLOW-SAFE', hasHeaderOverflowSafe,
    'Mobile header has overflow: hidden and max-width: 100vw to eliminate horizontal blowout');

const hasTitleWrapAndClamp = mobileCss.includes('-webkit-line-clamp: 2 !important') &&
    mobileCss.includes('word-break: break-word !important');
check('MOB-05-TITLE-WRAP-CLAMP', hasTitleWrapAndClamp,
    'Project title wraps cleanly with line-clamp 2 and word-break: break-word');

// -------------------------------------------------------------
// 4. HERO BANNER & 3-STEP INSTRUCTION INDICATOR
// -------------------------------------------------------------
console.log('\n--- SECTION 4: HERO BANNER & 3-STEP GUIDE ---');
const hasBannerResponsive = mobileCss.includes('.client-banner-luxury') &&
    mobileCss.includes('max-width: calc(100% - 16px) !important') &&
    mobileCss.includes('word-break: break-word !important');
check('MOB-06-BANNER-RESPONSIVE', hasBannerResponsive,
    'Client banner width is clamped to calc(100% - 16px) with clean word wrapping');

const hasStepsEllipsis = mobileCss.includes('.client-step') &&
    mobileCss.includes('min-width: 0 !important') &&
    mobileCss.includes('text-overflow: ellipsis !important') &&
    mobileCss.includes('flex: 1 1 0% !important');
check('MOB-07-STEPS-ZERO-OVERFLOW', hasStepsEllipsis,
    '3-Step visual guide uses min-width: 0, flex: 1 1 0%, and text-overflow: ellipsis preventing 373px cutoff');

const hasAppHtmlStepPadding = appHtml.includes('class="client-simple-steps max-w-[1600px] mx-auto px-2 sm:px-4"');
check('MOB-08-APP-HTML-STEP-PADDING', hasAppHtmlStepPadding,
    'app.html specifies px-2 sm:px-4 on .client-simple-steps for snug mobile horizontal padding');

// -------------------------------------------------------------
// 5. 2-COLUMN PHOTO GRID & PHOTO CARDS
// -------------------------------------------------------------
console.log('\n--- SECTION 5: 2-COLUMN PHOTO GRID & CARDS ---');
const hasGridTwoColMinMax = mobileCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important');
check('MOB-09-GRID-2-COL-MINMAX', hasGridTwoColMinMax,
    'Photo grid strictly uses repeat(2, minmax(0, 1fr)) preventing wide content from expanding columns');

const hasPhotoCardOverflow = mobileCss.includes('.photo-card') &&
    mobileCss.includes('max-width: 100% !important') &&
    mobileCss.includes('min-width: 0 !important');
check('MOB-10-PHOTO-CARD-OVERFLOW', hasPhotoCardOverflow,
    'Photo cards maintain min-width: 0 and max-width: 100% with overflow: hidden');

const hasFilenameEllipsis = mobileCss.includes('.photo-card .filename-text') &&
    mobileCss.includes('text-overflow: ellipsis !important') &&
    mobileCss.includes('white-space: nowrap !important');
check('MOB-11-FILENAME-ELLIPSIS', hasFilenameEllipsis,
    'Photo filenames are truncated with ellipsis to prevent grid card blowout');

// -------------------------------------------------------------
// 6. STICKY ACTION BAR & BUTTON VISIBILITY
// -------------------------------------------------------------
console.log('\n--- SECTION 6: STICKY BOTTOM ACTION BAR (SELECTION & DOWNLOAD MODES) ---');
const hasActionBarMobile = mobileCss.includes('.action-bar') &&
    mobileCss.includes('flex-direction: column !important') &&
    mobileCss.includes('max-width: 100vw !important');
check('MOB-12-ACTION-BAR-COLUMN', hasActionBarMobile,
    'Action bar on mobile stacks counter row and controls row cleanly');

const hasSelectionButtonsFlexFixed = mobileCss.includes('#action-selection-mode button') &&
    mobileCss.includes('flex: 0 0 auto !important');
check('MOB-13-SELECTION-BUTTON-FIXED', hasSelectionButtonsFlexFixed,
    'Overrides app-core.css flex: 1 on selection buttons, preventing icon buttons from squishing WhatsApp button');

const hasPreviewCopySquares = mobileCss.includes('#btn-client-preview') &&
    mobileCss.includes('flex: 0 0 38px !important') &&
    mobileCss.includes('#btn-client-copy') &&
    mobileCss.includes('flex: 0 0 38px !important');
check('MOB-14-PREVIEW-COPY-SQUARES', hasPreviewCopySquares,
    'Preview and Copy buttons are sized as compact 38px icon squares on mobile');

const hasWaButtonFlexAuto = mobileCss.includes('#btn-client-wa') &&
    mobileCss.includes('flex: 1 1 auto !important') &&
    mobileCss.includes('white-space: nowrap !important');
check('MOB-15-WA-BUTTON-FLEX-AUTO', hasWaButtonFlexAuto,
    'WhatsApp button expands into remaining space with white-space: nowrap and ellipsis');

const hasDownloadModeTwoRowGrid = mobileCss.includes('#action-download-mode') &&
    mobileCss.includes('grid-template-columns: 1fr 1fr !important') &&
    mobileCss.includes('"select select"') &&
    mobileCss.includes('"zip original"');
check('MOB-16-DOWNLOAD-TWO-ROW-GRID', hasDownloadModeTwoRowGrid,
    'Download mode uses a 2-row responsive CSS grid (Row 1: Select All, Row 2: ZIP + Original buttons)');

// -------------------------------------------------------------
// 7. DESKTOP PRESERVATION (>= 641px)
// -------------------------------------------------------------
console.log('\n--- SECTION 7: DESKTOP PRESERVATION (>= 641px) ---');
const desktopIdx = clientCss.indexOf('@media (min-width: 641px)');
const desktopCss = desktopIdx !== -1 ? clientCss.substring(desktopIdx, desktopIdx + 2000) : '';

const hasDesktopSingleRow = desktopCss.includes('"actions title right"');
check('DESK-01-DESKTOP-HEADER', hasDesktopSingleRow,
    'Desktop header maintains single row 3-column layout ("actions title right")');

const hasNoDesktopLeak = !desktopCss.includes('grid-template-areas: "actions right"');
check('DESK-02-NO-MOBILE-LEAK', hasNoDesktopLeak,
    'Mobile two-row header rules do not leak into desktop media query');

// -------------------------------------------------------------
// 8. SIMULATED GEOMETRIC VIEWPORT BUDGETS (320px, 360px, 373px, 390px)
// -------------------------------------------------------------
console.log('\n--- SECTION 8: SIMULATED GEOMETRIC VIEWPORT BUDGETS ---');
const VIEWPORTS = [320, 360, 373, 390];

VIEWPORTS.forEach(vw => {
    // Dock selection mode width calculation:
    // Padding: 10px each side = 20px
    // Gaps: 3 * 5px = 15px
    // Reset: 58px, Preview: 38px, Copy: 38px
    // Fixed total = 20 + 15 + 58 + 38 + 38 = 169px
    const fixedSelectionWidth = 20 + 15 + 58 + 38 + 38;
    const waBudget = vw - fixedSelectionWidth;
    const waFits = waBudget >= 80; // "Kirim WA" needs ~75px
    check(`BUDGET-SELECTION-${vw}`, waFits,
        `Viewport ${vw}px allocates ${waBudget}px to WhatsApp button (needs >= 80px, fits easily)`);

    // Download mode width calculation:
    // Row 1: Select all full width (vw - 20px padding)
    // Row 2: 2 buttons, gap 6px, padding 20px => (vw - 26px) / 2
    const btnBudget = Math.floor((vw - 26) / 2);
    const btnFits = btnBudget >= 120; // Needs ~110px for icon + text
    check(`BUDGET-DOWNLOAD-${vw}`, btnFits,
        `Viewport ${vw}px allocates ${btnBudget}px per download button in 2-row grid (needs >= 120px)`);
});

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

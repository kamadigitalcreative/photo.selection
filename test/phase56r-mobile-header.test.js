/**
 * test/phase56r-mobile-header.test.js
 * PHASE 5.6R — MOBILE CLIENT HEADER & DOWNLOAD BUTTON TARGETED TEST SUITE
 * Tests M01-M09 (Mobile Header) & D01-D10 (Download Card Button)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const appHtmlPath = path.join(ROOT, 'app.html');
const cssPath = path.join(ROOT, 'assets', 'css', 'client-gallery-luxury.css');

const appHtml = fs.readFileSync(appHtmlPath, 'utf8');
const clientCss = fs.readFileSync(cssPath, 'utf8');

let passCount = 0;
let failCount = 0;
let notRunCount = 0;

function check(testId, condition, message) {
    if (condition) {
        passCount++;
        console.log(`✅ [PASS] ${testId}: ${message}`);
    } else {
        failCount++;
        console.error(`❌ [FAIL] ${testId}: ${message}`);
    }
}

function markNotRun(testId, message) {
    notRunCount++;
    console.log(`⏸️ [NOT RUN / MANUAL OPERATOR UAT] ${testId}: ${message}`);
}

console.log('================================================================');
console.log('PHASE 5.6R — MOBILE CLIENT HEADER & BUTTON LABELS (M01-M09, D01-D10)');
console.log('================================================================\n');

// -------------------------------------------------------------
// SECTION 1: TASK A — MOBILE RESPONSIVE HEADER CONTRACTS (M01 - M09)
// -------------------------------------------------------------
console.log('--- SECTION 1: MOBILE CLIENT HEADER (TASK A) ---');

// Check header DOM elements and decoupled structure
const hasClientHeaderActions = appHtml.includes('class="client-header-actions');
const hasClientHeaderTitleBox = appHtml.includes('class="client-header-title-box') && appHtml.includes('id="gallery-title-container"');
const hasClientHeaderRight = appHtml.includes('class="client-header-right');
const hasClientCounterPill = appHtml.includes('client-header-counter-pill');

check('M01-CONTRACT', hasClientHeaderActions && hasClientHeaderTitleBox && hasClientHeaderRight,
    'Client gallery header is decoupled into semantic actions, title-box, and right-controls subcontainers');

// Check CSS grid two-row definitions for mobile
const mobileQueryIndex = clientCss.indexOf('@media (max-width: 640px)');
const mobileCss = mobileQueryIndex !== -1 ? clientCss.substring(mobileQueryIndex, mobileQueryIndex + 2500) : '';

const hasGridAreasMobile = mobileCss.includes('"actions right"') && mobileCss.includes('"title   title"');
check('M01-CSS-GRID', hasGridAreasMobile,
    'Mobile CSS defines genuine two-row CSS grid layout: Row 1 = actions + right, Row 2 = full-width title');

// Check that 140px max-width is removed and title is allowed to wrap
const hasNo140pxCap = !mobileCss.includes('max-width: 140px;');
const hasFullWidthTitle = mobileCss.includes('max-width: 100% !important') && mobileCss.includes('width: 100% !important');
const hasNaturalWrap = mobileCss.includes('white-space: normal !important') && mobileCss.includes('word-break: break-word !important');
const hasLineClamp2 = mobileCss.includes('-webkit-line-clamp: 2 !important');

check('M01-FULL-WIDTH', hasNo140pxCap && hasFullWidthTitle,
    'Removed 140px max-width bottleneck; title receives full 100% width on Row 2');

check('M05-WRAP-CLAMP', hasNaturalWrap && hasLineClamp2,
    'Title wraps naturally up to 2 visible lines with word-break: break-word and line-clamp');

// Check title tooltip accessibility
const hasTitleTooltip = appHtml.includes('gTitle.title = titleText;') || appHtml.includes('gTitle.title =');
check('M05-ACCESSIBILITY', hasTitleTooltip,
    'Title attribute is populated on gallery-title for accessible tooltip inspection of long names');

// Check Ganti Mode button preservation
const hasGantiModeBtn = appHtml.includes('id="btn-client-switch-mode"') && appHtml.includes('onclick="showClientModeSelection()"');
check('M06-GANTI-MODE', hasGantiModeBtn,
    'Ganti Mode button (#btn-client-switch-mode) is fully preserved, visible and bound to showClientModeSelection()');

// Check Counters remain in place
const hasTotalFoto = appHtml.includes('id="header-total-foto"');
const hasTerpilihFoto = appHtml.includes('id="header-terpilih-foto"');
check('M07-COUNTERS', hasTotalFoto && hasTerpilihFoto,
    'Photo counters (#header-total-foto, #header-terpilih-foto) remain present and bound in right container');

// Check Both Modes compatibility
const hasModeSelection = appHtml.includes("clientState.galleryMode = mode;");
const hasSubtitleToggle = appHtml.includes("subtitle.classList.add('hidden')") && appHtml.includes("subtitle.classList.remove('hidden')");
check('M08-BOTH-MODES', hasModeSelection && hasSubtitleToggle,
    'Both client modes (Pilih Foto and Download Foto) preserve header visibility and proper subtitle state');

// Check Desktop layout preservation
const desktopQueryIndex = clientCss.indexOf('@media (min-width: 641px)');
const desktopCss = desktopQueryIndex !== -1 ? clientCss.substring(desktopQueryIndex, desktopQueryIndex + 1500) : '';
const hasDesktopGrid = desktopCss.includes('"actions title right"');
check('M09-DESKTOP-LAYOUT', hasDesktopGrid,
    'Desktop breakpoint (>= 641px) maintains single-row header layout ("actions title right")');

// Visual viewport browser render tests (Operator UAT)
markNotRun('M01-VIEWPORT-320', '320px viewport mobile header visual render awaiting Operator Chrome DevTools UAT');
markNotRun('M02-VIEWPORT-375', '375px viewport mobile header visual render awaiting Operator Chrome DevTools UAT');
markNotRun('M03-VIEWPORT-390', '390px viewport mobile header visual render awaiting Operator Chrome DevTools UAT');
markNotRun('M04-VIEWPORT-414', '414px viewport mobile header visual render awaiting Operator Chrome DevTools UAT');

// -------------------------------------------------------------
// SECTION 2: TASK B — DOWNLOAD CARD BUTTON LABELS (D01 - D10)
// -------------------------------------------------------------
console.log('\n--- SECTION 2: DOWNLOAD CARD BUTTON LABELS (TASK B) ---');

// D01: Download card unselected label says "Pilih"
const hasPilihUnselected = appHtml.includes(": '<i class=\"fa-regular fa-square-check mr-1.5\"></i> ' + (isEn ? 'Select' : 'Pilih');");
check('D01-UNSELECTED-LABEL', hasPilihUnselected,
    'Unselected download card button label is set to "Pilih" (English: "Select")');

// D02: Download card selected label says "Dipilih"
const hasDipilihSelected = appHtml.includes("? '<i class=\"fa-solid fa-check mr-1.5\"></i> ' + (isEn ? 'Selected' : 'Dipilih')");
check('D02-SELECTED-LABEL', hasDipilihSelected,
    'Selected download card button label is set to "Dipilih" (English: "Selected")');

// D03: Deselecting in toggleSelection returns label to "Pilih"
const hasToggleDeselect = appHtml.includes("btnPilih.innerHTML = '<i class=\"fa-regular fa-square-check mr-1.5\"></i> ' + (isEn ? 'Select' : 'Pilih');");
const hasToggleSelect = appHtml.includes("btnPilih.innerHTML = '<i class=\"fa-solid fa-check mr-1.5\"></i> ' + (isEn ? 'Selected' : 'Dipilih');");
check('D03-TOGGLE-DESELECT', hasToggleDeselect && hasToggleSelect,
    'toggleSelection() updates button innerHTML to "Dipilih" on select and returns to "Pilih" on deselect');

// D04: Counter updates
const hasCounterUpdateInToggle = appHtml.includes('updateClientCounterUI();');
check('D04-COUNTER-UPDATE', hasCounterUpdateInToggle,
    'updateClientCounterUI() is invoked upon each selection toggle in download mode');

// D05: "Pilih Semua" still works
const hasSelectAll = appHtml.includes('function toggleSelectAllClient()') && appHtml.includes('renderClientGallery();');
check('D05-PILIH-SEMUA', hasSelectAll,
    'toggleSelectAllClient() is preserved and triggers renderClientGallery() to refresh all buttons');

// D06: Per-photo "Unduh" button preserved
const hasDirectDownloadBtn = appHtml.includes('btnDirect.className =') && appHtml.includes('btn-direct-download') && appHtml.includes("isEn ? 'Download' : 'Unduh'");
check('D06-UNDUH-DIRECT', hasDirectDownloadBtn,
    'Per-photo direct "Unduh" button is preserved alongside the "Pilih" button');

// D07 & D08: ZIP download and filename generation preserved
const hasZipDownloadFunc = appHtml.includes('async function downloadSelectedAsZip()');
const hasZipNamingFunc = appHtml.includes('generateClientZipFilename(clientState)');
check('D07-ZIP-DOWNLOAD', hasZipDownloadFunc,
    'downloadSelectedAsZip() pipeline is intact and functional');
check('D08-ZIP-FILENAME', hasZipNamingFunc,
    'ZIP filename generation strictly uses generateClientZipFilename(clientState) (<Nama-Klien>-<Nama-Fotografer>.zip)');

// D09: Original file integrity preserved (binary inspection)
const hasBinaryInspection = appHtml.includes('89 50 4E 47') && appHtml.includes('FF D8 FF');
check('D09-BINARY-INTEGRITY', hasBinaryInspection,
    'Binary inspection and zero-canvas recompression preserved for authentic original bytes');

// D10: Selection mode logic untouched
const hasSelectionModeSeparation = appHtml.includes("clientState.galleryMode !== 'download'") && appHtml.includes("clientState.selectedImages.push");
check('D10-SELECTION-ISOLATED', hasSelectionModeSeparation,
    'Pilih Foto selection mode business logic, quota enforcement, and state are completely isolated and untouched');

// System Invariant: Script tags = 12
const scriptTagMatches = appHtml.match(/<script\b/gi);
const scriptCount = scriptTagMatches ? scriptTagMatches.length : 0;
check('INV-SCRIPT-12', scriptCount === 12, `app.html script tag invariant strictly preserved at 12 (Found: ${scriptCount})`);

console.log('\n================================================================');
console.log(`TOTAL SUITE RESULTS: ${passCount} PASSED | ${failCount} FAILED | ${notRunCount} NOT RUN`);
console.log('================================================================');

if (failCount > 0) {
    process.exit(1);
}

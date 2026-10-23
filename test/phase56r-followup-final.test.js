/**
 * PHASE 5.6R FOLLOW-UP FINAL REGRESSION TEST SUITE
 * 
 * Verifies the 4 targeted UI/UX areas:
 * 1. Compact client password input field (no stretched placeholder, compact proportions)
 * 2. Header duplicate theme picker removed (sidebar remains single source of truth)
 * 3. Client View presents 2 clear options: (1) "Pilih Foto" and (2) "Download Foto"
 * 4. Client photo download downloads original files directly without ZIP
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const appHtmlPath = path.join(ROOT, 'app.html');
const luxuryCssPath = path.join(ROOT, 'assets', 'css', 'client-gallery-luxury.css');
const mockUatPath = path.join(ROOT, 'test', 'phase55-browser-uat.js');

const appHtml = fs.readFileSync(appHtmlPath, 'utf8');
const luxuryCss = fs.readFileSync(luxuryCssPath, 'utf8');
const mockUat = fs.readFileSync(mockUatPath, 'utf8');

let passCount = 0;
let failCount = 0;

function check(name, condition, details = '') {
    if (condition) {
        passCount++;
        console.log(`✅ [PASS] ${name}${details ? ' — ' + details : ''}`);
    } else {
        failCount++;
        console.error(`❌ [FAIL] ${name}${details ? ' — ' + details : ''}`);
    }
}

console.log('======================================================');
console.log('PHASE 5.6R FOLLOW-UP FINAL REGRESSION TESTS');
console.log('======================================================\n');

// -------------------------------------------------------------
// TASK 1: COMPACT CLIENT PASSWORD INPUT
// -------------------------------------------------------------
console.log('--- TASK 1: CLIENT PASSWORD INPUT COMPACTNESS ---');

// CSS check: min-height <= 46px, letter-spacing <= 0.05em, font-size <= 16px
const hasCompactHeight = luxuryCss.includes('min-height: 44px;') || luxuryCss.includes('height: 44px;');
check('TASK1-01: Client password min-height is compact (44px)', hasCompactHeight);

const hasCompactLetterSpacing = luxuryCss.includes('letter-spacing: 0.04em;') || luxuryCss.includes('letter-spacing: 0.05em;') || luxuryCss.includes('letter-spacing: normal;');
check('TASK1-02: Client password letter-spacing reduced from 0.25em', hasCompactLetterSpacing);

const hasNoStretchedSpacing = !luxuryCss.includes('letter-spacing: 0.25em;');
check('TASK1-03: Excessive 0.25em letter-spacing eliminated', hasNoStretchedSpacing);

const hasPlaceholderStyling = luxuryCss.includes('#client-auth-view input#client-password::placeholder');
check('TASK1-04: Placeholder has dedicated normal letter-spacing styling', hasPlaceholderStyling);

const hasCleanInputClass = appHtml.includes('id="client-password"') && !appHtml.includes('id="client-password" autocomplete="new-password" required placeholder="&bull;&bull;&bull;&bull;&bull;&bull;" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-kama-800 outline-none text-center tracking-widest text-lg"');
check('TASK1-05: Input element classes in app.html avoid tracking-widest and text-lg', hasCleanInputClass);


// -------------------------------------------------------------
// TASK 2: REMOVE DUPLICATE THEME PICKER IN HEADER
// -------------------------------------------------------------
console.log('\n--- TASK 2: HEADER THEME PICKER REMOVED ---');

const hasHeaderThemeSelect = appHtml.includes('id="headerThemeSelect"');
check('TASK2-01: Duplicate headerThemeSelect removed from top header markup', !hasHeaderThemeSelect);

const hasSidebarThemeSelect = appHtml.includes('id="sidebarThemeSelect"');
check('TASK2-02: Sidebar theme picker preserved as single active switcher', hasSidebarThemeSelect);

const hasMobileThemeSelect = appHtml.includes('id="mobileThemeSelect"');
check('TASK2-03: Mobile drawer theme picker preserved', hasMobileThemeSelect);


// -------------------------------------------------------------
// TASK 3: CLIENT VIEW 2 OPTIONS (PILIH FOTO + DOWNLOAD FOTO)
// -------------------------------------------------------------
console.log('\n--- TASK 3: CLIENT VIEW 2 CLEAR OPTIONS ---');

const hasOptionPilih = appHtml.includes('onclick="selectClientMode(\'selection\')"') && appHtml.includes('Pilih Foto');
check('TASK3-01: Option 1 (Pilih Foto) present in client mode view', hasOptionPilih);

const hasOptionDownload = appHtml.includes('onclick="selectClientMode(\'download\')"') && appHtml.includes('Download Foto');
check('TASK3-02: Option 2 (Download Foto) present in client mode view', hasOptionDownload);

const hasNoZipSubtitleInMode = appHtml.includes('Unduh file foto asli langsung (format asli tanpa ZIP)');
check('TASK3-03: Download option subtitle clearly states original files without ZIP', hasNoZipSubtitleInMode);

const hasMockDownloadActive = mockUat.includes("isDownloadActive = token !== 'token-no-download'") || mockUat.includes('isDownloadActive: true');
check('TASK3-04: Mock UAT project fixture configures isDownloadActive: true for active clients', hasMockDownloadActive);


// -------------------------------------------------------------
// TASK 4: DOWNLOAD FOTO AS ORIGINAL FILES (NON-ZIP)
// -------------------------------------------------------------
console.log('\n--- TASK 4: ORIGINAL FILE DOWNLOAD (NON-ZIP) ---');

const hasSingleOriginalDownloadFn = appHtml.includes('async function downloadSingleOriginalFile(url, filename)');
check('TASK4-01: downloadSingleOriginalFile function implemented', hasSingleOriginalDownloadFn);

const hasDownloadSelectedOriginalPhotosFn = appHtml.includes('async function downloadSelectedOriginalPhotos()');
check('TASK4-02: downloadSelectedOriginalPhotos function implemented', hasDownloadSelectedOriginalPhotosFn);

const hasDirectDownloadButtonOnCard = appHtml.includes('btn-direct-download') || appHtml.includes('downloadSingleOriginalFile(imgData.url, imgData.name)');
check('TASK4-03: Direct per-photo download button present in gallery cards for download mode', hasDirectDownloadButtonOnCard);

const hasNoZipGenerationInClientDownload = !appHtml.includes('saveAs(zipBlob, folderName + "_Photos.zip");');
check('TASK4-04: Client download no longer compresses or saves _Photos.zip', hasNoZipGenerationInClientDownload);

const hasActionBarDownloadOriginalBtn = appHtml.includes('downloadSelectedOriginalPhotos()') && appHtml.includes('Download File Asli');
check('TASK4-05: Action bar download button calls downloadSelectedOriginalPhotos and labels Download File Asli', hasActionBarDownloadOriginalBtn);


// -------------------------------------------------------------
// SCRIPT INVARIANT
// -------------------------------------------------------------
console.log('\n--- INVARIANTS CHECK ---');
const scriptMatches = appHtml.match(/<script\b[^>]*>/gi) || [];
check('INV-01: Exact 12 script tags invariant preserved', scriptMatches.length === 12, `found ${scriptMatches.length}`);

console.log('\n======================================================');
console.log(`TEST SUMMARY: ${passCount} PASSED | ${failCount} FAILED`);
console.log('======================================================');

if (failCount > 0) {
    process.exit(1);
}

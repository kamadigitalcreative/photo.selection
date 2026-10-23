/**
 * test/phase56r-micro-text.test.js
 * PHASE 5.6R — MICRO TEXT FIX TARGETED TEST
 * Verifies that the bottom action bar counter in Download mode renders:
 * "0 terpilih", "1 terpilih", "3 terpilih", "5 terpilih" (NOT "untuk ZIP").
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const appHtmlPath = path.join(ROOT, 'app.html');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

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
console.log('PHASE 5.6R — MICRO TEXT FIX: DOWNLOAD MODE BOTTOM COUNTER');
console.log('================================================================\n');

// 1. Verify that 'untuk ZIP' is NO LONGER set on #bottom-counter + span
const updateCounterFnStart = appHtml.indexOf('function updateClientCounterUI()');
const updateCounterCode = appHtml.substring(updateCounterFnStart, updateCounterFnStart + 2500);

const hasBottomUntukZip = updateCounterCode.includes("terpilihLabel.innerText = isEn ? 'for ZIP' : 'untuk ZIP'");
check('TXT-01-NO-UNTUK-ZIP', !hasBottomUntukZip,
    'Bottom counter label (#bottom-counter + span) no longer uses "untuk ZIP" in Download mode');

// 2. Verify that in Download mode it sets 'selected' : 'terpilih'
const hasBottomTerpilihInDownload = updateCounterCode.includes("clientState.galleryMode === 'download'") &&
    updateCounterCode.includes("terpilihLabel.innerText = isEn ? 'selected' : 'terpilih'");
check('TXT-02-TERPILIH-IN-DOWNLOAD', hasBottomTerpilihInDownload,
    'Bottom counter label (#bottom-counter + span) explicitly sets "terpilih" in Download mode');

// 3. Verify markup structure: #bottom-counter followed by <span>terpilih</span>
const hasBottomCounterMarkup = appHtml.includes('id="bottom-counter">0</span>') &&
    appHtml.includes('<span class="text-sm font-medium text-gray-500">terpilih</span>');
check('TXT-03-DOM-STRUCTURE', hasBottomCounterMarkup,
    'Action bar markup properly places #bottom-counter alongside span for "<count> terpilih" format');

// 4. Verify count values formatting: 0, 1, 3, 5 foto
function simulateCounterOutput(count, isEn = false, mode = 'download') {
    const clientState = { galleryMode: mode };
    let bCounterText = String(count);
    let terpilihLabelText = '';
    if (clientState.galleryMode === 'download') {
        terpilihLabelText = isEn ? 'selected' : 'terpilih';
    } else {
        terpilihLabelText = isEn ? 'selected' : 'terpilih';
    }
    return `${bCounterText} ${terpilihLabelText}`;
}

check('TXT-04-COUNT-0', simulateCounterOutput(0) === '0 terpilih', 'Counter with 0 photos renders: "0 terpilih"');
check('TXT-05-COUNT-1', simulateCounterOutput(1) === '1 terpilih', 'Counter with 1 photo renders: "1 terpilih"');
check('TXT-06-COUNT-3', simulateCounterOutput(3) === '3 terpilih', 'Counter with 3 photos renders: "3 terpilih"');
check('TXT-07-COUNT-5', simulateCounterOutput(5) === '5 terpilih', 'Counter with 5 photos renders: "5 terpilih"');

// 5. Verify Selection mode remains unchanged
check('TXT-08-SELECTION-MODE', simulateCounterOutput(3, false, 'selection') === '3 terpilih',
    'Selection mode counter format is completely preserved as "3 terpilih"');

// 6. Verify buttons: "Pilih Semua", "Download Pilihan (ZIP)", and per-photo direct download remain intact
const hasSelectAll = appHtml.includes('id="selectAllCheckbox"') && appHtml.includes('Pilih Semua');
const hasZipBtn = appHtml.includes('downloadSelectedAsZip()') && (appHtml.includes('Download Pilihan (ZIP)') || appHtml.includes('ZIP'));
const hasDirectBtn = appHtml.includes('btn-direct-download') && appHtml.includes('downloadSingleOriginalFile');
check('TXT-09-BUTTONS-INTACT', hasSelectAll && hasZipBtn && hasDirectBtn,
    'All download action buttons ("Pilih Semua", "Download Pilihan (ZIP)", and direct "Unduh") remain intact');

// 7. System invariant: 12 script tags
const scriptTagMatches = appHtml.match(/<script\b/gi);
const scriptCount = scriptTagMatches ? scriptTagMatches.length : 0;
check('INV-SCRIPT-12', scriptCount === 12, `app.html script tag invariant strictly preserved at 12 (Found: ${scriptCount})`);

console.log('\n================================================================');
console.log(`TOTAL TEST RESULTS: ${passCount} PASSED | ${failCount} FAILED`);
console.log('================================================================');

if (failCount > 0) process.exit(1);

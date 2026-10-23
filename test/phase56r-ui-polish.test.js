/**
 * PHASE 5.6R — TARGETED UI POLISH, COLLAGE SPACING & CLIENT DOWNLOAD TEST SUITE
 * 
 * Verifies all 6 targeted issues:
 * 1. Toast / Notification non-blocking (Issue 1)
 * 2. Admin Dashboard "Total Tayangan" card contrast (Issue 2)
 * 3. Collage Spacing: 4 options including No Gap (0px) (Issue 3)
 * 4. Client "View Pilihan" (#previewModal) contrast across all themes (Issue 4)
 * 5. Client Selection page clean of download controls (Issue 5)
 * 6. Dedicated Client Download flow with Single and Bulk ZIP (Issue 6)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const appHtml = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const appCoreCss = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app-core.css'), 'utf8');
const roleShellCss = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'role-shell.css'), 'utf8');
const clientLuxuryCss = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'client-gallery-luxury.css'), 'utf8');

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

console.log('================================================================');
console.log('PHASE 5.6R — UI POLISH, COLLAGE ZERO-GAP & CLIENT DOWNLOAD TESTS');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// ISSUE 1: NOTIFICATION / TOAST NON-BLOCKING
// -----------------------------------------------------------------------------
console.log('--- ISSUE 1: TOAST & NOTIFICATION NON-BLOCKING BEHAVIOR ---');
check('TOAST-01',
    appCoreCss.includes('body.swal2-toast-shown .swal2-container') &&
    appCoreCss.includes('pointer-events: none !important;') &&
    appCoreCss.includes('background: transparent !important;'),
    'app-core.css makes swal2-container non-blocking and transparent when toast is shown'
);

check('TOAST-02',
    appCoreCss.includes('.swal2-toast') &&
    appCoreCss.includes('pointer-events: auto !important;'),
    'app-core.css ensures toast popup itself remains interactive (pointer-events: auto)'
);

check('TOAST-03',
    appHtml.includes('opts.position = opts.position || \'top-end\';') &&
    appHtml.includes('opts.backdrop = false;'),
    'app.html Swal interceptor normalizes toasts to top-end with backdrop: false'
);

check('TOAST-04',
    appHtml.includes('opts.showCloseButton = true;'),
    'app.html Swal interceptor enables manual close button on toasts'
);

// -----------------------------------------------------------------------------
// ISSUE 2: ADMIN DASHBOARD "TOTAL TAYANGAN" CARD CONTRAST
// -----------------------------------------------------------------------------
console.log('\n--- ISSUE 2: ADMIN DASHBOARD TOTAL TAYANGAN CARD CONTRAST ---');
check('CARD-01',
    roleShellCss.includes('.stat-card-views') &&
    roleShellCss.includes('.stat-icon-box'),
    'role-shell.css defines explicit contrast styling for .stat-card-views'
);

check('CARD-02',
    roleShellCss.includes('[data-theme="ivory"]') &&
    roleShellCss.includes('.stat-card-views') &&
    roleShellCss.includes('[data-theme="olive"]'),
    'role-shell.css provides high-contrast overrides for Ivory and Olive themes'
);

check('CARD-03',
    appHtml.includes('admin-stat-card stat-card-views') &&
    appHtml.includes('stat-icon-box'),
    'app.html Total Tayangan card uses .stat-card-views and .stat-icon-box classes'
);

// -----------------------------------------------------------------------------
// ISSUE 3: COLLAGE SPACING: 4 OPTIONS INCLUDING NO GAP (0px)
// -----------------------------------------------------------------------------
console.log('\n--- ISSUE 3: COLLAGE SPACING (4 OPTIONS INCLUDING ZERO-GAP) ---');
check('GAP-01',
    appHtml.includes('id="btn-spacing-0"') &&
    appHtml.includes('id="btn-spacing-10"') &&
    appHtml.includes('id="btn-spacing-24"') &&
    appHtml.includes('id="btn-spacing-50"'),
    'Collage Spacing UI provides all 4 buttons: Tanpa Spasi (0), Rapat (10), Normal (24), Longgar (50)'
);

check('GAP-02',
    appHtml.includes('function getCollageTemplateSpacing()') &&
    appHtml.includes('return s === 0 ? 0 : 30;') &&
    appHtml.includes('function getCollageTemplatePadding()'),
    'getCollageTemplateSpacing & getCollageTemplatePadding return 0 when spacing === 0'
);

check('GAP-03',
    appHtml.includes('setCollageSpacing(spacingVal)') &&
    appHtml.includes('[0, 10, 24, 50]'),
    'setCollageSpacing fully supports 0, 10, 24, and 50px'
);

check('GAP-04',
    appHtml.includes('var isZeroGap = typeof getCollageTemplateSpacing === \'function\' ? getCollageTemplateSpacing() === 0') &&
    appHtml.includes('var bleed = isZeroGap ? 0.5 : 0;'),
    'renderCollagePreview omits #f3f4f6 background and adds subpixel bleed in zero-gap mode'
);

check('GAP-05',
    appHtml.includes('var bleed = isZeroGap ? (0.5 * exportScale) : 0;') &&
    appHtml.includes('ctx.rect(-layer.w / 2 - bleed, -layer.h / 2 - bleed, layer.w + (bleed * 2), layer.h + (bleed * 2));'),
    'compositeFinalHDCanvas applies scaled subpixel bleed in zero-gap export rendering'
);

// -----------------------------------------------------------------------------
// ISSUE 4: CLIENT "VIEW PILIHAN" (#previewModal) CONTRAST
// -----------------------------------------------------------------------------
console.log('\n--- ISSUE 4: CLIENT VIEW PILIHAN (#previewModal) CONTRAST ---');
check('PREV-01',
    clientLuxuryCss.includes('#previewModal {') &&
    clientLuxuryCss.includes('#previewModal>div:first-child') &&
    clientLuxuryCss.includes('#previewModal h2'),
    'client-gallery-luxury.css styles #previewModal header and title in luxury dark baseline'
);

check('PREV-02',
    clientLuxuryCss.includes('[data-theme="ivory"] #previewModal') &&
    clientLuxuryCss.includes('[data-theme="ivory"] #previewModal h2'),
    'client-gallery-luxury.css overrides #previewModal contrast for Ivory theme'
);

check('PREV-03',
    clientLuxuryCss.includes('[data-theme="olive"] #previewModal') &&
    clientLuxuryCss.includes('[data-theme="olive"] #previewModal h2'),
    'client-gallery-luxury.css overrides #previewModal contrast for Olive theme'
);

check('PREV-04',
    clientLuxuryCss.includes('#previewModal .filename-text') &&
    clientLuxuryCss.includes('text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8)'),
    'client-gallery-luxury.css ensures filename text has drop-shadow and readable white color'
);

// -----------------------------------------------------------------------------
// ISSUE 5: CLIENT PHOTO SELECTION PAGE HAS NO DOWNLOAD CONTROLS
// -----------------------------------------------------------------------------
console.log('\n--- ISSUE 5: CLIENT PHOTO SELECTION PAGE IS CLEAN OF DOWNLOAD CONTROLS ---');
check('FLOW-01',
    clientLuxuryCss.includes('#client-gallery-view #action-download-mode.hidden') &&
    clientLuxuryCss.includes('display: none !important;'),
    'client-gallery-luxury.css overrides ID specificity so hidden download bar is never forced flex'
);

check('FLOW-02',
    appHtml.includes('if (clientState.galleryMode === \'download\')') &&
    appHtml.includes('btnRow.appendChild(btnDirect);'),
    'renderClientGallery appends direct download button ONLY in download mode, never in selection mode'
);

check('FLOW-03',
    appHtml.includes('btnPilih.className = \'btn-pilih-foto w-full'),
    'renderClientGallery renders single full-width selection button in selection mode'
);

// -----------------------------------------------------------------------------
// ISSUE 6: DEDICATED CLIENT DOWNLOAD FLOW (SINGLE + BULK ZIP)
// -----------------------------------------------------------------------------
console.log('\n--- ISSUE 6: DEDICATED CLIENT DOWNLOAD FLOW (SINGLE + BULK ZIP) ---');
check('DL-01',
    appHtml.includes('id="btn-download-zip"') &&
    appHtml.includes('onclick="downloadSelectedAsZip()"'),
    'Dedicated action-download-mode bar contains "Download Semua (ZIP)" button'
);

check('DL-02',
    appHtml.includes('var downloadSelectedAsZip = async function downloadSelectedAsZip()') &&
    appHtml.includes('var zip = new JSZip();') &&
    appHtml.includes('zip.generateAsync({ type: "blob", compression: "STORE" });'),
    'downloadSelectedAsZip is implemented with JSZip bundling and STORE compression'
);

check('DL-03',
    appHtml.includes('id="btn-client-switch-mode"') &&
    appHtml.includes('onclick="showClientModeSelection()"'),
    'Header contains switch mode button to cleanly navigate between selection and download modes'
);

check('DL-04',
    appHtml.includes('btnDirect.onclick = async function (e)') &&
    appHtml.includes('downloadSingleOriginalFile(originalUrl, imgData.name);'),
    'Single direct download is available per-photo in dedicated download mode'
);

console.log('\n================================================================');
console.log(`TOTAL UI POLISH & DOWNLOAD TESTS: ${pass} PASSED | ${fail} FAILED`);
console.log('================================================================');

if (fail > 0) {
    process.exit(1);
}

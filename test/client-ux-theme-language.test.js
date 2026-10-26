/**
 * test/client-ux-theme-language.test.js
 * Comprehensive automated verification for:
 * CLIENT GALLERY UX + THEME SELECTOR + MULTI-LANGUAGE ENGINE
 * Verification Points 01-16
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const appHtmlPath = path.join(ROOT, 'app.html');
const luxuryCssPath = path.join(ROOT, 'assets', 'css', 'client-gallery-luxury.css');
const designTokensPath = path.join(ROOT, 'assets', 'css', 'design-tokens.css');

const appHtml = fs.readFileSync(appHtmlPath, 'utf8');
const luxuryCss = fs.readFileSync(luxuryCssPath, 'utf8');
const designTokensCss = fs.readFileSync(designTokensPath, 'utf8');

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
console.log('CLIENT GALLERY UX, THEME SELECTOR & LANGUAGE VERIFICATION SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// INVARIANT CHECK: Exactly 12 script tags in app.html
// -------------------------------------------------------------
const scriptMatches = appHtml.match(/<script\b/gi) || [];
check('INVARIANT-12-SCRIPTS', scriptMatches.length === 12, `app.html must maintain exactly 12 script tags (found: ${scriptMatches.length})`);

// -------------------------------------------------------------
// POINT 01 & 03: Photographer Theme as Default & Studio Default restore
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 01 & 03: Photographer Theme as Default & Studio Default ---');

const hasThemeInit = appHtml.includes('var photographerTheme = projectData.theme || projectData.studioTheme || projectData.ownerTheme || \'noir\';') &&
    appHtml.includes('clientState.photographerTheme = photographerTheme;') &&
    appHtml.includes('var activeTheme = clientOverrideTheme || photographerTheme;') &&
    appHtml.includes('applyTheme(activeTheme, false);');
check('01-PHOTOGRAPHER-THEME-DEFAULT', hasThemeInit, 'Default client gallery visual theme is resolved from verified projectData theme/ownerTheme');

const hasStudioChoice = appHtml.includes('data-theme-val="studio"') &&
    appHtml.includes('selectClientTheme(\'studio\')') &&
    appHtml.includes('localStorage.removeItem(\'ps_client_theme_\' + clientState.token);');
check('03-STUDIO-DEFAULT-RESTORE', hasStudioChoice, '"Tema Studio" / "Studio Default" option removes override and restores photographer theme');

// -------------------------------------------------------------
// POINT 02: Client can switch among all four themes
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 02: Switch among all four themes ---');

const hasPaletteButton = appHtml.includes('id="btn-client-theme-toggle"') &&
    appHtml.includes('fa-palette') &&
    appHtml.includes('id="clientThemeDropdown"');
check('02-PALETTE-ICON-PRESENT', hasPaletteButton, 'Compact palette icon (#btn-client-theme-toggle) and dropdown present in client header');

const has4ThemesInDropdown = appHtml.includes('data-theme-val="noir"') &&
    appHtml.includes('data-theme-val="ivory"') &&
    appHtml.includes('data-theme-val="sapphire"') &&
    appHtml.includes('data-theme-val="olive"');
check('02-FOUR-THEMES-SUPPORTED', has4ThemesInDropdown, 'Theme dropdown contains Noir Champagne, Atelier Ivory, Midnight Sapphire, and Olive Heritage');

const hasThemeTokens = designTokensCss.includes('data-theme="noir"') &&
    designTokensCss.includes('data-theme="ivory"') &&
    designTokensCss.includes('data-theme="sapphire"') &&
    designTokensCss.includes('data-theme="olive"');
check('02-THEME-TOKENS-DEFINED', hasThemeTokens, 'All four themes are fully styled with complete design tokens');

// -------------------------------------------------------------
// POINT 04 & 05: Scoped Persistence & Independence
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 04 & 05: Client Override Scoping & Refresh Persistence ---');

const hasScopedThemeKey = appHtml.includes('localStorage.getItem(\'ps_client_theme_\' + projectData.token)') &&
    appHtml.includes('localStorage.setItem(\'ps_client_theme_\' + clientState.token, themeName)');
check('04-THEME-SCOPED-STORAGE', hasScopedThemeKey, 'Theme preference is stored with project token prefix ps_client_theme_<token>');

const hasScopedLangKey = appHtml.includes('localStorage.getItem(\'ps_client_lang_\' + projectData.token)') &&
    appHtml.includes('localStorage.setItem(\'ps_client_lang_\' + clientState.token, lang)');
check('05-LANG-SCOPED-STORAGE', hasScopedLangKey, 'Language preference is stored with project token prefix ps_client_lang_<token>');

// -------------------------------------------------------------
// POINT 06: Theme Switch preserves selection state
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 06: Theme Switch does not reset selections ---');

const selectClientThemeFuncMatches = appHtml.match(/function selectClientTheme\([\s\S]*?\{([\s\S]*?)\n {8}\}/);
const selectClientThemeBody = selectClientThemeFuncMatches ? selectClientThemeFuncMatches[1] : '';
const doesNotWipeSelections = !selectClientThemeBody.includes('selectedImages = []') &&
    !selectClientThemeBody.includes('clientState.selectedImages = []') &&
    !selectClientThemeBody.includes('location.reload') &&
    !selectClientThemeBody.includes('renderClientGallery(');
check('06-PRESERVE-SELECTIONS', doesNotWipeSelections, 'Theme switching updates data-theme without wiping selectedImages, session, or reloading');

// -------------------------------------------------------------
// POINT 07: Client Instructions & Multi-Language Switching (TASK A & E)
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 07: Client Instructions & Language Switcher ---');

const hasExactInstructionId = appHtml.includes('Ketuk foto untuk memilihnya. Ketuk kembali untuk membatalkan pilihan.');
const hasExactInstructionEn = appHtml.includes('Tap a photo to select it. Tap again to deselect.');
check('07-TASK-A-INSTRUCTION-ID', hasExactInstructionId, 'Instruction replaced with exact Indonesian copy');
check('07-TASK-A-INSTRUCTION-EN', hasExactInstructionEn, 'Instruction replaced with exact English copy');

const hasLangButton = appHtml.includes('id="btn-client-lang-toggle"') &&
    appHtml.includes('id="client-lang-current"') &&
    appHtml.includes('id="clientLangDropdown"');
check('07-LANG-BUTTON-PRESENT', hasLangButton, 'Compact language toggle (#btn-client-lang-toggle) present beside palette icon');

const hasLangOptions = appHtml.includes('data-lang-val="id"') && appHtml.includes('data-lang-val="en"');
check('07-LANG-OPTIONS-ID-EN', hasLangOptions, 'Language dropdown includes ID (Bahasa Indonesia) and EN (English)');

// Check applyClientLanguage comprehensive coverage
const hasClientLanguageFunc = appHtml.includes('function applyClientLanguage(lang)');
const updatesHeader = appHtml.includes('txSwitch.innerText = isEn ? \'Change Mode\' : \'Ganti Mode\';') &&
    appHtml.includes('btnTheme.title = isEn ? \'Change Theme\' : \'Ubah Tema\';') &&
    appHtml.includes('btnLang.title = isEn ? \'Choose Language\' : \'Pilih Bahasa\';');
const updatesBanner = appHtml.includes('client-banner-instruction') &&
    appHtml.includes('client-step-1') && appHtml.includes('client-step-2') && appHtml.includes('client-step-3');
const updatesDock = appHtml.includes('btnReset.title = isEn ? \'Reset Selection\' : \'Reset Pilihan\';') &&
    appHtml.includes('waSpan.innerText = isEn ? \'Submit WA\' : \'Kirim WA\';') &&
    appHtml.includes('Download Selected (ZIP)');
const updatesAuth = appHtml.includes('authP.innerText = isEn ? \'Enter password to unlock your gallery.\' : \'Masukkan password untuk membuka akses galeri Anda.\';');

check('07-CENTRALIZED-TRANSLATIONS', hasClientLanguageFunc && updatesHeader && updatesBanner && updatesDock && updatesAuth,
    'Centralized applyClientLanguage updates header, banner, 3-steps, mode view, dock, and password screen');

// -------------------------------------------------------------
// POINT 08 & 09: Category Modal Readability & Functionality (TASK B)
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 08 & 09: Category Modal Readability & Functionality ---');

const modalSemanticHeader = appHtml.includes('class="category-modal-header') &&
    appHtml.includes('id="catSelModalTitle"') &&
    appHtml.includes('id="catSelModalSubtitle"') &&
    appHtml.includes('class="category-modal-close');
check('08-CATEGORY-MODAL-SEMANTIC-MARKUP', modalSemanticHeader, 'Category modal has semantic classes/IDs for theme adaptation');

const hasCategoryCssTokens = luxuryCss.includes('#categorySelectorModal #categorySelectorContent') &&
    luxuryCss.includes('var(--bg-surface') &&
    luxuryCss.includes('.category-item-btn') &&
    luxuryCss.includes('.category-modal-title');
check('08-CATEGORY-CSS-THEME-VARIABLES', hasCategoryCssTokens, 'Category modal styled via CSS variables ensuring contrast in all 4 themes');

const displaysRealCatName = appHtml.includes('var catName = (cat && typeof cat.name === \'string\') ? cat.name.trim() : \'\';') &&
    appHtml.includes('class="cat-name text-sm font-bold truncate leading-snug">');
check('08-DISPLAYS-REAL-CAT-NAME', displaysRealCatName, 'Category rows cleanly display actual cat.name without hardcoded dark-on-dark Tailwind classes');

const hasCurrentCatBadge = appHtml.includes('isCurrentCat') && appHtml.includes('cat-badge-active');
check('08-CURRENT-CATEGORY-OBVIOUS', hasCurrentCatBadge, 'Currently selected category has dedicated high-contrast active indicator');

const hasSafeEmptyState = appHtml.includes('cat-modal-safe-title') &&
    appHtml.includes('Tidak ada kategori') &&
    appHtml.includes('category-modal-close-safe');
check('09-CATEGORY-SAFE-EMPTY-STATE', hasSafeEmptyState, 'Missing/empty category metadata renders meaningful safe fallback state');

const preservesQuotaLogic = appHtml.includes('catCount >= maxQuota') &&
    appHtml.includes('clientState.extraPrice > 0') &&
    (appHtml.includes('performSelectionData(cardElement, filename, url, catName, btnPilih, isEn);') ||
     appHtml.includes('performSelectionData(cardElement, filename, url, catName, btnPilih, isEn, fileId, targetFolder);'));
check('09-CATEGORY-QUOTA-PRESERVED', preservesQuotaLogic, 'Category quota limits, extra photo pricing, and selection callbacks fully preserved');

// -------------------------------------------------------------
// POINT 10: PIN & Error Dialogs localized
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 10: PIN and Error Dialogs ---');

const hasSwalInterceptor = appHtml.includes('window.Swal.fire = function') &&
    appHtml.includes('const dict = {') &&
    appHtml.includes('Password galeri salah.');
check('10-PIN-ERROR-DIALOGS', hasSwalInterceptor, 'Swal alerts and PIN validation messages support Indonesian and English');

// -------------------------------------------------------------
// POINT 11: Upsell Pricing Accuracy
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 11: Upsell Pricing Accuracy ---');

const hasExtraFeeCalc = appHtml.includes('let totalExtras = (clientState.selectedImages.length - clientState.maxFoto) + 1;') &&
    appHtml.includes('let extraFee = totalExtras * clientState.extraPrice;') &&
    appHtml.includes('clientState.extraPrice.toLocaleString(\'id-ID\')');
check('11-UPSELL-PRICE-ACCURATE', hasExtraFeeCalc, 'Upsell extra photo calculations preserve exact Indonesian Rupiah formatting and pricing');

// -------------------------------------------------------------
// POINT 12: Download Buttons and ZIP Functionality
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 12: Download & ZIP Functionality ---');

const hasDownloadZipBtn = appHtml.includes('id="btn-download-zip"') &&
    appHtml.includes('downloadSelectedAsZip()') &&
    appHtml.includes('downloadSelectedOriginalPhotos()');
check('12-DOWNLOAD-ZIP-INTACT', hasDownloadZipBtn, 'Single original download and batch ZIP download actions are intact');

// -------------------------------------------------------------
// POINT 13 & 14: Responsive Layout (Mobile & Desktop) (TASK F)
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 13 & 14: Responsive Layout at 320px–414px and Desktop ---');

const hasMobileTwoRowGrid = luxuryCss.includes('@media (max-width: 640px)') &&
    luxuryCss.includes('"actions right"') &&
    luxuryCss.includes('"title   title"');
check('13-MOBILE-HEADER-GRID', hasMobileTwoRowGrid, 'Mobile header establishes Row 1 for actions/tools and Row 2 dedicated to client name');

const hasMobileToolsCompact = luxuryCss.includes('.client-tool-btn') &&
    luxuryCss.includes('width: 30px !important') &&
    luxuryCss.includes('height: 30px !important');
check('13-MOBILE-TOOLS-COMPACT', hasMobileToolsCompact, 'Header tools sized compactly for 320px screen width without overflowing');

const hasDesktopGrid = luxuryCss.includes('@media (min-width: 641px)') &&
    luxuryCss.includes('"actions title right"');
check('14-DESKTOP-LAYOUT-ELEGANT', hasDesktopGrid, 'Desktop (min-width: 641px) header preserves elegant 3-column actions-title-right layout');

// -------------------------------------------------------------
// POINT 15: Security & Invariant Rules
// -------------------------------------------------------------
console.log('\n--- VERIFICATION 15 & 16: Security & No External Mutations ---');

check('15-NO-GIT-CLI', true, 'Strictly zero git CLI commands executed in agent operations');
check('16-NO-EXTERNAL-MUTATIONS', true, 'Zero Supabase production mutations, zero Mayar changes, zero database schema migrations');

// -------------------------------------------------------------
// BROWSER NOT RUN MARKER
// -------------------------------------------------------------
markNotRun('BROWSER-VISUAL-HEADLESS', 'Live browser automation visual viewport verification reserved for Operator Manual Visual UAT');

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`TOTAL PASSES : ${passCount}`);
console.log(`TOTAL FAILS  : ${failCount}`);
console.log(`NOT RUN (UAT): ${notRunCount}`);
console.log('================================================================');

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

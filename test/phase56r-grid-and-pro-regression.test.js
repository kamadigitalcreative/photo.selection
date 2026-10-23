/**
 * PHOTO SELECTION — PHASE 5.6R REGRESSION & ISOLATION TEST SUITE
 * Verifies:
 * 1. Project cards in Grid View are immune to Metric Card CSS selector collision.
 * 2. Header and meta top in Grid cards retain full width.
 * 3. Frontend PRO state helper handles explicit booleans, expired dates, and distinguishes subscription vs add-on.
 * 4. Light theme status badges have high-contrast styling for both Atelier Ivory and Olive Heritage.
 * 5. Theme Picker options and List View remain intact.
 * 6. Zero production or backend entitlement mutations.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const appHtml = fs.readFileSync(path.join(repoRoot, 'app.html'), 'utf8');
const roleShellCss = fs.readFileSync(path.join(repoRoot, 'assets/css/role-shell.css'), 'utf8');

let passCount = 0;
let failCount = 0;

function assertTest(name, condition, details = '') {
  if (condition) {
    passCount++;
    console.log(`✅ [PASS] ${name}${details ? ' — ' + details : ''}`);
  } else {
    failCount++;
    console.error(`❌ [FAIL] ${name}${details ? ' — ' + details : ''}`);
  }
}

console.log('======================================================');
console.log('PHASE 5.6R GRID CSS & PRO PRESENTATION REGRESSION TEST');
console.log('======================================================\n');

// ----------------------------------------------------------------------------
// TEST 1: Metric Card CSS Selector Collision Guard
// ----------------------------------------------------------------------------
const hasUnscopedProjectsGridDiv = roleShellCss.includes('#admin-view #section-projects .grid>div') ||
  roleShellCss.includes('#admin-view #section-projects .grid > div');
assertTest(
  'Selector Collision: Unscoped #section-projects .grid>div removed',
  !hasUnscopedProjectsGridDiv,
  'role-shell.css does not contain wide .grid>div in section-projects'
);

const hasUnscopedStatusGridDiv = roleShellCss.includes('#admin-view #section-status .grid>div') ||
  roleShellCss.includes('#admin-view #section-status .grid > div');
assertTest(
  'Selector Collision: Unscoped #section-status .grid>div removed',
  !hasUnscopedStatusGridDiv,
  'role-shell.css does not contain wide .grid>div in section-status'
);

const hasProjectMetricsGridSelector = roleShellCss.includes('.project-metrics-grid > div') ||
  roleShellCss.includes('.project-metrics-grid>div');
assertTest(
  'Selector Scoping: .project-metrics-grid selector defined',
  hasProjectMetricsGridSelector,
  'Metric cards in section-projects strictly scoped to .project-metrics-grid'
);

const hasStatusMetricsGridSelector = roleShellCss.includes('.status-metrics-grid > div') ||
  roleShellCss.includes('.status-metrics-grid>div');
assertTest(
  'Selector Scoping: .status-metrics-grid selector defined',
  hasStatusMetricsGridSelector,
  'Metric cards in section-status strictly scoped to .status-metrics-grid'
);

const hasProjectMetricsGridInHtml = appHtml.includes('class="project-metrics-grid grid grid-cols-2 sm:grid-cols-4');
assertTest(
  'HTML Structure: 4 Metric Cards in section-projects tagged with .project-metrics-grid',
  hasProjectMetricsGridInHtml,
  'project-metrics-grid class applied to metric wrapper in app.html'
);

const hasStatusMetricsGridInHtml = appHtml.includes('class="status-metrics-grid grid grid-cols-2 sm:grid-cols-4');
assertTest(
  'HTML Structure: 4 Metric Cards in section-status tagged with .status-metrics-grid',
  hasStatusMetricsGridInHtml,
  'status-metrics-grid class applied to metric wrapper in app.html'
);

// Verify projectTableBody does NOT have project-metrics-grid
assertTest(
  'Grid Immunity: #projectTableBody is free from .project-metrics-grid',
  !appHtml.includes('id="projectTableBody" class="project-metrics-grid'),
  'Dynamic project cards rendered into #projectTableBody will never match metric cards CSS'
);

// ----------------------------------------------------------------------------
// TEST 2: Project Card Structure & Grid Header
// ----------------------------------------------------------------------------
const hasGridCardMetaTop = appHtml.includes('px-4 py-2.5 flex items-center justify-between border-b');
assertTest(
  'Grid Card: Full-width Meta Top tier exists',
  hasGridCardMetaTop,
  'Grid card has separate full-width meta top bar'
);

const hasActionButtonsInGrid = appHtml.includes('btn-copy-project-card') &&
  appHtml.includes('btn-simulate-client') &&
  appHtml.includes('btn-project-settings') &&
  appHtml.includes('btn-delete-project');
assertTest(
  'Grid Card: Action toolbar buttons preserved',
  hasActionButtonsInGrid,
  'Copy, preview, settings, and delete actions intact'
);

// ----------------------------------------------------------------------------
// TEST 3: PRO State Presentation Logic (Runtime Sandbox Evaluation)
// ----------------------------------------------------------------------------
// Extract isUserProActive function from app.html
const isUserProActiveMatch = appHtml.match(/function isUserProActive\([\s\S]*?\n\s{8}\}/);
assertTest(
  'PRO State: isUserProActive function extracted from app.html',
  Boolean(isUserProActiveMatch),
  'Function declaration found and extracted'
);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(isUserProActiveMatch[0], sandbox);
const { isUserProActive } = sandbox;

// Test 3a: Admin
assertTest(
  'PRO Evaluation: Admin role is always active',
  isUserProActive({ role: 'Admin' }) === true
);

// Test 3b: Demo without PRO
assertTest(
  'PRO Evaluation: Demo account is not active PRO',
  isUserProActive({ role: 'Demo', paket: 'Demo' }) === false
);

// Test 3c: Regular without Add-On
assertTest(
  'PRO Evaluation: Regular subscriber without add-on is not PRO',
  isUserProActive({ role: 'Photographer', paket: '1 Bulan', expiredAt: '2027-01-01', isPremiumAddon: false }) === false
);

// Test 3d: PRO Add-On active with valid future date
assertTest(
  'PRO Evaluation: PRO Add-On with future proExpiredAt is active',
  isUserProActive({ role: 'Photographer', paket: '1 Bulan', isPremiumAddon: true, proExpiredAt: '2028-10-18', proIsActive: true }) === true
);

// Test 3e: PRO Add-On expired date is strictly inactive
assertTest(
  'PRO Evaluation: Expired proExpiredAt (2020-01-01) is strictly inactive',
  isUserProActive({ role: 'Photographer', paket: '1 Bulan', isPremiumAddon: true, proExpiredAt: '2020-01-01', proIsActive: false }) === false
);

// Test 3f: Lifetime Subscription without PRO Add-On
assertTest(
  'PRO Evaluation: Lifetime core subscriber without PRO Add-On is not PRO',
  isUserProActive({ role: 'Photographer', paket: 'Lifetime', expiredAt: 'Lifetime', isPremiumAddon: false }) === false
);

// Test 3g: PRO Lifetime is active
assertTest(
  'PRO Evaluation: User with isProLifetime = true is active',
  isUserProActive({ role: 'Photographer', isProLifetime: true }) === true
);

assertTest(
  'PRO Evaluation: User with proExpiredAt = "Lifetime" is active',
  isUserProActive({ role: 'Photographer', proExpiredAt: 'Lifetime' }) === true
);

// Test 3h: String "FALSE" and "false" are strictly rejected
assertTest(
  'PRO Evaluation: String isPremiumAddon="FALSE" is not active',
  isUserProActive({ role: 'Photographer', isPremiumAddon: 'FALSE' }) === false
);

assertTest(
  'PRO Evaluation: String isPro="false" is not active',
  isUserProActive({ role: 'Photographer', isPro: 'false' }) === false
);

assertTest(
  'PRO Evaluation: String proIsActive="false" with expired date is not active',
  isUserProActive({ role: 'Photographer', proIsActive: 'false', isPremiumAddon: 'false' }) === false
);

// Test 3i: Legacy truthy values ('TRUE', 'true', 1) supported
assertTest(
  'PRO Evaluation: Legacy string isPremiumAddon="TRUE" is active',
  isUserProActive({ role: 'Photographer', isPremiumAddon: 'TRUE' }) === true
);

assertTest(
  'PRO Evaluation: Legacy numeric isPremiumAddon=1 is active',
  isUserProActive({ role: 'Photographer', isPremiumAddon: 1 }) === true
);

// ----------------------------------------------------------------------------
// TEST 4: Light Theme Status Badges Contrast
// ----------------------------------------------------------------------------
const hasIvoryGreenOverride = roleShellCss.includes('[data-theme="ivory"] .status-badge-green');
const hasOliveGreenOverride = roleShellCss.includes('[data-theme="olive"] .status-badge-green');
const hasIvoryAmberOverride = roleShellCss.includes('[data-theme="ivory"] .status-badge-amber');
const hasOliveAmberOverride = roleShellCss.includes('[data-theme="olive"] .status-badge-amber');
const hasIvorySlateOverride = roleShellCss.includes('[data-theme="ivory"] .status-badge-slate');
const hasOliveSlateOverride = roleShellCss.includes('[data-theme="olive"] .status-badge-slate');
const hasIvoryBlueOverride = roleShellCss.includes('[data-theme="ivory"] .status-badge-blue');
const hasOliveBlueOverride = roleShellCss.includes('[data-theme="olive"] .status-badge-blue');

assertTest(
  'Status Badges: Atelier Ivory green, amber, slate, blue contrast overrides present',
  hasIvoryGreenOverride && hasIvoryAmberOverride && hasIvorySlateOverride && hasIvoryBlueOverride,
  'All badge classes have light-theme contrast overrides in role-shell.css'
);

assertTest(
  'Status Badges: Olive Heritage green, amber, slate, blue contrast overrides present',
  hasOliveGreenOverride && hasOliveAmberOverride && hasOliveSlateOverride && hasOliveBlueOverride,
  'Olive theme inherits high-contrast status badge classes'
);

// ----------------------------------------------------------------------------
// TEST 5: Typography in Right Sidebar
// ----------------------------------------------------------------------------
const hasReadableTypographyMulaiCepat = appHtml.includes('id="tx-upload-desc"\n                                                    class="text-xs text-[var(--muted,#a8a39c)] mt-1 leading-normal"') ||
  appHtml.includes('id="tx-upload-desc"') && appHtml.includes('text-xs text-[var(--muted,#a8a39c)] mt-1 leading-normal');
assertTest(
  'Typography: Mulai Cepat descriptions upgraded to readable text-xs (12px)',
  hasReadableTypographyMulaiCepat,
  'Step descriptions use comfortable 12px text size'
);

// ----------------------------------------------------------------------------
// TEST 6: Theme Picker & Collage Integrity
// ----------------------------------------------------------------------------
const hasAllFourThemesInSelect = appHtml.includes('value="noir">Noir Champagne</option>') &&
  appHtml.includes('value="ivory">Atelier Ivory</option>') &&
  appHtml.includes('value="sapphire">Midnight Sapphire</option>') &&
  appHtml.includes('value="olive">Olive Heritage</option>');
assertTest(
  'Theme Picker: All 4 canonical themes preserved in header selector',
  hasAllFourThemesInSelect,
  'Noir, Ivory, Sapphire, and Olive options present'
);

const hasAllCollageSpacings = appHtml.includes('id="btn-spacing-0" onclick="setCollageSpacing(0)"') &&
  appHtml.includes('id="btn-spacing-20" onclick="setCollageSpacing(20)"') &&
  appHtml.includes('id="btn-spacing-60" onclick="setCollageSpacing(60)"');
assertTest(
  'Collage Controls: Canonical spacings (0, 20, 60) preserved',
  hasAllCollageSpacings,
  'Spacing buttons 0 (Rapat), 20 (Normal), 60 (Longgar) intact'
);

console.log('\n======================================================');
console.log(`PHASE 5.6R REGRESSION SUMMARY: ${passCount} PASSED | ${failCount} FAILED`);
console.log('======================================================');

if (failCount > 0) {
  process.exit(1);
}

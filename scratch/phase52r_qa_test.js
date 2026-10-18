const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

console.log('======================================================');
console.log('PHOTO SELECTION PHASE 5.2R — COMPREHENSIVE QA VERIFIER');
console.log('======================================================\n');

let passCount = 0;
let failCount = 0;

function assert(desc, condition, details = '') {
  if (condition) {
    console.log(`✅ [PASS] ${desc}${details ? ' — ' + details : ''}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${desc}${details ? ' — ' + details : ''}`);
    failCount++;
  }
}

// 1. Task A: Badge Selectors in role-shell.css
const roleShellCss = fs.readFileSync(path.join(repoRoot, 'assets/css/role-shell.css'), 'utf8');

assert(
  'Task A: Generic badge override removed',
  !roleShellCss.includes('#admin-view #badge-pro-status {\n    background: rgba(216, 186, 131, 0.12);')
);

assert(
  'Task A: PRO badge has champagne styling',
  roleShellCss.includes('#admin-view #badge-pro-status.bg-amber-50') &&
  roleShellCss.includes('color: #9b7a3e;') &&
  roleShellCss.includes('color: var(--color-champagne-light, #E6CF9F);')
);

assert(
  'Task A: Admin badge has distinct royal indigo styling',
  roleShellCss.includes('#admin-view #badge-pro-status.bg-indigo-50') &&
  roleShellCss.includes('color: #4338ca;') &&
  roleShellCss.includes('color: #a5b4fc;')
);

assert(
  'Task A: Regular paid subscription badge has distinct blue styling',
  roleShellCss.includes('#admin-view #badge-pro-status.bg-blue-50') &&
  roleShellCss.includes('color: #1d4ed8;') &&
  roleShellCss.includes('color: #93c5fd;')
);

assert(
  'Task A: Demo badge has neutral slate styling',
  roleShellCss.includes('#admin-view #badge-pro-status.bg-slate-100') &&
  roleShellCss.includes('color: #475569;') &&
  roleShellCss.includes('color: #94a3b8;')
);

// 2. Task B: Hero C Markup in index.html
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

assert(
  'Task B: Hero C photo cards have width and height attributes (zero CLS)',
  (indexHtml.match(/width="300" height="375"/g) || []).length === 4
);

assert(
  'Task B: Hero C photo cards have loading="eager" and decoding="async"',
  (indexHtml.match(/loading="eager" decoding="async"/g) || []).length === 4
);

assert(
  'Task B: Hero C uses external Unsplash images honestly documented',
  (indexHtml.match(/https:\/\/images\.unsplash\.com\/photo-/g) || []).length >= 4
);

// 3. Task C: CSS Cache and Load Order
const appHtml = fs.readFileSync(path.join(repoRoot, 'app.html'), 'utf8');
const appCoreCss = fs.readFileSync(path.join(repoRoot, 'assets/css/app-core.css'), 'utf8');

assert(
  'Task C: app.html links to app-core.css?v=5.2.1',
  appHtml.includes('<link rel="stylesheet" href="assets/css/app-core.css?v=5.2.1">')
);

assert(
  'Task C: app-core.css imports design-tokens.css and role-shell.css in correct order',
  appCoreCss.includes("@import url('./design-tokens.css');") &&
  appCoreCss.includes("@import url('./role-shell.css');") &&
  appCoreCss.indexOf('./design-tokens.css') < appCoreCss.indexOf('./role-shell.css')
);

// 4. Client Gallery Isolation & Non-Leakage
assert(
  'Client Isolation: role-shell.css rules strictly scoped to #admin-view or #mobile-sidebar',
  !roleShellCss.includes('#client-view') &&
  !roleShellCss.includes('.client-gallery') &&
  !roleShellCss.includes('.gallery-item')
);

// 5. JavaScript Integrity & isDemo Protection
assert(
  'JS Integrity: isDemo is defined in app.html line 6520',
  appHtml.includes('var isDemo = (!rawPaket || rawPaket === \'-\'')
);

assert(
  'JS Integrity: Script tag count in app.html strictly preserved (12 total)',
  (appHtml.match(/<script\b[^>]*>/gi) || []).length === 12
);

// 6. Language & i18n Integrity
assert(
  'i18n: Landing page bilingual dictionaries have all hero keys',
  indexHtml.includes("'hero.badge'") &&
  indexHtml.includes("'hero.mock_selected'") &&
  indexHtml.includes("'hero.mock_sorter'") &&
  indexHtml.includes("'hero.mock_pin'")
);

console.log(`\n======================================================`);
console.log(`VERIFICATION RESULT: ${passCount} PASSED | ${failCount} FAILED`);
console.log(`======================================================\n`);

if (failCount > 0) {
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve('app.html'), 'utf8');

const checks = [
  { name: 'btn-mode-selection id present', ok: html.includes('id="btn-mode-selection"') },
  { name: 'btn-mode-download id present', ok: html.includes('id="btn-mode-download"') },
  { name: 'processClientProjectData hides btnPilih', ok: html.includes('if (!clientState.isPilihActive)') && html.includes("if (btnPilih) btnPilih.classList.add('hidden');") },
  { name: 'processClientProjectData hides switchModeBtn', ok: html.includes('if (!clientState.isPilihActive || !clientState.isDownloadActive)') },
  { name: 'showClientModeSelection auto routes to download', ok: html.includes('if (clientState.isPilihActive === false && clientState.isDownloadActive === true)') && html.includes("selectClientMode('download');") },
  { name: 'selectClientMode selection guard', ok: html.includes("if (mode === 'selection' && clientState && clientState.isPilihActive === false)") },
  { name: 'toggleSelectAllClient includes originalUrl and id', ok: html.includes("id: imgData.id || '', name: imgData.name, folder: clientState.currentFolderName, url: origUrl, originalUrl: origUrl") },
  { name: 'downloadSelectedAsZip fallback img.url', ok: html.includes("var targetUrl = img.originalUrl || img.originalDownloadUrl || img.url;") },
  { name: 'universal download target _blank for mobile iOS/Android', ok: html.includes("a.target = '_blank';") },
  { name: '12 script tags invariant', ok: (html.match(/<script\b[^>]*>/gi) || []).length === 12 }
];

let allOk = true;
console.log('================================================================');
console.log('CLIENT MODE ROUTING & DOWNLOAD FIX VERIFICATION');
console.log('================================================================\n');

checks.forEach(c => {
  console.log((c.ok ? '✅ [PASS] ' : '❌ [FAIL] ') + c.name);
  if (!c.ok) allOk = false;
});

console.log('\n================================================================');
if (!allOk) {
  console.error('❌ SOME CHECKS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL 10 CLIENT MODE & DOWNLOAD CHECKS PASSED!');
  console.log('================================================================');
}


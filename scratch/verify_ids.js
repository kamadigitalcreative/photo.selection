const fs = require('fs');
const content = fs.readFileSync('app.html', 'utf8');

// List of critical element IDs in modalCreate:
const targetIds = [
  'modalCreate',
  'modalCreateContent',
  'lbl-create-title',
  'wizard-step-indicator',
  'btn-batal-create',
  'nav-step-1',
  'nav-step-2',
  'nav-step-3',
  'nav-step-4',
  'wizard-step-1',
  'wizard-step-2',
  'wizard-step-3',
  'wizard-step-4',
  // Step 1
  'tx-info-dasar',
  'lbl-p-name',
  'lbl-p-wa',
  'lbl-p-drive',
  'tx-gdrive-desc',
  // Step 2
  'lbl-p-layout',
  'tx-p-layout-desc',
  'lbl-p-layout-select',
  'p_client_layout',
  'lbl-p-pass',
  'p_pass',
  'lbl-p-music',
  'tx-p-music-up',
  'tx-p-music-link',
  'p_music_file',
  'p_music_url',
  // Step 3
  'tx-p-kuota',
  'lbl-p-max',
  'p_max',
  'p_unlimited',
  'lbl-p-extra',
  'p_extra_price',
  'tx-p-extra-desc',
  'lbl-p-deadline',
  'p_deadline',
  'tx-p-deadline-desc',
  // Step 4
  'tx-p-kontrol',
  'tx-p-menu',
  'tx-p-pilih',
  'tx-p-pilih-desc',
  'p_akses_pilih',
  'tx-p-down',
  'tx-p-down-desc',
  'p_akses_download',
  'tx-p-masa',
  'tx-p-masa-pilih',
  'p_durasi_pilih',
  'tx-p-masa-down',
  'p_durasi_download',
  'lbl-p-wm-title',
  'lbl-p-wm-desc',
  'p_watermark',
  'wrapper-multicategory',
  'lbl-p-cat-title',
  'lbl-p-cat-desc',
  'p_use_category',
  'category-builder',
  'category-list',
  'lbl-p-cat-add',
  // Footer
  'btnWizardPrev',
  'btnWizardCancel',
  'btnWizardNext',
  'btnWizardSubmit'
];

let missing = 0;
targetIds.forEach(id => {
  if (!content.includes(`id=\"${id}\"`) && !content.includes(`id='${id}'`)) {
    console.log('MISSING ID:', id);
    missing++;
  }
});

console.log(`Verification: ${targetIds.length - missing}/${targetIds.length} IDs present in app.html!`);


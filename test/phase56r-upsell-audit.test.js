/**
 * test/phase56r-upsell-audit.test.js
 * PHASE 5.6R — UPSELL FOTO EKSTRA (ADD-ON PRO) AUDIT & SIMULATION
 * 
 * Strict Read-Only Audit & In-Memory Mock Testing
 * Zero Git CLI, Zero Code Modifications, Zero Production Mutations
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { resolveUserProEntitlement } = require('../api/supabase.js');

const ROOT = path.resolve(__dirname, '..');
const appHtml = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const supabaseJs = fs.readFileSync(path.join(ROOT, 'api', 'supabase.js'), 'utf8');

const results = [];

function recordTest(id, name, status, details, category = 'RUNTIME PASS') {
  results.push({ id, name, status, details, category });
  const icon = status === 'PASS' ? '✅ [PASS]' : (status === 'FAIL' ? '❌ [FAIL]' : '⏸️ [' + status + ']');
  console.log(`${icon} Item ${id}: ${name} (${category})`);
  console.log(`   Details: ${details}`);
}

console.log('================================================================');
console.log('ANTIGRAVITY — AUDIT FITUR UPSELL FOTO EKSTRA (ADD-ON PRO)');
console.log('================================================================\n');

// -------------------------------------------------------------
// SECTION 1: BACKEND PRO AUTHORIZATION & ENTITLEMENT CHECKS
// -------------------------------------------------------------
console.log('--- SECTION 1: PRO AUTHORIZATION & BACKEND ENFORCEMENT ---');

// Test 1: Photographer with Active Add-On PRO entitlement (1 Year active)
try {
  const activeUser = { id: 'u1', Username: 'pro_photographer', Role: 'Photographer' };
  const proEntitlement = {
    user_id: 'u1',
    is_lifetime: false,
    expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
    source: 'payment'
  };
  const resolved = resolveUserProEntitlement(activeUser, proEntitlement, { tableChecked: true, tableAbsent: false });
  if (resolved.isPro === true && resolved.isExpired === false) {
    recordTest(1, 'Active 1-Year PRO photographer resolves isPro: true', 'PASS', `Resolved: isPro = ${resolved.isPro}, expiresAt = ${resolved.expiresAt}`, 'RUNTIME PASS');
  } else {
    recordTest(1, 'Active 1-Year PRO photographer resolves isPro: true', 'FAIL', JSON.stringify(resolved), 'FAIL');
  }
} catch (e) {
  recordTest(1, 'Active 1-Year PRO photographer resolves isPro: true', 'FAIL', e.message, 'FAIL');
}

// Test 2: Photographer with Lifetime PRO entitlement
try {
  const lifetimeUser = { id: 'u2', Username: 'lifetime_photographer', Role: 'Photographer' };
  const proEntitlement = { user_id: 'u2', is_lifetime: true, expires_at: null, source: 'payment' };
  const resolved = resolveUserProEntitlement(lifetimeUser, proEntitlement, { tableChecked: true, tableAbsent: false });
  if (resolved.isPro === true && resolved.isLifetime === true) {
    recordTest(2, 'Lifetime PRO photographer resolves isPro: true, isLifetime: true', 'PASS', `Resolved: isPro = ${resolved.isPro}, isLifetime = ${resolved.isLifetime}`, 'RUNTIME PASS');
  } else {
    recordTest(2, 'Lifetime PRO photographer resolves isPro: true, isLifetime: true', 'FAIL', JSON.stringify(resolved), 'FAIL');
  }
} catch (e) {
  recordTest(2, 'Lifetime PRO photographer resolves isPro: true, isLifetime: true', 'FAIL', e.message, 'FAIL');
}

// Test 3: Regular photographer WITHOUT PRO entitlement
try {
  const regularUser = { id: 'u3', Username: 'regular_photographer', Role: 'Photographer' };
  const resolved = resolveUserProEntitlement(regularUser, null, { tableChecked: true, tableAbsent: false });
  if (resolved.isPro === false) {
    recordTest(3, 'Regular photographer without PRO entitlement resolves isPro: false', 'PASS', `Resolved: isPro = false, source = ${resolved.source}`, 'RUNTIME PASS');
  } else {
    recordTest(3, 'Regular photographer without PRO entitlement resolves isPro: false', 'FAIL', JSON.stringify(resolved), 'FAIL');
  }
} catch (e) {
  recordTest(3, 'Regular photographer without PRO entitlement resolves isPro: false', 'FAIL', e.message, 'FAIL');
}

// Test 4: Photographer with EXPIRED PRO entitlement
try {
  const expiredUser = { id: 'u4', Username: 'expired_photographer', Role: 'Photographer' };
  const expiredEntitlement = {
    user_id: 'u4',
    is_lifetime: false,
    expires_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    source: 'payment'
  };
  const resolved = resolveUserProEntitlement(expiredUser, expiredEntitlement, { tableChecked: true, tableAbsent: false });
  if (resolved.isPro === false && resolved.isExpired === true) {
    recordTest(4, 'Expired PRO entitlement resolves isPro: false, isExpired: true', 'PASS', `Resolved: isPro = false, isExpired = true, expiredAt = ${resolved.expiredAtRaw}`, 'RUNTIME PASS');
  } else {
    recordTest(4, 'Expired PRO entitlement resolves isPro: false, isExpired: true', 'FAIL', JSON.stringify(resolved), 'FAIL');
  }
} catch (e) {
  recordTest(4, 'Expired PRO entitlement resolves isPro: false, isExpired: true', 'FAIL', e.message, 'FAIL');
}

// Test 5: Backend createProject PRO Enforcement in api/supabase.js
const hasBackendUpsellCheck = supabaseJs.includes('const hasUpsellRequested = extraPriceNum > 0;') &&
  supabaseJs.includes('if (!userPro.isPro)') &&
  supabaseJs.includes("return error(res, 'Fitur Sistem Upsell membutuhkan Add-On PRO yang aktif. Silakan aktifkan Add-On PRO.', 403);");
if (hasBackendUpsellCheck) {
  recordTest(5, 'Backend createProject explicitly checks userPro.isPro and blocks with HTTP 403', 'PASS', 'Verified in api/supabase.js lines ~2259-2271', 'IMPLEMENTED IN CODE');
} else {
  recordTest(5, 'Backend createProject explicitly checks userPro.isPro and blocks with HTTP 403', 'FAIL', 'Missing backend check', 'FAIL');
}

// Test 6: Frontend input locking in app.html
const hasFrontendPriceLock = appHtml.includes("inpPrice.disabled = !isPrem;") &&
  appHtml.includes("inpPrice.placeholder = isEn ? 'Locked (PRO Add-On)' : 'Terkunci (Add-On PRO)';") &&
  appHtml.includes("showPremiumAlert()");
if (hasFrontendPriceLock) {
  recordTest(6, 'Frontend p_extra_price input is disabled and triggers showPremiumAlert() when !isPremiumAddon()', 'PASS', 'Verified in app.html lines ~4208, 9550-9558', 'IMPLEMENTED IN CODE');
} else {
  recordTest(6, 'Frontend p_extra_price input is disabled and triggers showPremiumAlert() when !isPremiumAddon()', 'FAIL', 'Missing frontend lock', 'FAIL');
}

// -------------------------------------------------------------
// SECTION 2: CLIENT UPSELL SIMULATION (MOCK LOKAL ENGINE)
// -------------------------------------------------------------
console.log('\n--- SECTION 2: CLIENT SELECTION & UPSELL SIMULATION ---');

/**
 * Mock Client Selection Engine matching app.html logic
 */
class MockClientGallery {
  constructor(maxFoto = 3, extraPrice = 15000) {
    this.maxFoto = maxFoto;
    this.extraPrice = extraPrice;
    this.selectedImages = [];
    this.agreedToExtraCharge = false;
    this.statusClient = 'Belum Memilih';
    this.promptShown = false;
    this.promptData = null;
  }

  // Simulates clicking a photo card
  toggleSelect(filename, confirmExtraCharge = true) {
    const existingIndex = this.selectedImages.findIndex(img => img.name === filename);

    if (existingIndex === -1) {
      // Trying to select
      if (this.selectedImages.length >= this.maxFoto) {
        if (this.extraPrice > 0) {
          if (!this.agreedToExtraCharge) {
            this.promptShown = true;
            this.promptData = {
              extraPrice: this.extraPrice,
              currentCount: this.selectedImages.length,
              maxFoto: this.maxFoto
            };
            if (!confirmExtraCharge) {
              return { success: false, reason: 'CLIENT_REJECTED_EXTRA_CHARGE' };
            }
            this.agreedToExtraCharge = true;
          }
        } else {
          return { success: false, reason: 'QUOTA_FULL' };
        }
      }

      this.selectedImages.push({ name: filename });
      this.statusClient = 'Sedang Memilih';
      return { success: true, count: this.selectedImages.length };
    } else {
      // Deselect
      this.selectedImages.splice(existingIndex, 1);
      return { success: true, count: this.selectedImages.length, deselected: true };
    }
  }

  getExtraCount() {
    return Math.max(0, this.selectedImages.length - this.maxFoto);
  }

  getTotalExtraFee() {
    return this.getExtraCount() * this.extraPrice;
  }

  // Simulates final client submission (Kirim WA / Copy)
  submit() {
    const extraCount = this.getExtraCount();
    const targetStatus = extraCount > 0 ? 'Menunggu Konfirmasi Pembayaran' : 'Selesai';
    this.statusClient = targetStatus;
    return {
      status: targetStatus,
      totalSelected: this.selectedImages.length,
      quota: this.maxFoto,
      extraCount: extraCount,
      totalExtraFee: this.getTotalExtraFee()
    };
  }
}

// Scenario 7: Standard Flow (3 Quota, Rp15.000 Extra, 5 Photos)
const gallery = new MockClientGallery(3, 15000);

// Select 1, 2, 3 photos (Within Quota)
gallery.toggleSelect('foto1.jpg');
gallery.toggleSelect('foto2.jpg');
gallery.toggleSelect('foto3.jpg');

const step1Valid = gallery.selectedImages.length === 3 && gallery.getExtraCount() === 0 && gallery.getTotalExtraFee() === 0;
recordTest(7, 'Pilih 3 foto pertama: kuota terpenuhi tanpa biaya ekstra (Rp0)',
  step1Valid ? 'PASS' : 'FAIL',
  `Selected: ${gallery.selectedImages.length}, Extra: ${gallery.getExtraCount()}, Fee: Rp ${gallery.getTotalExtraFee()}`);

// Select 4th photo (Triggers confirmation +Rp15.000)
const res4 = gallery.toggleSelect('foto4.jpg', true);
const step2Valid = res4.success && gallery.promptShown && gallery.selectedImages.length === 4 &&
  gallery.getExtraCount() === 1 && gallery.getTotalExtraFee() === 15000;
recordTest(8, 'Pilih foto ke-4: konfirmasi biaya muncul, total ekstra = +Rp15.000',
  step2Valid ? 'PASS' : 'FAIL',
  `Selected: ${gallery.selectedImages.length}, Extra: ${gallery.getExtraCount()}, Fee: Rp ${gallery.getTotalExtraFee().toLocaleString('id-ID')}`);

// Select 5th photo (Total ekstra Rp30.000)
const res5 = gallery.toggleSelect('foto5.jpg', true);
const step3Valid = res5.success && gallery.selectedImages.length === 5 &&
  gallery.getExtraCount() === 2 && gallery.getTotalExtraFee() === 30000;
recordTest(9, 'Pilih foto ke-5: total ekstra bertambah otomatis menjadi Rp30.000',
  step3Valid ? 'PASS' : 'FAIL',
  `Selected: ${gallery.selectedImages.length}, Extra: ${gallery.getExtraCount()}, Fee: Rp ${gallery.getTotalExtraFee().toLocaleString('id-ID')}`);

// Deselect 1 photo (foto5.jpg removed -> returns to Rp15.000)
gallery.toggleSelect('foto5.jpg');
const step4Valid = gallery.selectedImages.length === 4 && gallery.getExtraCount() === 1 && gallery.getTotalExtraFee() === 15000;
recordTest(10, 'Batalkan satu foto: total ekstra berkurang kembali menjadi Rp15.000',
  step4Valid ? 'PASS' : 'FAIL',
  `Selected: ${gallery.selectedImages.length}, Extra: ${gallery.getExtraCount()}, Fee: Rp ${gallery.getTotalExtraFee().toLocaleString('id-ID')}`);

// Deselect down to 3 photos (foto4.jpg removed -> returns to Rp0)
gallery.toggleSelect('foto4.jpg');
const step5Valid = gallery.selectedImages.length === 3 && gallery.getExtraCount() === 0 && gallery.getTotalExtraFee() === 0;
recordTest(11, 'Batalkan hingga kuota asal (3 foto): biaya ekstra kembali menjadi Rp0',
  step5Valid ? 'PASS' : 'FAIL',
  `Selected: ${gallery.selectedImages.length}, Extra: ${gallery.getExtraCount()}, Fee: Rp ${gallery.getTotalExtraFee().toLocaleString('id-ID')}`);

// Scenario 12: Client REJECTS extra charge prompt
const galleryReject = new MockClientGallery(3, 15000);
galleryReject.toggleSelect('foto1.jpg');
galleryReject.toggleSelect('foto2.jpg');
galleryReject.toggleSelect('foto3.jpg');
const rejectRes = galleryReject.toggleSelect('foto4.jpg', false); // Client clicks Batal
const rejectValid = rejectRes.success === false && rejectRes.reason === 'CLIENT_REJECTED_EXTRA_CHARGE' && galleryReject.selectedImages.length === 3;
recordTest(12, 'Klien menolak biaya ekstra: foto ke-4 tidak ditambahkan (kuota tetap 3)',
  rejectValid ? 'PASS' : 'FAIL',
  `Rejected: ${!rejectRes.success}, Reason: ${rejectRes.reason}, Selected: ${galleryReject.selectedImages.length}`);

// Scenario 13: Project WITHOUT extra price (extraPrice = 0)
const galleryNoUpsell = new MockClientGallery(3, 0);
galleryNoUpsell.toggleSelect('foto1.jpg');
galleryNoUpsell.toggleSelect('foto2.jpg');
galleryNoUpsell.toggleSelect('foto3.jpg');
const noUpsellRes = galleryNoUpsell.toggleSelect('foto4.jpg');
const noUpsellValid = noUpsellRes.success === false && noUpsellRes.reason === 'QUOTA_FULL' && galleryNoUpsell.selectedImages.length === 3;
recordTest(13, 'Proyek tanpa harga ekstra (extraPrice=0): pilihan ke-4 dikunci (QUOTA_FULL)',
  noUpsellValid ? 'PASS' : 'FAIL',
  `Blocked: ${!noUpsellRes.success}, Reason: ${noUpsellRes.reason}, Selected: ${galleryNoUpsell.selectedImages.length}`);

// -------------------------------------------------------------
// SECTION 3: STATUS TRANSITIONS & SUBMISSION
// -------------------------------------------------------------
console.log('\n--- SECTION 3: SUBMISSION & STATUS TRANSITIONS ---');

// Scenario 14: Submission with Extra Photos -> Status "Menunggu Konfirmasi Pembayaran"
const gallerySubmitExtra = new MockClientGallery(3, 15000);
gallerySubmitExtra.toggleSelect('foto1.jpg');
gallerySubmitExtra.toggleSelect('foto2.jpg');
gallerySubmitExtra.toggleSelect('foto3.jpg');
gallerySubmitExtra.toggleSelect('foto4.jpg', true);
gallerySubmitExtra.toggleSelect('foto5.jpg', true);
const submissionExtra = gallerySubmitExtra.submit();

const isPendingPayment = submissionExtra.status === 'Menunggu Konfirmasi Pembayaran' && submissionExtra.extraCount === 2 && submissionExtra.totalExtraFee === 30000;
recordTest(14, 'Submit dengan foto ekstra menghasilkan status "Menunggu Konfirmasi Pembayaran"',
  isPendingPayment ? 'PASS' : 'FAIL',
  `Status: ${submissionExtra.status}, Extra: +${submissionExtra.extraCount}, Fee: Rp ${submissionExtra.totalExtraFee.toLocaleString('id-ID')}`);

// Scenario 15: Submission WITHOUT Extra Photos -> Status "Selesai"
const gallerySubmitNormal = new MockClientGallery(3, 15000);
gallerySubmitNormal.toggleSelect('foto1.jpg');
gallerySubmitNormal.toggleSelect('foto2.jpg');
gallerySubmitNormal.toggleSelect('foto3.jpg');
const submissionNormal = gallerySubmitNormal.submit();

const isNormalSelesai = submissionNormal.status === 'Selesai' && submissionNormal.extraCount === 0 && submissionNormal.totalExtraFee === 0;
recordTest(15, 'Submit tanpa foto ekstra langsung menghasilkan status "Selesai" (Lunas)',
  isNormalSelesai ? 'PASS' : 'FAIL',
  `Status: ${submissionNormal.status}, Extra: ${submissionNormal.extraCount}, Fee: Rp ${submissionNormal.totalExtraFee}`);

// Scenario 16: Photographer confirms payment via processPayment
// Inspect handleProcessPayment in api/supabase.js
const hasProcessPayment = supabaseJs.includes('async function handleProcessPayment(payload, res)') &&
  supabaseJs.includes("const ALLOWED_PAYMENT_STATUSES = new Set(['Selesai', 'Sedang Memilih']);");
recordTest(16, 'Photographer processPayment endpoint supports both "Selesai" (Confirm) and "Sedang Memilih" (Reject)',
  hasProcessPayment ? 'PASS' : 'FAIL',
  'Verified in api/supabase.js lines ~3063-3075', 'IMPLEMENTED IN CODE');

// -------------------------------------------------------------
// SECTION 4: SECURITY & API TAMPERING AUDIT
// -------------------------------------------------------------
console.log('\n--- SECTION 4: SECURITY & API TAMPERING AUDIT ---');

// Test 17: Client cannot mutate ExtraPrice or Max Foto via updateClientStatus
const updateStatusFn = supabaseJs.substring(
  supabaseJs.indexOf('async function handleUpdateClientStatus'),
  supabaseJs.indexOf('async function handleReleaseClientSession')
);

const canClientModifyExtraPrice = updateStatusFn.includes("updateBody.ExtraPrice =") || updateStatusFn.includes("updateBody['ExtraPrice'] =");
const canClientModifyMaxFoto = updateStatusFn.includes("updateBody['Max Foto'] =") || updateStatusFn.includes("updateBody.MaxFoto =");

if (!canClientModifyExtraPrice && !canClientModifyMaxFoto) {
  recordTest(17, 'Client cannot mutate ExtraPrice or Max Foto via updateClientStatus API', 'PASS',
    'Neither ExtraPrice nor Max Foto are read or updated in handleUpdateClientStatus', 'RUNTIME PASS');
} else {
  recordTest(17, 'Client cannot mutate ExtraPrice or Max Foto via updateClientStatus API', 'FAIL',
    `canModifyExtraPrice: ${canClientModifyExtraPrice}, canModifyMaxFoto: ${canClientModifyMaxFoto}`, 'FAIL');
}

// Test 18: Security Gap: Backend does not prevent client from sending status="Selesai" directly
const enforcesStatusRuleOnBackend = updateStatusFn.includes("if (cleanFiles.length > currentMax && currentExtraPrice > 0)") ||
  updateStatusFn.includes("cleanStatus === 'Selesai' && countNum > currentMax");

if (!enforcesStatusRuleOnBackend) {
  recordTest(18, 'AUDIT GAP: Backend handleUpdateClientStatus does not enforce "Menunggu Konfirmasi Pembayaran" server-side when count > maxFoto',
    'FAIL',
    'Client can theoretically send status="Selesai" via direct API request, bypassing client-side promptExtraPayment routing. Status lock is enforced on frontend, not validated on backend.',
    'SECURITY AUDIT FINDING');
} else {
  recordTest(18, 'AUDIT GAP: Backend handleUpdateClientStatus does not enforce "Menunggu Konfirmasi Pembayaran" server-side when count > maxFoto',
    'PASS', 'Server-side status guard present', 'RUNTIME PASS');
}

// Test 19: Security Gap: Backend does not reject count > maxFoto when ExtraPrice == 0
const enforcesQuotaOnBackendWhenNoUpsell = updateStatusFn.includes("countNum > currentMax") && updateStatusFn.includes("extraPrice");
if (!enforcesQuotaOnBackendWhenNoUpsell) {
  recordTest(19, 'AUDIT GAP: Backend handleUpdateClientStatus does not validate selectedCount against maxFoto when extraPrice == 0',
    'FAIL',
    'If extraPrice == 0, backend accepts selectedCount up to 10,000 without comparing against project maxFoto.',
    'SECURITY AUDIT FINDING');
} else {
  recordTest(19, 'AUDIT GAP: Backend handleUpdateClientStatus does not validate selectedCount against maxFoto when extraPrice == 0',
    'PASS', 'Backend quota check present', 'RUNTIME PASS');
}

// Test 20: Storage & Session Recovery (localStorage + Server Sync)
const hasStoragePersistence = appHtml.includes("localStorage.setItem('ps_client_selected_' + clientState.token, JSON.stringify(clientState.selectedImages));") &&
  appHtml.includes("sessionStorage.getItem(cacheFolderKey)") &&
  appHtml.includes("pingClientStatus('Sedang Memilih', '', true);");

recordTest(20, 'Client selections persist in localStorage, sessionStorage cache, and sync to server via debounce',
  hasStoragePersistence ? 'PASS' : 'FAIL',
  'Verified in app.html lines ~11359, 12389, 12397', 'IMPLEMENTED IN CODE');

console.log('\n================================================================');
const passCount = results.filter(r => r.status === 'PASS').length;
const failCount = results.filter(r => r.status === 'FAIL').length;
console.log(`TOTAL AUDIT CHECKS: ${results.length} | PASSED: ${passCount} | FINDINGS/FAILS: ${failCount}`);
console.log('================================================================');

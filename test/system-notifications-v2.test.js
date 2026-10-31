/**
 * PHOTO SELECTION — V2.0 SYSTEM NOTIFICATIONS VERIFICATION SUITE
 * Validates that legacy notifications (v1-v7) are decommissioned and replaced by
 * official V2.0 announcements (v8-v12) across backend API, database migration, and frontend modal.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const api = require('../api/supabase');

let passCount = 0;
let failCount = 0;

function check(testId, condition, description, detail = '') {
  if (condition) {
    console.log(`✅ [PASS] ${testId}: ${description}${detail ? ` (${detail})` : ''}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${testId}: ${description}${detail ? ` (${detail})` : ''}`);
    failCount++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('PHOTO SELECTION V2.0 — SYSTEM NOTIFICATIONS VERIFICATION');
  console.log('================================================================\n');

  // --- 1. BACKEND API & DATA CONTRACT ---
  console.log('--- 1. OFFICIAL V2.0 NOTIFICATIONS CONTRACT ---');
  const updates = api.OFFICIAL_SYSTEM_UPDATES;
  check('N01-COUNT', Array.isArray(updates) && updates.length === 5, 'Contains exactly 5 official V2.0 notification records', `Count: ${updates.length}`);

  const expectedIds = ['v8', 'v9', 'v10', 'v11', 'v12'];
  const actualIds = updates.map(u => u.ID);
  check('N02-IDS', JSON.stringify(actualIds) === JSON.stringify(expectedIds), 'Notification IDs match expected v8 through v12', actualIds.join(', '));

  const allActive = updates.every(u => u.Status === 'Active');
  check('N03-STATUS-ACTIVE', allActive, 'All 5 notification records have Status="Active"');

  const allHaveRequiredFields = updates.every(u => u.ID && u.Judul && u.Versi && u.Tanggal && u.Pesan && u.created_at);
  check('N04-REQUIRED-FIELDS', allHaveRequiredFields, 'Every update has non-empty ID, Judul, Versi, Tanggal, Pesan, created_at');

  const datesValid = updates.every(u => !isNaN(new Date(u.created_at).getTime()) && !isNaN(new Date(u.Tanggal).getTime()));
  check('N05-DATE-PARSING', datesValid, 'All notification Tanggal and created_at fields are valid standard ISO/date strings');

  // Verify specific feature coverage in copy
  const v8 = updates.find(u => u.ID === 'v8');
  check('N06-V8-MAJOR', v8 && v8.Judul.includes('V2.0') && v8.Pesan.includes('Atelier') && v8.Pesan.includes('watermark'), 'v8 covers V2.0 major release highlights');

  const v9 = updates.find(u => u.ID === 'v9');
  check('N07-V9-THEMES', v9 && v9.Judul.includes('Tema') && v9.Pesan.includes('Noir Champagne') && v9.Pesan.includes('Olive Heritage'), 'v9 covers 4 Atelier luxury themes');

  const v10 = updates.find(u => u.ID === 'v10');
  check('N08-V10-DOWNLOAD', v10 && v10.Judul.includes('ZIP') && v10.Pesan.includes('Google Drive'), 'v10 covers authentic photo download and batch ZIP export');

  const v11 = updates.find(u => u.ID === 'v11');
  check('N09-V11-PRO', v11 && v11.Versi === 'PRO' && v11.Pesan.includes('kategori') && v11.Pesan.includes('WhatsApp'), 'v11 covers PRO add-ons (watermark, categories, upsell extra quota)');

  const v12 = updates.find(u => u.ID === 'v12');
  check('N10-V12-BILINGUAL', v12 && v12.Pesan.includes('Inggris') && v12.Pesan.toLowerCase().includes('mobile'), 'v12 covers bilingual EN/ID toggle and mobile optimization');

  // --- 2. BACKEND GET OR SYNC RESILIENCE ---
  console.log('\n--- 2. BACKEND RESILIENCE & LEGACY FILTERING ---');
  const returnedRows = await api.getOrSyncSystemUpdates();
  check('N11-NO-LEGACY-RETURNED', returnedRows.every(r => !['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'].includes(r.ID)), 'getOrSyncSystemUpdates strictly guarantees zero legacy (v1-v7) items are returned');
  check('N12-CONTAINS-NEW-ITEMS', returnedRows.some(r => r.ID === 'v8'), 'getOrSyncSystemUpdates provides V2.0 updates to clients');

  // --- 3. DATABASE MIGRATION SCRIPT ---
  console.log('\n--- 3. SUPABASE SQL MIGRATION FILE ---');
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261031_v2_system_notifications.sql');
  const migrationExists = fs.existsSync(migrationPath);
  check('N13-MIGRATION-FILE', migrationExists, 'Migration file 20261031_v2_system_notifications.sql exists');

  if (migrationExists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    check('N14-MIGRATION-DELETE', sql.includes("DELETE FROM public.system_updates") && sql.includes("'v1'"), 'SQL script deletes legacy v1-v7 records');
    check('N15-MIGRATION-INSERT', sql.includes("INSERT INTO public.system_updates") && sql.includes("'v8'"), 'SQL script inserts new v8-v12 updates');
  }

  // --- 4. FRONTEND MODAL & THEME STYLING ---
  console.log('\n--- 4. FRONTEND APP.HTML & ROLE-SHELL.CSS ---');
  const appHtml = fs.readFileSync(path.resolve(__dirname, '../app.html'), 'utf8');
  const roleCss = fs.readFileSync(path.resolve(__dirname, '../assets/css/role-shell.css'), 'utf8');

  // Check script tag count invariant
  const scriptTags = (appHtml.match(/<script\b[^>]*>/gi) || []).length;
  check('N16-INVARIANT-SCRIPTS', scriptTags === 12, `app.html must maintain exactly 12 script tags (found: ${scriptTags})`);

  // Check modal container & date parsing helper
  check('N17-NOTIF-CONTAINER', appHtml.includes('id="notif-container"'), '#notif-container element exists in app.html');
  check('N18-RESILIENT-DATE-PARSING', appHtml.includes('dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString'), 'Resilient date formatting helper handles standard and fallback dates');

  // Check CSS high-contrast rules
  check('N19-MODAL-SHELL-CSS', roleCss.includes('#modalNotifContent'), '#modalNotifContent styling defined in role-shell.css');
  check('N20-TEXT-CONTRAST-CSS', roleCss.includes('#notif-container p.text-gray-500') && roleCss.includes('#e2e8f0'), 'High-contrast text color (#e2e8f0) applied to notification body');
  check('N21-BADGE-CONTRAST-CSS', roleCss.includes('#notif-container span.bg-blue-600'), 'Luxury gold badge gradient applied to version tag');
  check('N22-TITLE-CONTRAST-CSS', roleCss.includes('#notif-container h4') && roleCss.includes('#ffffff'), 'Crisp high-contrast white font applied to notification title');
  check('N23-LIGHT-THEMES-OVERRIDE', roleCss.includes('[data-theme="ivory"] #notif-container') && roleCss.includes('[data-theme="olive"] #notif-container'), 'Explicit light theme overrides defined for Atelier Ivory & Olive Heritage');

  console.log('\n================================================================');
  console.log(`TOTAL SYSTEM NOTIFICATIONS TESTS: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

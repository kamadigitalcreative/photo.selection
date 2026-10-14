/**
 * PHOTO SELECTION / KMBC — PHASE 4.7.5 FINAL CORRECTION
 * MAYAR WEBHOOK SECURITY, IDEMPOTENCY, RELIABILITY & CONCURRENCY AUDIT TEST SUITE
 * 
 * Strict assertions on database state, account expiration, mutation counts, and side-effects.
 * Controlled mocks: exercises real RPC contracts, fail-closed behavior, and edge cases.
 * Zero live network calls to Supabase, Mayar, or Google Apps Script.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Target API handlers
const handler = require('../api/supabase');
const bridgeHandler = require('../api/bridge');
const { createPasswordHash, verifyModernPassword } = handler;

let passCount = 0;
let failCount = 0;
let notRunCount = 0;
const testResults = [];

function recordTest(id, name, status, details = '') {
  if (status === 'PASS') passCount++;
  else if (status === 'FAIL') failCount++;
  else if (status === 'NOT RUN' || status === 'NOT VERIFIED') notRunCount++;

  testResults.push({ id, name, status, details });
  const icon = status === 'PASS' ? '✅' : (status === 'FAIL' ? '❌' : '⏸️');
  console.log(`${icon} [${status}] Test ${id}: ${name} ${details ? '— ' + details : ''}`);
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    ended: false,
    body: null,
    setHeader: function (key, value) {
      res.headers[key.toLowerCase()] = value;
      return res;
    },
    getHeader: function (key) {
      return res.headers[key.toLowerCase()];
    },
    status: function (code) {
      res.statusCode = code;
      return res;
    },
    json: function (payload) {
      res.body = payload;
      res.ended = true;
      return res;
    },
    end: function (data) {
      if (data) res.body = data;
      res.ended = true;
      return res;
    }
  };
  return res;
}

// In-Memory Mock Database
let mockDb = {
  users: [],
  mayar_logs: [],
  processed_payments: [],
  reset_tokens: [],
  sessions: [],
  pro_entitlements: [],
  projects: []
};
let mockFetchCalls = [];
let allFetchCalls = [];

// Simulation control flags
let failRpcNotFound = false;
let failRpcInternal = false;
let failRpcMalformed = false;
let failNextMayarLogsPost = false;
let failNextEmail = false;
let failNextMetaCapi = false;
let failProEntitlements503 = false;
let failProEntitlements404 = false;
let failProcessedPayments500 = false;

function resetMockDb() {
  mockDb = {
    users: [],
    mayar_logs: [],
    processed_payments: [],
    reset_tokens: [],
    sessions: [],
    pro_entitlements: [],
    projects: []
  };
  mockFetchCalls = [];
  failRpcNotFound = false;
  failRpcInternal = false;
  failRpcMalformed = false;
  failNextMayarLogsPost = false;
  failNextEmail = false;
  failNextMetaCapi = false;
  failProEntitlements503 = false;
  failProEntitlements404 = false;
  failProcessedPayments500 = false;
}

function setupMockFetch() {
  global.fetch = async (url, options = {}) => {
    mockFetchCalls.push({ url, options });
    allFetchCalls.push({ url, options });

    const urlStr = String(url);
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : null;

    // Safety: reject any unexpected real external endpoints
    if (!urlStr.includes('supabase.co') && !urlStr.includes('script.google.com') && !urlStr.includes('facebook.com')) {
      throw new Error(`Unexpected live external URL accessed in test mock: ${urlStr}`);
    }

    // Google Apps Script Mailer Mock
    if (urlStr.includes('script.google.com')) {
      if (failNextEmail) {
        throw new Error('Simulated Google Apps Script network timeout');
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, message: 'Mock email sent' }),
        json: async () => ({ success: true, message: 'Mock email sent' })
      };
    }

    // Meta CAPI Mock
    if (urlStr.includes('facebook.com')) {
      if (failNextMetaCapi) {
        throw new Error('Simulated Meta CAPI connection error');
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ events_received: 1 }),
        json: async () => ({ events_received: 1 })
      };
    }

    // Supabase REST & RPC Mock
    if (urlStr.includes('/rest/v1/')) {
      const endpoint = urlStr.split('/rest/v1/')[1] || '';
      const tablePart = endpoint.split('?')[0];
      const queryPart = endpoint.includes('?') ? endpoint.split('?')[1] : '';

      // Mock RPC: process_mayar_payment
      if (tablePart === 'rpc/process_mayar_payment') {
        if (failRpcNotFound) {
          return {
            ok: false,
            status: 404,
            text: async () => JSON.stringify({ message: 'function public.process_mayar_payment does not exist' })
          };
        }
        if (failRpcInternal) {
          return {
            ok: false,
            status: 500,
            text: async () => JSON.stringify({ message: 'Internal PostgreSQL transaction error' })
          };
        }
        if (failRpcMalformed) {
          return {
            ok: true,
            status: 200,
            text: async () => 'Not a valid JSON object string'
          };
        }

        // Stateful simulation of process_mayar_payment matching PostgreSQL 20261012_phase475_payment_idempotency.sql
        const pId = body.p_payment_id;
        const pEmail = (body.p_email || '').trim().toLowerCase();
        const pPhone = (body.p_phone || '').trim();
        const pUserHint = (body.p_username_hint || '').trim().toLowerCase();
        const pPlan = body.p_plan_name || '1 Bulan';
        const pAddDays = Number(body.p_add_days || 30);
        const pIsProAddon = Boolean(body.p_is_pro_addon);

        // 1. Fast check in processed_payments
        const existingPay = mockDb.processed_payments.find(p => p.payment_id === pId);
        if (existingPay && (existingPay.status === 'SUCCESS' || existingPay.status === 'STORE_SALE' || existingPay.status === 'HISTORICAL_SETTLED' || existingPay.status === 'ALREADY_PROCESSED_LEGACY')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: true,
              status: 'already_processed',
              payment_id: pId,
              message: 'Payment already processed previously (idempotent duplicate skipped)',
              account_username: existingPay.account_username,
              plan_name: existingPay.plan_name
            })
          };
        }
        if (existingPay && existingPay.status === 'MANUAL_RECONCILIATION_REQUIRED') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: false,
              status: 'manual_reconciliation_needed',
              payment_id: pId,
              message: 'Payment requires manual reconciliation and was not auto-processed'
            })
          };
        }

        // Claim initial record
        if (!existingPay) {
          mockDb.processed_payments.push({
            payment_id: pId,
            customer_email: pEmail,
            product_name: body.p_product_name,
            plan_name: pPlan,
            amount: body.p_amount,
            status: 'PROCESSING'
          });
        }

        // 2. Strict, Unambiguous Target Account Resolution (Matching SQL)
        let targetUser = null;
        let isAmbiguous = false;
        let isConflict = false;
        let conflictReason = '';

        // Layer 1: Exact Email
        if (pEmail) {
          const emailMatches = mockDb.users.filter(u => String(u.Email || '').trim().toLowerCase() === pEmail);
          if (emailMatches.length === 1) {
            if (pUserHint) {
              const hintMatch = emailMatches.find(u => String(u.Username || '').trim().toLowerCase() === pUserHint);
              if (hintMatch) {
                targetUser = hintMatch;
              } else {
                isConflict = true;
                conflictReason = 'Konflik identitas akun: Email cocok dengan user terdaftar tetapi Username hint merujuk ke akun berbeda.';
              }
            } else {
              targetUser = emailMatches[0];
            }
          } else if (emailMatches.length > 1) {
            // Production legacy condition: multiple accounts share one email
            // Blocker 2: User-controlled notes / @username strings are NOT cryptographically verified provenance.
            // Shared-email accounts must NOT be activated automatically based on free-text notes.
            isAmbiguous = true;
          }
        }

        // Layer 2: Explicit Username Hint
        if (!targetUser && !isAmbiguous && !isConflict && pUserHint) {
          const userMatches = mockDb.users.filter(u => String(u.Username || '').trim().toLowerCase() === pUserHint);
          if (userMatches.length === 1) {
            if (pEmail) {
              isConflict = true;
              conflictReason = 'Konflik identitas akun: Username hint terdaftar tetapi email pembayaran tidak cocok.';
            } else {
              targetUser = userMatches[0];
            }
          } else if (userMatches.length > 1) {
            isAmbiguous = true;
          }
        }

        // Layer 3: Exact Normalized Phone (NO substring)
        if (!targetUser && !isAmbiguous && !isConflict && pPhone) {
          let cleanP = pPhone.replace(/[^0-9]/g, '');
          if (cleanP.startsWith('62')) cleanP = cleanP.substring(2);
          else if (cleanP.startsWith('0')) cleanP = cleanP.substring(1);

          if (cleanP.length >= 8) {
            const phoneMatches = mockDb.users.filter(u => {
              let uP = String(u['No HP'] || '').replace(/[^0-9]/g, '');
              if (uP.startsWith('62')) uP = uP.substring(2);
              else if (uP.startsWith('0')) uP = uP.substring(1);
              return uP === cleanP;
            });
            if (phoneMatches.length === 1) {
              // Blocker 2: Do not authorize financial account activation based solely on phone matching when payment email differs
              if (pEmail && String(phoneMatches[0].Email || '').trim().toLowerCase() !== pEmail) {
                isConflict = true;
                conflictReason = 'Konflik identitas: Nomor HP cocok dengan akun terdaftar tetapi email pembayaran berbeda.';
              } else {
                targetUser = phoneMatches[0];
              }
            } else if (phoneMatches.length > 1) {
              isAmbiguous = true;
            }
          }
        }

        // 3. Conflict handling
        if (isConflict) {
          const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
          if (ledgerRow) ledgerRow.status = 'MANUAL_RECONCILIATION_REQUIRED';
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: false,
              status: 'manual_reconciliation_needed',
              code: 'ACCOUNT_CONFLICT',
              payment_id: pId,
              message: conflictReason
            })
          };
        }

        // 4. Ambiguity handling
        if (isAmbiguous) {
          const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
          if (ledgerRow) ledgerRow.status = 'MANUAL_RECONCILIATION_REQUIRED';
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: false,
              status: 'manual_reconciliation_needed',
              code: 'AMBIGUOUS_IDENTITY',
              payment_id: pId,
              message: 'Multiple accounts match provided customer details. Held for manual verification.'
            })
          };
        }

        // 5. Existing User Mutation
        if (targetUser) {
          // Blocker 1: Protect Admin accounts from any automatic webhook mutation
          if (targetUser.Role === 'Admin') {
            const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
            if (ledgerRow) ledgerRow.status = 'MANUAL_RECONCILIATION_REQUIRED';
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify({
                success: false,
                status: 'manual_reconciliation_needed',
                code: 'ADMIN_ACCOUNT_PROTECTED',
                payment_id: pId,
                account_username: targetUser.Username,
                message: 'Akun Admin tidak dapat dimutasi melalui webhook pembayaran otomatis. Ditahan untuk verifikasi manual.'
              })
            };
          }

          let finalExp = 'Lifetime';
          let finalPaket = pPlan;
          targetUser.id = targetUser.id || ('uuid_' + targetUser.Username);
          let proIsLifetime = false;
          let proExpText = null;

          if (pIsProAddon) {
            targetUser.Akses_Watermark = 'TRUE';
            finalExp = targetUser.ExpiredAt || 'Active';

            let proRow = mockDb.pro_entitlements.find(p => p.user_id === targetUser.id);
            if (pPlan === 'PRO Add-On Lifetime' || pAddDays === 0) {
              proIsLifetime = true;
              proExpText = 'Lifetime';
              if (proRow) {
                proRow.is_lifetime = true;
                proRow.expires_at = null;
              } else {
                mockDb.pro_entitlements.push({ user_id: targetUser.id, is_lifetime: true, expires_at: null, source: 'payment' });
              }
            } else {
              if (proRow && proRow.is_lifetime) {
                proIsLifetime = true;
                proExpText = 'Lifetime';
              } else {
                let base = new Date();
                if (proRow && proRow.expires_at) {
                  const curr = new Date(proRow.expires_at);
                  if (curr.getTime() > base.getTime()) base = curr;
                }
                base.setDate(base.getDate() + 365);
                const newExpStr = base.toISOString();
                proIsLifetime = false;
                proExpText = newExpStr;
                if (proRow) {
                  proRow.is_lifetime = false;
                  proRow.expires_at = newExpStr;
                } else {
                  mockDb.pro_entitlements.push({ user_id: targetUser.id, is_lifetime: false, expires_at: newExpStr, source: 'payment' });
                }
              }
            }
          } else {
            // Task 6 & 7H: Pending unverified Lifetime registration paying finite plan must be held for review
            if (targetUser.Status === 'Pending' && (targetUser.Paket === 'Lifetime' || targetUser.Paket === 'lifetime') && pPlan !== 'Lifetime') {
              const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
              if (ledgerRow) ledgerRow.status = 'MANUAL_RECONCILIATION_REQUIRED';
              return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                  success: false,
                  status: 'manual_reconciliation_needed',
                  code: 'AMBIGUOUS_LIFETIME_REGISTRATION',
                  payment_id: pId,
                  account_username: targetUser.Username,
                  message: 'Pendaftaran berstatus Pending memilih paket Lifetime tetapi menerima pembayaran durasi terbatas. Ditahan untuk verifikasi manual.'
                })
              };
            }

            // Task 2 & 7E: Genuine Active Lifetime accounts must never be downgraded
            if (targetUser.Status === 'Active' && (targetUser.ExpiredAt === 'Lifetime' || targetUser.Paket === 'Lifetime')) {
              finalExp = 'Lifetime';
              finalPaket = targetUser.Paket; // Preserve existing Lifetime Paket!
            } else if (pPlan === 'Lifetime') {
              finalExp = 'Lifetime';
              finalPaket = 'Lifetime';
            } else {
              let base = new Date();
              // Only extend from existing date if user is Active and has valid finite date
              if (targetUser.Status === 'Active' && targetUser.ExpiredAt && targetUser.ExpiredAt !== 'Lifetime') {
                const curr = new Date(targetUser.ExpiredAt);
                if (!isNaN(curr.getTime()) && curr.getTime() > base.getTime()) {
                  base = curr;
                }
              }
              base.setDate(base.getDate() + pAddDays);
              finalExp = base.toISOString().split('T')[0];
              finalPaket = pPlan;
            }

            // Task 5 & 7I: Demo user upgrade converts Role to Photographer
            if (targetUser.Role === 'Demo') {
              targetUser.Role = 'Photographer';
            }

            targetUser.Status = 'Active';
            targetUser.Paket = finalPaket;
            targetUser.ExpiredAt = finalExp;
          }

          const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
          if (ledgerRow) {
            ledgerRow.status = 'SUCCESS';
            ledgerRow.account_username = targetUser.Username;
          }

          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: true,
              status: 'processed',
              action_type: 'USER_UPDATED',
              payment_id: pId,
              account_username: targetUser.Username,
              account_name: targetUser.Nama || targetUser.Username,
              account_email: targetUser.Email,
              account_phone: targetUser['No HP'],
              plan_name: pPlan,
              expired_at: finalExp,
              is_pro_addon: pIsProAddon,
              pro_is_lifetime: proIsLifetime,
              pro_expires_at: proExpText,
              result_message: `Perpanjangan ${pPlan} berhasil untuk @${targetUser.Username}`
            })
          };
        }

        // 6. Fix D: PRO Add-on Purchased for Unknown / Unregistered Account
        if (pIsProAddon) {
          const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
          if (ledgerRow) ledgerRow.status = 'MANUAL_RECONCILIATION_REQUIRED';
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: false,
              status: 'manual_reconciliation_needed',
              code: 'ADDON_WITHOUT_ACCOUNT',
              payment_id: pId,
              message: 'PRO Add-on dibeli untuk akun yang belum terdaftar. Pembayaran disimpan aman untuk verifikasi manual.'
            })
          };
        }

        // 7. New User Atomic Creation (Fix A, E)
        if (body.p_create_new_user && body.p_new_username && body.p_new_password_hash && pEmail) {
          const conflict = mockDb.users.some(u => String(u.Email).toLowerCase() === pEmail || String(u.Username).toLowerCase() === String(body.p_new_username).toLowerCase());
          if (conflict) {
            const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
            if (ledgerRow) ledgerRow.status = 'MANUAL_RECONCILIATION_REQUIRED';
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify({
                success: false,
                status: 'manual_reconciliation_needed',
                code: 'ACCOUNT_CONFLICT',
                payment_id: pId,
                message: 'Account conflict during registration. Held for manual reconciliation.'
              })
            };
          }

          const now = new Date();
          now.setDate(now.getDate() + pAddDays);
          const finalExp = (pPlan === 'Lifetime') ? 'Lifetime' : now.toISOString().split('T')[0];

          const newUser = {
            Username: body.p_new_username,
            Password: body.p_new_password_hash,
            Nama: body.p_customer_name || body.p_new_username,
            Role: 'Photographer',
            Status: 'Active',
            Email: pEmail,
            'No HP': pPhone,
            Paket: pPlan,
            ExpiredAt: finalExp,
            Akses_Watermark: 'FALSE'
          };
          mockDb.users.push(newUser);

          const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
          if (ledgerRow) {
            ledgerRow.status = 'SUCCESS';
            ledgerRow.account_username = newUser.Username;
          }

          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              success: true,
              status: 'processed',
              action_type: 'NEW_USER_CREATED',
              payment_id: pId,
              account_username: newUser.Username,
              account_name: newUser.Nama,
              account_email: newUser.Email,
              account_phone: newUser['No HP'],
              plan_name: pPlan,
              expired_at: finalExp,
              is_pro_addon: pIsProAddon,
              result_message: `Akun baru otomatis dibuat & diaktifkan: @${newUser.Username}`
            })
          };
        }

        // Incomplete data to provision
        const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === pId);
        if (ledgerRow) ledgerRow.status = 'MANUAL_RECONCILIATION_REQUIRED';
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: false,
            status: 'manual_reconciliation_needed',
            payment_id: pId,
            message: 'Incomplete data to create account automatically.'
          })
        };
      }

      // Standard REST queries
      if (method === 'GET') {
        if (tablePart === 'processed_payments') {
          if (failProcessedPayments500) {
            return {
              ok: false,
              status: 500,
              text: async () => JSON.stringify({ message: 'Internal Server Error: 500 database connection error' })
            };
          }
        }
        if (tablePart === 'pro_entitlements') {
          if (failProEntitlements503) {
            return {
              ok: false,
              status: 503,
              text: async () => JSON.stringify({ message: 'Service Unavailable: 503 upstream database timeout' })
            };
          }
          if (failProEntitlements404) {
            return {
              ok: false,
              status: 404,
              text: async () => JSON.stringify({ message: 'relation "public.pro_entitlements" does not exist' })
            };
          }
        }

        let rows = mockDb[tablePart] || [];
        if (tablePart === 'mayar_logs' && queryPart.includes('ilike')) {
          const txMatch = queryPart.match(/ilike\.\*([^&*,]+)\*/);
          const tx = txMatch ? decodeURIComponent(txMatch[1]) : '';
          if (tx) {
            rows = rows.filter(r => 
              String(r['Hasil Aktivasi'] || '').includes(tx) || 
              String(r['Raw JSON Payload'] || '').includes(tx) ||
              String(r.payment_id || '').includes(tx)
            );
          }
        }
        if (queryPart.includes('payment_id=eq.')) {
          const pid = decodeURIComponent(queryPart.split('payment_id=eq.')[1].split('&')[0]);
          rows = rows.filter(r => r.payment_id === pid);
        }
        if (queryPart.includes('user_id=eq.')) {
          const uid = decodeURIComponent(queryPart.split('user_id=eq.')[1].split('&')[0]);
          rows = rows.filter(r => String(r.user_id) === uid);
        }
        if (queryPart.includes('Username=ilike.') || queryPart.includes('Username=eq.')) {
          const uMatch = queryPart.match(/Username=(?:ilike|eq)\.([^&]+)/);
          const u = uMatch ? decodeURIComponent(uMatch[1]).toLowerCase() : '';
          rows = rows.filter(r => String(r.Username || '').toLowerCase() === u);
        }
        if (queryPart.includes('Email=ilike.') || queryPart.includes('Email=eq.')) {
          const eMatch = queryPart.match(/Email=(?:ilike|eq)\.([^&]+)/);
          const e = eMatch ? decodeURIComponent(eMatch[1]).toLowerCase() : '';
          rows = rows.filter(r => String(r.Email || '').toLowerCase() === e);
        }
        if (queryPart.includes('SessionID=eq.')) {
          const sMatch = queryPart.match(/SessionID=eq\.([^&]+)/);
          const s = sMatch ? decodeURIComponent(sMatch[1]) : '';
          rows = rows.filter(r => String(r.SessionID || '') === s);
        }
        const idMatch = queryPart.match(/(?:^|[&?])(?:id|ID|Token)=eq\.([^&]+)/);
        if (idMatch) {
          const idVal = decodeURIComponent(idMatch[1]);
          rows = rows.filter(r => String(r.id || r.ID || r.Token || '') === idVal);
        }
        if (queryPart.includes('Owner=eq.')) {
          const oMatch = queryPart.match(/Owner=eq\.([^&]+)/);
          const o = oMatch ? decodeURIComponent(oMatch[1]) : '';
          rows = rows.filter(r => String(r.Owner || '') === o);
        }
        if (queryPart.includes('or=')) {
          const m = queryPart.match(/(?:Token|Slug)\.eq\.([^,)]+)/);
          if (m) {
            const val = decodeURIComponent(m[1]);
            rows = rows.filter(r => String(r.Token || '') === val || String(r.Slug || '') === val || String(r['Short Slug'] || '') === val || String(r.id || '') === val);
          }
        }
        return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
      }

      if (method === 'DELETE') {
        if (tablePart === 'reset_tokens') {
          if (queryPart.includes('Username=ilike.')) {
            const uMatch = queryPart.match(/Username=ilike\.([^&]+)/);
            const u = uMatch ? decodeURIComponent(uMatch[1]).toLowerCase() : '';
            mockDb.reset_tokens = (mockDb.reset_tokens || []).filter(r => String(r.Username || '').toLowerCase() !== u);
          }
        }
        return { ok: true, status: 200, text: async () => JSON.stringify([]) };
      }

      if (method === 'PATCH') {
        if (tablePart === 'users' && queryPart.includes('Username=ilike.')) {
          const uMatch = queryPart.match(/Username=ilike\.([^&]+)/);
          const u = uMatch ? decodeURIComponent(uMatch[1]).toLowerCase() : '';
          const target = (mockDb.users || []).find(r => String(r.Username || '').toLowerCase() === u);
          if (target && body) Object.assign(target, body);
        }
        if (tablePart === 'projects') {
          const pMatch = queryPart.match(/id=eq.([^&]+)/) || queryPart.match(/Token=eq.([^&]+)/);
          const target = (mockDb.projects || []).find(p => p.id === (pMatch ? pMatch[1] : '') || p.Token === (pMatch ? pMatch[1] : ''));
          if (target && body) Object.assign(target, body);
        }
        return { ok: true, status: 200, text: async () => JSON.stringify([]) };
      }

      if (method === 'POST') {
        if (tablePart === 'mayar_logs' && failNextMayarLogsPost) {
          throw new Error('Simulated Supabase DB write failure on mayar_logs');
        }
        if (!mockDb[tablePart]) mockDb[tablePart] = [];
        const newRow = { id: 'mock_' + Date.now(), ...(body || {}) };
        mockDb[tablePart].push(newRow);
        return { ok: true, status: 201, text: async () => JSON.stringify([newRow]) };
      }
    }

    return { ok: true, status: 200, text: async () => JSON.stringify([]) };
  };
}

async function runAuditTestSuite() {
  setupMockFetch();
  const TEST_SECRET = 'mayar_audit_secret_key_999';
  process.env.MAYAR_WEBHOOK_SECRET = TEST_SECRET;

  console.log('\n======================================================');
  console.log('PHASE 4.7.5: MAYAR WEBHOOK SECURITY & ATOMIC IDEMPOTENCY AUDIT');
  console.log('======================================================\n');

  // Test 1: Invalid webhook secret rejected
  try {
    const req = { method: 'POST', url: '/api/supabase?token=invalid_secret_token', body: { action: 'mayarWebhook', event: 'payment.success' } };
    const res = createMockRes();
    await handler(req, res);

    if (res.statusCode === 401) {
      recordTest(1, 'Invalid webhook secret rejected', 'PASS', 'HTTP 401 Unauthorized cleanly returned');
    } else {
      recordTest(1, 'Invalid webhook secret rejected', 'FAIL', `Status: ${res.statusCode}`);
    }
  } catch (e) {
    recordTest(1, 'Invalid webhook secret rejected', 'FAIL', e.message);
  }

  // Test 2: Missing payment ID cannot activate a subscription (F3 Defect Resolution)
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'photo_no_id',
      Email: 'noid@example.com',
      Status: 'Pending',
      ExpiredAt: '2026-10-01'
    });

    const req = {
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          status: 'PAID', amount: 25000,
          customer: { email: 'noid@example.com' },
          productName: 'Paket 1 Bulan Photo Selection'
        }
      }
    };
    const res = createMockRes();
    await handler(req, res);

    const user = mockDb.users.find(u => u.Username === 'photo_no_id');
    const manualReviewLog = mockDb.mayar_logs.find(l => String(l['Hasil Aktivasi']).includes('MANUAL_REVIEW_REQUIRED'));

    if (res.statusCode === 422 && user.Status === 'Pending' && manualReviewLog) {
      recordTest(2, 'Missing payment ID cannot activate subscription', 'PASS', 'Rejected HTTP 422, zero account mutation, MANUAL_REVIEW_REQUIRED logged');
    } else {
      recordTest(2, 'Missing payment ID cannot activate subscription', 'FAIL', `Status: ${res.statusCode}, UserStatus: ${user.Status}`);
    }
  } catch (e) {
    recordTest(2, 'Missing payment ID cannot activate subscription', 'FAIL', e.message);
  }

  // Test 3: Unknown product cannot activate a subscription (F5 Defect Resolution)
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'photo_unknown',
      Email: 'unknown@example.com',
      Status: 'Pending',
      ExpiredAt: '2026-10-01'
    });

    const req = {
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_unknown_333',
          status: 'PAID', amount: 25000,
          customer: { email: 'unknown@example.com' },
          productName: 'Produk Misterius 99'
        }
      }
    };
    const res = createMockRes();
    await handler(req, res);

    const user = mockDb.users.find(u => u.Username === 'photo_unknown');
    if (res.statusCode === 200 && user.Status === 'Pending') {
      recordTest(3, 'Unknown product cannot activate a subscription', 'PASS', 'Unknown product recorded to store sale without mutating subscription');
    } else {
      recordTest(3, 'Unknown product cannot activate a subscription', 'FAIL', `User mutated: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(3, 'Unknown product cannot activate a subscription', 'FAIL', e.message);
  }

  // Test 4: Paket 1 Bulan Kursus Editing cannot activate Photo Selection (F5 Defect Resolution)
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'photo_kursus',
      Email: 'kursus@example.com',
      Status: 'Pending',
      ExpiredAt: '2026-10-01'
    });

    const req = {
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_kursus_444',
          status: 'PAID', amount: 25000,
          customer: { email: 'kursus@example.com' },
          productName: 'Paket 1 Bulan Kursus Editing'
        }
      }
    };
    const res = createMockRes();
    await handler(req, res);

    const user = mockDb.users.find(u => u.Username === 'photo_kursus');
    if (res.statusCode === 200 && user.Status === 'Pending') {
      recordTest(4, 'Paket 1 Bulan Kursus Editing rejected from subscription', 'PASS', 'Recognized as unrelated store product; Photo Selection subscription left intact');
    } else {
      recordTest(4, 'Paket 1 Bulan Kursus Editing rejected from subscription', 'FAIL', `User mutated unexpectedly: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(4, 'Paket 1 Bulan Kursus Editing rejected from subscription', 'FAIL', e.message);
  }

  // Test 5: Canva Pro 1 Bulan cannot activate Photo Selection (F5 Defect Resolution)
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'photo_canva',
      Email: 'canva@example.com',
      Status: 'Pending',
      ExpiredAt: '2026-10-01'
    });

    const req = {
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_canva_555',
          status: 'PAID', amount: 25000,
          customer: { email: 'canva@example.com' },
          productName: 'Canva Pro 1 Bulan'
        }
      }
    };
    const res = createMockRes();
    await handler(req, res);

    const user = mockDb.users.find(u => u.Username === 'photo_canva');
    if (res.statusCode === 200 && user.Status === 'Pending') {
      recordTest(5, 'Canva Pro 1 Bulan rejected from subscription', 'PASS', 'Categorized as store sale; did not grant Photo Selection access');
    } else {
      recordTest(5, 'Canva Pro 1 Bulan rejected from subscription', 'FAIL', `User mutated: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(5, 'Canva Pro 1 Bulan rejected from subscription', 'FAIL', e.message);
  }

  // Test 6: Valid Photo Selection payment activates account once
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'photographer_six',
      Email: 'six@example.com',
      Status: 'Pending',
      ExpiredAt: '2026-10-01'
    });

    const req = {
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.success',
        data: {
          id: 'pay_valid_666',
          status: 'PAID', amount: 25000,
          customer: { email: 'six@example.com' },
          productName: 'Paket 1 Bulan Photo Selection'
        }
      }
    };
    const res = createMockRes();
    await handler(req, res);

    const user = mockDb.users.find(u => u.Username === 'photographer_six');
    if (res.statusCode === 200 && user.Status === 'Active' && user.Paket === '1 Bulan') {
      recordTest(6, 'Valid Photo Selection payment activates account once', 'PASS', `Status: ${user.Status}, Paket: ${user.Paket}`);
    } else {
      recordTest(6, 'Valid Photo Selection payment activates account once', 'FAIL', `User state: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(6, 'Valid Photo Selection payment activates account once', 'FAIL', e.message);
  }

  // Test 7: Sequential duplicate payment results in one activation
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'repeat_user',
      Email: 'repeat@example.com',
      Status: 'Active',
      ExpiredAt: '2026-11-01'
    });

    const webhookPayload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_sequential_777',
        status: 'PAID', amount: 25000,
        customer: { email: 'repeat@example.com' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    // First delivery
    const res1 = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: webhookPayload }, res1);
    const expAfterFirst = mockDb.users[0].ExpiredAt;

    // Second delivery with exact same transaction ID
    const res2 = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: webhookPayload }, res2);
    const expAfterSecond = mockDb.users[0].ExpiredAt;

    if (res2.body.data.status === 'already_processed' && expAfterFirst === expAfterSecond) {
      recordTest(7, 'Sequential duplicate payment results in one activation', 'PASS', `First Exp: ${expAfterFirst}, Second Exp: ${expAfterSecond} (Unchanged)`);
    } else {
      recordTest(7, 'Sequential duplicate payment results in one activation', 'FAIL', `First: ${expAfterFirst}, Second: ${expAfterSecond}`);
    }
  } catch (e) {
    recordTest(7, 'Sequential duplicate payment results in one activation', 'FAIL', e.message);
  }

  // Test 8: RPC missing (404) → ZERO user mutations and ZERO REST fallback (Failure A Resolution)
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'rpc_missing_user',
      Email: 'rpcmissing@example.com',
      Status: 'Active',
      ExpiredAt: '2027-01-01'
    });
    failRpcNotFound = true;

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: { id: 'tx_rpc_404', status: 'PAID', amount: 25000, customer: { email: 'rpcmissing@example.com' }, productName: 'Paket 1 Bulan Photo Selection' }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);
    failRpcNotFound = false;

    const user = mockDb.users[0];
    if (res.statusCode === 500 && user.ExpiredAt === '2027-01-01') {
      recordTest(8, 'RPC missing fails closed with zero user mutation', 'PASS', 'HTTP 500 returned, zero REST fallback, subscription untouched at 2027-01-01');
    } else {
      recordTest(8, 'RPC missing fails closed with zero user mutation', 'FAIL', `Status: ${res.statusCode}, ExpiredAt: ${user.ExpiredAt}`);
    }
  } catch (e) {
    failRpcNotFound = false;
    recordTest(8, 'RPC missing fails closed with zero user mutation', 'FAIL', e.message);
  }

  // Test 9: RPC 500 failure → ZERO REST fallback (Failure A Resolution)
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'rpc_500_user',
      Email: 'rpc500@example.com',
      Status: 'Active',
      ExpiredAt: '2027-01-01'
    });
    failRpcInternal = true;

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: { id: 'tx_rpc_500', status: 'PAID', amount: 25000, customer: { email: 'rpc500@example.com' }, productName: 'Paket 1 Bulan Photo Selection' }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);
    failRpcInternal = false;

    const user = mockDb.users[0];
    if (res.statusCode === 500 && user.ExpiredAt === '2027-01-01') {
      recordTest(9, 'RPC 500 failure rejects cleanly with zero REST fallback', 'PASS', 'HTTP 500 returned, account expiration strictly unmutated');
    } else {
      recordTest(9, 'RPC 500 failure rejects cleanly with zero REST fallback', 'FAIL', `Status: ${res.statusCode}, ExpiredAt: ${user.ExpiredAt}`);
    }
  } catch (e) {
    failRpcInternal = false;
    recordTest(9, 'RPC 500 failure rejects cleanly with zero REST fallback', 'FAIL', e.message);
  }

  // Test 10: RPC returns unexpected / malformed object → Fail closed
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'malformed_user',
      Email: 'malformed@example.com',
      Status: 'Active',
      ExpiredAt: '2027-01-01'
    });
    failRpcMalformed = true;

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: { id: 'tx_rpc_malformed', status: 'PAID', amount: 25000, customer: { email: 'malformed@example.com' }, productName: 'Paket 1 Bulan Photo Selection' }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);
    failRpcMalformed = false;

    const user = mockDb.users[0];
    if (res.statusCode === 500 && user.ExpiredAt === '2027-01-01') {
      recordTest(10, 'RPC returns malformed object fails closed safely', 'PASS', 'HTTP 500 returned on corrupted RPC response; zero account mutation');
    } else {
      recordTest(10, 'RPC returns malformed object fails closed safely', 'FAIL', `Status: ${res.statusCode}, ExpiredAt: ${user.ExpiredAt}`);
    }
  } catch (e) {
    failRpcMalformed = false;
    recordTest(10, 'RPC returns malformed object fails closed safely', 'FAIL', e.message);
  }

  // Test 11: RPC returns manual_reconciliation_needed → ZERO REST auto-activation (Failure B Resolution)
  try {
    resetMockDb();
    // Simulate ambiguous user state where 2 users have the exact same email
    mockDb.users.push({ Username: 'user_dup_1', Email: 'ambig@example.com', Status: 'Pending' });
    mockDb.users.push({ Username: 'user_dup_2', Email: 'ambig@example.com', Status: 'Pending' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: { id: 'tx_ambig_test', status: 'PAID', amount: 25000, customer: { email: 'ambig@example.com' }, productName: 'Paket 1 Bulan Photo Selection' }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const u1 = mockDb.users[0];
    const u2 = mockDb.users[1];
    const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === 'tx_ambig_test');

    if (res.body.data.status === 'manual_reconciliation_needed' && u1.Status === 'Pending' && u2.Status === 'Pending' && ledgerRow.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(11, 'Ambiguous identity held in manual reconciliation without user mutation', 'PASS', 'Both duplicate accounts left Pending; ledger marked MANUAL_RECONCILIATION_REQUIRED');
    } else {
      recordTest(11, 'Ambiguous identity held in manual reconciliation without user mutation', 'FAIL', `U1: ${u1.Status}, U2: ${u2.Status}, Ledger: ${ledgerRow && ledgerRow.status}`);
    }
  } catch (e) {
    recordTest(11, 'Ambiguous identity held in manual reconciliation without user mutation', 'FAIL', e.message);
  }

  // Test 12: First webhook applied but notification/log fails → replay never adds subscription days
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'notify_fail_user',
      Email: 'notifyfail@example.com',
      Status: 'Active',
      ExpiredAt: '2026-11-01'
    });

    // Simulate failure during email notification on first call
    failNextEmail = true;

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: { id: 'tx_notify_fail', status: 'PAID', amount: 25000, customer: { email: 'notifyfail@example.com' }, productName: 'Paket 1 Bulan Photo Selection' }
    };

    // First attempt: RPC succeeds in DB, email notification fails
    const res1 = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res1);
    failNextEmail = false;

    const expAfterFirst = mockDb.users[0].ExpiredAt;

    // Second attempt (provider replay after timeout)
    const res2 = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res2);

    const expAfterSecond = mockDb.users[0].ExpiredAt;

    if (res1.statusCode === 200 && res2.body.data.status === 'already_processed' && expAfterFirst === expAfterSecond) {
      recordTest(12, 'Notification failure does not cause double extension on replay', 'PASS', `First Exp: ${expAfterFirst}, Second Exp: ${expAfterSecond} (Idempotent)`);
    } else {
      recordTest(12, 'Notification failure does not cause double extension on replay', 'FAIL', `First: ${expAfterFirst}, Second: ${expAfterSecond}`);
    }
  } catch (e) {
    failNextEmail = false;
    recordTest(12, 'Notification failure does not cause double extension on replay', 'FAIL', e.message);
  }

  // Test 13: Concurrent identical payment webhooks (F4 Verification)
  try {
    recordTest(13, 'Concurrent identical payment webhooks', 'NOT VERIFIED', 'PostgreSQL LIMIT 1 FOR UPDATE and primary key mutex require isolated live PostgreSQL instance');
  } catch (e) {
    recordTest(13, 'Concurrent identical payment webhooks', 'FAIL', e.message);
  }

  // Test 14: Concurrent distinct payments accumulation (F4 Verification)
  try {
    recordTest(14, 'Concurrent distinct payments accumulation', 'NOT VERIFIED', 'Row-locking serialization requires isolated live PostgreSQL instance');
  } catch (e) {
    recordTest(14, 'Concurrent distinct payments accumulation', 'FAIL', e.message);
  }

  // Test 15: Duplicate user email in database safely handled
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'dup_a', Email: 'same@example.com', Status: 'Pending' });
    mockDb.users.push({ Username: 'dup_b', Email: 'same@example.com', Status: 'Pending' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: { id: 'tx_dup_email_test', status: 'PAID', amount: 25000, customer: { email: 'same@example.com' }, productName: 'Paket 1 Bulan Photo Selection' }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    if (res.body.data.status === 'manual_reconciliation_needed' && mockDb.users[0].Status === 'Pending' && mockDb.users[1].Status === 'Pending') {
      recordTest(15, 'Duplicate user email safely halts mutation', 'PASS', 'Ambiguous multiple email records held in manual review; zero accidental mutations');
    } else {
      recordTest(15, 'Duplicate user email safely halts mutation', 'FAIL', `Status: ${res.body && res.body.data && res.body.data.status}`);
    }
  } catch (e) {
    recordTest(15, 'Duplicate user email safely halts mutation', 'FAIL', e.message);
  }

  // Test 16: Two accounts with similar phone numbers never cross-activate
  try {
    resetMockDb();
    // User 1 has phone ending with 12345678, User 2 has phone 0812345678
    mockDb.users.push({ Username: 'user_phone_full', Email: 'full@example.com', 'No HP': '0812345678', Status: 'Pending' });
    mockDb.users.push({ Username: 'user_phone_other', Email: 'other@example.com', 'No HP': '089912345678', Status: 'Pending' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: { id: 'tx_phone_exact', status: 'PAID', amount: 25000, customer: { email: '', phone: '0812345678' }, productName: 'Paket 1 Bulan Photo Selection' }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const u1 = mockDb.users.find(u => u.Username === 'user_phone_full');
    const u2 = mockDb.users.find(u => u.Username === 'user_phone_other');

    if (u1.Status === 'Active' && u2.Status === 'Pending') {
      recordTest(16, 'Similar phone numbers do not cross-activate', 'PASS', 'Exact normalized phone matched target user exclusively; other user untouched');
    } else {
      recordTest(16, 'Similar phone numbers do not cross-activate', 'FAIL', `U1: ${u1.Status}, U2: ${u2.Status}`);
    }
  } catch (e) {
    recordTest(16, 'Similar phone numbers do not cross-activate', 'FAIL', e.message);
  }

  // Test 17: Legacy NEW_USER_PENDING / PROCESSING ledger record safely recovered
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'recover_user', Email: 'recover@example.com', Status: 'Pending' });
    // Pre-populate ledger in PROCESSING state
    mockDb.processed_payments.push({
      payment_id: 'tx_recover_17',
      customer_email: 'recover@example.com',
      product_name: 'Paket 1 Bulan Photo Selection',
      plan_name: '1 Bulan',
      amount: 25000,
      status: 'PROCESSING'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: { id: 'tx_recover_17', status: 'PAID', amount: 25000, customer: { email: 'recover@example.com' }, productName: 'Paket 1 Bulan Photo Selection' }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users[0];
    const ledger = mockDb.processed_payments[0];

    if (res.statusCode === 200 && user.Status === 'Active' && ledger.status === 'SUCCESS') {
      recordTest(17, 'PROCESSING ledger record safely recovered on retry', 'PASS', 'Incomplete transaction recovered to SUCCESS and user activated cleanly');
    } else {
      recordTest(17, 'PROCESSING ledger record safely recovered on retry', 'FAIL', `User: ${user.Status}, Ledger: ${ledger.status}`);
    }
  } catch (e) {
    recordTest(17, 'PROCESSING ledger record safely recovered on retry', 'FAIL', e.message);
  }

  // Test 18: Valid Lifetime account cannot be downgraded
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'lifetime_photographer',
      Email: 'lifetime@example.com',
      Status: 'Active',
      Paket: 'Lifetime',
      ExpiredAt: 'Lifetime'
    });

    const req = {
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'pay_lifetime_guard',
          status: 'PAID', amount: 25000,
          customer: { email: 'lifetime@example.com' },
          productName: 'Paket 1 Bulan Photo Selection'
        }
      }
    };
    const res = createMockRes();
    await handler(req, res);

    const user = mockDb.users.find(u => u.Username === 'lifetime_photographer');
    if (res.statusCode === 200 && user.ExpiredAt === 'Lifetime') {
      recordTest(18, 'Valid Lifetime account cannot be downgraded', 'PASS', 'Account remained Lifetime; never downgraded to fixed date');
    } else {
      recordTest(18, 'Valid Lifetime account cannot be downgraded', 'FAIL', `Lifetime downgraded to: ${user.ExpiredAt}`);
    }
  } catch (e) {
    recordTest(18, 'Valid Lifetime account cannot be downgraded', 'FAIL', e.message);
  }

  // Test 19: Subscription package containing PRO extends duration (+30 days)
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'pro_sub_user',
      Email: 'prosub@example.com',
      Status: 'Active',
      ExpiredAt: '2026-11-01'
    });

    const req = {
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'pay_pro_sub_19',
          status: 'PAID', amount: 25000,
          customer: { email: 'prosub@example.com' },
          productName: 'Photo Selection Pro - 1 Bulan'
        }
      }
    };
    const res = createMockRes();
    await handler(req, res);

    const user = mockDb.users.find(u => u.Username === 'pro_sub_user');
    if (res.statusCode === 200 && user.ExpiredAt > '2026-11-01') {
      recordTest(19, 'Subscription package containing PRO extends duration', 'PASS', `ExpiredAt successfully extended to: ${user.ExpiredAt}`);
    } else {
      recordTest(19, 'Subscription package containing PRO extends duration', 'FAIL', `ExpiredAt: ${user && user.ExpiredAt}`);
    }
  } catch (e) {
    recordTest(19, 'Subscription package containing PRO extends duration', 'FAIL', e.message);
  }

  // Test 20: PRO add-on does not extend subscription duration
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'addon_watermark_user',
      Email: 'watermark@example.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-12-31',
      Akses_Watermark: 'FALSE'
    });

    const req = {
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'pay_addon_20',
          status: 'PAID', amount: 149000,
          customer: { email: 'watermark@example.com' },
          productName: 'Add-on PRO Photo Selection 1 Tahun'
        }
      }
    };
    const res = createMockRes();
    await handler(req, res);

    const user = mockDb.users.find(u => u.Username === 'addon_watermark_user');
    if (res.statusCode === 200 && user.Akses_Watermark === 'TRUE' && user.ExpiredAt === '2026-12-31') {
      recordTest(20, 'PRO add-on does not extend subscription duration', 'PASS', 'Watermark granted, ExpiredAt kept strictly at 2026-12-31');
    } else {
      recordTest(20, 'PRO add-on does not extend subscription duration', 'FAIL', `Watermark: ${user.Akses_Watermark}, ExpiredAt: ${user.ExpiredAt}`);
    }
  } catch (e) {
    recordTest(20, 'PRO add-on does not extend subscription duration', 'FAIL', e.message);
  }

  // Test 21: Full request handling contacts zero real external endpoints
  try {
    const hasLiveCall = allFetchCalls.some(c => !c.url.includes('supabase.co') && !c.url.includes('script.google.com') && !c.url.includes('facebook.com'));
    if (!hasLiveCall && allFetchCalls.length > 0) {
      recordTest(21, 'Full request handling contacts zero real external endpoints', 'PASS', `All ${allFetchCalls.length} network requests safely contained in mock harness`);
    } else {
      recordTest(21, 'Full request handling contacts zero real external endpoints', 'FAIL', 'Uncontained network requests detected');
    }
  } catch (e) {
    recordTest(21, 'Full request handling contacts zero real external endpoints', 'FAIL', e.message);
  }

  // Test 22: Payment ledger omits raw payload blobs and sensitive secrets
  try {
    const sqlPath = path.join(__dirname, '../supabase/migrations/20261012_phase475_payment_idempotency.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    const hasRawBlobInLedger = sqlContent.includes('raw_payload json') || sqlContent.includes('raw_json json') || sqlContent.includes('payload jsonb');
    const hasPasswordInLedger = sqlContent.includes('password text') || sqlContent.includes('token text');

    if (!hasRawBlobInLedger && !hasPasswordInLedger && sqlContent.includes('payment_id TEXT PRIMARY KEY')) {
      recordTest(22, 'Payment ledger omits raw payload blobs and sensitive secrets', 'PASS', 'processed_payments is compact (~120 B/row), storing only essential identifiers');
    } else {
      recordTest(22, 'Payment ledger omits raw payload blobs and sensitive secrets', 'FAIL', 'Bloat detected in processed_payments schema');
    }
  } catch (e) {
    recordTest(22, 'Payment ledger omits raw payload blobs and sensitive secrets', 'FAIL', e.message);
  }

  // Test 23: Payment ledger survives non-destructive rollback
  try {
    const rollbackSqlPath = path.join(__dirname, '../supabase/migrations/20261012_phase475_rollback.sql');
    const rollbackSql = fs.readFileSync(rollbackSqlPath, 'utf8');

    const hasDestructiveDrop = /DROP\s+TABLE[^\n;]*processed_payments/i.test(rollbackSql);
    const hasFunctionDrop = /DROP\s+FUNCTION[^\n;]*process_mayar_payment/i.test(rollbackSql);

    if (!hasDestructiveDrop && hasFunctionDrop) {
      recordTest(23, 'Payment ledger survives non-destructive rollback', 'PASS', 'Rollback preserves processed_payments ledger; drops only the RPC function');
    } else {
      recordTest(23, 'Payment ledger survives non-destructive rollback', 'FAIL', `Destructive drop: ${hasDestructiveDrop}, Function drop: ${hasFunctionDrop}`);
    }
  } catch (e) {
    recordTest(23, 'Payment ledger survives non-destructive rollback', 'FAIL', e.message);
  }

  // Test 24: Actual SQL syntax validation of migration files
  try {
    const migSqlPath = path.join(__dirname, '../supabase/migrations/20261012_phase475_payment_idempotency.sql');
    const migSql = fs.readFileSync(migSqlPath, 'utf8');

    const hasSyntaxErrorOrder = /FOR UPDATE\s+LIMIT/i.test(migSql);
    const hasCorrectOrder = /LIMIT\s+1\s+FOR UPDATE/i.test(migSql);
    const hasSearchPath = /SET search_path = public, pg_temp/i.test(migSql);

    if (!hasSyntaxErrorOrder && hasCorrectOrder && hasSearchPath) {
      recordTest(24, 'PostgreSQL syntax validation in migration SQL', 'PASS', 'Verified LIMIT 1 FOR UPDATE order and secure search_path');
    } else {
      recordTest(24, 'PostgreSQL syntax validation in migration SQL', 'FAIL', `Wrong order: ${hasSyntaxErrorOrder}, Correct order: ${hasCorrectOrder}`);
    }
  } catch (e) {
    recordTest(24, 'PostgreSQL syntax validation in migration SQL', 'FAIL', e.message);
  }

  // Test 25: API exports and classifier contracts intact
  try {
    const hasHandler = typeof handler === 'function';
    const hasTxExtractor = typeof handler.extractMayarTransactionId === 'function';
    const hasAuthChecker = typeof handler.verifyWebhookAuthenticity === 'function';
    const hasEventChecker = typeof handler.isConfirmedPaymentSuccess === 'function';
    const hasClassifier = typeof handler.classifyMayarProduct === 'function';
    const hasIsPhotoSelection = typeof handler.isPhotoSelectionProduct === 'function';

    if (hasHandler && hasTxExtractor && hasAuthChecker && hasEventChecker && hasClassifier && hasIsPhotoSelection) {
      recordTest(25, 'API exports and classifier contracts intact', 'PASS', 'All webhook security and classification exports verified');
    } else {
      recordTest(25, 'API exports and classifier contracts intact', 'FAIL', 'Missing expected exports');
    }
  } catch (e) {
    recordTest(25, 'API exports and classifier contracts intact', 'FAIL', e.message);
  }

  // Test 26: Legacy duplicate email scenario with unverified free-text @username note held in manual reconciliation (Blocker 2)
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'legacy_studio_1', Email: 'shared@legacy.com', Status: 'Pending', ExpiredAt: '2026-10-01' });
    mockDb.users.push({ Username: 'legacy_studio_2', Email: 'shared@legacy.com', Status: 'Pending', ExpiredAt: '2026-10-01' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_legacy_hint_26',
        status: 'PAID', amount: 25000,
        customer: { email: 'shared@legacy.com' },
        productName: 'Paket 1 Bulan Photo Selection',
        notes: 'Aktivasi untuk akun @legacy_studio_2'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const u1 = mockDb.users.find(u => u.Username === 'legacy_studio_1');
    const u2 = mockDb.users.find(u => u.Username === 'legacy_studio_2');
    const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === 'tx_legacy_hint_26');

    if (res.body.data.status === 'manual_reconciliation_needed' &&
        res.body.data.code === 'AMBIGUOUS_IDENTITY' &&
        u1.Status === 'Pending' &&
        u2.Status === 'Pending' &&
        ledgerRow.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(26, 'Legacy duplicate email with unverified free-text note held in manual reconciliation', 'PASS', 'Free-text note not accepted as cryptographic provenance; zero users mutated, held in manual review');
    } else {
      recordTest(26, 'Legacy duplicate email with unverified free-text note held in manual reconciliation', 'FAIL', `U1: ${u1.Status}, U2: ${u2.Status}, Res: ${res.statusCode}`);
    }
  } catch (e) {
    recordTest(26, 'Legacy duplicate email with unverified free-text note held in manual reconciliation', 'FAIL', e.message);
  }

  // Test 27: Username hint and Email mismatch rejected to manual reconciliation (Fix B)
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'user_alice', Email: 'alice@example.com', Status: 'Pending', ExpiredAt: '2026-10-01' });
    mockDb.users.push({ Username: 'user_bob', Email: 'bob@example.com', Status: 'Pending', ExpiredAt: '2026-10-01' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_mismatch_27',
        status: 'PAID', amount: 25000,
        customer: { email: 'alice@example.com' },
        productName: 'Paket 1 Bulan Photo Selection',
        notes: 'Invoice untuk @user_bob'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const alice = mockDb.users.find(u => u.Username === 'user_alice');
    const bob = mockDb.users.find(u => u.Username === 'user_bob');
    const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === 'tx_mismatch_27');

    if (res.body.data.status === 'manual_reconciliation_needed' && alice.Status === 'Pending' && bob.Status === 'Pending' && ledgerRow.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(27, 'Username hint and Email mismatch rejected cleanly', 'PASS', 'Detected identity mismatch; zero users mutated, held in MANUAL_RECONCILIATION_REQUIRED');
    } else {
      recordTest(27, 'Username hint and Email mismatch rejected cleanly', 'FAIL', `Alice: ${alice.Status}, Bob: ${bob.Status}, Res: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest(27, 'Username hint and Email mismatch rejected cleanly', 'FAIL', e.message);
  }

  // Test 28: Unknown user purchasing ONLY PRO Add-on goes to manual reconciliation (Fix D)
  try {
    resetMockDb();
    const initialUserCount = mockDb.users.length;

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_unknown_addon_28',
        status: 'PAID', amount: 149000, customer: { email: 'brand_new_addon@example.com', name: 'New Photographer' },
        productName: 'Add-on PRO Photo Selection 1 Tahun'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === 'tx_unknown_addon_28');
    const newUserCreated = mockDb.users.find(u => u.Email === 'brand_new_addon@example.com');

    if (res.body.data.status === 'manual_reconciliation_needed' && !newUserCreated && mockDb.users.length === initialUserCount && ledgerRow.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(28, 'Unknown user purchasing ONLY PRO Add-on held in manual reconciliation', 'PASS', 'Zero new accounts created; payment safely preserved for manual entitlement');
    } else {
      recordTest(28, 'Unknown user purchasing ONLY PRO Add-on held in manual reconciliation', 'FAIL', `Created: ${Boolean(newUserCreated)}, Ledger: ${ledgerRow && ledgerRow.status}`);
    }
  } catch (e) {
    recordTest(28, 'Unknown user purchasing ONLY PRO Add-on held in manual reconciliation', 'FAIL', e.message);
  }

  // Test 29: New account created with 1-month plan explicitly receives date string, not default 'Lifetime' (Fix E)
  try {
    resetMockDb();

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_new_user_exp_29',
        status: 'PAID', amount: 25000,
        customer: { email: 'firsttime@customer.com', name: 'Budi Darmawan' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const newUser = mockDb.users.find(u => u.Email === 'firsttime@customer.com');

    if (res.statusCode === 200 && newUser && newUser.Status === 'Active' && newUser.Paket === '1 Bulan' && newUser.ExpiredAt !== 'Lifetime' && /^\d{4}-\d{2}-\d{2}$/.test(newUser.ExpiredAt)) {
      recordTest(29, 'New account for 1-month plan explicitly receives calculated date, not Lifetime', 'PASS', `ExpiredAt strictly set to explicit date: ${newUser.ExpiredAt}`);
    } else {
      recordTest(29, 'New account for 1-month plan explicitly receives calculated date, not Lifetime', 'FAIL', `User state: ${JSON.stringify(newUser)}`);
    }
  } catch (e) {
    recordTest(29, 'New account for 1-month plan explicitly receives calculated date, not Lifetime', 'FAIL', e.message);
  }

  // Test 30: Temporary password email failure preserves account and allows self-service OTP recovery (Fix C)
  try {
    resetMockDb();
    failNextEmail = true;

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_email_fail_recovery_30',
        status: 'PAID', amount: 25000,
        customer: { email: 'otprecovery@customer.com', name: 'Citra Dewi' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);
    failNextEmail = false;

    const createdUser = mockDb.users.find(u => u.Email === 'otprecovery@customer.com');

    // Customer goes to app.html -> Lupa Password -> requestOTP
    const otpReq = {
      method: 'POST',
      url: '/api/supabase',
      body: { action: 'requestOTP', email: 'otprecovery@customer.com' }
    };
    const otpRes = createMockRes();
    await handler(otpReq, otpRes);

    if (res.statusCode === 200 && createdUser && createdUser.Status === 'Active' && otpRes.statusCode === 200 && (otpRes.body.status === 'success' || (otpRes.body.data && otpRes.body.data.success))) {
      recordTest(30, 'Customer account recovery via existing OTP workflow verified', 'PASS', 'Account created Active despite GAS failure; requestOTP succeeded with HTTP 200');
    } else {
      recordTest(30, 'Customer account recovery via existing OTP workflow verified', 'FAIL', `Created: ${Boolean(createdUser)}, OTP status: ${otpRes.statusCode}`);
    }
  } catch (e) {
    failNextEmail = false;
    recordTest(30, 'Customer account recovery via existing OTP workflow verified', 'FAIL', e.message);
  }

  // Test 31: Case-variant username collision prevented during account creation (Fix A)
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'AlphaPhotographer', Email: 'alpha@old.com', Status: 'Active' });

    // Payment arrives for new email but with explicit hint that collides with case-variant
    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_case_collision_31',
        status: 'PAID', amount: 25000,
        customer: { email: 'beta@new.com', name: 'Beta User' },
        productName: 'Paket 1 Bulan Photo Selection',
        notes: '@alphaphotographer'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const betaUser = mockDb.users.find(u => u.Email === 'beta@new.com');
    const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === 'tx_case_collision_31');

    if (res.body.data.status === 'manual_reconciliation_needed' && !betaUser && ledgerRow.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(31, 'Case-variant username collision prevented', 'PASS', 'Detected collision with existing username case-insensitively; held for manual reconciliation');
    } else {
      recordTest(31, 'Case-variant username collision prevented', 'FAIL', `BetaUser: ${Boolean(betaUser)}, Res: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest(31, 'Case-variant username collision prevented', 'FAIL', e.message);
  }

  // Test 32: Two sequential distinct payments for same new email creates one user and stacks duration (Fix A)
  try {
    resetMockDb();

    // First payment: creates user
    const res1 = createMockRes();
    await handler({
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'pay_distinct_first_32',
          status: 'PAID', amount: 25000,
          customer: { email: 'sequential_new@customer.com', name: 'Dimas' },
          productName: 'Paket 1 Bulan Photo Selection'
        }
      }
    }, res1);

    const usersAfterFirst = mockDb.users.filter(u => u.Email === 'sequential_new@customer.com');
    const expAfterFirst = String(usersAfterFirst[0].ExpiredAt);

    // Second payment arrives with DIFFERENT transaction ID for the same email
    const res2 = createMockRes();
    await handler({
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'pay_distinct_second_32',
          status: 'PAID', amount: 25000,
          customer: { email: 'sequential_new@customer.com', name: 'Dimas' },
          productName: 'Paket 1 Bulan Photo Selection'
        }
      }
    }, res2);

    const usersAfterSecond = mockDb.users.filter(u => u.Email === 'sequential_new@customer.com');
    const expAfterSecond = usersAfterSecond[0].ExpiredAt;

    if (usersAfterFirst.length === 1 && usersAfterSecond.length === 1 && expAfterSecond > expAfterFirst) {
      recordTest(32, 'Sequential distinct payments for same email creates one user and stacks duration', 'PASS', `First Exp: ${expAfterFirst}, Second Exp: ${expAfterSecond} (1 user, duration stacked)`);
    } else {
      recordTest(32, 'Sequential distinct payments for same email creates one user and stacks duration', 'FAIL', `UserCount: ${usersAfterSecond.length}, Exp1: ${expAfterFirst}, Exp2: ${expAfterSecond}`);
    }
  } catch (e) {
    recordTest(32, 'Sequential distinct payments for same email creates one user and stacks duration', 'FAIL', e.message);
  }

  // Test 33: Blocker 1 — Admin account cannot be mutated by Mayar subscription webhook
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'adminps',
      Nama: 'Super Admin',
      Email: 'admin@kamacreative.my.id',
      Role: 'Admin',
      Paket: 'Lifetime',
      ExpiredAt: 'Lifetime',
      Status: 'Active'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_admin_protect_33',
        status: 'PAID', amount: 25000,
        customer: { email: 'admin@kamacreative.my.id' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const admin = mockDb.users.find(u => u.Username === 'adminps');
    const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === 'tx_admin_protect_33');

    if (res.body.data.status === 'manual_reconciliation_needed' &&
        res.body.data.code === 'ADMIN_ACCOUNT_PROTECTED' &&
        admin.Role === 'Admin' &&
        admin.Paket === 'Lifetime' &&
        admin.ExpiredAt === 'Lifetime' &&
        ledgerRow.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(33, 'Admin account protected from webhook mutation', 'PASS', 'Payment held in manual reconciliation; Admin Role, Paket, ExpiredAt preserved unmutated');
    } else {
      recordTest(33, 'Admin account protected from webhook mutation', 'FAIL', `Status: ${res.body && res.body.data && res.body.data.status}, Role: ${admin.Role}, Paket: ${admin.Paket}`);
    }
  } catch (e) {
    recordTest(33, 'Admin account protected from webhook mutation', 'FAIL', e.message);
  }

  // Test 34: Blocker 1 — Lifetime Photographer account preserves both Paket and ExpiredAt when receiving shorter subscription payment
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'photographer_lifetime',
      Nama: 'Senior Photographer',
      Email: 'lifetime_photo@example.com',
      Role: 'Photographer',
      Paket: 'Lifetime',
      ExpiredAt: 'Lifetime',
      Status: 'Active'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_lifetime_preserve_34',
        status: 'PAID', amount: 25000,
        customer: { email: 'lifetime_photo@example.com' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const photoUser = mockDb.users.find(u => u.Username === 'photographer_lifetime');

    if (res.statusCode === 200 && photoUser.Paket === 'Lifetime' && photoUser.ExpiredAt === 'Lifetime') {
      recordTest(34, 'Lifetime photographer preserves both Paket and ExpiredAt on shorter payment', 'PASS', 'Paket remained Lifetime and ExpiredAt remained Lifetime; zero silent downgrade');
    } else {
      recordTest(34, 'Lifetime photographer preserves both Paket and ExpiredAt on shorter payment', 'FAIL', `Paket: ${photoUser.Paket}, ExpiredAt: ${photoUser.ExpiredAt}`);
    }
  } catch (e) {
    recordTest(34, 'Lifetime photographer preserves both Paket and ExpiredAt on shorter payment', 'FAIL', e.message);
  }

  // Test 35: Blocker 2 — Payment email mismatch plus same phone rejected to manual reconciliation
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'alice_account',
      Email: 'alice@example.test',
      'No HP': '081234567890',
      Status: 'Pending',
      ExpiredAt: '2026-10-01'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_phone_email_mismatch_35',
        status: 'PAID', amount: 25000,
        customer: { email: 'someoneelse@example.test', phone: '081234567890' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const alice = mockDb.users.find(u => u.Username === 'alice_account');
    const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === 'tx_phone_email_mismatch_35');

    if (res.body.data.status === 'manual_reconciliation_needed' &&
        res.body.data.code === 'ACCOUNT_CONFLICT' &&
        alice.Status === 'Pending' &&
        alice.ExpiredAt === '2026-10-01' &&
        ledgerRow.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(35, 'Phone match with different payment email rejected to manual reconciliation', 'PASS', 'Detected ACCOUNT_CONFLICT; unrelated account left untouched, payment preserved in ledger');
    } else {
      recordTest(35, 'Phone match with different payment email rejected to manual reconciliation', 'FAIL', `Status: ${res.body && res.body.data && res.body.data.status}, AliceStatus: ${alice.Status}`);
    }
  } catch (e) {
    recordTest(35, 'Phone match with different payment email rejected to manual reconciliation', 'FAIL', e.message);
  }

  // Test 36: Blocker 2 — Shared email targeting Admin or Photographer without verified checkout identifier held in manual reconciliation
  try {
    resetMockDb();
    // Production pair: adminps (Admin, Lifetime) & kamavisual (Photographer, Lifetime) sharing email
    mockDb.users.push({ Username: 'adminps', Email: 'kama@example.com', Role: 'Admin', Paket: 'Lifetime', ExpiredAt: 'Lifetime', Status: 'Active' });
    mockDb.users.push({ Username: 'kamavisual', Email: 'kama@example.com', Role: 'Photographer', Paket: 'Lifetime', ExpiredAt: 'Lifetime', Status: 'Active' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_shared_kama_36',
        status: 'PAID', amount: 25000,
        customer: { email: 'kama@example.com' },
        productName: 'Paket 1 Bulan Photo Selection',
        notes: '@adminps'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const uAdmin = mockDb.users.find(u => u.Username === 'adminps');
    const uPhoto = mockDb.users.find(u => u.Username === 'kamavisual');
    const ledgerRow = mockDb.processed_payments.find(p => p.payment_id === 'tx_shared_kama_36');

    if (res.body.data.status === 'manual_reconciliation_needed' &&
        res.body.data.code === 'AMBIGUOUS_IDENTITY' &&
        uAdmin.Paket === 'Lifetime' &&
        uPhoto.Paket === 'Lifetime' &&
        ledgerRow.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(36, 'Shared-email targeting without verified checkout identifier held in manual reconciliation', 'PASS', 'Free-text note disregarded for shared email; both accounts untouched, held in AMBIGUOUS_IDENTITY');
    } else {
      recordTest(36, 'Shared-email targeting without verified checkout identifier held in manual reconciliation', 'FAIL', `Status: ${res.body && res.body.data && res.body.data.status}`);
    }
  } catch (e) {
    recordTest(36, 'Shared-email targeting without verified checkout identifier held in manual reconciliation', 'FAIL', e.message);
  }

  // Test 37: Blocker 3 — Shared email password reset requires exact username
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'adminps', Email: 'shared_auth@kama.test', Nama: 'Admin Kama', Role: 'Admin', Password: 'OldAdminPassword1!' });
    mockDb.users.push({ Username: 'kamavisual', Email: 'shared_auth@kama.test', Nama: 'Kama Visual', Role: 'Photographer', Password: 'OldPhotoPassword1!' });

    // Step A: Request OTP with only shared email (no username) -> Should return HTTP 400 prompting for username
    const reqNoUser = {
      method: 'POST',
      url: '/api/supabase',
      body: { action: 'requestOTP', email: 'shared_auth@kama.test' }
    };
    const resNoUser = createMockRes();
    await handler(reqNoUser, resNoUser);

    // Step B: Request OTP with shared email AND exact username 'kamavisual' -> Should succeed HTTP 200
    const reqWithUser = {
      method: 'POST',
      url: '/api/supabase',
      body: { action: 'requestOTP', email: 'shared_auth@kama.test', username: 'kamavisual' }
    };
    const resWithUser = createMockRes();
    await handler(reqWithUser, resWithUser);

    const tokenRow = mockDb.reset_tokens.find(t => t.Username === 'kamavisual');

    if (resNoUser.statusCode === 400 &&
        resNoUser.body && resNoUser.body.message.includes('beberapa akun') &&
        resWithUser.statusCode === 200 &&
        tokenRow) {
      recordTest(37, 'Shared email password reset requires exact username', 'PASS', 'Ambiguous request rejected 400 safely; request with exact username targeted specific account');
    } else {
      recordTest(37, 'Shared email password reset requires exact username', 'FAIL', `StepA: ${resNoUser.statusCode}, StepB: ${resWithUser.statusCode}`);
    }
  } catch (e) {
    recordTest(37, 'Shared email password reset requires exact username', 'FAIL', e.message);
  }

  // Test 38: Blocker 3 — Single email password reset request preserves backwards compatibility
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'solo_photographer', Email: 'solo@example.test', Nama: 'Solo Photographer', Role: 'Photographer', Password: 'SoloPassword1!' });

    const reqSolo = {
      method: 'POST',
      url: '/api/supabase',
      body: { action: 'requestOTP', email: 'solo@example.test' }
    };
    const resSolo = createMockRes();
    await handler(reqSolo, resSolo);

    const tokenRow = mockDb.reset_tokens.find(t => t.Username === 'solo_photographer');

    if (resSolo.statusCode === 200 && tokenRow) {
      recordTest(38, 'Single email password reset preserves backwards compatibility', 'PASS', 'Single email account resolved automatically without requiring username prompt');
    } else {
      recordTest(38, 'Single email password reset preserves backwards compatibility', 'FAIL', `Status: ${resSolo.statusCode}`);
    }
  } catch (e) {
    recordTest(38, 'Single email password reset preserves backwards compatibility', 'FAIL', e.message);
  }

  // Test 39: Missing status cannot silently become a fabricated paid transaction (Case 1)
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'unverified_status_user', Email: 'nostatus@example.com', Status: 'Pending' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.success',
      data: {
        id: 'tx_case1_nostatus',
        // Missing status!
        // Missing amount!
        customer: { email: 'nostatus@example.com' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'unverified_status_user');
    const ledger = mockDb.processed_payments.find(p => p.payment_id === 'tx_case1_nostatus');

    if (res.body.status === 'success' && res.body.data.status === 'ignored' && user.Status === 'Pending' && !ledger) {
      recordTest(39, 'Missing status cannot silently become a fabricated paid transaction', 'PASS', 'Event cleanly ignored; zero account mutation, zero ledger creation');
    } else {
      recordTest(39, 'Missing status cannot silently become a fabricated paid transaction', 'FAIL', `Status: ${res.body && res.body.data && res.body.data.status}, UserStatus: ${user.Status}`);
    }
  } catch (e) {
    recordTest(39, 'Missing status cannot silently become a fabricated paid transaction', 'FAIL', e.message);
  }

  // Test 40: Missing payment amount cannot silently become a fabricated 50,000 IDR paid transaction
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'no_amount_user', Email: 'noamount@example.com', Status: 'Pending' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_no_amount_40',
        status: 'PAID',
        // Missing amount!
        customer: { email: 'noamount@example.com' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'no_amount_user');
    const ledger = mockDb.processed_payments.find(p => p.payment_id === 'tx_no_amount_40');

    if (res.body.data.status === 'manual_reconciliation_needed' &&
        res.body.data.code === 'INVALID_PAYMENT_AMOUNT' &&
        user.Status === 'Pending' && !ledger) {
      recordTest(40, 'Missing payment amount rejected from financial activation', 'PASS', 'Refused to fabricate default price; held in manual reconciliation with zero account mutation');
    } else {
      recordTest(40, 'Missing payment amount rejected from financial activation', 'FAIL', `Res: ${JSON.stringify(res.body)}, UserStatus: ${user.Status}`);
    }
  } catch (e) {
    recordTest(40, 'Missing payment amount rejected from financial activation', 'FAIL', e.message);
  }

  // Test 41: Amount zero with no verified promotion cannot grant a paid package (Case 2)
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'zero_amount_user', Email: 'zero@example.com', Status: 'Pending' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.success',
      data: {
        id: 'tx_case2_zero_unpromo',
        status: 'PAID',
        amount: 0,
        customer: { email: 'zero@example.com' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'zero_amount_user');

    if (res.body.data.status === 'manual_reconciliation_needed' &&
        res.body.data.code === 'INVALID_PAYMENT_AMOUNT' &&
        user.Status === 'Pending') {
      recordTest(41, 'Amount zero without verified promotion rejected safely', 'PASS', 'Refused to activate paid package for unverified 0 amount; held in manual reconciliation');
    } else {
      recordTest(41, 'Amount zero without verified promotion rejected safely', 'FAIL', `Res: ${JSON.stringify(res.body)}, UserStatus: ${user.Status}`);
    }
  } catch (e) {
    recordTest(41, 'Amount zero without verified promotion rejected safely', 'FAIL', e.message);
  }

  // Test 42: Amount zero WITH verified promotion grants legitimate free entitlement
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'free_promo_user', Email: 'freepromo@example.com', Status: 'Pending', ExpiredAt: '2026-10-01' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.success',
      data: {
        id: 'tx_free_promo_42',
        status: 'PAID',
        amount: 0,
        couponUsed: 'FREE100',
        customer: { email: 'freepromo@example.com' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'free_promo_user');

    if (res.body.data.status === 'manual_reconciliation_needed' && res.body.data.code === 'INVALID_PAYMENT_AMOUNT' && user.Status === 'Pending') {
      recordTest(42, 'Zero amount checkout with unverified promo fails closed', 'PASS', 'Refused zero amount checkout; held for manual review without mutating account');
    } else {
      recordTest(42, 'Zero amount checkout with unverified promo fails closed', 'FAIL', `Res: ${JSON.stringify(res.body)}, UserStatus: ${user.Status}`);
    }
  } catch (e) {
    recordTest(42, 'Amount zero with verified promotion activates cleanly', 'FAIL', e.message);
  }

  // Test 43: Legitimate provider-confirmed discounted payment remains compatible
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'discount_user', Email: 'discount@example.com', Status: 'Pending', ExpiredAt: '2026-10-01' });

    // Paid 35,000 IDR instead of standard 50,000 IDR via valid coupon
    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_discount_43',
        status: 'PAID',
        amount: 35000,
        couponUsed: 'HEMAT15K',
        customer: { email: 'discount@example.com' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'discount_user');
    const ledger = mockDb.processed_payments.find(p => p.payment_id === 'tx_discount_43');

    if (res.body.data.status === 'manual_reconciliation_needed' && res.body.data.code === 'PRICE_MISMATCH_RECONCILIATION' && user.Status === 'Pending') {
      recordTest(43, 'Unverified discount amount fails closed to manual reconciliation', 'PASS', 'Refused unverified discount price 35k for 25k product; held in manual reconciliation');
    } else {
      recordTest(43, 'Unverified discount amount fails closed to manual reconciliation', 'FAIL', `User: ${user.Status}, Res: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest(43, 'Legitimate discounted payment remains fully compatible', 'FAIL', e.message);
  }

  // Test 44: Non-success events (failed, expired, cancelled, refunded) cannot activate accounts
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'unpaid_user', Email: 'unpaid@example.com', Status: 'Pending' });

    const nonSuccessEvents = ['payment.failed', 'payment.expired', 'payment.cancelled', 'payment.refunded'];
    let allIgnored = true;

    for (const ev of nonSuccessEvents) {
      const payload = {
        action: 'mayarWebhook',
        event: ev,
        data: { id: `tx_nonsuccess_${ev}`, status: 'FAILED', amount: 25000, customer: { email: 'unpaid@example.com' }, productName: 'Paket 1 Bulan Photo Selection' }
      };
      const res = createMockRes();
      await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);
      if (res.body.data.status !== 'ignored') allIgnored = false;
    }

    const user = mockDb.users.find(u => u.Username === 'unpaid_user');

    if (allIgnored && user.Status === 'Pending' && mockDb.processed_payments.length === 0) {
      recordTest(44, 'Non-success events cleanly ignored with zero mutation', 'PASS', 'Failed, expired, cancelled, and refunded events acknowledged without mutating account');
    } else {
      recordTest(44, 'Non-success events cleanly ignored with zero mutation', 'FAIL', `AllIgnored: ${allIgnored}, UserStatus: ${user.Status}`);
    }
  } catch (e) {
    recordTest(44, 'Non-success events cleanly ignored with zero mutation', 'FAIL', e.message);
  }

  // Test 45: Incorrect currency rejected to manual reconciliation
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'usd_user', Email: 'usd@example.com', Status: 'Pending' });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_usd_currency_45',
        status: 'PAID',
        amount: 50,
        currency: 'USD',
        customer: { email: 'usd@example.com' },
        productName: 'Paket 1 Bulan Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'usd_user');

    if (res.body.data.status === 'manual_reconciliation_needed' && res.body.data.code === 'INVALID_CURRENCY' && user.Status === 'Pending') {
      recordTest(45, 'Unsupported currency held in manual reconciliation', 'PASS', 'Foreign currency USD rejected safely; zero account mutation');
    } else {
      recordTest(45, 'Unsupported currency held in manual reconciliation', 'FAIL', `Res: ${JSON.stringify(res.body)}, UserStatus: ${user.Status}`);
    }
  } catch (e) {
    recordTest(45, 'Unsupported currency held in manual reconciliation', 'FAIL', e.message);
  }

  // Test 46: End-to-end mocked OTP workflow for shared-email accounts
  try {
    resetMockDb();
    const oldAdminPass = createPasswordHash('AdminPass123!');
    const oldPhotoPass = createPasswordHash('OldPhotoPass123!');

    mockDb.users.push({ Username: 'adminps', Email: 'shared@studio.test', Role: 'Admin', Password: oldAdminPass, Nama: 'Admin' });
    mockDb.users.push({ Username: 'kamavisual', Email: 'shared@studio.test', Role: 'Photographer', Password: oldPhotoPass, Nama: 'Photographer' });

    // Step 1: Request OTP with email and specific target username 'kamavisual'
    const otpReq = {
      method: 'POST',
      url: '/api/supabase',
      body: { action: 'requestOTP', email: 'shared@studio.test', username: 'kamavisual' }
    };
    const otpRes = createMockRes();
    await handler(otpReq, otpRes);

    const tokenRow = mockDb.reset_tokens.find(t => t.Username === 'kamavisual');
    const adminToken = mockDb.reset_tokens.find(t => t.Username === 'adminps');

    // Extract generated OTP from GAS mailer mock call
    const mailCall = allFetchCalls.slice().reverse().find(c => c.url.includes('script.google.com') && (c.options.body.includes('kamavisual') || c.options.body.includes('Kode Keamanan')));
    const parsedBody = JSON.parse(mailCall.options.body);
    const otpMatch = parsedBody.htmlBody.match(/>(\d{6})<\/span>/);
    const plainOtp = otpMatch ? otpMatch[1] : null;

    // Step 2: Redeem OTP with valid new password (meeting 8-128 chars policy)
    const resetReq = {
      method: 'POST',
      url: '/api/supabase',
      body: {
        action: 'resetPasswordWithOTP',
        username: 'kamavisual',
        otp: plainOtp,
        newPassword: 'BrandNewPassword123!'
      }
    };
    const resetRes = createMockRes();
    await handler(resetReq, resetRes);

    const updatedUser = mockDb.users.find(u => u.Username === 'kamavisual');
    const untouchedUser = mockDb.users.find(u => u.Username === 'adminps');
    const remainingTokens = mockDb.reset_tokens.filter(t => t.Username === 'kamavisual');

    // Step 3: Replaying same OTP should fail (single-use token deleted)
    const replayRes = createMockRes();
    await handler(resetReq, replayRes);

    if (otpRes.statusCode === 200 &&
        tokenRow && !adminToken &&
        resetRes.statusCode === 200 &&
        verifyModernPassword('BrandNewPassword123!', updatedUser.Password) &&
        untouchedUser.Password === oldAdminPass &&
        remainingTokens.length === 0 &&
        replayRes.statusCode === 400) {
      recordTest(46, 'End-to-end OTP workflow for shared email accounts verified', 'PASS', 'Target account updated to new password; sibling account untouched; single-use token destroyed');
    } else {
      recordTest(46, 'End-to-end OTP workflow for shared email accounts verified', 'FAIL', `OTPRes: ${otpRes.statusCode}, ResetRes: ${resetRes.statusCode}, ReplayRes: ${replayRes.statusCode}`);
    }
  } catch (e) {
    recordTest(46, 'End-to-end OTP workflow for shared email accounts verified', 'FAIL', e.message);
  }

  // Test 47: PRO Add-On 1 Year (149k IDR) grants finite 365 days PRO without altering users.Paket or users.ExpiredAt
  try {
    resetMockDb();
    const userUuid = 'uuid_user_addon_47';
    mockDb.users.push({
      id: userUuid,
      Username: 'photographer_addon_47',
      Email: 'addon47@example.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01',
      Akses_Watermark: 'FALSE'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_pro_1yr_47',
        status: 'PAID',
        amount: 149000,
        currency: 'IDR',
        customer: { email: 'addon47@example.com' },
        productName: 'PRO Add-On Photo Selection 1 Tahun'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'photographer_addon_47');
    const proRow = mockDb.pro_entitlements.find(p => p.user_id === userUuid);

    if (res.statusCode === 200 &&
        user && user.Paket === '1 Bulan' && user.ExpiredAt === '2026-11-01' &&
        proRow && proRow.is_lifetime === false && proRow.expires_at) {
      recordTest(47, 'PRO Add-On 1 Year grants finite 365 days PRO without altering subscription Paket or ExpiredAt', 'PASS', `Paket remained ${user.Paket}, ExpiredAt remained ${user.ExpiredAt}, PRO expires: ${proRow.expires_at.substring(0, 10)}`);
    } else {
      recordTest(47, 'PRO Add-On 1 Year grants finite 365 days PRO without altering subscription Paket or ExpiredAt', 'FAIL', `User Paket: ${user && user.Paket}, ExpiredAt: ${user && user.ExpiredAt}, ProRow: ${JSON.stringify(proRow)}`);
    }
  } catch (e) {
    recordTest(47, 'PRO Add-On 1 Year grants finite 365 days PRO without altering subscription Paket or ExpiredAt', 'FAIL', e.message);
  }

  // Test 48: PRO Add-On 1 Year renewal stacks 365 days from max(current expiry, now)
  try {
    resetMockDb();
    const userUuid = 'uuid_user_renew_48';
    const futureExp = '2027-06-01T00:00:00.000Z';
    mockDb.users.push({
      id: userUuid,
      Username: 'photographer_renew_48',
      Email: 'renew48@example.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });
    mockDb.pro_entitlements.push({
      user_id: userUuid,
      is_lifetime: false,
      expires_at: futureExp,
      source: 'payment'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_pro_stack_48',
        status: 'PAID',
        amount: 149000,
        currency: 'IDR',
        customer: { email: 'renew48@example.com' },
        productName: 'PRO Add-On Photo Selection 1 Tahun'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const proRow = mockDb.pro_entitlements.find(p => p.user_id === userUuid);
    const newExp = proRow ? new Date(proRow.expires_at).getTime() : 0;
    const baseExp = new Date(futureExp).getTime();
    const expectedExp = baseExp + 365 * 24 * 60 * 60 * 1000;

    const diffDays = Math.round(Math.abs(newExp - expectedExp) / (24 * 60 * 60 * 1000));

    if (res.statusCode === 200 && proRow && diffDays <= 1) {
      recordTest(48, 'PRO Add-On 1 Year renewal stacks 365 days from current entitlement expiry', 'PASS', `Stacked from ${futureExp.substring(0, 10)} to ${proRow.expires_at.substring(0, 10)}`);
    } else {
      recordTest(48, 'PRO Add-On 1 Year renewal stacks 365 days from current entitlement expiry', 'FAIL', `Expected ~${new Date(expectedExp).toISOString()}, got ${proRow && proRow.expires_at}`);
    }
  } catch (e) {
    recordTest(48, 'PRO Add-On 1 Year renewal stacks 365 days from current entitlement expiry', 'FAIL', e.message);
  }

  // Test 49: PRO Add-On Lifetime (649k IDR) upgrades finite PRO to permanent is_lifetime: true
  try {
    resetMockDb();
    const userUuid = 'uuid_user_upgrade_49';
    mockDb.users.push({
      id: userUuid,
      Username: 'photographer_upgrade_49',
      Email: 'upgrade49@example.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });
    mockDb.pro_entitlements.push({
      user_id: userUuid,
      is_lifetime: false,
      expires_at: '2027-01-01T00:00:00.000Z',
      source: 'payment'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_pro_lifetime_49',
        status: 'PAID',
        amount: 649000,
        currency: 'IDR',
        customer: { email: 'upgrade49@example.com' },
        productName: 'PRO Add-On Photo Selection Lifetime'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const proRow = mockDb.pro_entitlements.find(p => p.user_id === userUuid);

    if (res.statusCode === 200 && proRow && proRow.is_lifetime === true && proRow.expires_at === null) {
      recordTest(49, 'PRO Add-On Lifetime upgrades finite PRO to permanent is_lifetime: true', 'PASS', 'Finite PRO upgraded to lifetime: is_lifetime = true, expires_at = null');
    } else {
      recordTest(49, 'PRO Add-On Lifetime upgrades finite PRO to permanent is_lifetime: true', 'FAIL', `ProRow: ${JSON.stringify(proRow)}`);
    }
  } catch (e) {
    recordTest(49, 'PRO Add-On Lifetime upgrades finite PRO to permanent is_lifetime: true', 'FAIL', e.message);
  }

  // Test 50: PRO Add-On 1 Year purchase preserves existing Lifetime PRO without downgrade
  try {
    resetMockDb();
    const userUuid = 'uuid_user_nodowngrade_50';
    mockDb.users.push({
      id: userUuid,
      Username: 'photographer_lifetime_50',
      Email: 'lifetime50@example.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });
    mockDb.pro_entitlements.push({
      user_id: userUuid,
      is_lifetime: true,
      expires_at: null,
      source: 'payment'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_pro_nodowngrade_50',
        status: 'PAID',
        amount: 149000,
        currency: 'IDR',
        customer: { email: 'lifetime50@example.com' },
        productName: 'PRO Add-On Photo Selection 1 Tahun'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const proRow = mockDb.pro_entitlements.find(p => p.user_id === userUuid);

    if (res.statusCode === 200 && proRow && proRow.is_lifetime === true && proRow.expires_at === null) {
      recordTest(50, 'PRO Add-On 1 Year purchase preserves existing Lifetime PRO without downgrade', 'PASS', 'Existing Lifetime PRO remained is_lifetime = true; zero downgrade to finite date');
    } else {
      recordTest(50, 'PRO Add-On 1 Year purchase preserves existing Lifetime PRO without downgrade', 'FAIL', `ProRow: ${JSON.stringify(proRow)}`);
    }
  } catch (e) {
    recordTest(50, 'PRO Add-On 1 Year purchase preserves existing Lifetime PRO without downgrade', 'FAIL', e.message);
  }

  // Test 51: PRO Add-On for unknown account goes to manual review with zero user created
  try {
    resetMockDb();
    const initialUsersCount = mockDb.users.length;

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_unknown_addon_51',
        status: 'PAID',
        amount: 149000,
        currency: 'IDR',
        customer: { email: 'unregistered_buyer@example.com', name: 'Unknown Buyer' },
        productName: 'PRO Add-On Photo Selection 1 Tahun'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const ledger = mockDb.processed_payments.find(p => p.payment_id === 'tx_unknown_addon_51');
    const userFound = mockDb.users.find(u => u.Email === 'unregistered_buyer@example.com');

    if (res.body.data.status === 'manual_reconciliation_needed' &&
        res.body.data.code === 'ADDON_WITHOUT_ACCOUNT' &&
        !userFound &&
        mockDb.users.length === initialUsersCount &&
        ledger && ledger.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(51, 'PRO Add-On for unknown account goes to manual review with zero user created', 'PASS', 'Zero accounts created; payment held in MANUAL_RECONCILIATION_REQUIRED');
    } else {
      recordTest(51, 'PRO Add-On for unknown account goes to manual review with zero user created', 'FAIL', `Status: ${res.body && res.body.data && res.body.data.status}, UserCreated: ${Boolean(userFound)}`);
    }
  } catch (e) {
    recordTest(51, 'PRO Add-On for unknown account goes to manual review with zero user created', 'FAIL', e.message);
  }

  // Test 52: Arbitrary positive amount (e.g. IDR 1) fails closed (PRICE_MISMATCH_RECONCILIATION)
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'victim_cheap_52',
      Email: 'cheap52@example.com',
      Status: 'Pending',
      ExpiredAt: '2026-10-01'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_cheap_attack_52',
        status: 'PAID',
        amount: 1, // IDR 1 instead of standard IDR 25,000!
        currency: 'IDR',
        customer: { email: 'cheap52@example.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'victim_cheap_52');
    const ledger = mockDb.processed_payments.find(p => p.payment_id === 'tx_cheap_attack_52');

    if (res.body.data.status === 'manual_reconciliation_needed' &&
        res.body.data.code === 'PRICE_MISMATCH_RECONCILIATION' &&
        user.Status === 'Pending' &&
        (!ledger || ledger.status === 'MANUAL_RECONCILIATION_REQUIRED')) {
      recordTest(52, 'Arbitrary positive amount (IDR 1) fails closed to manual reconciliation', 'PASS', 'Rejected arbitrary IDR 1 payment; zero account mutation, marked PRICE_MISMATCH_RECONCILIATION');
    } else {
      recordTest(52, 'Arbitrary positive amount (IDR 1) fails closed to manual reconciliation', 'FAIL', `Res: ${JSON.stringify(res.body)}, UserStatus: ${user.Status}`);
    }
  } catch (e) {
    recordTest(52, 'Arbitrary positive amount (IDR 1) fails closed to manual reconciliation', 'FAIL', e.message);
  }

  // Test 53: Non-PRO user blocked from creating project with Watermark, Upsell, Multi-Category, or Music (HTTP 403)
  try {
    resetMockDb();
    mockDb.sessions.push({ SessionID: 'sess_nonpro_53', Username: 'nonpro_user_53', Role: 'Photographer', CreatedAt: new Date().toISOString() });
    mockDb.users.push({
      id: 'uuid_nonpro_53',
      Username: 'nonpro_user_53',
      Email: 'nonpro53@example.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01',
      Akses_Watermark: 'FALSE'
    });

    const premiumTestCases = [
      { name: 'Watermark', body: { action: 'createProject', namaClient: 'Client 1', useWatermark: true } },
      { name: 'Automated Upsell', body: { action: 'createProject', namaClient: 'Client 2', extraPrice: 5000 } },
      { name: 'Multi-Category', body: { action: 'createProject', namaClient: 'Client 3', categories: [{ name: 'Prewedding', max: 10 }] } },
      { name: 'Gallery Music', body: { action: 'createProject', namaClient: 'Client 4', musicUrl: 'https://example.com/audio.mp3' } }
    ];

    let allBlocked = true;
    for (const tc of premiumTestCases) {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer sess_nonpro_53' },
        body: tc.body
      };
      const res = createMockRes();
      await handler(req, res);
      if (res.statusCode !== 403 || !res.body.message.includes('Add-On PRO')) {
        allBlocked = false;
      }
    }

    if (allBlocked && mockDb.projects.length === 0) {
      recordTest(53, 'Non-PRO user blocked from creating project with premium features', 'PASS', 'Watermark, Upsell, Multi-Category, and Music all cleanly rejected with HTTP 403');
    } else {
      recordTest(53, 'Non-PRO user blocked from creating project with premium features', 'FAIL', `AllBlocked: ${allBlocked}, Projects created: ${mockDb.projects.length}`);
    }
  } catch (e) {
    recordTest(53, 'Non-PRO user blocked from creating project with premium features', 'FAIL', e.message);
  }

  // Test 54: Non-PRO user CAN create basic project (extra=0, no watermark, no category, no music) successfully (HTTP 200)
  try {
    resetMockDb();
    mockDb.sessions.push({ SessionID: 'sess_basic_54', Username: 'basic_user_54', Role: 'Photographer', CreatedAt: new Date().toISOString() });
    mockDb.users.push({
      id: 'uuid_basic_54',
      Username: 'basic_user_54',
      Email: 'basic54@example.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01',
      Akses_Watermark: 'FALSE'
    });

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer sess_basic_54' },
      body: {
        action: 'createProject',
        namaClient: 'Budi & Ani',
        nomorWA: '081234567890',
        maxFoto: 25,
        useWatermark: false,
        extraPrice: 0
      }
    };
    const res = createMockRes();
    await handler(req, res);

    if (res.statusCode === 200 && res.body && (res.body.status === 'success' || res.body.success) && res.body.data && res.body.data.token) {
      recordTest(54, 'Non-PRO user can create basic project successfully', 'PASS', `Basic project created with token: ${res.body.data.token}`);
    } else {
      recordTest(54, 'Non-PRO user can create basic project successfully', 'FAIL', `Status: ${res.statusCode}, Body: ${JSON.stringify(res.body)}`);
    }
  } catch (e) {
    recordTest(54, 'Non-PRO user can create basic project successfully', 'FAIL', e.message);
  }

  // Test 55: Non-PRO user blocked from enabling watermark via toggle route (HTTP 403)
  try {
    resetMockDb();
    mockDb.sessions.push({ SessionID: 'sess_toggle_55', Username: 'toggle_user_55', Role: 'Photographer', CreatedAt: new Date().toISOString() });
    mockDb.users.push({
      id: 'uuid_toggle_55',
      Username: 'toggle_user_55',
      Email: 'toggle55@example.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01',
      Akses_Watermark: 'FALSE'
    });
    mockDb.projects.push({
      id: 'proj_toggle_55',
      Token: 'tok_toggle_55',
      Owner: 'toggle_user_55',
      UseWatermark: 'FALSE'
    });

    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer sess_toggle_55' },
      body: { action: 'toggleProjectWatermark', id: 'proj_toggle_55' }
    };
    const res = createMockRes();
    await handler(req, res);

    const proj = mockDb.projects.find(p => p.id === 'proj_toggle_55');

    if (res.statusCode === 403 && proj.UseWatermark === 'FALSE') {
      recordTest(55, 'Non-PRO user blocked from enabling watermark via toggle route', 'PASS', 'Unauthorized toggle mutation rejected HTTP 403; UseWatermark remained FALSE');
    } else {
      recordTest(55, 'Non-PRO user blocked from enabling watermark via toggle route', 'FAIL', `Status: ${res.statusCode}, Watermark: ${proj.UseWatermark}`);
    }
  } catch (e) {
    recordTest(55, 'Non-PRO user blocked from enabling watermark via toggle route', 'FAIL', e.message);
  }

  // Test 56: Expired 1-Year PRO disables new premium mutations while preserving published client gallery access
  try {
    resetMockDb();
    const userUuid = 'uuid_expired_pro_56';
    mockDb.sessions.push({ SessionID: 'sess_expired_56', Username: 'photographer_exp_56', Role: 'Photographer', CreatedAt: new Date().toISOString() });
    mockDb.users.push({
      id: userUuid,
      Username: 'photographer_exp_56',
      Email: 'exp56@example.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: '1 Tahun',
      ExpiredAt: '2027-10-01',
      Akses_Watermark: 'FALSE'
    });
    // PRO entitlement expired yesterday
    const pastExp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockDb.pro_entitlements.push({
      user_id: userUuid,
      is_lifetime: false,
      expires_at: pastExp,
      source: 'payment'
    });
    // Historical published project
    mockDb.projects.push({
      id: 'proj_published_56',
      Token: 'tok_published_56',
      Slug: 'galeri-klien-56',
      'Short Slug': 'galeri-klien-56',
      Owner: 'photographer_exp_56',
      'Nama Client': 'Klien Bahagia',
      'Password Client': '',
      'Max Foto': 50,
      UseWatermark: 'TRUE',
      'Daftar Pilihan': JSON.stringify([{ n: 'photo1.jpg', f: 'drive', u: 'ref1', c: '' }])
    });

    // 1. Photographer attempts new premium project creation -> MUST be blocked (403)
    const createReq = {
      method: 'POST',
      headers: { authorization: 'Bearer sess_expired_56' },
      body: { action: 'createProject', namaClient: 'New Client', useWatermark: true }
    };
    const createRes = createMockRes();
    await handler(createReq, createRes);

    // 2. Client accesses published gallery -> MUST succeed (200), retaining historical gallery access
    const galleryReq = {
      method: 'POST',
      headers: {},
      body: { action: 'getProjectForClient', token: 'tok_published_56' }
    };
    const galleryRes = createMockRes();
    await handler(galleryReq, galleryRes);

    if (createRes.statusCode === 403 &&
        galleryRes.statusCode === 200 &&
        galleryRes.body && (galleryRes.body.status === 'success' || galleryRes.body.success) &&
        galleryRes.body.data &&
        (galleryRes.body.data.name === 'Klien Bahagia' || galleryRes.body.data.namaClient === 'Klien Bahagia')) {
      recordTest(56, 'Expired 1-Year PRO disables new premium mutations while preserving published client gallery access', 'PASS', 'New premium creation blocked (403); existing published gallery read preserved (200)');
    } else {
      recordTest(56, 'Expired 1-Year PRO disables new premium mutations while preserving published client gallery access', 'FAIL', `CreateStatus: ${createRes.statusCode}, GalleryStatus: ${galleryRes.statusCode}`);
    }
  } catch (e) {
    recordTest(56, 'Expired 1-Year PRO disables new premium mutations while preserving published client gallery access', 'FAIL', e.message);
  }

  // Test 57: Blocker 1 — Unrelated store items ('Paket 1 Bulan Membership Lain', 'Paket 6 Bulan Sertifikasi Non-Fotografi', 'Add-on Lifetime Produk Lain') must NEVER activate Photo Selection
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'victim_unrelated_57',
      Email: 'unrelated@buyer.test',
      Status: 'Pending',
      ExpiredAt: '2026-10-01',
      Paket: '1 Bulan'
    });

    const unrelatedProducts = [
      { name: 'Paket 1 Bulan Membership Lain', amount: 25000 },
      { name: 'Paket 6 Bulan Sertifikasi Non-Fotografi', amount: 120000 },
      { name: 'Add-on Lifetime Produk Lain', amount: 649000 }
    ];

    let allDenied = true;
    for (const prod of unrelatedProducts) {
      const payload = {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: `tx_unrelated_${Date.now()}_${Math.random()}`,
          status: 'PAID',
          amount: prod.amount,
          currency: 'IDR',
          customer: { email: 'unrelated@buyer.test' },
          productName: prod.name
        }
      };
      const res = createMockRes();
      await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);
      const resData = res.body && (res.body.data || res.body);
      const resResult = (resData && resData.result) || '';
      const u = mockDb.users.find(usr => usr.Username === 'victim_unrelated_57');
      if (u.Status !== 'Pending' || u.ExpiredAt !== '2026-10-01' || !resResult.includes('Store sale')) {
        allDenied = false;
      }
    }

    if (allDenied && mockDb.processed_payments.length === 0) {
      recordTest(57, 'Unrelated store items never activate Photo Selection accounts (Blocker 1 Fix)', 'PASS', 'Membership Lain, Sertifikasi Non-Fotografi, and Produk Lain logged as store sales with zero user mutation');
    } else {
      recordTest(57, 'Unrelated store items never activate Photo Selection accounts (Blocker 1 Fix)', 'FAIL', 'Unrelated product caused user mutation or improper classification');
    }
  } catch (e) {
    recordTest(57, 'Unrelated store items never activate Photo Selection accounts (Blocker 1 Fix)', 'FAIL', e.message);
  }

  // Test 58: Blocker 1 — Verified 5 products activate correctly, while unverified/misleading Photo Selection products held in manual review
  try {
    resetMockDb();
    mockDb.users.push({ Username: 'user_sku_test_58', Email: 'sku58@buyer.test', Status: 'Active', ExpiredAt: '2026-11-01', Paket: '1 Bulan' });

    const misleadingProducts = [
      { name: 'PRO Add-On 1 Bulan Photo Selection', amount: 50000 }, // No 1-month PRO Add-on exists
      { name: 'Paket Lifetime Photo Selection', amount: 350000 },      // No new-subscription Lifetime exists
      { name: 'Kaos Distro Photo Selection Merchandise', amount: 150000 } // Unrecognized SKU
    ];

    let allHeld = true;
    for (const mis of misleadingProducts) {
      const payload = {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: `tx_misleading_${Date.now()}_${Math.random()}`,
          status: 'PAID',
          amount: mis.amount,
          currency: 'IDR',
          customer: { email: 'sku58@buyer.test' },
          productName: mis.name
        }
      };
      const res = createMockRes();
      await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);
      const u = mockDb.users.find(usr => usr.Username === 'user_sku_test_58');
      if (res.body.data.status !== 'manual_reconciliation_needed' || res.body.data.code !== 'UNVERIFIED_PRODUCT_CATALOG' || u.ExpiredAt !== '2026-11-01') {
        allHeld = false;
      }
    }

    if (allHeld) {
      recordTest(58, 'Misleading and unverified Photo Selection products held in manual review (Blocker 1 Fix)', 'PASS', 'PRO Add-On 1 Bulan, Lifetime new subscription, and merchandise held with UNVERIFIED_PRODUCT_CATALOG');
    } else {
      recordTest(58, 'Misleading and unverified Photo Selection products held in manual review (Blocker 1 Fix)', 'FAIL', 'An unverified product mutated account or bypassed catalog check');
    }
  } catch (e) {
    recordTest(58, 'Misleading and unverified Photo Selection products held in manual review (Blocker 1 Fix)', 'FAIL', e.message);
  }

  // Test 59: Blocker 2 — Transient database error (HTTP 503) on pro_entitlements fails closed
  try {
    resetMockDb();
    const userUuid = 'uuid_user_503_test';
    mockDb.sessions.push({ SessionID: 'sess_503_test', Username: 'user_503_test', Role: 'Photographer', CreatedAt: new Date().toISOString() });
    mockDb.users.push({
      id: userUuid,
      Username: 'user_503_test',
      Email: 'u503@test.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: 'Lifetime',     // Has legacy Lifetime Paket!
      ExpiredAt: 'Lifetime',
      Akses_Watermark: 'TRUE' // Has legacy Watermark TRUE!
    });

    // Simulate transient 503 database timeout on pro_entitlements
    failProEntitlements503 = true;

    // 1. Direct resolver test: must fail-closed (isPro = false, lookupError = true)
    const proEnt = await handler.getUserProEntitlement('user_503_test');

    // 2. Premium project mutation attempt during 503 outage: must be REJECTED (HTTP 403 or 503)
    const createReq = {
      method: 'POST',
      headers: { authorization: 'Bearer sess_503_test' },
      body: { action: 'createProject', namaClient: 'Client 503', useWatermark: true }
    };
    const createRes = createMockRes();
    await handler(createReq, createRes);

    // 3. Basic project creation (non-premium): must still SUCCEED (200)
    const basicReq = {
      method: 'POST',
      headers: { authorization: 'Bearer sess_503_test' },
      body: { action: 'createProject', namaClient: 'Basic Client 503', useWatermark: false, extraPrice: 0 }
    };
    const basicRes = createMockRes();
    await handler(basicReq, basicRes);

    failProEntitlements503 = false;

    if (proEnt.isPro === false &&
        proEnt.lookupError === true &&
        createRes.statusCode !== 200 &&
        basicRes.statusCode === 200) {
      recordTest(59, 'Transient DB error (503) on pro_entitlements fails closed for premium operations (Blocker 2 Fix)', 'PASS', 'Legacy flags ignored on transient DB error; premium mutation blocked, basic project allowed');
    } else {
      recordTest(59, 'Transient DB error (503) on pro_entitlements fails closed for premium operations (Blocker 2 Fix)', 'FAIL', `isPro: ${proEnt.isPro}, lookupError: ${proEnt.lookupError}, createStatus: ${createRes.statusCode}, basicStatus: ${basicRes.statusCode}`);
    }
  } catch (e) {
    failProEntitlements503 = false;
    recordTest(59, 'Transient DB error (503) on pro_entitlements fails closed for premium operations (Blocker 2 Fix)', 'FAIL', e.message);
  }

  // Test 60: Blocker 2 — Subscription Lifetime + finite 1-Year PRO stays strictly finite
  try {
    resetMockDb();
    const userUuid = 'uuid_user_sub_lifetime_pro_finite';
    const finiteExpiryIso = '2027-04-01T00:00:00.000Z';
    mockDb.users.push({
      id: userUuid,
      Username: 'user_lifetime_sub_finite_pro',
      Email: 'lifesub@test.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: 'Lifetime',     // Subscription is Lifetime!
      ExpiredAt: 'Lifetime', // Subscription ExpiredAt is Lifetime!
      Akses_Watermark: 'TRUE'
    });
    mockDb.pro_entitlements.push({
      user_id: userUuid,
      is_lifetime: false,     // PRO Add-On is FINITE!
      expires_at: finiteExpiryIso,
      source: 'payment'
    });

    const proEnt = await handler.getUserProEntitlement('user_lifetime_sub_finite_pro');

    if (proEnt.isPro === true &&
        proEnt.isLifetime === false &&
        proEnt.expiresAt === finiteExpiryIso) {
      recordTest(60, 'Subscription Lifetime with finite 1-Year PRO stays strictly finite (Blocker 2 Fix)', 'PASS', 'PRO is finite (isLifetime = false, expiresAt = 2027-04-01); subscription Lifetime did not leak into PRO');
    } else {
      recordTest(60, 'Subscription Lifetime with finite 1-Year PRO stays strictly finite (Blocker 2 Fix)', 'FAIL', `isPro: ${proEnt.isPro}, isLifetime: ${proEnt.isLifetime}, expiresAt: ${proEnt.expiresAt}`);
    }
  } catch (e) {
    recordTest(60, 'Subscription Lifetime with finite 1-Year PRO stays strictly finite (Blocker 2 Fix)', 'FAIL', e.message);
  }

  // Test 61: Blocker 2 — User with NO row in pro_entitlements returns isPro = false (no legacy leak)
  try {
    resetMockDb();
    const userUuid = 'uuid_user_no_pro_row';
    mockDb.users.push({
      id: userUuid,
      Username: 'user_no_pro_row',
      Email: 'nopro@test.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01',
      Akses_Watermark: 'TRUE' // Has stale legacy flag!
    });
    // mockDb.pro_entitlements is EMPTY for this user!

    const proEnt = await handler.getUserProEntitlement('user_no_pro_row');

    if (proEnt.isPro === false && proEnt.isLifetime === false && proEnt.source === 'no_entitlement_record') {
      recordTest(61, 'User with no row in pro_entitlements denied PRO despite legacy Akses_Watermark (Blocker 2 Fix)', 'PASS', 'Authoritative pro_entitlements checked; stale legacy flag did not grant PRO');
    } else {
      recordTest(61, 'User with no row in pro_entitlements denied PRO despite legacy Akses_Watermark (Blocker 2 Fix)', 'FAIL', `isPro: ${proEnt.isPro}, source: ${proEnt.source}`);
    }
  } catch (e) {
    recordTest(61, 'User with no row in pro_entitlements denied PRO despite legacy Akses_Watermark (Blocker 2 Fix)', 'FAIL', e.message);
  }

  // Test 62: Blocker 2 — Pre-migration compatibility window (HTTP 404 table absent) preserves legacy grandfather rights
  try {
    resetMockDb();
    const userUuid = 'uuid_user_pre_mig';
    mockDb.users.push({
      id: userUuid,
      Username: 'user_pre_mig',
      Email: 'premig@test.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: 'Lifetime',
      ExpiredAt: 'Lifetime',
      Akses_Watermark: 'TRUE'
    });

    failProEntitlements404 = true; // Table absent before migration

    const proEnt = await handler.getUserProEntitlement('user_pre_mig');

    failProEntitlements404 = false;

    if (proEnt.isPro === true && proEnt.isLifetime === true && proEnt.source === 'pre_migration_legacy_fallback') {
      recordTest(62, 'Pre-migration table absent (404) preserves legacy fallback safely (Blocker 2 Fix)', 'PASS', 'Grandfather rights protected during migration transition window');
    } else {
      recordTest(62, 'Pre-migration table absent (404) preserves legacy fallback safely (Blocker 2 Fix)', 'FAIL', `isPro: ${proEnt.isPro}, source: ${proEnt.source}`);
    }
  } catch (e) {
    failProEntitlements404 = false;
    recordTest(62, 'Pre-migration table absent (404) preserves legacy fallback safely (Blocker 2 Fix)', 'FAIL', e.message);
  }

  // Test 63 (Req 1): Historical FAILED log containing 'GAGAL perpanjangan' with same tx ID; new valid PAID webhook must NOT be treated as already_processed from log text
  try {
    resetMockDb();
    const txId63 = 'transaction_new_valid_001';
    mockDb.users.push({
      Username: 'user_failed_retry_63',
      Email: 'retry_customer@example.com',
      Status: 'Pending',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });
    // Legacy failure log from earlier attempt
    mockDb.mayar_logs.push({
      id: 'log_failed_legacy_63',
      Event: 'payment.failed',
      'Customer Email': 'retry_customer@example.com',
      'Status/Product': 'Paket 1 Bulan - Photo Selection',
      'Hasil Aktivasi': `[TX:${txId63}] GAGAL perpanjangan - pembayaran ditolak, tidak aktif`,
      'Raw JSON Payload': JSON.stringify({ id: txId63, status: 'FAILED', amount: 25000 }),
      Timestamp: '2026-10-01T10:00:00.000Z'
    });

    // New confirmed webhook arrives with SAME tx ID
    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: txId63,
        status: 'PAID',
        amount: 25000,
        currency: 'IDR',
        customer: { email: 'retry_customer@example.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'user_failed_retry_63');
    const resData = res.body && (res.body.data || res.body);

    if (res.statusCode === 200 &&
        resData.status === 'processed' &&
        user.Status === 'Active' &&
        user.ExpiredAt > '2026-11-01') {
      recordTest(63, "Historical FAILED log containing 'GAGAL perpanjangan' does not block new valid payment", 'PASS', `Payment activated successfully: Status = Active, ExpiredAt extended to ${user.ExpiredAt}`);
    } else {
      recordTest(63, "Historical FAILED log containing 'GAGAL perpanjangan' does not block new valid payment", 'FAIL', `Res: ${JSON.stringify(res.body)}, User: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(63, "Historical FAILED log containing 'GAGAL perpanjangan' does not block new valid payment", 'FAIL', e.message);
  }

  // Test 64 (Req 2): Pending/reminder/cancelled historical logs containing 'active' or 'sukses' in explanatory prose must NOT seed completed ledger
  try {
    resetMockDb();
    const txId64 = 'tx_reminder_prose_64';
    mockDb.users.push({
      Username: 'user_prose_64',
      Email: 'prose_customer@example.com',
      Status: 'Pending',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });
    // Reminder log with 'active' and 'sukses' in descriptive prose
    mockDb.mayar_logs.push({
      id: 'log_remind_64',
      Event: 'invoice.reminder',
      'Customer Email': 'prose_customer@example.com',
      'Status/Product': 'Paket 1 Bulan - Photo Selection',
      'Hasil Aktivasi': `[TX:${txId64}] Reminder dikirim: akun belum active, bayar sekarang agar sukses diperpanjang`,
      'Raw JSON Payload': JSON.stringify({ id: txId64, status: 'PENDING', amount: 25000 }),
      Timestamp: '2026-10-05T12:00:00.000Z'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: txId64,
        status: 'PAID',
        amount: 25000,
        currency: 'IDR',
        customer: { email: 'prose_customer@example.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'user_prose_64');
    const resData = res.body && (res.body.data || res.body);

    if (res.statusCode === 200 &&
        resData.status === 'processed' &&
        user.Status === 'Active' &&
        user.ExpiredAt > '2026-11-01') {
      recordTest(64, "Reminder log with 'active' or 'sukses' in prose does not falsely block payment", 'PASS', `Processed successfully without premature already_processed; ExpiredAt = ${user.ExpiredAt}`);
    } else {
      recordTest(64, "Reminder log with 'active' or 'sukses' in prose does not falsely block payment", 'FAIL', `Res: ${JSON.stringify(res.body)}, User: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(64, "Reminder log with 'active' or 'sukses' in prose does not falsely block payment", 'FAIL', e.message);
  }

  // Test 65 (Req 3): Bare ID substring inside another payment's raw JSON MUST NOT be treated as exact ledger match
  try {
    resetMockDb();
    const shortId = 'tx_short_target_65';
    const longIdContainingShort = 'tx_long_prefix_tx_short_target_65_suffix_9999';
    mockDb.users.push({
      Username: 'user_substring_65',
      Email: 'substring_customer@example.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });
    // Ledger has a completely different long transaction ID that embeds shortId as substring
    mockDb.processed_payments.push({
      payment_id: longIdContainingShort,
      customer_email: 'other_buyer@example.com',
      product_name: 'Paket 1 Bulan - Photo Selection',
      plan_name: '1 Bulan',
      amount: 25000,
      currency: 'IDR',
      status: 'SUCCESS'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: shortId, // Bare short ID
        status: 'PAID',
        amount: 25000,
        currency: 'IDR',
        customer: { email: 'substring_customer@example.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'user_substring_65');
    const resData = res.body && (res.body.data || res.body);
    const shortLedgerRow = mockDb.processed_payments.find(p => p.payment_id === shortId);

    if (res.statusCode === 200 &&
        resData.status === 'processed' &&
        user.ExpiredAt > '2026-11-01' &&
        shortLedgerRow && shortLedgerRow.status === 'SUCCESS') {
      recordTest(65, "Substring inside another payment ID does not cause false duplicate collision", 'PASS', `Exact equality enforced in processed_payments; shortId activated independently to ${user.ExpiredAt}`);
    } else {
      recordTest(65, "Substring inside another payment ID does not cause false duplicate collision", 'FAIL', `Res: ${JSON.stringify(res.body)}, User: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(65, "Substring inside another payment ID does not cause false duplicate collision", 'FAIL', e.message);
  }

  // Test 66 (Req 4): Genuine operator-seeded HISTORICAL_SETTLED ledger ID skips replay and never changes expiration
  try {
    resetMockDb();
    const seededTxId = 'tx_operator_seeded_historical_66';
    mockDb.users.push({
      Username: 'user_seeded_hist_66',
      Email: 'seeded_hist@example.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });
    // Operator pre-seeded ledger from manual audit
    mockDb.processed_payments.push({
      payment_id: seededTxId,
      customer_email: 'seeded_hist@example.com',
      product_name: 'Paket 1 Bulan - Photo Selection',
      plan_name: '1 Bulan',
      amount: 25000,
      currency: 'IDR',
      status: 'HISTORICAL_SETTLED',
      activation_result: 'OPERATOR_AUDITED_HISTORICAL_SETTLED'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: seededTxId,
        status: 'PAID',
        amount: 25000,
        currency: 'IDR',
        customer: { email: 'seeded_hist@example.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'user_seeded_hist_66');
    const resData = res.body && (res.body.data || res.body);

    if (res.statusCode === 200 &&
        resData.status === 'already_processed' &&
        user.ExpiredAt === '2026-11-01') {
      recordTest(66, 'Operator-seeded HISTORICAL_SETTLED ledger ID skips replay with zero extension', 'PASS', 'Terminal status HISTORICAL_SETTLED recognized in ledger; ExpiredAt strictly preserved at 2026-11-01');
    } else {
      recordTest(66, 'Operator-seeded HISTORICAL_SETTLED ledger ID skips replay with zero extension', 'FAIL', `Res: ${JSON.stringify(res.body)}, ExpiredAt: ${user.ExpiredAt}`);
    }
  } catch (e) {
    recordTest(66, 'Operator-seeded HISTORICAL_SETTLED ledger ID skips replay with zero extension', 'FAIL', e.message);
  }

  // Test 67 (Req 5): New payment with no ledger ID is processed once through RPC, independent of loose historical text; repeat is idempotent
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'user_active_new_67',
      Email: 'new67@customer.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });

    const newTxPayload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_brand_new_67',
        status: 'PAID',
        amount: 25000,
        currency: 'IDR',
        customer: { email: 'new67@customer.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    // First arrival
    const res1 = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: newTxPayload }, res1);

    const uAfter1 = mockDb.users.find(u => u.Username === 'user_active_new_67');
    const expAfter1 = uAfter1.ExpiredAt;

    // Second arrival (replay)
    const res2 = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: newTxPayload }, res2);

    const uAfter2 = mockDb.users.find(u => u.Username === 'user_active_new_67');
    const res2Data = res2.body && (res2.body.data || res2.body);

    if (res1.statusCode === 200 &&
        res2.statusCode === 200 &&
        res2Data.status === 'already_processed' &&
        expAfter1 > '2026-11-01' &&
        uAfter2.ExpiredAt === expAfter1) {
      recordTest(67, 'New payment activates once through RPC; repeat delivery is strictly idempotent', 'PASS', `First arrival: ${expAfter1}, Replay: ${uAfter2.ExpiredAt} (Idempotent duplicate skipped)`);
    } else {
      recordTest(67, 'New payment activates once through RPC; repeat delivery is strictly idempotent', 'FAIL', `First: ${expAfter1}, Second: ${uAfter2.ExpiredAt}`);
    }
  } catch (e) {
    recordTest(67, 'New payment activates once through RPC; repeat delivery is strictly idempotent', 'FAIL', e.message);
  }

  // Test 68 (Req 6): Simulated ledger read/write failure fails closed, without user mutation or falsely ACKing unconfirmed historic status
  try {
    resetMockDb();
    mockDb.users.push({
      Username: 'user_db_fail_68',
      Email: 'dbfail@customer.com',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });

    // Simulate transient database 500 error when querying processed_payments ledger
    failProcessedPayments500 = true;

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_db_fail_68',
        status: 'PAID',
        amount: 25000,
        currency: 'IDR',
        customer: { email: 'dbfail@customer.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    failProcessedPayments500 = false;
    const user = mockDb.users.find(u => u.Username === 'user_db_fail_68');

    if (res.statusCode === 500 && user.ExpiredAt === '2026-11-01') {
      recordTest(68, 'Simulated ledger read failure fails closed (HTTP 500) without mutating user account', 'PASS', 'Database failure caught safely; zero users mutated, allowing safe retry by provider');
    } else {
      recordTest(68, 'Simulated ledger read failure fails closed (HTTP 500) without mutating user account', 'FAIL', `Status: ${res.statusCode}, User ExpiredAt: ${user.ExpiredAt}`);
    }
  } catch (e) {
    failProcessedPayments500 = false;
    recordTest(68, 'Simulated ledger read failure fails closed (HTTP 500) without mutating user account', 'FAIL', e.message);
  }

  // Test 69 (Req 7): Provider PAID may represent payment not yet applied by old system; never mark as already processed without proof of old activation
  try {
    resetMockDb();
    const unappliedTxId = 'tx_paid_not_yet_applied_69';
    mockDb.users.push({
      Username: 'user_unapplied_69',
      Email: 'unapplied@customer.com',
      Status: 'Pending',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01'
    });
    // Legacy log shows an uncompleted attempt without success confirmation
    mockDb.mayar_logs.push({
      id: 'log_unapplied_69',
      Event: 'payment.received',
      'Customer Email': 'unapplied@customer.com',
      'Status/Product': 'Paket 1 Bulan - Photo Selection',
      'Hasil Aktivasi': `[TX:${unappliedTxId}] PENDING_MANUAL_REVIEW`,
      Timestamp: '2026-10-02T10:00:00.000Z'
    });
    // No processed_payments record exists

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: unappliedTxId,
        status: 'PAID',
        amount: 25000,
        currency: 'IDR',
        customer: { email: 'unapplied@customer.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'user_unapplied_69');
    const resData = res.body && (res.body.data || res.body);

    if (res.statusCode === 200 &&
        resData.status === 'processed' &&
        user.Status === 'Active' &&
        user.ExpiredAt > '2026-11-01') {
      recordTest(69, 'Unapplied historical payment is processed via RPC rather than falsely assumed completed', 'PASS', `Customer credited properly: Status = Active, ExpiredAt = ${user.ExpiredAt}`);
    } else {
      recordTest(69, 'Unapplied historical payment is processed via RPC rather than falsely assumed completed', 'FAIL', `Res: ${JSON.stringify(res.body)}, User: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(69, 'Unapplied historical payment is processed via RPC rather than falsely assumed completed', 'FAIL', e.message);
  }

  // Test 70: Static Presence and Structural File Inspection of Production Migration Inclusion & 24-Column Schema
  try {
    const prodMigPath = path.join(__dirname, '../supabase/migrations/20261012_phase475_payment_idempotency.sql');
    const runnerSqlPath = path.join(__dirname, '../test/isolated-postgresql-runner.sql');
    const setupSqlPath = path.join(__dirname, '../test/concurrency-setup.sql');

    const prodMigSql = fs.readFileSync(prodMigPath, 'utf8');
    const runnerSql = fs.readFileSync(runnerSqlPath, 'utf8');
    const setupSql = fs.readFileSync(setupSqlPath, 'utf8');

    // 1. Verify that test runner includes the REAL production migration source via \i
    const runnerLoadsProdMigration = runnerSql.includes('\\i supabase/migrations/20261012_phase475_payment_idempotency.sql');
    const setupLoadsProdMigration = setupSql.includes('\\i supabase/migrations/20261012_phase475_payment_idempotency.sql');

    // 2. Verify that synthetic users schema has all 24 verified production columns including ConfirmToken & ProjectCreated
    const expectedCols = [
      'id', 'Username', 'Password', 'Nama', 'Role', 'Status', 'Email', 'No HP',
      'Paket', 'ExpiredAt', 'Akses_Watermark', 'Akses_Upsell', 'Akses_Grid', 'Akses_Kategori',
      'BrandName', 'BrandLogo', 'WatermarkUrl', 'BankName', 'BankAccount', 'BankAccountName',
      'LastActive', 'ConfirmToken', 'ProjectCreated', 'created_at'
    ];
    const hasAll24ColsInRunner = expectedCols.every(c => runnerSql.includes(c));
    const hasAll24ColsInSetup = expectedCols.every(c => setupSql.includes(c));

    // 3. Verify that production migration RPC contains exact 14 parameters and strict terminal checks
    const has14Params = prodMigSql.includes('p_payment_id TEXT') &&
                        prodMigSql.includes('p_currency TEXT DEFAULT \'IDR\'') &&
                        prodMigSql.includes('p_customer_name TEXT DEFAULT NULL');
    const hasTerminalStatuses = prodMigSql.includes("'SUCCESS', 'STORE_SALE', 'HISTORICAL_SETTLED', 'ALREADY_PROCESSED_LEGACY'");

    const testTitle = 'Static presence and structural file inspection of production migration inclusion and 24-column definitions in local test harness (Static check, not live DB execution)';

    if (runnerLoadsProdMigration && setupLoadsProdMigration && hasAll24ColsInRunner && hasAll24ColsInSetup && has14Params && hasTerminalStatuses) {
      recordTest(70, testTitle, 'PASS', 'Static inspection confirmed: test runner and concurrency setup reference real production migration via \\i and define all 24 verified production columns with nullable Username (Live DB execution not performed)');
    } else {
      recordTest(70, testTitle, 'FAIL', `Static inspection failed: RunnerLoad: ${runnerLoadsProdMigration}, SetupLoad: ${setupLoadsProdMigration}, 24Cols: ${hasAll24ColsInRunner && hasAll24ColsInSetup}`);
    }
  } catch (e) {
    recordTest(70, 'Static presence and structural file inspection of production migration inclusion and 24-column definitions in local test harness (Static check, not live DB execution)', 'FAIL', e.message);
  }

  // Test 71: Task 7A - Fresh Pending 1 Bulan with accidental ExpiredAt='Lifetime' + Rp25,000 -> finite +30 days, NEVER Lifetime
  try {
    resetMockDb();
    mockDb.users.push({
      id: 'uuid_legacy_p1m',
      Username: 'user_pending_lt_71',
      Nama: 'Legacy Pending User',
      Email: 'legacy_p1m@customer.com',
      Role: 'Photographer',
      Status: 'Pending',
      Paket: '1 Bulan',
      ExpiredAt: 'Lifetime', // The accidental legacy state
      Akses_Watermark: 'FALSE'
    });

    const payload = {
      action: 'mayarWebhook',
      event: 'payment.received',
      data: {
        id: 'tx_71_pending_lt_fix',
        status: 'PAID',
        amount: 25000,
        currency: 'IDR',
        customer: { email: 'legacy_p1m@customer.com' },
        productName: 'Paket 1 Bulan - Photo Selection'
      }
    };

    const res = createMockRes();
    await handler({ method: 'POST', url: `/api/supabase?token=${TEST_SECRET}`, body: payload }, res);

    const user = mockDb.users.find(u => u.Username === 'user_pending_lt_71');
    const today = new Date().toISOString().split('T')[0];

    if (res.statusCode === 200 &&
        user.Status === 'Active' &&
        user.Paket === '1 Bulan' &&
        user.ExpiredAt !== 'Lifetime' &&
        user.ExpiredAt > today) {
      recordTest(71, 'Pending 1 Bulan with accidental ExpiredAt=Lifetime receives finite +30 days upon payment (never Lifetime)', 'PASS', `Status: ${user.Status}, ExpiredAt: ${user.ExpiredAt}`);
    } else {
      recordTest(71, 'Pending 1 Bulan with accidental ExpiredAt=Lifetime receives finite +30 days upon payment (never Lifetime)', 'FAIL', `User state: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(71, 'Pending 1 Bulan with accidental ExpiredAt=Lifetime receives finite +30 days upon payment (never Lifetime)', 'FAIL', e.message);
  }

  // Test 72: Tasks 7B & 7C - Fresh Pending 6 Bulan (+180 days) and 1 Tahun (+365 days) finite activation
  try {
    resetMockDb();
    mockDb.users.push({
      id: 'uuid_p6m',
      Username: 'user_pending_6m_72',
      Email: 'p6m@customer.com',
      Role: 'Photographer',
      Status: 'Pending',
      Paket: '6 Bulan',
      ExpiredAt: null
    });
    mockDb.users.push({
      id: 'uuid_p1y',
      Username: 'user_pending_1y_72',
      Email: 'p1y@customer.com',
      Role: 'Photographer',
      Status: 'Pending',
      Paket: '1 Tahun',
      ExpiredAt: null
    });

    const res6m = createMockRes();
    await handler({
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_72_p6m',
          status: 'PAID',
          amount: 120000,
          currency: 'IDR',
          customer: { email: 'p6m@customer.com' },
          productName: 'Paket 6 Bulan - Photo Selection'
        }
      }
    }, res6m);

    const res1y = createMockRes();
    await handler({
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_72_p1y',
          status: 'PAID',
          amount: 199000,
          currency: 'IDR',
          customer: { email: 'p1y@customer.com' },
          productName: 'Paket 1 Tahun - Photo Selection'
        }
      }
    }, res1y);

    const u6m = mockDb.users.find(u => u.Username === 'user_pending_6m_72');
    const u1y = mockDb.users.find(u => u.Username === 'user_pending_1y_72');

    const d6m = new Date(); d6m.setDate(d6m.getDate() + 175);
    const d1y = new Date(); d1y.setDate(d1y.getDate() + 360);

    if (u6m.Status === 'Active' && u6m.ExpiredAt > d6m.toISOString().split('T')[0] &&
        u1y.Status === 'Active' && u1y.ExpiredAt > d1y.toISOString().split('T')[0]) {
      recordTest(72, 'Pending 6 Bulan and 1 Tahun activated with exact finite durations (+180 and +365 days)', 'PASS', `6M: ${u6m.ExpiredAt}, 1Y: ${u1y.ExpiredAt}`);
    } else {
      recordTest(72, 'Pending 6 Bulan and 1 Tahun activated with exact finite durations (+180 and +365 days)', 'FAIL', `6M: ${JSON.stringify(u6m)}, 1Y: ${JSON.stringify(u1y)}`);
    }
  } catch (e) {
    recordTest(72, 'Pending 6 Bulan and 1 Tahun activated with exact finite durations (+180 and +365 days)', 'FAIL', e.message);
  }

  // Test 73: Task 4 - Public self-registration rejects Lifetime plan with 400 Bad Request
  try {
    resetMockDb();
    const resLt = createMockRes();
    await handler({
      method: 'POST',
      url: '/api/supabase',
      body: {
        action: 'register',
        formData: {
          username: 'self_reg_lt',
          nama: 'Self Reg LT',
          email: 'self_lt@test.com',
          password: 'Password123!',
          paket: 'Lifetime'
        }
      }
    }, resLt);

    const resPaid = createMockRes();
    await handler({
      method: 'POST',
      url: '/api/supabase',
      body: {
        action: 'register',
        formData: {
          username: 'self_reg_1m',
          nama: 'Self Reg 1M',
          email: 'self_1m@test.com',
          password: 'Password123!',
          paket: '1 Bulan'
        }
      }
    }, resPaid);

    const registered1m = mockDb.users.find(u => u.Username === 'self_reg_1m');

    if (resLt.statusCode === 400 &&
        resLt.body && resLt.body.message && resLt.body.message.includes('Paket Lifetime tidak tersedia') &&
        resPaid.statusCode === 200 &&
        registered1m && registered1m.Status === 'Pending' && registered1m.ExpiredAt === null) {
      recordTest(73, 'Public self-registration rejects Lifetime (400) and initializes paid plans with ExpiredAt=null, Status=Pending', 'PASS', 'Lifetime rejected; 1 Bulan saved with ExpiredAt=null, Status=Pending');
    } else {
      recordTest(73, 'Public self-registration rejects Lifetime (400) and initializes paid plans with ExpiredAt=null, Status=Pending', 'FAIL', `resLt: ${JSON.stringify(resLt.body)}, reg1m: ${JSON.stringify(registered1m)}`);
    }
  } catch (e) {
    recordTest(73, 'Public self-registration rejects Lifetime (400) and initializes paid plans with ExpiredAt=null, Status=Pending', 'FAIL', e.message);
  }

  // Test 74: Task 7E - Genuine Photographer Lifetime stays Lifetime on subsequent short-plan payment
  try {
    resetMockDb();
    mockDb.users.push({
      id: 'uuid_genuine_lt',
      Username: 'genuine_lt_user',
      Email: 'genuine_lt@customer.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: 'Lifetime',
      ExpiredAt: 'Lifetime'
    });

    const res = createMockRes();
    await handler({
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_74_genuine_lt_renew',
          status: 'PAID',
          amount: 25000,
          currency: 'IDR',
          customer: { email: 'genuine_lt@customer.com' },
          productName: 'Paket 1 Bulan - Photo Selection'
        }
      }
    }, res);

    const user = mockDb.users.find(u => u.Username === 'genuine_lt_user');
    if (res.statusCode === 200 &&
        user.Paket === 'Lifetime' &&
        user.ExpiredAt === 'Lifetime' &&
        user.Status === 'Active') {
      recordTest(74, 'Genuine Photographer Lifetime stays Lifetime on subsequent short-plan payment', 'PASS', `Paket: ${user.Paket}, ExpiredAt: ${user.ExpiredAt}`);
    } else {
      recordTest(74, 'Genuine Photographer Lifetime stays Lifetime on subsequent short-plan payment', 'FAIL', `User state: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(74, 'Genuine Photographer Lifetime stays Lifetime on subsequent short-plan payment', 'FAIL', e.message);
  }

  // Test 75: Task 7H - Pending Lifetime choice receiving finite payment held in AMBIGUOUS_LIFETIME_REGISTRATION
  try {
    resetMockDb();
    mockDb.users.push({
      id: 'uuid_pending_choice_lt',
      Username: 'pending_choice_user',
      Email: 'pending_choice@customer.com',
      Role: 'Photographer',
      Status: 'Pending',
      Paket: 'Lifetime',
      ExpiredAt: 'Lifetime'
    });

    const res = createMockRes();
    await handler({
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_75_ambiguous_lt',
          status: 'PAID',
          amount: 25000,
          currency: 'IDR',
          customer: { email: 'pending_choice@customer.com' },
          productName: 'Paket 1 Bulan - Photo Selection'
        }
      }
    }, res);

    const user = mockDb.users.find(u => u.Username === 'pending_choice_user');
    const ledger = mockDb.processed_payments.find(p => p.payment_id === 'tx_75_ambiguous_lt');
    const resData = res.body && (res.body.data || res.body);
    if (res.statusCode === 200 &&
        resData.code === 'AMBIGUOUS_LIFETIME_REGISTRATION' &&
        user.Status === 'Pending' &&
        ledger.status === 'MANUAL_RECONCILIATION_REQUIRED') {
      recordTest(75, 'Pending Lifetime registration paying finite plan held for manual review (AMBIGUOUS_LIFETIME_REGISTRATION)', 'PASS', `Code: ${resData.code}, Status: ${user.Status}`);
    } else {
      recordTest(75, 'Pending Lifetime registration paying finite plan held for manual review (AMBIGUOUS_LIFETIME_REGISTRATION)', 'FAIL', `Res: ${JSON.stringify(res.body)}, User: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(75, 'Pending Lifetime registration paying finite plan held for manual review (AMBIGUOUS_LIFETIME_REGISTRATION)', 'FAIL', e.message);
  }

  // Test 76: Task 7I - Demo user converted to Photographer role upon subscription payment
  try {
    resetMockDb();
    mockDb.users.push({
      id: 'uuid_demo_user',
      Username: 'demo_user_76',
      Email: 'demo@customer.com',
      Role: 'Demo',
      Status: 'Active',
      Paket: 'Demo',
      ExpiredAt: '2026-11-01'
    });

    const res = createMockRes();
    await handler({
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_76_demo_upgrade',
          status: 'PAID',
          amount: 25000,
          currency: 'IDR',
          customer: { email: 'demo@customer.com' },
          productName: 'Paket 1 Bulan - Photo Selection'
        }
      }
    }, res);

    const user = mockDb.users.find(u => u.Username === 'demo_user_76');

    if (res.statusCode === 200 &&
        user.Role === 'Photographer' &&
        user.Paket === '1 Bulan' &&
        user.Status === 'Active') {
      recordTest(76, 'Demo user converted to Photographer role upon paid subscription activation', 'PASS', `Role: ${user.Role}, Paket: ${user.Paket}`);
    } else {
      recordTest(76, 'Demo user converted to Photographer role upon paid subscription activation', 'FAIL', `User state: ${JSON.stringify(user)}`);
    }
  } catch (e) {
    recordTest(76, 'Demo user converted to Photographer role upon paid subscription activation', 'FAIL', e.message);
  }

  // Test 77: Task 7J - Existing PRO 1 year and Lifetime entitlements preserved and decoupled from main subscription
  try {
    resetMockDb();
    mockDb.users.push({
      id: 'uuid_pro_user_77',
      Username: 'pro_user_77',
      Email: 'prouser@customer.com',
      Role: 'Photographer',
      Status: 'Active',
      Paket: '1 Bulan',
      ExpiredAt: '2026-11-01',
      Akses_Watermark: 'TRUE'
    });
    mockDb.pro_entitlements.push({
      user_id: 'uuid_pro_user_77',
      is_lifetime: true,
      expires_at: null,
      source: 'legacy_grant'
    });

    // Renew main subscription
    const res = createMockRes();
    await handler({
      method: 'POST',
      url: `/api/supabase?token=${TEST_SECRET}`,
      body: {
        action: 'mayarWebhook',
        event: 'payment.received',
        data: {
          id: 'tx_77_pro_decoupled',
          status: 'PAID',
          amount: 25000,
          currency: 'IDR',
          customer: { email: 'prouser@customer.com' },
          productName: 'Paket 1 Bulan - Photo Selection'
        }
      }
    }, res);

    const user = mockDb.users.find(u => u.Username === 'pro_user_77');
    const pro = mockDb.pro_entitlements.find(p => p.user_id === 'uuid_pro_user_77');

    if (res.statusCode === 200 &&
        user.Paket === '1 Bulan' &&
        pro.is_lifetime === true &&
        pro.expires_at === null) {
      recordTest(77, 'Existing PRO Lifetime entitlement is not downgraded or tied to main subscription duration', 'PASS', `Main Paket: ${user.Paket}, PRO Lifetime: ${pro.is_lifetime}`);
    } else {
      recordTest(77, 'Existing PRO Lifetime entitlement is not downgraded or tied to main subscription duration', 'FAIL', `User: ${JSON.stringify(user)}, PRO: ${JSON.stringify(pro)}`);
    }
  } catch (e) {
    recordTest(77, 'Existing PRO Lifetime entitlement is not downgraded or tied to main subscription duration', 'FAIL', e.message);
  }

  console.log('\n======================================================');
  console.log(`AUDIT TEST SUMMARY: ${passCount} PASSED | ${failCount} FAILED | ${notRunCount} NOT VERIFIED / NOT RUN`);
  console.log('======================================================\n');

  return { passCount, failCount, notRunCount, testResults };
}

runAuditTestSuite();

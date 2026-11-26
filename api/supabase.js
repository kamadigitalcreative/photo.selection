/**
 * API Handler Backend Berbasis Supabase (PostgreSQL)
 * Lengkap dengan 100% Dukungan Seluruh Fitur & Menu Aplikasi Photo Selection
 */

const crypto = require('crypto');
const path = require('path');
const { URL } = require('url');
const { Readable, Transform, pipeline } = require('stream');
const { getDriveProvider, urlParser, DownloadService, types } = require('./drive');

function toNodeReadable(body) {
  if (!body) return null;
  if (Buffer.isBuffer(body)) {
    return Readable.from([body]);
  }
  if (typeof body.pipe === 'function') {
    return body;
  }
  if (typeof Readable.fromWeb === 'function' && typeof body.getReader === 'function') {
    return Readable.fromWeb(body);
  }
  if (body[Symbol.asyncIterator]) {
    return Readable.from(body);
  }
  return null;
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jqptagcbkyxxqqmxqusf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_TL_Et1x8IlEwxKASjF0K8Q_t72R3f_9';
const LEGACY_KAMA_SALT = "KamaSecretSalt";
const GAS_MAILER_URL = process.env.GAS_MAILER_URL || process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbwzw3k--HOqHS0As2PCrz6m7c3VKqKlifdJVrb9Cy15ScvmHNB5lFFDNTRR5xfmzf4/exec';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'kamabalicreative@gmail.com';
const APP_URL = process.env.APP_URL || 'https://ps.kamacreative.my.id';
const RESEND_API_KEY = process.env.RESEND_API_KEY || Buffer.from('cmVfQmF2WFY3S2hfR1ZZVEt2MlVYZ2NVU3JWU1lZNUFjNFlU', 'base64').toString('utf8');
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'Photo Selection <noreply@kamacreative.my.id>';

function getActiveSupabaseUrl() {
  return (process.env && process.env.SUPABASE_URL) || SUPABASE_URL;
}

function getActiveSupabaseKey() {
  return (process.env && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) || SUPABASE_KEY;
}

async function supabaseQuery(endpoint, options = {}) {
  const activeUrl = getActiveSupabaseUrl();
  const activeKey = getActiveSupabaseKey();
  const url = `${activeUrl}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': activeKey,
    'Authorization': `Bearer ${activeKey}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...(options.headers || {})
  };

  const config = {
    method: options.method || 'GET',
    headers: headers
  };

  if (options.body) {
    config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

  if (!response.ok) {
    const errMsg = (data && data.message) ? data.message : (data && data.error ? data.error : text);
    throw new Error(errMsg || `Supabase HTTP ${response.status}`);
  }

  return data;
}

const OFFICIAL_SYSTEM_UPDATES = [
  {
    ID: 'v8',
    Judul: 'Pembaruan Besar Photo Selection V2.0',
    Versi: 'V2.0',
    Tanggal: '2026-10-31',
    Pesan: 'Rilis akbar Photo Selection V2.0! Hadir dengan 4 tema mewah The Atelier, download instan ZIP & foto resolusi asli, proteksi watermark otomatis, kuota multi-kategori, dan sistem upsell cuan ekstra.',
    Status: 'Active',
    created_at: '2026-10-31T00:05:00.000Z'
  },
  {
    ID: 'v9',
    Judul: 'Koleksi 4 Tema Mewah (The Atelier)',
    Versi: 'TEMA',
    Tanggal: '2026-10-31',
    Pesan: 'Nikmati 4 tema visual berkelas: Noir Champagne, Midnight Sapphire, Atelier Ivory, dan Olive Heritage dengan kontras tinggi dan tampilan memanjakan mata klien di HP & Desktop.',
    Status: 'Active',
    created_at: '2026-10-31T00:04:00.000Z'
  },
  {
    ID: 'v10',
    Judul: 'Download Foto Resolusi Penuh & Ekspor ZIP',
    Versi: 'FITUR',
    Tanggal: '2026-10-31',
    Pesan: 'Klien kini dapat mengunduh foto pilihan mereka secara mandiri per foto resolusi asli langsung dari Google Drive, atau mengekspor seluruh foto terpilih ke dalam satu file ZIP ringkas tanpa ribet.',
    Status: 'Active',
    created_at: '2026-10-31T00:03:00.000Z'
  },
  {
    ID: 'v11',
    Judul: 'Fitur PRO: Watermark, Kategori & Upsell Extra',
    Versi: 'PRO',
    Tanggal: '2026-10-31',
    Pesan: 'Maksimalkan cuan studio Anda! Atur kuota foto per kategori (Akad, Resepsi, dll), proteksi watermark otomatis, musik galeri (BGM), serta tagihan biaya ekstra foto otomatis ke WhatsApp klien.',
    Status: 'Active',
    created_at: '2026-10-31T00:02:00.000Z'
  },
  {
    ID: 'v12',
    Judul: 'Dukungan Bahasa Inggris & Optimasi Mobile',
    Versi: 'UPDATE',
    Tanggal: '2026-10-31',
    Pesan: 'Galeri klien kini dapat beralih ke Bahasa Inggris (EN) dengan sekali klik. Navigasi mobile dioptimalkan di semua ukuran layar smartphone agar klien semakin nyaman memilih foto.',
    Status: 'Active',
    created_at: '2026-10-31T00:01:00.000Z'
  }
];

// Phase 4.5 Security Constants
const OTP_TTL_MS = 10 * 60 * 1000; // 10 menit
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 detik
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SCRYPT_KEYLEN = 64; // 64 bytes = 128 hex characters
const OTP_SCRYPT_KEYLEN = 32; // 32 bytes = 64 hex characters

// Quota Contract
const MAX_PHOTO_QUOTA = 999999;

function validatePhotoQuota(value, maxLimit = MAX_PHOTO_QUOTA) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < 0 || num > maxLimit) return null;
  return num;
}

function parseProjectMaxFoto(rawPrimary, rawSecondary) {
  const val = (rawPrimary !== undefined && rawPrimary !== null && String(rawPrimary).trim() !== '')
    ? rawPrimary
    : rawSecondary;
  if (val !== undefined && val !== null && String(val).trim() !== '') {
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 50;
}

function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function legacyHashPassword(password) {
  if (!password) return '';
  return crypto.createHash('sha256').update(password + LEGACY_KAMA_SALT).digest('hex');
}


function createPasswordHash(password) {
  if (typeof password !== 'string' || !password) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  });
  return `scrypt$v1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function verifyModernPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== 'v1') {
    return false;
  }
  const saltHex = parts[2];
  const hashHex = parts[3];
  if (!/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(hashHex)) {
    return false;
  }
  try {
    const saltBuf = Buffer.from(saltHex, 'hex');
    const expectedHashBuf = Buffer.from(hashHex, 'hex');
    const derivedKey = crypto.scryptSync(password, saltBuf, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM
    });
    if (derivedKey.length !== expectedHashBuf.length) return false;
    return crypto.timingSafeEqual(derivedKey, expectedHashBuf);
  } catch (e) {
    return false;
  }
}

function verifyAccountPassword(password, storedPassword) {
  if (typeof password !== 'string' || typeof storedPassword !== 'string' || !storedPassword) {
    return { valid: false, scheme: null, needsMigration: false };
  }

  // 1. Modern scrypt format
  if (storedPassword.startsWith('scrypt$v1$')) {
    const isValid = verifyModernPassword(password, storedPassword);
    return { valid: isValid, scheme: 'scrypt', needsMigration: false };
  }

  // 2. Legacy SHA-256 hash (64 hex characters)
  if (/^[0-9a-f]{64}$/i.test(storedPassword)) {
    const legacyCalculated = legacyHashPassword(password);
    const isValid = timingSafeStringEqual(legacyCalculated, storedPassword);
    return { valid: isValid, scheme: 'legacy_sha', needsMigration: isValid };
  }

  // 3. Legacy plaintext fallback (strict migration-only)
  const isPlaintextMatch = timingSafeStringEqual(password, storedPassword);
  return { valid: isPlaintextMatch, scheme: 'plaintext', needsMigration: isPlaintextMatch };
}

function validatePasswordPolicy(password) {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 128;
}

function createOtpHash(otp) {
  if (typeof otp !== 'string' || !otp) {
    throw new Error('OTP must be a non-empty string');
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(otp, salt, OTP_SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  });
  return `otp-scrypt$v1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function verifyModernOtp(otp, storedOtpHash) {
  if (typeof otp !== 'string' || typeof storedOtpHash !== 'string') return false;
  const parts = storedOtpHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'otp-scrypt' || parts[1] !== 'v1') {
    return false;
  }
  const saltHex = parts[2];
  const hashHex = parts[3];
  if (!/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{64}$/i.test(hashHex)) {
    return false;
  }
  try {
    const saltBuf = Buffer.from(saltHex, 'hex');
    const expectedHashBuf = Buffer.from(hashHex, 'hex');
    const derivedKey = crypto.scryptSync(otp, saltBuf, OTP_SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM
    });
    if (derivedKey.length !== expectedHashBuf.length) return false;
    return crypto.timingSafeEqual(derivedKey, expectedHashBuf);
  } catch (e) {
    return false;
  }
}

function verifyOtp(submittedOtp, storedOtp, createdAt) {
  if (typeof submittedOtp !== 'string' || !submittedOtp) return false;
  if (typeof storedOtp !== 'string' || !storedOtp) return false;

  const createdDate = parseSafeDate(createdAt);
  if (!createdDate) return false;
  const age = Date.now() - createdDate.getTime();
  if (age < -60000 || age > OTP_TTL_MS) return false;

  if (storedOtp.startsWith('otp-scrypt$v1$')) {
    return verifyModernOtp(submittedOtp, storedOtp);
  }

  // Legacy plaintext 6-digit OTP
  if (/^\d{6}$/.test(storedOtp)) {
    return timingSafeStringEqual(submittedOtp, storedOtp);
  }

  return false;
}

async function getRecentOtpFailedAttempts(username) {
  if (!username) return 0;
  const marker = '__RESET_OTP_ATTEMPT__:' + username.toLowerCase().trim();
  const rows = await supabaseQuery(`sessions?Username=eq.${encodeURIComponent(marker)}&select=*`);
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const now = Date.now();
  const recent = rows.filter(r => {
    const dt = parseSafeDate(r.CreatedAt);
    if (!dt) return false;
    const age = now - dt.getTime();
    return age >= -60000 && age <= OTP_TTL_MS;
  });
  return recent.length;
}

async function recordOtpFailedAttempt(username) {
  if (!username) return;
  const marker = '__RESET_OTP_ATTEMPT__:' + username.toLowerCase().trim();
  await supabaseQuery('sessions', {
    method: 'POST',
    body: {
      SessionID: crypto.randomUUID(),
      Username: marker,
      Role: 'ResetOTPAttempt',
      CreatedAt: new Date().toISOString()
    }
  });
}

async function clearOtpFailedAttempts(username) {
  if (!username) return;
  const marker = '__RESET_OTP_ATTEMPT__:' + username.toLowerCase().trim();
  try {
    await supabaseQuery(`sessions?Username=eq.${encodeURIComponent(marker)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.error('Error clearing OTP failed attempts:', err);
  }
}

async function revokeAccountSessionsOrThrow(username) {
  if (!username) {
    throw new Error('Username wajib diisi untuk pencabutan sesi');
  }
  const cleanUser = String(username).trim();
  if (cleanUser.startsWith('__CLIENT_GALLERY__') || cleanUser.startsWith('__RESET_OTP_ATTEMPT__')) {
    throw new Error('Invalid account username for session revocation');
  }
  await supabaseQuery(`sessions?Username=ilike.${encodeURIComponent(cleanUser)}`, {
    method: 'DELETE'
  });
}

function parseSafeDate(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(dateInput).trim();
  if (!str || str === '-' || str === 'null' || str === 'undefined') return null;

  // Cek format DD/MM/YYYY atau DD-MM-YYYY (contoh: 17/08/2026 23:12:24 atau 02/09/2026)
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1; // 0-indexed
    const year = parseInt(ddmmyyyyMatch[3], 10);
    const hours = ddmmyyyyMatch[4] ? parseInt(ddmmyyyyMatch[4], 10) : 0;
    const minutes = ddmmyyyyMatch[5] ? parseInt(ddmmyyyyMatch[5], 10) : 0;
    const seconds = ddmmyyyyMatch[6] ? parseInt(ddmmyyyyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) return d;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function sha256(str) {
  if (!str) return '';
  return crypto.createHash('sha256').update(String(str).trim().toLowerCase()).digest('hex');
}

async function sendMetaCAPIEvent(eventName, eventData = {}) {
  const pixelId = process.env.META_PIXEL_ID || '';
  const token = process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN || '';
  if (!pixelId || !token) return;

  try {
    const userData = {};
    if (eventData.clientIp) userData.client_ip_address = eventData.clientIp;
    if (eventData.userAgent) userData.client_user_agent = eventData.userAgent;
    if (eventData.email) userData.em = [sha256(eventData.email)];
    if (eventData.phone) userData.ph = [sha256(String(eventData.phone).replace(/[^0-9]/g, ''))];
    if (eventData.fbp) userData.fbp = eventData.fbp;
    if (eventData.fbc) userData.fbc = eventData.fbc;

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventData.eventId || undefined,
          event_source_url: eventData.sourceUrl || 'https://ps.kamacreative.my.id',
          action_source: 'website',
          user_data: userData,
          custom_data: eventData.customData || undefined
        }
      ]
    };

    await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (err) {
    console.error('Meta CAPI Error:', err);
  }
}

async function sendEmailViaResend({ to, subject, htmlBody, textBody }) {
  const apiKey = (process.env && process.env.RESEND_API_KEY) || RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const fromAddress = (process.env && process.env.SENDER_EMAIL) || SENDER_EMAIL || 'Photo Selection <noreply@kamacreative.my.id>';
    const recipientList = Array.isArray(to) ? to : [to];
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipientList,
        subject: subject,
        html: htmlBody,
        text: textBody || undefined
      })
    });
    if (!res.ok) {
      let errDetail = '';
      try {
        const errJson = await res.json();
        errDetail = JSON.stringify(errJson);
      } catch (_) {
        errDetail = await res.text().catch(() => '');
      }
      console.warn('[MAILER:RESEND] Non-200 status:', res.status, errDetail);
      return false;
    }
    const data = await res.json().catch(() => ({}));
    console.log('[MAILER:RESEND] Email berhasil dikirim via Resend ke', to, 'ID:', data.id);
    return true;
  } catch (err) {
    console.warn('[MAILER:RESEND] Error pengiriman Resend:', err && err.message ? err.message : err);
    return false;
  }
}

async function sendEmailViaGAS({ to, subject, htmlBody, textBody }) {
  // 1. Prioritaskan pengiriman via Domain Resmi (Resend)
  const resendSuccess = await sendEmailViaResend({ to, subject, htmlBody, textBody });
  if (resendSuccess) {
    return true;
  }

  // 2. Fallback cadangan ke Google Apps Script jika Resend gagal atau kuota harian habis
  console.warn('[MAILER] Mencoba fallback cadangan via Google Apps Script...');
  const mailerUrl = process.env.GAS_MAILER_URL || process.env.GAS_URL || GAS_MAILER_URL;
  if (!mailerUrl) {
    console.warn('[MAILER] GAS_MAILER_URL belum diatur di Environment Variables. Email tidak dapat dikirim.');
    return false;
  }
  try {
    const res = await fetch(mailerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        to: to,
        subject: subject,
        htmlBody: htmlBody,
        textBody: textBody || ''
      })
    });
    if (!res.ok) {
      let safeResponseText = '';
      try {
        const text = await res.text();
        safeResponseText = text ? text.slice(0, 200).replace(/[\r\n]+/g, ' ') : '';
      } catch (_) { }
      console.error('[MAILER] GAS returned non-success status:', res.status, safeResponseText);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[MAILER] Gagal mengirim email via GAS:', err && err.message ? err.message : err);
    return false;
  }
}

function escapeEmailHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAdminNewUserEmail({ nama, username, email, nohp, paket, status }) {
  const isPending = status === 'Pending';
  const safeNama = escapeEmailHtml(nama);
  const safeUsername = escapeEmailHtml(username);
  const safeEmail = escapeEmailHtml(email);
  const safeNohp = escapeEmailHtml(nohp || '-');
  const safeWaHref = (nohp || '').replace(/[^0-9]/g, '');
  const safePaket = escapeEmailHtml(paket);
  const safeStatus = escapeEmailHtml(status);
  const mailtoHref = encodeURI(email || '');
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: #1e3a8a; padding: 24px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">Pendaftaran Fotografer Baru</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #bfdbfe;">Photo Selection &bull; Notifikasi Sistem</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>Admin Kama Creative</strong>, akun fotografer baru telah mendaftar:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b; width: 140px;">Nama Studio / User</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 500;">${safeNama}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Username</td>
          <td style="padding: 10px 0; color: #0f172a;"><code>@${safeUsername}</code></td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Email</td>
          <td style="padding: 10px 0;"><a href="mailto:${mailtoHref}" style="color: #2563eb; text-decoration: none;">${safeEmail}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">No HP / WA</td>
          <td style="padding: 10px 0;"><a href="https://wa.me/${safeWaHref}" style="color: #059669; text-decoration: none; font-weight: 600;">${safeNohp}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Pilihan Paket</td>
          <td style="padding: 10px 0;"><span style="display: inline-block; background: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 6px;">${safePaket}</span></td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Status Akun</td>
          <td style="padding: 10px 0;"><span style="display: inline-block; background: ${isPending ? '#fef3c7; color: #92400e;' : '#d1fae5; color: #065f46;'} font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 6px;">${safeStatus}</span></td>
        </tr>
      </table>
      <p style="color: #64748b; font-size: 13px; margin: 20px 0;">
        Silakan login ke sistem Photo Selector Anda untuk menyetujui (ACC) dan mengatur masa aktif akun tersebut.
      </p>
      <div style="text-align: center; margin: 24px 0 10px 0;">
        <a href="${APP_URL}/login" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 14px;">Buka Dashboard Admin</a>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      &copy; Photo Selection System &bull; Kama Creative
    </div>
  </div>`;
}

function buildPhotographerWelcomeEmail({ nama, username, email, paket, status, paymentUrl }) {
  const isPending = status === 'Pending';
  const safeNama = escapeEmailHtml(nama);
  const safeUsername = escapeEmailHtml(username);
  const safeEmail = escapeEmailHtml(email);
  const safePaket = escapeEmailHtml(paket);
  const safePaymentUrl = (paymentUrl && isSafeHttpsUrl(paymentUrl)) ? encodeURI(paymentUrl) : '';
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 26px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">Selamat Datang di Photo Selection!</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #bfdbfe;">Aplikasi Galeri &amp; Seleksi Foto Klien Praktis</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>${safeNama}</strong>,</p>
      <p>Terima kasih telah mendaftar di <strong>Photo Selection</strong>. Akun Anda berhasil dicatat dengan rincian:</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748b; width: 130px;"><strong>Username:</strong></td><td style="color: #0f172a; font-weight: 600;">@${safeUsername}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;"><strong>Email:</strong></td><td style="color: #0f172a;">${safeEmail}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;"><strong>Paket:</strong></td><td style="color: #0f172a;"><span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${safePaket}</span></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;"><strong>Status Akun:</strong></td><td><span style="background: ${isPending ? '#fef3c7; color: #b45309;' : '#dcfce7; color: #15803d;'} padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${isPending ? 'Menunggu Pembayaran' : 'Aktif'}</span></td></tr>
        </table>
      </div>
      ${isPending && safePaymentUrl ? `
        <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 14px; margin: 18px 0; border-radius: 0 8px 8px 0;">
          <strong style="color: #1e40af; font-size: 14px;">Langkah Aktivasi Otomatis:</strong>
          <p style="margin: 6px 0 12px 0; font-size: 13px; color: #1e3a8a;">Selesaikan pembayaran Anda untuk langsung mengaktifkan akun secara otomatis tanpa perlu konfirmasi:</p>
          <a href="${safePaymentUrl}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 13px;">Bayar Sekarang via Mayar &rarr;</a>
        </div>
      ` : `
        <p style="font-size: 13px; color: #4b5563;">Akun Anda sudah aktif dan dapat langsung digunakan untuk mengunggah dan membagikan galeri foto klien.</p>
        <div style="text-align: center; margin: 20px 0 10px 0;">
          <a href="${APP_URL}/login" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">Masuk ke Aplikasi</a>
        </div>
      `}
      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">Jika ada pertanyaan atau butuh bantuan, hubungi kami melalui WhatsApp tim support Kama Creative.</p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      &copy; Photo Selection &bull; Kama Creative
    </div>
  </div>`;
}

function buildPhotographerActivatedEmail({ nama, username, email, paket, expiredAt, tempPassword }) {
  const safeNama = escapeEmailHtml(nama);
  const safeUsername = escapeEmailHtml(username);
  const safeEmail = escapeEmailHtml(email);
  const safePaket = escapeEmailHtml(paket);
  const safeExpiredAt = escapeEmailHtml(expiredAt || 'Lifetime');
  const safeTempPassword = tempPassword ? escapeEmailHtml(tempPassword) : '';
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 26px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">Akun Photo Selection Anda Telah Aktif!</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #d1fae5;">Selamat berkarya dan selamat menikmati alur kerja seleksi foto otomatis</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>${safeNama}</strong>,</p>
      <p>Kabar gembira! Akun <strong>Photo Selection</strong> Anda telah resmi <strong>diaktifkan</strong>.</p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #166534; width: 140px;"><strong>Username:</strong></td><td style="color: #0f172a; font-weight: 600;">@${safeUsername}</td></tr>
          <tr><td style="padding: 6px 0; color: #166534;"><strong>Email:</strong></td><td style="color: #0f172a;">${safeEmail}</td></tr>
          ${safeTempPassword ? `<tr><td style="padding: 6px 0; color: #166534;"><strong>Password Login:</strong></td><td style="color: #b91c1c; font-weight: 700;"><code>${safeTempPassword}</code></td></tr>` : ''}
          <tr><td style="padding: 6px 0; color: #166534;"><strong>Paket:</strong></td><td style="color: #0f172a;"><span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${safePaket}</span></td></tr>
          <tr><td style="padding: 6px 0; color: #166534;"><strong>Masa Aktif Sampai:</strong></td><td style="color: #0f172a; font-weight: 600;">${safeExpiredAt}</td></tr>
        </table>
      </div>
      <div style="text-align: center; margin: 24px 0 14px 0;">
        <a href="${APP_URL}/login" style="background: #059669; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 700; display: inline-block; font-size: 15px; box-shadow: 0 2px 5px rgba(5,150,105,0.25);">Buka Aplikasi & Masuk Sekarang &rarr;</a>
      </div>
      <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 20px;">
        URL Akses: <a href="${APP_URL}/login" style="color: #059669; text-decoration: none; font-weight: 500;">${APP_URL}/login</a>
      </p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      &copy; Photo Selection &bull; Kama Creative
    </div>
  </div>`;
}

function buildAdminPaymentSuccessEmail({ nama, username, email, nohp, paket, amount, expiredAt }) {
  const safeNama = escapeEmailHtml(nama);
  const safeUsername = escapeEmailHtml(username);
  const safeEmail = escapeEmailHtml(email);
  const safeNohp = escapeEmailHtml(nohp || '-');
  const safeWaHref = (nohp || '').replace(/[^0-9]/g, '');
  const safePaket = escapeEmailHtml(paket);
  const safeExpiredAt = escapeEmailHtml(expiredAt || 'Lifetime');
  const mailtoHref = encodeURI(email || '');
  const formattedAmount = (Number(amount) || 0).toLocaleString('id-ID');
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: #065f46; padding: 24px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Pembayaran Mayar Diterima</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #a7f3d0;">Akun fotografer berhasil diaktifkan otomatis</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>Admin Kama Creative</strong>, pembayaran baru telah sukses diterima melalui Mayar:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b; width: 140px;">Nama Customer</td><td style="padding: 8px 0; color: #0f172a; font-weight: 500;">${safeNama}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Username</td><td style="padding: 8px 0; color: #0f172a;">@${safeUsername}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Email</td><td style="padding: 8px 0;"><a href="mailto:${mailtoHref}" style="color: #2563eb; text-decoration: none;">${safeEmail}</a></td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">No HP / WA</td><td style="padding: 8px 0;"><a href="https://wa.me/${safeWaHref}" style="color: #059669; text-decoration: none; font-weight: 600;">${safeNohp}</a></td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Paket</td><td style="padding: 8px 0; color: #065f46; font-weight: 700;">${safePaket}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Nominal</td><td style="padding: 8px 0; color: #0f172a; font-weight: 600;">Rp ${formattedAmount}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Masa Aktif</td><td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${safeExpiredAt}</td></tr>
      </table>
      <div style="text-align: center; margin: 20px 0 10px 0;">
        <a href="${APP_URL}/login" style="background: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">Lihat di Dashboard Admin</a>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      &copy; Photo Selection &bull; Kama Creative
    </div>
  </div>`;
}

function buildExpiryReminderEmail({ nama, username, expiredAt }) {
  const safeNama = escapeEmailHtml(nama);
  const safeUsername = escapeEmailHtml(username);
  const safeExpiredAt = escapeEmailHtml(expiredAt || '');
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
    <div style="background: #d97706; padding: 24px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Pengingat Masa Aktif Akun Photo Selection</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #fef3c7;">Perpanjang masa aktif untuk menjaga galeri klien tetap dapat diakses</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>${safeNama}</strong> (<code>@${safeUsername}</code>),</p>
      <p>Masa aktif akun Photo Selection Anda akan segera berakhir pada: <strong style="color: #b45309;">${safeExpiredAt}</strong>.</p>
      <p>Agar klien tetap dapat memilih dan mengunduh foto tanpa hambatan, segera perpanjang langganan akun Anda.</p>
      <div style="text-align: center; margin: 24px 0 10px 0;">
        <a href="${APP_URL}/login" style="background: #d97706; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">Perpanjang Langganan Sekarang &rarr;</a>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      &copy; Photo Selection &bull; Kama Creative
    </div>
  </div>`;
}

function buildOtpResetPasswordEmail({ nama, username, otp }) {
  const safeNama = escapeEmailHtml(nama || username);
  const safeUsername = escapeEmailHtml(username);
  const safeOtp = escapeEmailHtml(otp);
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 26px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">Kode Keamanan Reset Password</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Permintaan Pengaturan Ulang Kata Sandi Akun</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>${safeNama}</strong> (<code>@${safeUsername}</code>),</p>
      <p>Kami menerima permintaan untuk mereset kata sandi akun <strong>Photo Selection</strong> Anda. Gunakan 6 digit Kode OTP berikut untuk memverifikasi akun Anda:</p>
      
      <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1e40af; display: inline-block;">${safeOtp}</span>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">Kode OTP ini berlaku selama 10 menit. Jangan berikan kode ini kepada siapa pun.</p>
      </div>

      <p style="font-size: 13px; color: #64748b;">Jika Anda tidak merasa meminta reset password, silakan abaikan email ini. Akun Anda tetap aman.</p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
      &copy; Photo Selection &bull; Kama Creative
    </div>
  </div>`;
}

function sendJSON(res, statusCode, payload) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(statusCode).json(payload);
}

function success(res, data, message = 'Success') {
  return sendJSON(res, 200, { status: 'success', data: data, message: message });
}

function error(res, message = 'Error occurred', statusCode = 400, data = null) {
  const payload = { status: 'error', message: message, data: data };
  if (data && typeof data === 'object' && !Array.isArray(data) && data.code) {
    payload.code = data.code;
  }
  return sendJSON(res, statusCode, payload);
}

// =========================================================================
// PHASE 4.6X SECURITY & VALIDATION HELPERS
// =========================================================================

function stripDangerousControlChars(str, allowNewlines = true) {
  if (typeof str !== 'string') return '';
  if (allowNewlines) {
    return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }
  return str.replace(/[\u0000-\u001F\u007F]/g, '');
}

function cleanPlainString(value, allowNewlines = false) {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  return stripDangerousControlChars(str, allowNewlines);
}

function toSafeString(value, maxLength = 255, allowNewlines = false) {
  const clean = cleanPlainString(value, allowNewlines);
  return typeof maxLength === 'number' && maxLength > 0 ? clean.slice(0, maxLength) : clean;
}

function isSafeHttpsUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length > 4096) return false;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isSafeAudioReference(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (isSafeHttpsUrl(trimmed)) return true;
  if (trimmed.startsWith('/api/bridge?action=getProjectAudio') || trimmed.startsWith('/api/bridge?action=getAudioStream')) return true;
  if (trimmed.startsWith('data:audio/') && trimmed.length <= 25 * 1024 * 1024) {
    return /^data:audio\/(mpeg|mp3|wav|ogg|aac|m4a|webm|mp4);base64,[A-Za-z0-9+/=]+$/.test(trimmed);
  }
  return false;
}

function estimateBase64DecodedBytes(base64Str) {
  if (typeof base64Str !== 'string') return 0;
  const commaIdx = base64Str.indexOf(',');
  const raw = (commaIdx !== -1 ? base64Str.slice(commaIdx + 1) : base64Str).trim();
  if (!raw || raw.length % 4 !== 0) return 0;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) return 0;
  let padding = 0;
  if (raw.endsWith('==')) padding = 2;
  else if (raw.endsWith('=')) padding = 1;
  return (raw.length / 4) * 3 - padding;
}

function isSafeDataImage(value, maxDecodedBytes = 2 * 1024 * 1024, allowedTypes = ['jpeg', 'jpg', 'png', 'webp', 'gif']) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  const match = trimmed.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return false;

  const declaredType = match[1].toLowerCase();
  const normalizedType = declaredType === 'jpg' ? 'jpeg' : declaredType;
  const normalizedAllowed = allowedTypes.map(t => (t.toLowerCase() === 'jpg' ? 'jpeg' : t.toLowerCase()));
  if (!normalizedAllowed.includes(normalizedType)) return false;

  const rawBase64 = match[2];
  if (rawBase64.length === 0 || rawBase64.length % 4 !== 0) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(rawBase64)) {
    return false;
  }

  const decodedBytes = estimateBase64DecodedBytes(rawBase64);
  if (decodedBytes < 12 || decodedBytes > maxDecodedBytes) return false;

  try {
    const fullBuf = Buffer.from(rawBase64, 'base64');
    if (fullBuf.length < 12) return false;

    let detectedType = null;

    if (normalizedType === 'jpeg') {
      // JPEG must start with SOI (FF D8 FF) and terminate with EOI (FF D9)
      if (fullBuf.length >= 64 &&
        fullBuf[0] === 0xFF && fullBuf[1] === 0xD8 && fullBuf[2] === 0xFF) {
        const tail = fullBuf.slice(Math.max(0, fullBuf.length - 16));
        if (tail.includes(Buffer.from([0xFF, 0xD9]))) {
          detectedType = 'jpeg';
        }
      }
    } else if (normalizedType === 'png') {
      // PNG must have 8-byte signature, IHDR chunk at offset 12, and IEND chunk at EOF
      if (fullBuf.length >= 45 &&
        fullBuf[0] === 0x89 && fullBuf[1] === 0x50 && fullBuf[2] === 0x4E && fullBuf[3] === 0x47 &&
        fullBuf[4] === 0x0D && fullBuf[5] === 0x0A && fullBuf[6] === 0x1A && fullBuf[7] === 0x0A &&
        fullBuf.slice(12, 16).toString('ascii') === 'IHDR') {
        const tail = fullBuf.slice(Math.max(0, fullBuf.length - 16));
        if (tail.includes(Buffer.from('IEND'))) {
          detectedType = 'png';
        }
      }
    } else if (normalizedType === 'gif') {
      // GIF must start with GIF87a or GIF89a and terminate with trailer byte 0x3B
      if (fullBuf.length >= 26 &&
        (fullBuf.slice(0, 6).toString('ascii') === 'GIF87a' || fullBuf.slice(0, 6).toString('ascii') === 'GIF89a') &&
        fullBuf[fullBuf.length - 1] === 0x3B) {
        detectedType = 'gif';
      }
    } else if (normalizedType === 'webp') {
      // WebP must start with RIFF...WEBP with valid size and VP8/VP8L/VP8X container
      if (fullBuf.length >= 24 &&
        fullBuf.slice(0, 4).toString('ascii') === 'RIFF' &&
        fullBuf.slice(8, 12).toString('ascii') === 'WEBP') {
        const riffSize = fullBuf.readUInt32LE(4);
        const chunkType = fullBuf.slice(12, 16).toString('ascii');
        if (['VP8 ', 'VP8L', 'VP8X'].includes(chunkType) && Math.abs(fullBuf.length - (riffSize + 8)) <= 2) {
          detectedType = 'webp';
        }
      }
    }

    if (!detectedType || detectedType !== normalizedType) return false;
  } catch (_) {
    return false;
  }

  return true;
}

function isSafeImageReference(value, maxDecodedBytes = 2 * 1024 * 1024) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return isSafeHttpsUrl(trimmed) || isSafeDataImage(trimmed, maxDecodedBytes);
}

function isSafeFeedbackImageReference(value, maxDecodedBytes = 5 * 1024 * 1024) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return isSafeHttpsUrl(trimmed) || isSafeDataImage(trimmed, maxDecodedBytes, ['jpeg', 'jpg', 'png', 'webp']);
}

const ALLOWED_DRIVE_HOSTS = new Set(['drive.google.com']);

function isAllowedDriveHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  return ALLOWED_DRIVE_HOSTS.has(hostname.toLowerCase());
}

function validateDriveReference(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length > 500) return false;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  if (isSafeHttpsUrl(trimmed)) {
    try {
      const u = new URL(trimmed);
      return isAllowedDriveHost(u.hostname);
    } catch (_) {
      return false;
    }
  }
  return /^[a-zA-Z0-9_-]{10,128}$/.test(trimmed);
}

function validateSafeIdentifier(value, maxLength = 128) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return false;
  return /^[A-Za-z0-9_.:-]+$/.test(trimmed);
}


function extractSessionId(payload, req) {
  // 1. Authorization: Bearer <sessionId>
  if (req && req.headers) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && typeof authHeader === 'string') {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
    }
  }

  // 2. payload.sessionId
  if (payload && typeof payload.sessionId === 'string' && payload.sessionId.trim()) {
    return payload.sessionId.trim();
  }

  // 3. payload.currentUser.sessionId
  if (payload && payload.currentUser && typeof payload.currentUser.sessionId === 'string' && payload.currentUser.sessionId.trim()) {
    return payload.currentUser.sessionId.trim();
  }

  // Compatibility fallback for formData / data envelopes
  if (payload && payload.formData) {
    if (typeof payload.formData.sessionId === 'string' && payload.formData.sessionId.trim()) {
      return payload.formData.sessionId.trim();
    }
    if (payload.formData.currentUser && typeof payload.formData.currentUser.sessionId === 'string' && payload.formData.currentUser.sessionId.trim()) {
      return payload.formData.currentUser.sessionId.trim();
    }
  }

  return '';
}

async function verifyUserSession(payload, req) {
  const sessionId = extractSessionId(payload, req);
  if (!sessionId) {
    return null;
  }

  let sessionRows = null;
  try {
    sessionRows = await supabaseQuery(`sessions?SessionID=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`);
  } catch (err) {
    console.error('Session query error:', err);
    return null;
  }

  if (!sessionRows || !Array.isArray(sessionRows) || sessionRows.length === 0) {
    return null;
  }

  const sessionRow = sessionRows[0];
  const sessionRole = (sessionRow.Role || '').trim();
  const sessionUsername = (sessionRow.Username || '').trim();

  // Cross-auth isolation: Client Gallery sessions & OTP attempt markers must NEVER authenticate account actions
  if (sessionRole === 'ClientGallery' || sessionUsername.startsWith('__CLIENT_GALLERY__') || sessionRole === 'ResetOTPAttempt' || sessionUsername.startsWith('__RESET_OTP_ATTEMPT__')) {
    return null;
  }

  if (!sessionUsername) {
    return null;
  }

  let userRows = null;
  try {
    userRows = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(sessionUsername)}&select=*&limit=1`);
  } catch (err) {
    console.error('User query error for session:', err);
    return null;
  }

  if (!userRows || !Array.isArray(userRows) || userRows.length === 0) {
    return null;
  }

  const u = userRows[0];
  const role = u.Role || 'Photographer';
  const status = u.Status || 'Active';

  return {
    sessionId: sessionId,
    username: u.Username,
    role: role,
    status: status,
    expiredAt: u.ExpiredAt || 'Lifetime',
    paket: u.Paket || '',
    nama: u.Nama || u.Username,
    email: u.Email || '',
    nohp: u['No HP'] || '',
    brandName: u.BrandName || '',
    brandLogo: u.BrandLogo || '',
    watermarkUrl: u.WatermarkUrl || '',
    bankName: u.BankName || '',
    bankAccount: u.BankAccount || '',
    bankAccountName: u.BankAccountName || '',
    projectCreated: Number(u.ProjectCreated) || 0,
    ProjectCreated: Number(u.ProjectCreated) || 0,
    rawUser: u
  };
}

function isDemoUser(user) {
  if (!user) return false;
  const role = String(user.role || user.Role || '').trim().toLowerCase();
  if (role === 'admin') return false;
  if (role === 'demo') return true;
  const username = String(user.username || user.Username || '').trim().toLowerCase();
  if (username === 'demo' || username === 'demo_user') return true;
  const status = String(user.status || user.Status || '').trim().toUpperCase();
  if (status === 'DEMO') return true;
  const paket = String(user.paket || user.Paket || '').trim().toUpperCase();
  return paket.includes('DEMO') || paket === 'FREE' || paket === 'FREE PLAN' || paket === '-';
}

function requireAdmin(authUser) {
  return Boolean(authUser && authUser.role === 'Admin');
}

const PROTECTED_ACCOUNT_ACTIONS = new Set([
  'saveBrandSettings',
  'uploadBrandLogo',
  'savePaymentSettings',
  'pingUser',
  'getUsers',
  'approveUser',
  'updateExpiry',
  'sendExpiryReminder',
  'deleteUser',
  'getProjects',
  'createProject',
  'updateClientPassword',
  'updateDeadline',
  'deleteProject',
  'reopenProject',
  'toggleProjectWatermark',
  'toggleProjectDownload',
  'updateProjectMaxFoto',
  'updateProjectMusic',
  'uploadAudioChunk',
  'processPayment',
  'getDashboardStats',
  'submitFeedback',
  'getFeedbacks',
  'replyFeedback',
  'markFeedbackRead',
  'syncBackground'
]);

const ADMIN_ONLY_ACTIONS = new Set([
  'getUsers',
  'approveUser',
  'updateExpiry',
  'sendExpiryReminder',
  'deleteUser',
  'getDashboardStats',
  'replyFeedback',
  'syncSystemUpdates'
]);

async function handleLogout(payload, req, res) {
  const sessionId = extractSessionId(payload, req);
  if (sessionId) {
    try {
      await supabaseQuery(`sessions?SessionID=eq.${encodeURIComponent(sessionId)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.error('Error deleting session during logout:', e);
    }
  }
  return success(res, { success: true, message: 'Logout berhasil' });
}

async function requireProjectAccess(authUser, idOrToken, res) {
  if (!authUser || !authUser.username) {
    if (res) error(res, 'Sesi tidak valid atau telah berakhir. Silakan login kembali.', 401);
    return null;
  }

  const cleanId = String(idOrToken || '').trim();
  if (!cleanId) {
    if (res) error(res, 'Project tidak ditemukan', 404);
    return null;
  }

  let projects = null;
  try {
    projects = await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(cleanId)},Token.eq.${encodeURIComponent(cleanId)})&select=*`);
  } catch (err) {
    console.error('requireProjectAccess lookup error:', err);
    if (res) error(res, 'Gagal memuat data project', 500);
    return null;
  }

  if (!projects || !Array.isArray(projects) || projects.length === 0) {
    if (res) error(res, 'Project tidak ditemukan', 404);
    return null;
  }

  const project = projects[0];

  // Admin retains global access
  if (authUser.role === 'Admin') {
    return project;
  }

  // Non-Admin: normalized Owner vs authUser.username comparison
  const projectOwner = String(project.Owner || '').trim().toLowerCase();
  const callerUsername = String(authUser.username || '').trim().toLowerCase();

  if (projectOwner !== callerUsername) {
    if (res) error(res, 'Akses project ditolak.', 403);
    return null;
  }

  return project;
}

function getProjectMutationFilter(project) {
  const dbId = String((project && project.id) || '').trim();
  if (dbId) {
    return `id=eq.${encodeURIComponent(dbId)}`;
  }

  const token = String((project && project.Token) || '').trim();
  if (token) {
    return `Token=eq.${encodeURIComponent(token)}`;
  }

  throw new Error('Authorized project has no stable identifier');
}

function verifyWebhookAuthenticity(req) {
  const configuredSecret = String(process.env.MAYAR_WEBHOOK_SECRET || '').trim();
  if (!configuredSecret) {
    return { configured: false, valid: false };
  }

  let token = '';
  if (req && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      token = parsedUrl.searchParams.get('token') || '';
    } catch (e) { }
  }

  // Also accept header token fallback (e.g. x-mayar-token, authorization, x-callback-token)
  if (!token && req && req.headers) {
    const rawHeader = req.headers['x-mayar-token'] || req.headers['x-callback-token'] || req.headers['authorization'] || '';
    if (typeof rawHeader === 'string') {
      token = rawHeader.startsWith('Bearer ') ? rawHeader.slice(7).trim() : rawHeader.trim();
    }
  }

  token = String(token || '').trim();
  if (!token) {
    return { configured: true, valid: false };
  }

  const secretBuf = Buffer.from(configuredSecret);
  const tokenBuf = Buffer.from(token);

  if (secretBuf.length !== tokenBuf.length) {
    return { configured: true, valid: false };
  }

  const isMatch = crypto.timingSafeEqual(secretBuf, tokenBuf);
  return { configured: true, valid: isMatch };
}

function extractMayarTransactionId(data, payload) {
  const d = data || {};
  const p = payload || {};
  const rawId = d.id || d.paymentId || d.transactionId || d.invoiceId || p.id || '';
  return String(rawId || '').trim();
}

function isNewMembershipEvent(rawEvent) {
  const ev = String(rawEvent || '').trim().toLowerCase();
  return ev === 'new membership' ||
    ev === 'new_membership' ||
    ev === 'membership.created' ||
    ev === 'membership.new' ||
    ev.includes('membership');
}

function isConfirmedPaymentSuccess(rawEvent, data, payload) {
  const ev = String(rawEvent || '').trim().toLowerCase();

  const nonSuccessEvents = new Set([
    'payment.reminder',
    'payment.failed',
    'payment.expired',
    'payment.cancelled',
    'payment.canceled',
    'payment.unpaid',
    'payment.pending',
    'payment.refunded',
    'payment.disputed'
  ]);
  if (nonSuccessEvents.has(ev)) {
    return false;
  }

  const isPaymentEvent = ev === 'purchase' ||
    ev === 'payment.received' ||
    ev === 'payment.success' ||
    ev === 'transaction.success' ||
    ev === 'payment.paid' ||
    ev === 'invoice.paid' ||
    ev === 'invoice.settled';

  if (!isPaymentEvent) {
    return false;
  }

  const d = data || {};
  const rawStatus = String(d.status || (payload && payload.status) || '').trim().toUpperCase();

  // Status must be explicitly present and confirmed as settled/paid by provider
  if (!rawStatus) {
    return false;
  }

  const nonSuccessStatuses = new Set([
    'PENDING',
    'UNPAID',
    'EXPIRED',
    'FAILED',
    'CANCELLED',
    'CANCELED',
    'REFUNDED',
    'CLOSED'
  ]);

  if (nonSuccessStatuses.has(rawStatus)) {
    return false;
  }

  const successStatuses = new Set(['PAID', 'SUCCESS', 'SETTLED', 'COMPLETED']);
  if (!successStatuses.has(rawStatus)) {
    return false;
  }

  return true;
}

const MAYAR_CATALOG = {
  SUBSCRIPTION_1_BULAN: {
    sku: 'SUBSCRIPTION_1_BULAN',
    plan_kind: 'SUBSCRIPTION',
    paketName: '1 Bulan',
    addDays: 30,
    standardPrice: 25000,
    isProAddon: false,
    slug: 'paket-1-bulan-photo-selection',
    verifiedDisplayName: 'Paket 1 Bulan - Photo Selection' // Confirmed from real settled Mayar transaction
  },
  SUBSCRIPTION_6_BULAN: {
    sku: 'SUBSCRIPTION_6_BULAN',
    plan_kind: 'SUBSCRIPTION',
    paketName: '6 Bulan',
    addDays: 180,
    standardPrice: 120000,
    isProAddon: false,
    slug: 'paket-6-bulan-photo-selection',
    verifiedDisplayName: null // Needs verification for exact display name string
  },
  SUBSCRIPTION_1_TAHUN: {
    sku: 'SUBSCRIPTION_1_TAHUN',
    plan_kind: 'SUBSCRIPTION',
    paketName: '1 Tahun',
    addDays: 365,
    standardPrice: 199000,
    isProAddon: false,
    slug: 'paket-1-tahunn-photo-selection', // Verified slug spelling in app.html ('tahunn')
    verifiedDisplayName: null // Needs verification
  },
  PRO_ADDON_1_TAHUN: {
    sku: 'PRO_ADDON_1_TAHUN',
    plan_kind: 'PRO_ADDON',
    paketName: 'PRO Add-On 1 Tahun',
    addDays: 365,
    standardPrice: 149000,
    isProAddon: true,
    isLifetime: false,
    slug: 'add-on-pro-photo-selection-1-tahun',
    verifiedDisplayName: null // Needs verification
  },
  PRO_ADDON_LIFETIME: {
    sku: 'PRO_ADDON_LIFETIME',
    plan_kind: 'PRO_ADDON',
    paketName: 'PRO Add-On Lifetime',
    addDays: 0,
    standardPrice: 649000,
    isProAddon: true,
    isLifetime: true,
    slug: 'add-on-pro-photo-selection-lifetime',
    verifiedDisplayName: null // Needs verification
  }
};

function classifyMayarProduct(rawProductName) {
  if (!rawProductName || typeof rawProductName !== 'string') {
    return { isPhotoSelection: false, isProAddon: false, paketName: null, addDays: 0, reason: 'Empty product name' };
  }

  const p = rawProductName.trim().toUpperCase();

  // 1. Blacklist unrelated products from Kama Creative store:
  // e.g. KURSUS, EDITING, CANVA, NETFLIX, SPOTIFY, PRESET, LIGHTROOM, WEBSITE, JASA, DESIGN, DESAIN
  const unrelatedKeywords = [
    'KURSUS', 'EDITING', 'CANVA', 'NETFLIX', 'SPOTIFY',
    'PRESET', 'LIGHTROOM', 'WEBSITE', 'JASA', 'DESIGN', 'DESAIN',
    'SERTIFIKASI', 'MEMBERSHIP LAIN', 'PRODUK LAIN'
  ];
  for (const kw of unrelatedKeywords) {
    if (p.includes(kw)) {
      return { isPhotoSelection: false, isProAddon: false, paketName: null, addDays: 0, isStoreSale: true, reason: `Unrelated product keyword: ${kw}` };
    }
  }

  // 2. Default DENY: Must explicitly prove Photo Selection identity.
  // Unrelated items like 'Paket 1 Bulan Membership Lain', 'Paket 6 Bulan Sertifikasi Non-Fotografi',
  // 'Add-on Lifetime Produk Lain' do NOT belong to Photo Selection and must NEVER activate accounts.
  const hasPhotoSelectionBrand = p.includes('PHOTO SELECTION') || 
                                 p.includes('PHOTO-SELECTION') || 
                                 p.includes('PHOTO_SELECTION') || 
                                 p.includes('PHOTOSELECTOR') || 
                                 p.includes('PHOTO SELECTOR') || 
                                 p.includes('KMBC');

  const hasVerifiedSlug = p.includes('PAKET-1-BULAN-PHOTO-SELECTION') ||
                          p.includes('PAKET-6-BULAN-PHOTO-SELECTION') ||
                          p.includes('PAKET-1-TAHUNN-PHOTO-SELECTION') ||
                          p.includes('PAKET-1-TAHUN-PHOTO-SELECTION') ||
                          p.includes('ADD-ON-PRO-PHOTO-SELECTION-1-TAHUN') ||
                          p.includes('ADD-ON-PRO-PHOTO-SELECTION-LIFETIME');

  if (!hasPhotoSelectionBrand && !hasVerifiedSlug) {
    return {
      isPhotoSelection: false,
      isProAddon: false,
      paketName: null,
      addDays: 0,
      isStoreSale: true,
      reason: 'Not a Photo Selection product: missing Photo Selection brand identifier'
    };
  }

  // 3. Check for standalone PRO Add-On
  const isAddonKeyword = p.includes('ADD-ON') || p.includes('ADDON') || p.includes('PRO ADD-ON') || p.includes('WATERMARK');
  if (isAddonKeyword) {
    if (p.includes('LIFETIME') || p.includes('SELAMANYA') || p.includes('PERMANEN')) {
      const cat = MAYAR_CATALOG.PRO_ADDON_LIFETIME;
      return {
        isPhotoSelection: true,
        isProAddon: true,
        isLifetime: true,
        paketName: cat.paketName,
        addDays: cat.addDays,
        standardPrice: cat.standardPrice,
        sku: cat.sku
      };
    }
    if (p.includes('1 TAHUN') || p.includes('1-TAHUN') || p.includes('TAHUNN') || p.includes('TAHUN') || p.includes('ANNUAL') || p.includes('YEAR')) {
      const cat = MAYAR_CATALOG.PRO_ADDON_1_TAHUN;
      return {
        isPhotoSelection: true,
        isProAddon: true,
        isLifetime: false,
        paketName: cat.paketName,
        addDays: cat.addDays,
        standardPrice: cat.standardPrice,
        sku: cat.sku
      };
    }
    // Business rule: There is NO 1-Month PRO Add-on and unspecific periods are not accepted
    if (p.includes('1 BULAN') || p.includes('1-BULAN') || p.includes('MONTHLY') || p.includes('BULANAN')) {
      return {
        isPhotoSelection: true,
        isProAddon: true,
        isUnverifiedProduct: true,
        paketName: null,
        addDays: 0,
        reason: 'Invalid SKU: No 1-month PRO Add-On exists'
      };
    }
    return {
      isPhotoSelection: true,
      isProAddon: true,
      isUnverifiedProduct: true,
      paketName: null,
      addDays: 0,
      reason: 'Unverified or ambiguous PRO Add-On duration'
    };
  }

  // 4. Check for Subscriptions (Only 3 confirmed products: 1 Bulan, 6 Bulan, 1 Tahun)
  // 1 Tahun (365 days, IDR 199,000)
  if (p.includes('1 TAHUN') || p.includes('1-TAHUN') || p.includes('TAHUNN') || p.includes('12 BULAN') || p.includes('ANNUAL') || p.includes('YEAR')) {
    const cat = MAYAR_CATALOG.SUBSCRIPTION_1_TAHUN;
    return {
      isPhotoSelection: true,
      isProAddon: false,
      paketName: cat.paketName,
      addDays: cat.addDays,
      standardPrice: cat.standardPrice,
      sku: cat.sku
    };
  }

  // 6 Bulan (180 days, IDR 120,000)
  if (p.includes('6 BULAN') || p.includes('6-BULAN') || p.includes('6BULAN') || p.includes('SEMESTER')) {
    const cat = MAYAR_CATALOG.SUBSCRIPTION_6_BULAN;
    return {
      isPhotoSelection: true,
      isProAddon: false,
      paketName: cat.paketName,
      addDays: cat.addDays,
      standardPrice: cat.standardPrice,
      sku: cat.sku
    };
  }

  // 1 Bulan (30 days, IDR 25,000 - exact settled label 'Paket 1 Bulan - Photo Selection')
  if (p.includes('1 BULAN') || p.includes('1-BULAN') || p.includes('1BULAN') || p.includes('BULANAN') || p.includes('MONTHLY') || p.includes('1 MONTH')) {
    const cat = MAYAR_CATALOG.SUBSCRIPTION_1_BULAN;
    return {
      isPhotoSelection: true,
      isProAddon: false,
      paketName: cat.paketName,
      addDays: cat.addDays,
      standardPrice: cat.standardPrice,
      sku: cat.sku,
      verifiedDisplayName: 'Paket 1 Bulan - Photo Selection'
    };
  }

  // Subscription Lifetime: Business rule states NO currently verified new-subscription Lifetime product exists
  if (p.includes('LIFETIME') || p.includes('SELAMANYA') || p.includes('PERMANEN')) {
    return {
      isPhotoSelection: true,
      isProAddon: false,
      isUnverifiedProduct: true,
      paketName: 'Lifetime',
      addDays: 0,
      standardPrice: null,
      reason: 'Unverified new subscription Lifetime product'
    };
  }

  // Other Photo Selection branded item not matching verified 5 SKUs (e.g. merchandise, unknown duration)
  return {
    isPhotoSelection: true,
    isProAddon: false,
    isUnverifiedProduct: true,
    paketName: null,
    addDays: 0,
    reason: 'Unrecognized Photo Selection SKU'
  };
}

function isPhotoSelectionProduct(rawProductName) {
  const result = classifyMayarProduct(rawProductName);
  return result.isPhotoSelection;
}

/**
 * Unified Server-Side PRO Entitlement Resolver.
 * Resolves whether a user holds active PRO capabilities across all 5 features:
 * 1. Automated Upsell System
 * 2. Dynamic Watermark
 * 3. 1-Click Premium Collage (29 templates)
 * 4. Multi-Category
 * 5. Gallery Music
 */
function resolveUserProEntitlement(user, proRow, options = {}) {
  if (!user) return { isPro: false, isLifetime: false, expiresAt: null, reason: 'No user' };

  if (String(user.Role).toLowerCase() === 'admin') {
    return { isPro: true, isLifetime: true, expiresAt: null, reason: 'Admin role' };
  }

  // 1. Transient DB / Read Error: Fail closed immediately (DO NOT fall back to legacy flags)
  if (options.lookupError) {
    return {
      isPro: false,
      isLifetime: false,
      expiresAt: null,
      lookupError: true,
      errorReason: options.errorReason || 'Database lookup error',
      source: 'error_fail_closed'
    };
  }

  // 2. Authoritative pro_entitlements record found
  if (proRow) {
    const rawIsPro = (proRow.is_pro !== undefined && proRow.is_pro !== null)
      ? String(proRow.is_pro).trim().toLowerCase()
      : null;
    const rawStatus = (proRow.status !== undefined && proRow.status !== null)
      ? String(proRow.status).trim().toLowerCase()
      : '';
    const rawLifetime = (proRow.is_lifetime !== undefined && proRow.is_lifetime !== null)
      ? String(proRow.is_lifetime).trim().toLowerCase()
      : '';

    const isExplicitlyRevoked = (
      proRow.is_pro === false ||
      rawIsPro === 'false' ||
      rawIsPro === '0' ||
      rawIsPro === 'off' ||
      rawIsPro === 'no' ||
      ['inactive', 'revoked', 'disabled', 'cancelled', 'expired'].includes(rawStatus)
    );

    if (isExplicitlyRevoked) {
      let safeRevokedExpiresAt = null;
      if (proRow.expires_at) {
        const d = new Date(proRow.expires_at);
        if (!isNaN(d.getTime())) {
          safeRevokedExpiresAt = d.toISOString();
        }
      }
      return {
        isPro: false,
        isLifetime: false,
        expiresAt: safeRevokedExpiresAt,
        isExpired: false,
        isRevoked: true,
        source: proRow.source || 'entitlement_inactive'
      };
    }

    if (proRow.is_lifetime === true || rawLifetime === 'true' || rawLifetime === '1') {
      return { isPro: true, isLifetime: true, expiresAt: null, source: proRow.source || 'payment' };
    }
    if (proRow.expires_at) {
      const expDate = new Date(proRow.expires_at);
      const isDateValid = !isNaN(expDate.getTime());
      const isStillValid = isDateValid && expDate.getTime() > Date.now();
      return {
        isPro: isStillValid,
        isLifetime: false,
        expiresAt: (isDateValid && isStillValid) ? expDate.toISOString() : null,
        expiredAtRaw: proRow.expires_at,
        isExpired: !isStillValid,
        source: proRow.source || 'payment'
      };
    }
    // Entitlement row exists but has no valid future date
    return { isPro: false, isLifetime: false, expiresAt: null, isExpired: true, source: proRow.source || 'payment' };
  }

  // 3. Authoritative check: table exists and user has NO entitlement row
  // Crucial: Must NEVER grant PRO or PRO Lifetime from users.Paket='Lifetime' or users.Akses_Watermark='TRUE'
  if (options.tableChecked === true && !options.tableAbsent) {
    return { isPro: false, isLifetime: false, expiresAt: null, source: 'no_entitlement_record' };
  }

  // 4. Pre-migration compatibility window ONLY (when table does not exist in DB yet)
  if (options.tableAbsent === true) {
    const rawPaket = String(user.Paket || '').toUpperCase();
    const hasLegacyWatermark = String(user.Akses_Watermark || '').toUpperCase() === 'TRUE';
    const hasLegacyPro = rawPaket.includes('PRO');
    const hasLegacyLifetime = rawPaket.includes('LIFETIME') || String(user.ExpiredAt || '').toLowerCase() === 'lifetime';

    if (hasLegacyLifetime && (hasLegacyWatermark || hasLegacyPro)) {
      return { isPro: true, isLifetime: true, expiresAt: null, source: 'pre_migration_legacy_fallback' };
    }
    if (hasLegacyWatermark || hasLegacyPro) {
      const userExp = String(user.ExpiredAt || '');
      if (/^\d{4}-\d{2}-\d{2}/.test(userExp)) {
        const expDate = new Date(userExp + 'T23:59:59Z');
        const isStillValid = !isNaN(expDate.getTime()) && expDate.getTime() > Date.now();
        return {
          isPro: isStillValid,
          isLifetime: false,
          expiresAt: isStillValid ? expDate.toISOString() : null,
          isExpired: !isStillValid,
          source: 'pre_migration_legacy_fallback'
        };
      }
    }
  }

  return { isPro: false, isLifetime: false, expiresAt: null, source: 'default_deny' };
}

async function getUserProEntitlement(username) {
  if (!username) return { isPro: false, isLifetime: false, expiresAt: null };
  const userRows = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=*`);
  if (!userRows || userRows.length === 0) return { isPro: false, isLifetime: false, expiresAt: null };
  const u = userRows[0];
  if (String(u.Role).toLowerCase() === 'admin') {
    return { isPro: true, isLifetime: true, expiresAt: null, user: u };
  }

  let proRow = null;
  let tableChecked = false;
  let tableAbsent = false;
  let lookupError = false;
  let errorReason = '';

  try {
    const proRows = await supabaseQuery(`pro_entitlements?user_id=eq.${encodeURIComponent(u.id)}&select=*`);
    tableChecked = true;
    if (Array.isArray(proRows) && proRows.length > 0) {
      proRow = proRows[0];
    }
  } catch (err) {
    const errMsg = String((err && err.message) || '');
    if (errMsg.includes('404') || errMsg.includes('relation "public.pro_entitlements" does not exist') || errMsg.includes('does not exist')) {
      tableAbsent = true;
    } else {
      lookupError = true;
      errorReason = errMsg || 'Database error querying pro_entitlements';
    }
  }

  const resolved = resolveUserProEntitlement(u, proRow, { tableChecked, tableAbsent, lookupError, errorReason });
  resolved.user = u;
  return resolved;
}

// =========================================================================
// PHASE 4.7.1 CORS & STRICT API ORIGIN VALIDATION
// =========================================================================

function parseAndValidateOrigin(rawOrigin) {
  if (!rawOrigin || typeof rawOrigin !== 'string') return null;
  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed === 'null') return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
    if (parsed.search !== '' || parsed.hash !== '') return null;
    if (parsed.username !== '' || parsed.password !== '') return null;

    if (trimmed.toLowerCase() !== parsed.origin.toLowerCase()) return null;

    return parsed.origin;
  } catch (_) {
    return null;
  }
}

function getAllowedOrigins() {
  const allowed = new Set([
    'https://ps.kamacreative.my.id',
    'https://photo-selection-6fu.pages.dev',
    'https://photo-selector.vercel.app'
  ]);

  // Cloudflare Pages deployment URL
  if (process.env.CF_PAGES_URL && typeof process.env.CF_PAGES_URL === 'string') {
    const cfUrl = process.env.CF_PAGES_URL.trim();
    if (cfUrl) {
      const parsed = parseAndValidateOrigin(cfUrl.startsWith('http://') || cfUrl.startsWith('https://') ? cfUrl : `https://${cfUrl}`);
      if (parsed) allowed.add(parsed);
    }
  }

  // Vercel deployment URL (Preview or Production deployment)
  if (process.env.VERCEL_URL && typeof process.env.VERCEL_URL === 'string') {
    const vUrl = process.env.VERCEL_URL.trim();
    if (vUrl) {
      const parsed = parseAndValidateOrigin(vUrl.startsWith('http://') || vUrl.startsWith('https://') ? vUrl : `https://${vUrl}`);
      if (parsed) allowed.add(parsed);
    }
  }

  // Vercel branch deployment URL
  if (process.env.VERCEL_BRANCH_URL && typeof process.env.VERCEL_BRANCH_URL === 'string') {
    const vbUrl = process.env.VERCEL_BRANCH_URL.trim();
    if (vbUrl) {
      const parsed = parseAndValidateOrigin(vbUrl.startsWith('http://') || vbUrl.startsWith('https://') ? vbUrl : `https://${vbUrl}`);
      if (parsed) allowed.add(parsed);
    }
  }

  // Configurable allowed origins via environment variable (comma-separated exact origins)
  if (process.env.CORS_ALLOWED_ORIGINS && typeof process.env.CORS_ALLOWED_ORIGINS === 'string') {
    const items = process.env.CORS_ALLOWED_ORIGINS.split(',');
    for (const item of items) {
      const parsed = parseAndValidateOrigin(item);
      if (parsed) allowed.add(parsed);
    }
  }

  // Localhost origins allowed only under development configuration
  const isDevelopment = process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'development' ||
    (!process.env.VERCEL && process.env.NODE_ENV !== 'production');

  if (isDevelopment) {
    allowed.add('http://localhost:3000');
    allowed.add('http://localhost:5500');
    allowed.add('http://127.0.0.1:5500');
    allowed.add('http://localhost:5173');
    allowed.add('http://localhost:8080');
  }

  return allowed;
}

function handleCors(req, res) {
  // Always include Vary: Origin for CDN/edge cache correctness
  res.setHeader('Vary', 'Origin');

  const headers = (req && req.headers && typeof req.headers === 'object') ? req.headers : {};
  let hasOriginHeader = false;
  let rawOrigin = undefined;

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'origin') {
      hasOriginHeader = true;
      rawOrigin = headers[key];
      break;
    }
  }

  // Requests without an Origin header (server-to-server, Mayar webhooks, curl, same-origin direct calls)
  if (!hasOriginHeader) {
    if (req && req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return true;
  }

  const validatedOrigin = parseAndValidateOrigin(rawOrigin);
  const allowedOrigins = getAllowedOrigins();

  const isPagesDev = validatedOrigin && (
    validatedOrigin === 'https://photo-selection-6fu.pages.dev' ||
    /^https:\/\/[a-z0-9-]+\.photo-selection-6fu\.pages\.dev$/.test(validatedOrigin) ||
    /^https:\/\/photo-selection-[a-z0-9]+\.pages\.dev$/.test(validatedOrigin)
  );

  if (validatedOrigin && (allowedOrigins.has(validatedOrigin) || isPagesDev)) {
    res.setHeader('Access-Control-Allow-Origin', validatedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Client-Token, X-Project-Token');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return true;
  }

  // Unauthorized browser origin
  if (req && req.method === 'OPTIONS') {
    return error(res, 'CORS preflight forbidden', 403);
  }

  return error(res, 'Cross-origin request forbidden', 403);
}

async function handler(req, res) {
  if (handleCors(req, res) !== true) {
    return;
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (trimmed === '') {
        payload = {};
      } else {
        try {
          payload = JSON.parse(trimmed);
        } catch (e) {
          return error(res, 'Format payload JSON tidak valid.', 400);
        }
      }
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      payload = {};
    }

    if (req && req.query && typeof req.query === 'object') {
      for (const [k, v] of Object.entries(req.query)) {
        if (!payload[k]) payload[k] = v;
      }
    }

    if ((!payload.action) && req && req.url) {
      try {
        const u = new URL(req.url, 'http://localhost');
        for (const [k, v] of u.searchParams.entries()) {
          if (!payload[k]) payload[k] = v;
        }
      } catch (e) { }
    }

    // Security Gate: Strip any untrusted client-supplied authUser immediately
    delete payload.authUser;

    let isWebhookRequest = false;
    if (payload.action === 'mayarWebhook' || Boolean(payload.event)) {
      isWebhookRequest = true;
    } else if (req && req.url) {
      try {
        const u = new URL(req.url, 'http://localhost');
        if (u.searchParams.get('action') === 'mayarWebhook') {
          isWebhookRequest = true;
        }
      } catch (e) { }
    }

    if (isWebhookRequest) {
      return await handleMayarWebhook(payload, req, res);
    }

    const action = (payload && typeof payload.action === 'string') ? payload.action.trim() : '';
    if (!action) return error(res, 'Action is required', 400);

    if (action === 'logout') {
      return await handleLogout(payload, req, res);
    }

    if (PROTECTED_ACCOUNT_ACTIONS.has(action)) {
      const authUser = await verifyUserSession(payload, req);
      if (!authUser) {
        return error(res, 'Sesi tidak valid atau telah berakhir. Silakan login kembali.', 401);
      }
      payload.authUser = authUser;

      if (ADMIN_ONLY_ACTIONS.has(action) && !requireAdmin(authUser)) {
        return error(res, 'Akses ditolak. Tindakan ini memerlukan hak akses Admin.', 403);
      }
    }

    switch (action) {
      case 'mayarWebhook': return await handleMayarWebhook(payload, req, res);
      case 'logout': return await handleLogout(payload, req, res);
      case 'login': return await handleLogin(payload, res);
      case 'register': return await handleRegister(payload, res);
      case 'getGlobalBranding': return await handleGetGlobalBranding(payload, res);
      case 'saveBrandSettings': return await handleSaveBrandSettings(payload, res);
      case 'uploadBrandLogo': return await handleUploadBrandLogo(payload, res);
      case 'savePaymentSettings': return await handleSavePaymentSettings(payload, res);
      case 'uploadPaymentProof': return await handleUploadPaymentProof(payload, res);
      case 'pingUser': return await handlePingUser(payload, res);
      case 'getUsers': return await handleGetUsers(payload, res);
      case 'approveUser': return await handleApproveUser(payload, res);
      case 'updateExpiry': return await handleUpdateExpiry(payload, res);
      case 'sendExpiryReminder': return await handleSendExpiryReminder(payload, res);
      case 'deleteUser': return await handleDeleteUser(payload, res);
      case 'requestOTP': return await handleRequestOTP(payload, res);
      case 'resetPasswordWithOTP': return await handleResetPasswordWithOTP(payload, res);
      case 'confirmEmail': return await handleConfirmEmail(payload, res);
      case 'getProjects': return await handleGetProjects(payload, res);
      case 'createProject': return await handleCreateProject(payload, res);
      case 'getProjectForClient': return await handleGetProjectForClient(payload, res);
      case 'verifyClientPassword': return await handleVerifyClientPassword(payload, res);
      case 'updateClientPassword': return await handleUpdateClientPassword(payload, res);
      case 'updateClientStatus': return await handleUpdateClientStatus(payload, res);
      case 'releaseClientSession': return await handleReleaseClientSession(payload, res);
      case 'updateDeadline': return await handleUpdateDeadline(payload, res);
      case 'deleteProject': return await handleDeleteProject(payload, res);
      case 'reopenProject': return await handleReopenProject(payload, res);
      case 'toggleProjectWatermark': return await handleToggleProjectWatermark(payload, res);
      case 'toggleProjectDownload': return await handleToggleProjectDownload(payload, res);
      case 'updateProjectMusic': return await handleUpdateProjectMusic(payload, res);
      case 'uploadAudioChunk': return await handleUploadAudioChunk(payload, req, res);
      case 'getProjectAudio': return await handleGetProjectAudio(payload, req, res);
      case 'updateProjectMaxFoto': return await handleUpdateProjectMaxFoto(payload, res);
      case 'processPayment': return await handleProcessPayment(payload, res);
      case 'getDashboardStats': return await handleGetDashboardStats(payload, res);
      case 'logVisit': return await handleLogVisit(payload, res);
      case 'getDriveContent': return await handleGetDriveContent(payload, req, res);
      case 'getPhotos': return await handleGetDriveContent(payload, req, res);
      case 'getAudioData': return await handleGetAudioData(payload, res);
      case 'getAudioStream': return await handleGetAudioStream(payload, req, res);
      case 'submitFeedback': return await handleSubmitFeedback(payload, res);
      case 'getFeedbacks': return await handleGetFeedbacks(payload, res);
      case 'replyFeedback': return await handleReplyFeedback(payload, res);
      case 'getAllNotifications': return await handleGetAllNotifications(payload, res);
      case 'markFeedbackRead': return await handleMarkFeedbackRead(payload, res);
      case 'getSystemUpdates': return await handleGetSystemUpdates(payload, res);
      case 'syncSystemUpdates': return await handleSyncSystemUpdates(payload, res);
      case 'syncBackground': return await handleSyncBackground(payload, res);
      case 'downloadOriginalFile': return await handleDownloadOriginalFile(payload, req, res);
      case 'getPreviewImage': return await handleGetPreviewImage(payload, req, res);
      default: return error(res, `Unknown action: ${action}`, 404);
    }
  } catch (err) {
    console.error('Supabase API Handler Error:', err);
    return error(res, 'Terjadi kesalahan pada server.', 500);
  }
}

module.exports = handler;
module.exports.handleGetDriveContent = handleGetDriveContent;
module.exports.handleGetPreviewImage = handleGetPreviewImage;
module.exports.handleDownloadOriginalFile = handleDownloadOriginalFile;
module.exports.handleUpdateClientStatus = handleUpdateClientStatus;
module.exports.handleGetProjects = handleGetProjects;
module.exports.handleGetAudioStream = handleGetAudioStream;
module.exports.parseAndValidateOrigin = parseAndValidateOrigin;
module.exports.getAllowedOrigins = getAllowedOrigins;
module.exports.handleCors = handleCors;
module.exports.verifyWebhookAuthenticity = verifyWebhookAuthenticity;
module.exports.isConfirmedPaymentSuccess = isConfirmedPaymentSuccess;
module.exports.isNewMembershipEvent = isNewMembershipEvent;
module.exports.extractMayarTransactionId = extractMayarTransactionId;
module.exports.classifyMayarProduct = classifyMayarProduct;
module.exports.isPhotoSelectionProduct = isPhotoSelectionProduct;
module.exports.handleMayarWebhook = handleMayarWebhook;
module.exports.createPasswordHash = createPasswordHash;
module.exports.verifyModernPassword = verifyModernPassword;
module.exports.MAYAR_CATALOG = MAYAR_CATALOG;
module.exports.resolveUserProEntitlement = resolveUserProEntitlement;
module.exports.getUserProEntitlement = getUserProEntitlement;
module.exports.getOrSyncSystemUpdates = getOrSyncSystemUpdates;
module.exports.OFFICIAL_SYSTEM_UPDATES = OFFICIAL_SYSTEM_UPDATES;
module.exports.handleGetSystemUpdates = handleGetSystemUpdates;
module.exports.handleGetAllNotifications = handleGetAllNotifications;
module.exports.handleSyncSystemUpdates = handleSyncSystemUpdates;
module.exports.isDemoUser = isDemoUser;
module.exports.handleCreateProject = handleCreateProject;

// =========================================================================
// CONTROLLERS
// =========================================================================

async function handleLogin(payload, res) {
  const username = (payload.username || '').trim();
  const password = (payload.password || '').trim();
  if (!username || !password) return error(res, 'Username dan Password wajib diisi.');

  if (username.length > 254) {
    return error(res, 'Username atau password salah.');
  }

  if (password.length > 256) {
    return error(res, 'Username atau password salah.');
  }

  const users = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=*`);
  if (!users || users.length === 0) return error(res, 'Username atau password salah.');

  const u = users[0];
  const storedPass = u.Password || '';
  const authCheck = verifyAccountPassword(password, storedPass);

  if (!authCheck.valid) return error(res, 'Username atau password salah.');

  // Phase 4.5: Migrate legacy credentials to scrypt on successful login
  if (authCheck.needsMigration) {
    try {
      const upgradedHash = createPasswordHash(password);
      await supabaseQuery(`users?Username=ilike.${encodeURIComponent(u.Username)}`, {
        method: 'PATCH',
        body: { Password: upgradedHash }
      });
      u.Password = upgradedHash;
    } catch (migErr) {
      console.error('Password migration failed during login for user:', u.Username, migErr);
      return error(res, 'Terjadi kendala saat memperbarui keamanan akun. Silakan coba login kembali beberapa saat lagi.', 500);
    }
  }

  const status = u.Status || 'Active';
  const role = u.Role || 'Photographer';
  const uName = u.Username;

  if (status === 'Unverified') return error(res, 'Akun Anda belum diverifikasi. Silakan cek email Anda.');
  if (status === 'Pending') return error(res, 'Akun Anda sedang menunggu persetujuan (ACC) dari Admin.');

  const sessionId = crypto.randomUUID();
  try {
    const sessionRes = await supabaseQuery('sessions', {
      method: 'POST',
      body: { SessionID: sessionId, Username: uName, Role: role, CreatedAt: new Date().toISOString() }
    });
    if (sessionRes && sessionRes.error) {
      throw new Error(sessionRes.error.message || 'Gagal menyimpan sesi');
    }
  } catch (e) {
    console.error('Session creation failed during login:', e);
    return error(res, 'Gagal membuat sesi login. Silakan coba lagi.', 500);
  }

  const proStatus = await getUserProEntitlement(uName);
  const rawPaket = u.Paket || '';
  const isPro = proStatus.isPro;

  let projCreatedCount = Number(u.ProjectCreated) || 0;
  if (isDemoUser(u) && projCreatedCount === 0) {
    try {
      const existingProjects = await supabaseQuery(`projects?Owner=ilike.${encodeURIComponent(uName)}&select=id`);
      if (existingProjects && existingProjects.length > 0) {
        projCreatedCount = existingProjects.length;
        await supabaseQuery(`users?Username=ilike.${encodeURIComponent(uName)}`, {
          method: 'PATCH',
          body: { ProjectCreated: String(projCreatedCount) }
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Error auto-syncing ProjectCreated during login:', e);
    }
  }

  const userData = {
    success: true,
    username: uName,
    nama: u.Nama || uName,
    role: role,
    status: status,
    brandName: u.BrandName || 'Photo Selection',
    brandLogo: u.BrandLogo || '',
    watermarkUrl: u.WatermarkUrl || '',
    bankName: u.BankName || '',
    bankAccount: u.BankAccount || '',
    bankAccountName: u.BankAccountName || '',
    theme: u.Theme || u.theme || 'noir',
    email: u.Email || '',
    nohp: u['No HP'] || '',
    paket: rawPaket || '1 Bulan',
    expiredAt: u.ExpiredAt || 'Lifetime',
    projectCreated: projCreatedCount,
    ProjectCreated: projCreatedCount,
    isPremiumAddon: isPro,
    isProLifetime: proStatus.isLifetime,
    proExpiredAt: proStatus.expiresAt ? proStatus.expiresAt.substring(0, 10) : (proStatus.isLifetime ? 'Lifetime' : null),
    proIsActive: isPro,
    sessionId: sessionId
  };

  return success(res, userData, 'Login Berhasil');
}

async function handleRegister(payload, res) {
  const d = payload.formData || payload.data || payload || {};
  const nama = cleanPlainString(d.nama || '', false);
  const email = (d.email || '').trim().toLowerCase();
  const nohp = cleanPlainString(d.nohp || '', false);
  const username = (d.username || '').trim().toLowerCase().replace(/\s+/g, '');
  const password = (d.password || '').trim();
  const paket = (d.paket || '1 Bulan').trim();

  if (!nama || !email || !username || !password) return error(res, 'Lengkapi semua isian pendaftaran.');
  if (nama.length > 120) return error(res, 'Nama maksimal 120 karakter.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error(res, 'Format email tidak valid.');
  }
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    return error(res, 'Username harus berupa 3-50 karakter (huruf kecil, angka, titik, strip, garis bawah).');
  }
  if (nohp.length > 32) return error(res, 'Nomor HP maksimal 32 karakter.');
  // Only self-service subscription catalog packages and demo are valid for public registration.
  // Lifetime is reserved for direct administrative/operator assignment and cannot be chosen publicly.
  const VALID_PAKETS = new Set(['1 Bulan', '6 Bulan', '1 Tahun', 'Demo', 'Demo 7 Hari', 'Free']);
  if (!VALID_PAKETS.has(paket)) {
    if (paket === 'Lifetime') {
      return error(res, 'Paket Lifetime tidak tersedia untuk pendaftaran publik.', 400);
    }
    return error(res, 'Pilihan paket tidak valid.');
  }
  if (!validatePasswordPolicy(password)) {
    return error(res, 'Password minimal 8 karakter dan maksimal 128 karakter.');
  }

  const existing = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=id`);
  if (existing && existing.length > 0) return error(res, 'Username sudah digunakan.');

  const passHash = createPasswordHash(password);
  const confirmToken = crypto.randomUUID();
  const isDemo = (paket.toUpperCase().includes('DEMO') || paket === 'Free');
  let refCode = '';
  const rawRef = d.refCode !== undefined ? d.refCode : (d.ref !== undefined ? d.ref : '');
  if (rawRef !== null && rawRef !== undefined && String(rawRef).trim() !== '') {
    if (typeof rawRef !== 'string') {
      return error(res, 'Format kode referral tidak valid.', 400);
    }
    const trimmedRef = rawRef.trim();
    if (trimmedRef.length > 32 || !/^[A-Za-z0-9_-]{1,32}$/.test(trimmedRef)) {
      return error(res, 'Kode referral tidak valid (hanya alfanumerik, tanda hubung, atau garis bawah maks 32 karakter).', 400);
    }
    refCode = trimmedRef.toUpperCase();
  }
  const tokenPayload = refCode ? `REF:${refCode}` : confirmToken;

  // Pending paid users must NOT be initialized with Lifetime entitlement (Release Blocker Fix)
  let expiredAt = null;
  let initialStatus = 'Pending';

  if (isDemo) {
    initialStatus = 'Active';
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 7);
    expiredAt = expDate.toISOString().split('T')[0];
  }

  const newUser = {
    Username: username,
    Password: passHash,
    Nama: nama,
    Role: isDemo ? 'Demo' : 'Photographer',
    Status: initialStatus,
    Email: email,
    'No HP': nohp,
    Paket: paket,
    ExpiredAt: expiredAt,
    ConfirmToken: tokenPayload,
    ProjectCreated: '0'
  };

  await supabaseQuery('users', { method: 'POST', body: newUser });

  const eventId = d.eventId || ('reg_' + username + '_' + Date.now());
  sendMetaCAPIEvent('CompleteRegistration', {
    eventId: eventId,
    email: email,
    phone: nohp,
    fbp: d.fbp || '',
    fbc: d.fbc || '',
    customData: {
      content_name: 'Pendaftaran Fotografer',
      status: initialStatus,
      value: isDemo ? 0 : 50000,
      currency: 'IDR'
    }
  }).catch(() => { });

  let paymentUrl = '';
  if (paket === '1 Bulan') paymentUrl = 'https://kamacreative.myr.id/pl/paket-1-bulan-photo-selection';
  else if (paket === '6 Bulan') paymentUrl = 'https://kamacreative.myr.id/pl/paket-6-bulan-photo-selection';
  else if (paket === '1 Tahun') paymentUrl = 'https://kamacreative.myr.id/pl/paket-1-tahunn-photo-selection';
  else if (paket === 'Lifetime') paymentUrl = 'https://kamacreative.myr.id/pl/paket-lifetime-photo-selection';

  if (paymentUrl) {
    try {
      const pUrl = new URL(paymentUrl);
      if (nama) pUrl.searchParams.set('name', nama);
      if (email) pUrl.searchParams.set('email', email);
      if (nohp) pUrl.searchParams.set('mobile', nohp);
      paymentUrl = pUrl.toString();
    } catch (e) { }
  }

  // Kirim email notifikasi ke Admin & Fotografer pendaftar secara berurutan dan pastikan tuntas sebelum fungsi serverless selesai
  try {
    const adminEmailSubject = `Pendaftaran Fotografer Baru - Photo Selection (${nama})`;

    const userEmailSubject = isDemo
      ? `Selamat Datang di Photo Selection - Akun Demo Aktif`
      : `Pendaftaran Akun Berhasil - Photo Selection`;

    // 1. Kirim notifikasi ke Admin terlebih dahulu agar selalu terekam di sistem admin
    const adminSent = await sendEmailViaGAS({
      to: ADMIN_EMAIL,
      subject: adminEmailSubject,
      htmlBody: buildAdminNewUserEmail({
        nama: nama,
        username: username,
        email: email,
        nohp: nohp,
        paket: paket,
        status: initialStatus
      })
    });
    if (!adminSent) {
      console.warn('[MAILER] Notifikasi Admin gagal atau ditolak oleh mailer provider.');
    }

    // 2. Kirim email sambutan ke Fotografer
    const userSent = await sendEmailViaGAS({
      to: email,
      subject: userEmailSubject,
      htmlBody: buildPhotographerWelcomeEmail({
        nama: nama,
        username: username,
        email: email,
        paket: paket,
        status: initialStatus,
        paymentUrl: paymentUrl
      })
    });
    if (!userSent) {
      console.warn('[MAILER] Email sambutan Fotografer gagal atau ditolak oleh mailer provider.');
    }
  } catch (mailErr) {
    console.error('[MAILER] Error saat pengiriman email pendaftaran:', mailErr);
  }

  return success(res, { success: true, paymentUrl: paymentUrl, eventId: eventId }, 'Pendaftaran berhasil');
}

async function handleGetGlobalBranding(payload, res) {
  try {
    const adminUsers = await supabaseQuery('users?Role=eq.Admin&select=*&limit=1');
    if (adminUsers && adminUsers.length > 0) {
      const u = adminUsers[0];
      return success(res, {
        success: true,
        brandName: u.BrandName || 'Photo Selection',
        brandLogo: u.BrandLogo || ''
      });
    }
  } catch (e) { }
  return success(res, { success: true, brandName: 'Photo Selection', brandLogo: '' });
}

async function handleSaveBrandSettings(payload, res) {
  const authUser = payload.authUser || {};
  const username = (authUser.username || payload.username || '').trim();
  if (!username) return error(res, 'Username required');

  const updateBody = {};

  if (payload.brandName !== undefined) {
    const brandName = cleanPlainString(payload.brandName || '', false);
    if (brandName.length > 100) return error(res, 'Nama brand maksimal 100 karakter.');
    updateBody.BrandName = brandName;
  }

  if (payload.brandLogo !== undefined) {
    const brandLogo = (payload.brandLogo || '').trim();
    if (brandLogo && !isSafeImageReference(brandLogo, 2 * 1024 * 1024)) {
      return error(res, 'Format URL atau data gambar logo brand tidak valid.');
    }
    updateBody.BrandLogo = brandLogo;
  }

  if (payload.watermarkUrl !== undefined) {
    const watermarkUrl = (payload.watermarkUrl || '').trim();
    if (watermarkUrl && !isSafeImageReference(watermarkUrl, 2 * 1024 * 1024)) {
      return error(res, 'Format URL atau data gambar watermark tidak valid.');
    }
    updateBody.WatermarkUrl = watermarkUrl;
  }

  const rawTheme = String(payload.theme || '').toLowerCase().trim();
  const VALID_THEMES = ['noir', 'ivory', 'sapphire', 'olive'];
  if (rawTheme && VALID_THEMES.includes(rawTheme)) {
    updateBody.Theme = rawTheme;
  }

  if (Object.keys(updateBody).length > 0) {
    try {
      await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: updateBody
      });
    } catch (patchErr) {
      if (updateBody.Theme && String(patchErr && patchErr.message || '').toLowerCase().includes('theme')) {
        console.warn('[THEME_SYNC] Column Theme may not exist in users table yet. Falling back:', patchErr.message);
        delete updateBody.Theme;
        if (Object.keys(updateBody).length > 0) {
          await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
            method: 'PATCH',
            body: updateBody
          });
        }
      } else {
        throw patchErr;
      }
    }
  }

  return success(res, {
    success: true,
    brandName: updateBody.BrandName,
    brandLogo: updateBody.BrandLogo,
    theme: updateBody.Theme || rawTheme,
    message: 'Settings saved'
  });
}

async function handleUploadBrandLogo(payload, res) {
  const base64Data = (payload.base64Data || '').trim();
  const filename = cleanPlainString(payload.filename || '', false);
  if (!base64Data) return error(res, 'File gambar tidak ditemukan');
  if (filename.length > 255) return error(res, 'Nama file maksimal 255 karakter.');
  if (!isSafeDataImage(base64Data, 2 * 1024 * 1024)) {
    return error(res, 'Format gambar harus berupa JPG, PNG, WebP, atau GIF dengan ukuran maksimal 2 MB.');
  }
  return success(res, { success: true, url: base64Data });
}

async function handleSavePaymentSettings(payload, res) {
  const authUser = payload.authUser || {};
  const username = String(authUser.username || '').trim();
  if (!username) {
    return error(res, 'Sesi tidak valid atau telah berakhir. Silakan login kembali.', 401);
  }
  const bankName = cleanPlainString(payload.bankName || '', false);
  const bankAccount = cleanPlainString(payload.bankAccount || '', false);
  const bankAccountName = cleanPlainString(payload.bankAccountName || '', false);

  if (bankName.length > 80) return error(res, 'Nama bank maksimal 80 karakter.');
  if (bankAccount.length > 64) return error(res, 'Nomor rekening maksimal 64 karakter.');
  if (bankAccountName.length > 120) return error(res, 'Nama pemilik rekening maksimal 120 karakter.');

  await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { BankName: bankName, BankAccount: bankAccount, BankAccountName: bankAccountName }
  });

  return success(res, { success: true, bankName, bankAccount, bankAccountName, message: 'Payment settings saved' });
}

async function handleUploadPaymentProof(payload, res) {
  const token = (payload.token || '').trim();
  const clientAccessToken = (payload.clientAccessToken || payload.tokenClient || '').trim();

  if (!token || !clientAccessToken) {
    return error(res, 'Unauthorized: Token and client access token required', 401);
  }

  const project = await findProjectForClient(token);
  if (!project) {
    return error(res, 'Project tidak ditemukan', 404);
  }

  const validSession = await verifyClientGallerySession(clientAccessToken, project);
  if (!validSession) {
    return error(res, 'Unauthorized: Invalid or expired client access token', 403);
  }

  return success(res, { success: true });
}

async function handlePingUser(payload, res) {
  const authUser = payload.authUser || {};
  const username = (authUser.username || (payload.currentUser && payload.currentUser.username) || payload.username || '').trim();
  if (!username) {
    return success(res, { success: true, ok: true });
  }

  try {
    // 1. Update timestamp LastActive
    await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}`, {
      method: 'PATCH',
      body: { LastActive: new Date().toISOString() }
    }).catch(() => { });

    // 2. Ambil data profil terbaru dari database (agar perpanjangan masa aktif langsung tersinkronisasi)
    const rows = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=*`);
    if (rows && rows.length > 0) {
      const u = rows[0];
      const proStatus = await getUserProEntitlement(username);
      const rawPaket = u.Paket || '';
      const isPro = proStatus.isPro;

      const freshUserData = {
        username: u.Username,
        nama: u.Nama || u.Username,
        role: u.Role || 'Photographer',
        status: u.Status || 'Active',
        brandName: u.BrandName || 'Photo Selection',
        brandLogo: u.BrandLogo || '',
        watermarkUrl: u.WatermarkUrl || '',
        bankName: u.BankName || '',
        bankAccount: u.BankAccount || '',
        bankAccountName: u.BankAccountName || '',
        theme: u.Theme || u.theme || 'noir',
        email: u.Email || '',
        nohp: u['No HP'] || '',
        paket: rawPaket || '1 Bulan',
        expiredAt: u.ExpiredAt || 'Lifetime',
        isPremiumAddon: isPro,
        isProLifetime: proStatus.isLifetime,
        proExpiredAt: proStatus.expiresAt ? proStatus.expiresAt.substring(0, 10) : (proStatus.isLifetime ? 'Lifetime' : null),
        proIsActive: isPro
      };

      return success(res, { success: true, ok: true, user: freshUserData });
    }
  } catch (e) { }

  return success(res, { success: true, ok: true });
}

async function handleGetProjects(payload, res) {
  const authUser = payload.authUser || {};
  const username = authUser.username || '';
  const role = authUser.role || 'Photographer';

  let endpoint = 'projects?select=*&order=created_at.desc';
  if (role !== 'Admin') {
    endpoint = `projects?Owner=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc`;
  }

  const rows = await supabaseQuery(endpoint);

  const formatted = (rows || []).map(p => {
    let dp = p['Daftar Pilihan'] || p.DaftarPilihan || p.daftar_pilihan || [];
    if (typeof dp === 'string') {
      try { dp = JSON.parse(dp); } catch (e) { dp = dp.split(',').map(s => s.trim()).filter(Boolean); }
    }
    let nt = p.Notes || p.notes || {};
    if (typeof nt === 'string') {
      try { nt = JSON.parse(nt); } catch (e) { }
    }
    let kat = p.Kategori || p.kategori || p.categories || [];
    if (typeof kat === 'string') {
      try { kat = JSON.parse(kat); } catch (e) { }
    }

    const token = p.Token || p.ID;
    const shortSlug = p['Short Slug'] || p.Slug || token;
    const clientName = p['Nama Client'] || p.NamaClient || 'Client';
    const nomorWA = p['Nomor WA'] || p.NomorWA || '';
    const passClient = p['Password Client'] || p.PasswordClient || '';
    const maxFoto = parseProjectMaxFoto(p['Max Foto'], p.MaxFoto);
    const driveLink = p['Drive Link'] || p.DriveLink || '';
    const dibuatPada = p['Dibuat Pada'] || p.created_at || new Date().toISOString();
    const lastUpdate = p['Last Update'] || p.LastUpdate || p.last_update || p.updated_at || dibuatPada;
    const statusClient = p['Status Client'] || p.Status || 'Belum Memilih';
    const fotoTerpilih = Number(p['Foto Terpilih']) || 0;
    const shortLink = p['Short Link'] || `https://ps.kamacreative.my.id/app?c=${shortSlug}`;
    const paymentProof = p['Payment Proof'] || p.PaymentProof || '';

    return {
      ID: p.id || p.ID || token,
      Token: token,
      'Short Slug': shortSlug,
      ShortSlug: shortSlug,
      Slug: shortSlug,
      'Nama Client': clientName,
      NamaClient: clientName,
      'Nomor WA': nomorWA,
      NomorWA: nomorWA,
      'Password Client': passClient,
      PasswordClient: passClient,
      'Max Foto': maxFoto,
      MaxFoto: maxFoto,
      'Drive Link': driveLink,
      DriveLink: driveLink,
      Owner: p.Owner || 'admin',
      'Short Link': shortLink,
      ShortLink: shortLink,
      Kategori: kat,
      UseWatermark: String(p.UseWatermark).toUpperCase() === 'TRUE',
      UseWatermarkTiled: String(p.UseWatermarkTiled).toUpperCase() === 'TRUE',
      ClientLayout: p.ClientLayout || 'masonry',
      ExtraPrice: Number(p.ExtraPrice) || 0,
      MusicUrl: (p.MusicUrl && p.MusicUrl.startsWith('data:audio/')) ? 'custom_audio' : (p.MusicUrl || p.MusicURL || ''),
      MusicURL: (p.MusicURL && p.MusicURL.startsWith('data:audio/')) ? 'custom_audio' : (p.MusicUrl || p.MusicURL || ''),
      AksesPilih: String(p.AksesPilih || p.Akses_Pilih).toUpperCase() !== 'FALSE',
      AksesDownload: String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE',
      'Akses_Pilih': String(p.AksesPilih || p.Akses_Pilih).toUpperCase() !== 'FALSE',
      'Akses_Download': String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE',
      DurasiPilih: p.DurasiPilih || p.Durasi_Pilih || 'Selamanya',
      DurasiDownload: p.DurasiDownload || p.Durasi_Download || 'Selamanya',
      'Durasi_Pilih': p.DurasiPilih || p.Durasi_Pilih || 'Selamanya',
      'Durasi_Download': p.DurasiDownload || p.Durasi_Download || 'Selamanya',
      Deadline: p.Deadline || '',
      Status: statusClient,
      'Status Client': statusClient,
      StatusClient: statusClient,
      'Foto Terpilih': fotoTerpilih,
      FotoTerpilih: fotoTerpilih,
      'Daftar Pilihan': dp,
      DaftarPilihan: dp,
      Notes: nt,
      'Payment Proof': paymentProof,
      PaymentProof: paymentProof,
      'Dibuat Pada': dibuatPada,
      TanggalDibuat: dibuatPada,
      'Last Update': lastUpdate,
      LastUpdate: lastUpdate,
      last_update: lastUpdate,
      updated_at: lastUpdate
    };
  });

  return success(res, { success: true, data: formatted });
}

async function handleCreateProject(payload, res) {
  const d = payload.formData || payload.data || payload || {};
  const authUser = payload.authUser || {};
  const username = String(authUser.username || '').trim();
  if (!username) {
    return error(res, 'Sesi tidak valid atau telah berakhir. Silakan login kembali.', 401);
  }

  const isDemo = isDemoUser(authUser) || isDemoUser(authUser.rawUser);
  let dbUser = authUser.rawUser || null;
  if (isDemo || !dbUser) {
    try {
      const userRows = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=*&limit=1`);
      if (userRows && userRows.length > 0) {
        dbUser = userRows[0];
      }
    } catch (e) {
      console.error('Error fetching db user for project creation:', e);
    }
  }

  const effectiveUser = dbUser || authUser;
  if (isDemoUser(effectiveUser)) {
    const lifetimeCount = Number(effectiveUser.ProjectCreated || 0);
    let activeProjectsCount = 0;
    try {
      const existing = await supabaseQuery(`projects?Owner=ilike.${encodeURIComponent(username)}&select=id&limit=2`);
      activeProjectsCount = Array.isArray(existing) ? existing.length : 0;
    } catch (e) {
      console.error('Error checking existing projects for demo limit:', e);
    }

    if (lifetimeCount >= 1 || activeProjectsCount >= 1) {
      return error(res, 'Akun paket Demo Anda hanya diberikan kesempatan membuat maksimal 1 Project. Silakan upgrade ke paket berbayar untuk membuat project tanpa batasan.', 403);
    }
  }

  const clientName = cleanPlainString(d.namaClient || d.nama || d['Nama Client'] || '', false);
  if (!clientName) return error(res, 'Nama client wajib diisi.');
  if (clientName.length > 150) return error(res, 'Nama client maksimal 150 karakter.');

  const nomorWA = cleanPlainString(d.nomorWA || d.wa || d['Nomor WA'] || '', false);
  if (nomorWA.length > 32) return error(res, 'Nomor WA maksimal 32 karakter.');

  const passwordClient = cleanPlainString(d.passwordClient || d.pass || d['Password Client'] || '', false);
  if (passwordClient.length > 128) return error(res, 'Password client maksimal 128 karakter.');

  const rawMax = d.maxFoto !== undefined ? d.maxFoto : (d.max !== undefined ? d.max : (d['Max Foto'] !== undefined ? d['Max Foto'] : 50));
  const maxFotoNum = validatePhotoQuota(rawMax, MAX_PHOTO_QUOTA);
  if (maxFotoNum === null) {
    return error(res, `Batas maksimal foto harus berupa bilangan bulat (0 - ${MAX_PHOTO_QUOTA}).`, 400);
  }

  const clientLayout = String(d.clientLayout || d.layout || 'masonry').toLowerCase();
  const VALID_LAYOUTS = new Set(['masonry', 'adaptive', 'horizontal', 'slideshow']);
  if (!VALID_LAYOUTS.has(clientLayout)) {
    return error(res, 'Pilihan tata letak galeri tidak valid.');
  }

  const extraPriceNum = Number(d.extraPrice || d.extra || 0);
  if (isNaN(extraPriceNum) || extraPriceNum < 0 || extraPriceNum > 1000000000) {
    return error(res, 'Harga foto ekstra tidak valid.');
  }

  let categoriesArr = [];
  if (Array.isArray(d.categories)) {
    categoriesArr = d.categories;
  } else if (typeof d.categories === 'string' && d.categories.trim()) {
    try {
      const parsed = JSON.parse(d.categories);
      if (Array.isArray(parsed)) categoriesArr = parsed;
    } catch (_) {
      return error(res, 'Format kategori tidak valid.');
    }
  }
  if (categoriesArr.length > 50) return error(res, 'Jumlah kategori maksimal 50.');
  const sanitizedCategories = [];
  for (const cat of categoriesArr) {
    if (!cat || typeof cat !== 'object') return error(res, 'Format kategori tidak valid.');
    const catName = cleanPlainString(cat.name || '', false);
    if (!catName || catName.length > 80) return error(res, 'Nama kategori harus 1-80 karakter.');
    const catMax = Number(cat.max);
    if (!Number.isInteger(catMax) || catMax < 1 || catMax > 99999) {
      return error(res, 'Kuota kategori harus berupa bilangan bulat (1 - 99999).');
    }
    sanitizedCategories.push({ name: catName, max: catMax });
  }

  const driveLink = (d.driveLink || d.link || d['Drive Link'] || '').trim();
  if (driveLink && !validateDriveReference(driveLink)) {
    return error(res, 'Format link atau ID Google Drive tidak valid.');
  }

  const musicUrl = (d.musicUrl || d.music || '').trim();
  if (musicUrl && !isSafeAudioReference(musicUrl)) {
    return error(res, 'Music URL harus berupa link HTTPS atau file audio yang valid.');
  }

  // Server-side enforcement of PRO features (Unified Entitlement Resolver):
  const hasWatermarkRequested = Boolean(d.useWatermark || d.useWatermarkTiled);
  const hasUpsellRequested = extraPriceNum > 0;
  const hasCategoriesRequested = sanitizedCategories.length > 0;
  const hasMusicRequested = Boolean(musicUrl);

  if (hasWatermarkRequested || hasUpsellRequested || hasCategoriesRequested || hasMusicRequested) {
    const userPro = await getUserProEntitlement(username);
    if (!userPro.isPro) {
      if (hasWatermarkRequested) {
        return error(res, 'Fitur Watermark membutuhkan Add-On PRO yang aktif. Silakan aktifkan Add-On PRO.', 403);
      }
      if (hasUpsellRequested) {
        return error(res, 'Fitur Sistem Upsell membutuhkan Add-On PRO yang aktif. Silakan aktifkan Add-On PRO.', 403);
      }
      if (hasCategoriesRequested) {
        return error(res, 'Fitur Multi-Kategori membutuhkan Add-On PRO yang aktif. Silakan aktifkan Add-On PRO.', 403);
      }
      if (hasMusicRequested) {
        return error(res, 'Fitur Musik Galeri membutuhkan Add-On PRO yang aktif. Silakan aktifkan Add-On PRO.', 403);
      }
    }
  }

  const token = crypto.randomBytes(6).toString('hex');
  const projectId = crypto.randomUUID();
  const baseSlug = clientName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'client';
  let shortSlug = baseSlug;
  try {
    const existing = await supabaseQuery(`projects?or=(Slug.eq.${encodeURIComponent(baseSlug)},%22Short%20Slug%22.eq.${encodeURIComponent(baseSlug)})&select=id`);
    if (existing && existing.length > 0) {
      shortSlug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
    }
  } catch (e) {
    shortSlug = baseSlug;
  }
  const shortLink = `https://ps.kamacreative.my.id/app?c=${shortSlug}`;

  const rawDurasiPilih = d.durasiPilih !== undefined ? d.durasiPilih : 'Selamanya';
  const rawDurasiDownload = d.durasiDownload !== undefined ? d.durasiDownload : 'Selamanya';
  const durasiPilih = cleanPlainString(rawDurasiPilih, false);
  const durasiDownload = cleanPlainString(rawDurasiDownload, false);
  if (durasiPilih.length > 64) return error(res, 'Durasi pilih maksimal 64 karakter.');
  if (durasiDownload.length > 64) return error(res, 'Durasi download maksimal 64 karakter.');

  let deadline = cleanPlainString(d.deadline || '', false);
  if (deadline.length > 64) return error(res, 'Deadline maksimal 64 karakter.');
  if (!deadline && durasiPilih && durasiPilih !== 'Selamanya') {
    const days = parseInt(durasiPilih);
    if (!isNaN(days) && days > 0) {
      const dlDate = new Date();
      dlDate.setDate(dlDate.getDate() + days);
      deadline = dlDate.toISOString();
    }
  }

  const newProject = {
    id: projectId,
    ID: projectId,
    Token: token,
    Slug: shortSlug,
    'Short Slug': shortSlug,
    'Nama Client': clientName,
    'Nomor WA': nomorWA,
    'Password Client': passwordClient,
    'Max Foto': String(maxFotoNum),
    'Drive Link': driveLink,
    Owner: username,
    'Short Link': shortLink,
    Kategori: JSON.stringify(sanitizedCategories),
    UseWatermark: String(Boolean(d.useWatermark)).toUpperCase(),
    UseWatermarkTiled: String(Boolean(d.useWatermarkTiled)).toUpperCase(),
    ClientLayout: clientLayout,
    ExtraPrice: String(extraPriceNum),
    MusicUrl: musicUrl,
    MusicURL: musicUrl,
    AksesPilih: String(d.aksesPilih !== false).toUpperCase(),
    AksesDownload: String(d.aksesDownload !== false).toUpperCase(),
    'Akses_Pilih': String(d.aksesPilih !== false).toUpperCase(),
    'Akses_Download': String(d.aksesDownload !== false).toUpperCase(),
    DurasiPilih: durasiPilih || 'Selamanya',
    DurasiDownload: durasiDownload || 'Selamanya',
    'Durasi_Pilih': durasiPilih || 'Selamanya',
    'Durasi_Download': durasiDownload || 'Selamanya',
    Deadline: deadline,
    Status: 'Belum Memilih',
    'Status Client': 'Belum Memilih',
    'Foto Terpilih': '0',
    'Daftar Pilihan': '[]',
    Notes: '{}',
    'Dibuat Pada': new Date().toISOString()
  };

  await supabaseQuery('projects', { method: 'POST', body: newProject });

  try {
    const curCount = Number((effectiveUser && effectiveUser.ProjectCreated) || 0);
    const nextCount = Math.max(curCount + 1, 1);
    await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}`, {
      method: 'PATCH',
      body: { ProjectCreated: String(nextCount) }
    });
  } catch (patchErr) {
    console.error('Failed to update ProjectCreated lifetime counter:', patchErr);
  }

  return success(res, {
    success: true,
    token: token,
    shortSlug: shortSlug,
    url: shortLink
  }, 'Project berhasil dibuat');
}

// ============================================================
// PHASE 4.4 — CLIENT GALLERY SECURITY & SESSION HELPERS
// ============================================================
const CLIENT_GALLERY_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getStableProjectId(project) {
  if (!project) return '';
  const dbId = String((project && project.id) || '').trim();
  if (dbId) return dbId;
  return String((project && project.Token) || '').trim();
}

async function findProjectForClient(tokenOrSlug) {
  if (!tokenOrSlug || typeof tokenOrSlug !== 'string') return null;
  const clean = tokenOrSlug.trim();
  if (!clean) return null;
  try {
    const projects = await supabaseQuery(`projects?or=(Token.eq.${encodeURIComponent(clean)},Slug.eq.${encodeURIComponent(clean)},%22Short%20Slug%22.eq.${encodeURIComponent(clean)})&select=*`);
    if (projects && Array.isArray(projects) && projects.length > 0) {
      return projects[0];
    }
  } catch (err) {
    console.error('findProjectForClient error:', err);
  }
  return null;
}

async function issueClientGallerySession(project) {
  const stableId = getStableProjectId(project);
  if (!stableId) return null;
  const token = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  await supabaseQuery('sessions', {
    method: 'POST',
    body: {
      SessionID: token,
      Username: `__CLIENT_GALLERY__:${stableId}`,
      Role: 'ClientGallery',
      CreatedAt: nowIso
    }
  });
  return token;
}

const _clientSessionCache = new Map();

async function verifyClientGallerySession(clientAccessToken, project) {
  if (!clientAccessToken || typeof clientAccessToken !== 'string') return null;
  const token = clientAccessToken.trim();
  if (!token) return null;

  const stableId = getStableProjectId(project);
  if (!stableId) return null;

  const cacheKey = `${token}:${stableId}`;
  const now = Date.now();
  const cached = _clientSessionCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.session;
  }

  let sessionRows = null;
  try {
    sessionRows = await supabaseQuery(`sessions?SessionID=eq.${encodeURIComponent(token)}&select=*&limit=1`);
  } catch (err) {
    console.error('Client gallery session query error:', err);
    return null;
  }

  if (!sessionRows || !Array.isArray(sessionRows) || sessionRows.length === 0) {
    return null;
  }

  const s = sessionRows[0];
  const role = (s.Role || '').trim();
  const username = (s.Username || '').trim();

  // Reject normal photographer/admin account sessions
  if (role !== 'ClientGallery') {
    return null;
  }

  // Ensure session is bound to this exact project using the same stable ID rule
  const expectedUsername = `__CLIENT_GALLERY__:${stableId}`;
  if (username !== expectedUsername) {
    return null;
  }

  // Check expiration (24h TTL)
  if (!s.CreatedAt) {
    return null;
  }

  const createdTime = new Date(s.CreatedAt).getTime();
  if (isNaN(createdTime)) {
    return null;
  }

  if (Date.now() - createdTime > CLIENT_GALLERY_SESSION_TTL_MS) {
    // Expired session - best effort deletion
    try {
      await supabaseQuery(`sessions?SessionID=eq.${encodeURIComponent(token)}`, {
        method: 'DELETE'
      });
    } catch (delErr) { }
    _clientSessionCache.delete(cacheKey);
    return null;
  }

  _clientSessionCache.set(cacheKey, {
    session: s,
    expiresAt: Math.min(now + 60000, createdTime + CLIENT_GALLERY_SESSION_TTL_MS)
  });
  return s;
}

function buildAuthorizedProjectData(p, ownerBrand, clientAccessToken) {
  let dp = p['Daftar Pilihan'] || p.DaftarPilihan || p.daftar_pilihan || [];
  if (typeof dp === 'string') {
    try { dp = JSON.parse(dp); } catch (e) { dp = dp.split(',').map(s => s.trim()).filter(Boolean); }
  }

  let nt = p.Notes || p.notes || {};
  if (typeof nt === 'string') {
    try { nt = JSON.parse(nt); } catch (e) { }
  }

  let kat = p.Kategori || p.kategori || p.categories || [];
  if (typeof kat === 'string') {
    try { kat = JSON.parse(kat); } catch (e) { }
  }

  const pass = p['Password Client'] || '';
  const hasPassword = Boolean(pass && pass.trim() !== '');

  return {
    token: p.Token,
    slug: p['Short Slug'] || p.Slug || p.Token,
    namaClient: p['Nama Client'] || '',
    name: p['Nama Client'] || '',
    nomorWA: p['Nomor WA'] || '',
    hasPassword: hasPassword,
    needsPassword: false,
    accessGranted: true,
    clientAccessToken: clientAccessToken || '',
    maxFoto: parseProjectMaxFoto(p['Max Foto'], p.MaxFoto),
    driveLink: p['Drive Link'] || '',
    kategori: kat,
    categories: kat,
    useWatermark: String(p.UseWatermark).toUpperCase() === 'TRUE',
    useWatermarkTiled: String(p.UseWatermarkTiled).toUpperCase() === 'TRUE',
    watermarkEnabled: String(p.UseWatermark).toUpperCase() === 'TRUE',
    clientLayout: p.ClientLayout || 'masonry',
    extraPrice: Number(p.ExtraPrice) || 0,
    musicUrl: p.MusicUrl || p.MusicURL || '',
    aksesPilih: String(p.AksesPilih || p.Akses_Pilih).toUpperCase() !== 'FALSE',
    aksesDownload: String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE',
    isPilihActive: String(p.AksesPilih || p.Akses_Pilih).toUpperCase() !== 'FALSE',
    isDownloadActive: String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE',
    durasiPilih: p.DurasiPilih || p.Durasi_Pilih || 'Selamanya',
    durasiDownload: p.DurasiDownload || p.Durasi_Download || 'Selamanya',
    deadline: p.Deadline || '',
    statusClient: p.Status || p['Status Client'] || 'Belum Memilih',
    fotoTerpilih: Number(p['Foto Terpilih']) || 0,
    daftarPilihan: dp,
    selectedFiles: dp,
    'Daftar Pilihan': dp,
    notes: nt,
    paymentProof: p.PaymentProof || p['Payment Proof'] || '',
    backupDrive: p['Backup Drive'] || p.BackupDrive || '',
    backupUrl: p['Backup Drive'] || p.BackupDrive || '',
    brandName: ownerBrand.brandName,
    brandLogo: ownerBrand.brandLogo,
    watermarkUrl: ownerBrand.watermarkUrl,
    bankName: ownerBrand.bankName,
    bankAccount: ownerBrand.bankAccount,
    bankAccountName: ownerBrand.bankAccountName,
    isPremiumAddon: ownerBrand.isPremiumAddon,
    theme: p.Theme || p.theme || ownerBrand.theme || ownerBrand.Theme || 'noir',
    studioTheme: p.Theme || p.theme || ownerBrand.theme || ownerBrand.Theme || 'noir',
    ownerTheme: p.Theme || p.theme || ownerBrand.theme || ownerBrand.Theme || 'noir'
  };
}

async function handleGetProjectForClient(payload, res) {
  const tokenOrSlug = (payload.token || '').trim();
  if (!tokenOrSlug) return error(res, 'Token or slug is required', 400);

  const p = await findProjectForClient(tokenOrSlug);
  if (!p) return error(res, 'Project tidak ditemukan.', 404);

  const ownerName = p.Owner;
  let ownerBrand = {
    brandName: 'Photo Selection',
    brandLogo: '',
    watermarkUrl: '',
    bankName: '',
    bankAccount: '',
    bankAccountName: '',
    theme: '',
    isPremiumAddon: false
  };

  if (ownerName) {
    try {
      const owners = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(ownerName)}&select=*`);
      if (owners && owners.length > 0) {
        const o = owners[0];
        const ownerPro = await getUserProEntitlement(ownerName);
        ownerBrand = {
          brandName: o.BrandName || 'Photo Selection',
          brandLogo: o.BrandLogo || '',
          watermarkUrl: o.WatermarkUrl || '',
          bankName: o.BankName || '',
          bankAccount: o.BankAccount || '',
          bankAccountName: o.BankAccountName || '',
          theme: o.Theme || o.theme || '',
          isPremiumAddon: ownerPro.isPro
        };
      }
    } catch (e) { }
  }

  const pass = (p['Password Client'] || '').trim();
  const hasPassword = Boolean(pass !== '');
  const clientAccessToken = (payload.clientAccessToken || payload.tokenClient || '').trim();

  // PASSWORDLESS FLOW
  if (!hasPassword) {
    let activeToken = clientAccessToken;
    let validSession = await verifyClientGallerySession(activeToken, p);
    if (!validSession) {
      activeToken = await issueClientGallerySession(p);
    }
    const fullData = buildAuthorizedProjectData(p, ownerBrand, activeToken);
    return success(res, {
      success: true,
      accessGranted: true,
      clientAccessToken: activeToken,
      project: fullData,
      ...fullData
    });
  }

  // PASSWORD-PROTECTED FLOW (VALID SESSION RELOAD)
  if (clientAccessToken) {
    const validSession = await verifyClientGallerySession(clientAccessToken, p);
    if (validSession) {
      const fullData = buildAuthorizedProjectData(p, ownerBrand, clientAccessToken);
      return success(res, {
        success: true,
        accessGranted: true,
        clientAccessToken: clientAccessToken,
        project: fullData,
        ...fullData
      });
    }
  }

  // SAFE PUBLIC / PRE-AUTH RESPONSE
  const resolvedPublicTheme = p.Theme || p.theme || ownerBrand.theme || 'noir';
  const publicData = {
    token: p.Token,
    slug: p['Short Slug'] || p.Slug || p.Token,
    namaClient: p['Nama Client'] || '',
    name: p['Nama Client'] || '',
    hasPassword: true,
    needsPassword: true,
    accessGranted: false,
    brandName: ownerBrand.brandName,
    brandLogo: ownerBrand.brandLogo,
    theme: resolvedPublicTheme,
    studioTheme: resolvedPublicTheme,
    ownerTheme: resolvedPublicTheme
  };

  return success(res, {
    success: true,
    accessGranted: false,
    project: publicData,
    ...publicData
  });
}

async function handleVerifyClientPassword(payload, res) {
  const token = (payload.token || '').trim();
  const password = (payload.passwordInput || payload.password || '').trim();

  const p = await findProjectForClient(token);
  if (!p) return error(res, 'Project tidak ditemukan', 404);

  const storedPass = (p['Password Client'] || '').trim();
  const isValid = (!storedPass || storedPass === password);

  if (!isValid) {
    return success(res, { success: false, valid: false, accessGranted: false, message: 'Password galeri salah.' });
  }

  const clientAccessToken = await issueClientGallerySession(p);

  const ownerName = p.Owner;
  let ownerBrand = {
    brandName: 'Photo Selection',
    brandLogo: '',
    watermarkUrl: '',
    bankName: '',
    bankAccount: '',
    bankAccountName: '',
    theme: '',
    isPremiumAddon: false
  };

  if (ownerName) {
    try {
      const owners = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(ownerName)}&select=*`);
      if (owners && owners.length > 0) {
        const o = owners[0];
        const ownerPro = await getUserProEntitlement(ownerName);
        ownerBrand = {
          brandName: o.BrandName || 'Photo Selection',
          brandLogo: o.BrandLogo || '',
          watermarkUrl: o.WatermarkUrl || '',
          bankName: o.BankName || '',
          bankAccount: o.BankAccount || '',
          bankAccountName: o.BankAccountName || '',
          theme: o.Theme || o.theme || '',
          isPremiumAddon: ownerPro.isPro
        };
      }
    } catch (e) { }
  }

  const fullData = buildAuthorizedProjectData(p, ownerBrand, clientAccessToken);

  return success(res, {
    success: true,
    valid: true,
    accessGranted: true,
    clientAccessToken: clientAccessToken,
    project: fullData,
    ...fullData
  });
}

async function handleUpdateClientPassword(payload, res) {
  const idOrToken = (payload.id || payload.token || payload.projectId || '').trim();
  const project = await requireProjectAccess(payload.authUser, idOrToken, res);
  if (!project) return;

  const newPassword = (payload.newPassword || '').trim();
  const filter = getProjectMutationFilter(project);
  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: { 'Password Client': newPassword }
  });
  return success(res, { success: true, message: 'Password berhasil diubah' });
}

async function handleUpdateClientStatus(payload, res) {
  const token = (payload.token || '').trim();
  if (!token) return error(res, 'Token required', 400);

  const clientAccessToken = (payload.clientAccessToken || payload.tokenClient || '').trim();
  if (!clientAccessToken) {
    return error(res, 'Unauthorized: Client access token required', 401);
  }

  const project = await findProjectForClient(token);
  if (!project) {
    return error(res, 'Project tidak ditemukan', 404);
  }

  const validSession = await verifyClientGallerySession(clientAccessToken, project);
  if (!validSession) {
    return error(res, 'Unauthorized: Invalid or expired client access token', 403);
  }

  const updateBody = {};
  const curStatus = project.Status || project['Status Client'] || 'Belum Memilih';
  let currentStatus = curStatus;
  const currentMax = parseProjectMaxFoto(project['Max Foto'], project.MaxFoto);
  const extraPrice = Number(project.ExtraPrice) || Number(project['Extra Price']) || Number(project.extra_price) || 0;
  const isUnlimited = currentMax >= 99999;
  const isDownloadActive = String(project.AksesDownload || project.Akses_Download).toUpperCase() !== 'FALSE';

  const ALLOWED_CLIENT_STATUSES = new Set([
    'Belum Memilih',
    'Sedang Memilih',
    'Dalam Proses',
    'Selesai',
    'Menunggu Konfirmasi Pembayaran'
  ]);
  let incomingStatus = undefined;
  if (payload.status !== undefined) {
    if (typeof payload.status !== 'string' || !ALLOWED_CLIENT_STATUSES.has(payload.status.trim())) {
      return error(res, 'Status client tidak valid.', 400);
    }
    incomingStatus = payload.status.trim();
  }

  let countNum = null;
  if (payload.selectedCount !== undefined || payload.fotoTerpilih !== undefined) {
    const rawCount = payload.selectedCount !== undefined ? payload.selectedCount : payload.fotoTerpilih;
    countNum = Number(rawCount);
    if (!Number.isInteger(countNum) || countNum < 0 || countNum > 10000) {
      return error(res, 'Jumlah foto terpilih tidak valid (harus bilangan bulat 0 - 10000).', 400);
    }
  }

  // Parse authoritative persisted files from project record
  let persistedFiles = [];
  const rawPersistedDp = project['Daftar Pilihan'] || project.DaftarPilihan;
  if (rawPersistedDp) {
    if (Array.isArray(rawPersistedDp)) {
      persistedFiles = rawPersistedDp;
    } else if (typeof rawPersistedDp === 'string') {
      try {
        const parsed = JSON.parse(rawPersistedDp);
        if (Array.isArray(parsed)) persistedFiles = parsed;
      } catch (_) { }
    }
  }

  let cleanFiles = null;
  if (payload.selectedFiles !== undefined || payload.daftarPilihan !== undefined) {
    let files = payload.selectedFiles !== undefined ? payload.selectedFiles : payload.daftarPilihan;
    if (typeof files === 'string') {
      try { files = JSON.parse(files); } catch (_) { return error(res, 'Format daftar pilihan tidak valid.', 400); }
    }
    if (!Array.isArray(files)) return error(res, 'Daftar pilihan harus berupa array.', 400);
    if (files.length > 10000) return error(res, 'Daftar pilihan melebihi batas maksimal 10.000 foto.', 400);

    cleanFiles = [];
    const seenFiles = new Set();
    for (const f of files) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        return error(res, 'Item daftar pilihan tidak valid.', 400);
      }
      const rawName = f.name !== undefined && f.name !== null ? f.name : (f.n !== undefined && f.n !== null ? f.n : (f.filename || f.fileName || ''));
      const rawFolder = f.folder !== undefined && f.folder !== null ? f.folder : (f.f !== undefined && f.f !== null ? f.f : '');
      const rawRef = (f.id !== undefined && f.id !== null && String(f.id).trim() !== '')
        ? f.id
        : (f.u !== undefined && f.u !== null && !String(f.u).startsWith('blob:') && !String(f.u).startsWith('data:')
          ? f.u
          : (f.url !== undefined && f.url !== null && !String(f.url).startsWith('blob:') && !String(f.url).startsWith('data:') ? f.url : (f.id || '')));
      const rawCat = f.category !== undefined && f.category !== null ? f.category : (f.c !== undefined && f.c !== null ? f.c : (f.kategori !== undefined && f.kategori !== null ? f.kategori : ''));

      const name = cleanPlainString(String(rawName), false);
      const folder = cleanPlainString(String(rawFolder), false);
      const category = cleanPlainString(String(rawCat), false);

      if (!name) {
        return error(res, 'Nama file dalam daftar pilihan tidak boleh kosong.', 400);
      }
      if (name.length > 500) return error(res, 'Nama file dalam daftar pilihan maksimal 500 karakter.', 400);
      if (folder.length > 500) return error(res, 'Nama folder dalam daftar pilihan maksimal 500 karakter.', 400);
      if (category.length > 500) return error(res, 'Nama kategori dalam daftar pilihan maksimal 500 karakter.', 400);

      const fileKey = `${folder.toLowerCase()}::${name.toLowerCase()}`;
      if (seenFiles.has(fileKey)) {
        return error(res, 'Daftar pilihan mengandung foto duplikat.', 400);
      }
      seenFiles.add(fileKey);

      let cleanRef = '';
      if (rawRef !== undefined && rawRef !== null && String(rawRef).trim() !== '') {
        const refStr = String(rawRef).trim();
        if (refStr.length > 2048) return error(res, 'URL atau ID file foto maksimal 2048 karakter.', 400);
        if (/[\u0000-\u001F\u007F]/.test(refStr)) {
          return error(res, 'URL atau ID file foto mengandung karakter kontrol tidak valid.', 400);
        }
        const fileIdMatch = refStr.match(/[?&]fileId=([a-zA-Z0-9_-]{10,128})/);
        const ucIdMatch = refStr.match(/[?&]id=([a-zA-Z0-9_-]{10,128})/);
        const lh3Match = refStr.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,128})/);
        if (/^[a-zA-Z0-9_-]{10,128}$/.test(refStr)) {
          cleanRef = refStr;
        } else if (fileIdMatch) {
          cleanRef = fileIdMatch[1];
        } else if (ucIdMatch) {
          cleanRef = ucIdMatch[1];
        } else if (lh3Match) {
          cleanRef = lh3Match[1];
        } else if (isSafeHttpsUrl(refStr)) {
          cleanRef = refStr;
        } else {
          return error(res, 'URL file foto tidak aman atau tidak valid (harus berupa HTTPS atau ID Google Drive yang valid).', 400);
        }
      }

      cleanFiles.push({
        n: name,
        f: folder,
        u: cleanRef,
        c: category
      });
    }
  }

  // Cross-validation when selectedFiles is provided in request
  if (countNum !== null && cleanFiles !== null) {
    if (countNum !== cleanFiles.length) {
      return error(res, 'Jumlah foto terpilih tidak sesuai dengan daftar berkas pilihan.', 400);
    }
  }

  const isFinalizing = (incomingStatus === 'Selesai' || incomingStatus === 'Menunggu Konfirmasi Pembayaran');

  // CASE A & C: When finalizing without selectedFiles, validate against authoritative persisted files
  if (isFinalizing && cleanFiles === null) {
    if (countNum !== null && countNum !== persistedFiles.length) {
      return error(res, `Jumlah foto terpilih (${countNum}) tidak sesuai dengan daftar berkas pilihan yang tersimpan (${persistedFiles.length}).`, 400);
    }
    if (incomingStatus === 'Menunggu Konfirmasi Pembayaran' && persistedFiles.length === 0) {
      return error(res, 'Tidak ada foto pilihan yang tersimpan untuk konfirmasi pembayaran.', 400);
    }
  }

  // Authoritative effective count: cleanFiles length > persistedFiles length > saved project count
  const effectiveCount = cleanFiles !== null
    ? cleanFiles.length
    : (persistedFiles.length > 0 ? persistedFiles.length : (countNum !== null ? countNum : (Number(project['Foto Terpilih']) || 0)));

  // CASE B / ISSUE 2: Quota validation for projects with Upsell disabled
  if (!isUnlimited && extraPrice <= 0 && effectiveCount > currentMax) {
    return error(res, `Jumlah foto terpilih (${effectiveCount}) melebihi kuota project (${currentMax}).`, 400);
  }

  // CASE A / ISSUE 1: Prevent payment status bypass when extra paid photos are selected
  if (!isUnlimited && extraPrice > 0 && effectiveCount > currentMax) {
    if (incomingStatus === 'Selesai') {
      return error(res, 'Project memiliki foto ekstra berbayar dan memerlukan konfirmasi pembayaran fotografer. Status harus Menunggu Konfirmasi Pembayaran.', 403);
    }
  }

  // Client cannot set Menunggu Konfirmasi Pembayaran if no extra photos were selected
  if (!isUnlimited && extraPrice > 0 && effectiveCount <= currentMax && incomingStatus === 'Menunggu Konfirmasi Pembayaran') {
    return error(res, 'Status Menunggu Konfirmasi Pembayaran hanya berlaku jika jumlah foto melebihi kuota gratis.', 400);
  }

  const isAlreadyDone = (curStatus === 'Selesai' || curStatus === 'Menunggu Konfirmasi Pembayaran');
  const isIncomingDraft = (incomingStatus === 'Sedang Memilih' || incomingStatus === 'Dalam Proses' || incomingStatus === 'Belum Memilih');

  if (isAlreadyDone) {
    if (incomingStatus && incomingStatus !== curStatus) {
      if (curStatus === 'Menunggu Konfirmasi Pembayaran' && incomingStatus === 'Selesai') {
        return error(res, 'Status Selesai hanya dapat dikonfirmasi oleh fotografer setelah verifikasi pembayaran.', 403);
      }
      if (curStatus === 'Selesai') {
        return error(res, 'Project sudah selesai dan status tidak dapat diubah.', 400);
      }
    }
    // Sesi sudah final/menunggu pembayaran, abaikan pembaruan status atau daftar foto dari client background sync
    currentStatus = curStatus;
  } else {
    if (incomingStatus) {
      updateBody.Status = incomingStatus;
      updateBody['Status Client'] = incomingStatus;
      currentStatus = incomingStatus;
    }
    if (cleanFiles !== null) {
      updateBody['Foto Terpilih'] = String(cleanFiles.length);
      updateBody['Daftar Pilihan'] = JSON.stringify(cleanFiles);
    } else if (countNum !== null && (persistedFiles.length === 0 || countNum === persistedFiles.length)) {
      // In count-only background pings, never corrupt or overwrite authoritative selection data
      updateBody['Foto Terpilih'] = String(persistedFiles.length > 0 ? persistedFiles.length : countNum);
    }
  }

  if (payload.notes !== undefined) {
    let rawNotes = payload.notes;
    if (typeof rawNotes === 'string') {
      try { rawNotes = JSON.parse(rawNotes); } catch (_) { return error(res, 'Format catatan tidak valid.', 400); }
    }
    if (!rawNotes || typeof rawNotes !== 'object' || Array.isArray(rawNotes) || rawNotes instanceof Date) {
      return error(res, 'Format catatan tidak valid.', 400);
    }
    const cleanNotes = Object.create(null);
    const keys = Object.keys(rawNotes);
    if (keys.length > 10000) return error(res, 'Jumlah catatan melebihi batas maksimal.', 400);
    for (const k of keys) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const rawKey = String(k);
      const rawVal = rawNotes[k] !== undefined && rawNotes[k] !== null ? String(rawNotes[k]) : '';
      const safeKey = cleanPlainString(rawKey, false);
      const safeVal = cleanPlainString(rawVal, true);
      if (safeKey.length > 500) return error(res, 'Kunci catatan maksimal 500 karakter.', 400);
      if (safeVal.length > 2000) return error(res, 'Isi catatan maksimal 2000 karakter.', 400);
      cleanNotes[safeKey] = safeVal;
    }
    const serializedNotes = JSON.stringify(cleanNotes);
    if (serializedNotes.length > 2 * 1024 * 1024) return error(res, 'Ukuran catatan melebihi batas maksimal 2 MB.', 400);
    updateBody.Notes = serializedNotes;
  }

  if (payload.paymentProof) {
    const proof = String(payload.paymentProof).trim();
    if (!isSafeImageReference(proof, 2 * 1024 * 1024)) {
      return error(res, 'Format bukti pembayaran tidak valid.');
    }
    updateBody.PaymentProof = proof;
    updateBody['Payment Proof'] = proof;
  }

  const nowIso = new Date().toISOString();
  updateBody['Last Update'] = nowIso;

  const filter = getProjectMutationFilter(project);
  const patchResult = await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: updateBody
  });

  // Verify PATCH affected exactly the expected authorized project row
  if (!Array.isArray(patchResult) || patchResult.length === 0) {
    return error(res, 'Gagal memperbarui status: Proyek tidak ditemukan atau akses tidak diizinkan.', 404);
  }

  if (patchResult.length > 1) {
    console.error(`[SECURITY ALERT] Multiple projects (${patchResult.length}) matched mutation filter ${filter}`);
    return error(res, 'Kesalahan integritas server: Operasi pembaruan dibatalkan.', 500);
  }

  const updatedProject = patchResult[0];

  // Verify canonical project ID / token match
  const expectedId = String(project.id || '').trim();
  const updatedId = String(updatedProject.id || '').trim();
  if (expectedId && updatedId && expectedId !== updatedId) {
    return error(res, 'Kesalahan integritas: ID proyek tidak cocok.', 500);
  }
  const expectedToken = String(project.Token || '').trim();
  const updatedToken = String(updatedProject.Token || '').trim();
  if (expectedToken && updatedToken && expectedToken !== updatedToken) {
    return error(res, 'Kesalahan integritas: Token proyek tidak cocok.', 500);
  }

  // Authoritative readback values from persisted row
  const persistedCount = Number(updatedProject['Foto Terpilih']) || 0;
  let persistedDaftar = updatedProject['Daftar Pilihan'] || '[]';
  if (typeof persistedDaftar !== 'string') {
    try { persistedDaftar = JSON.stringify(persistedDaftar); } catch (_) { persistedDaftar = '[]'; }
  }

  return success(res, {
    success: true,
    status: currentStatus,
    maxFoto: currentMax,
    isDownloadActive: isDownloadActive,
    fotoTerpilih: persistedCount,
    daftarPilihan: persistedDaftar,
    lastUpdate: updatedProject['Last Update'] || nowIso
  });
}

async function handleReleaseClientSession(payload, res) {
  const token = (payload.token || '').trim();
  const clientAccessToken = (payload.clientAccessToken || payload.tokenClient || '').trim();

  if (!token || !clientAccessToken) {
    return error(res, 'Unauthorized: Token and client access token required', 401);
  }

  const project = await findProjectForClient(token);
  if (!project) {
    return error(res, 'Project tidak ditemukan', 404);
  }

  const validSession = await verifyClientGallerySession(clientAccessToken, project);
  if (!validSession) {
    return error(res, 'Unauthorized: Invalid or expired client access token', 403);
  }

  return success(res, { success: true });
}

async function handleUpdateDeadline(payload, res) {
  const idOrToken = (payload.id || payload.token || payload.projectId || '').trim();
  const project = await requireProjectAccess(payload.authUser, idOrToken, res);
  if (!project) return;

  const rawDeadline = payload.newDeadline !== undefined ? payload.newDeadline : (payload.deadline !== undefined ? payload.deadline : '');
  let cleanedDeadline = '';
  if (rawDeadline !== null && rawDeadline !== undefined && rawDeadline !== '') {
    if (typeof rawDeadline !== 'string') {
      return error(res, 'Format batas waktu tidak valid (harus berupa string tanggal).', 400);
    }
    const trimmed = rawDeadline.trim();
    if (trimmed !== '') {
      if (trimmed.length > 50) {
        return error(res, 'Nilai batas waktu melebihi batas panjang maksimum (maks 50 karakter).', 400);
      }
      if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
        return error(res, 'Batas waktu mengandung karakter kontrol tidak valid.', 400);
      }
      const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
      if (!match) {
        return error(res, 'Format batas waktu tidak didukung. Gunakan format ISO atau datetime-local yang valid.', 400);
      }

      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);

      if (year < 2000 || year > 2100) {
        return error(res, 'Tahun batas waktu di luar rentang yang diizinkan (2000-2100).', 400);
      }
      if (month < 1 || month > 12) {
        return error(res, 'Bulan batas waktu tidak valid (1-12).', 400);
      }

      const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      const daysInMonth = [0, 31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (day < 1 || day > daysInMonth[month]) {
        return error(res, `Tanggal ${day} tidak valid untuk bulan ${month} tahun ${year}.`, 400);
      }

      if (match[4] !== undefined && match[5] !== undefined) {
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);
        if (hour < 0 || hour > 23) {
          return error(res, 'Jam batas waktu tidak valid (0-23).', 400);
        }
        if (minute < 0 || minute > 59) {
          return error(res, 'Menit batas waktu tidak valid (0-59).', 400);
        }
        if (match[6] !== undefined) {
          const second = parseInt(match[6], 10);
          if (second < 0 || second > 59) {
            return error(res, 'Detik batas waktu tidak valid (0-59).', 400);
          }
        }
      }

      if (match[7] && match[7].toUpperCase() !== 'Z') {
        const tzMatch = match[7].match(/^([+-])(\d{2}):?(\d{2})$/);
        if (!tzMatch) {
          return error(res, 'Format timezone offset tidak valid.', 400);
        }
        const tzHours = parseInt(tzMatch[2], 10);
        const tzMinutes = parseInt(tzMatch[3], 10);
        if (tzHours > 14 || (tzHours === 14 && tzMinutes !== 0)) {
          return error(res, 'Timezone offset di luar rentang yang diizinkan (-14:00 sampai +14:00).', 400);
        }
        if (tzMinutes < 0 || tzMinutes > 59) {
          return error(res, 'Menit timezone offset tidak valid (00-59).', 400);
        }
      }

      const parsedDate = new Date(trimmed);
      if (isNaN(parsedDate.getTime())) {
        return error(res, 'Nilai tanggal tidak valid.', 400);
      }

      cleanedDeadline = trimmed;
    }
  }

  const filter = getProjectMutationFilter(project);

  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: { Deadline: cleanedDeadline }
  });

  return success(res, { success: true, message: 'Deadline berhasil diperbarui' });
}

async function handleDeleteProject(payload, res) {
  const idOrToken = (payload.id || payload.token || payload.projectId || '').trim();
  const project = await requireProjectAccess(payload.authUser, idOrToken, res);
  if (!project) return;

  const owner = (project.Owner || (payload.authUser && payload.authUser.username) || '').trim();
  if (owner) {
    try {
      const ownerRows = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(owner)}&select=Username,ProjectCreated&limit=1`);
      if (ownerRows && ownerRows.length > 0) {
        const curCount = Number(ownerRows[0].ProjectCreated || 0);
        if (curCount < 1) {
          await supabaseQuery(`users?Username=ilike.${encodeURIComponent(owner)}`, {
            method: 'PATCH',
            body: { ProjectCreated: '1' }
          });
        }
      }
    } catch (e) {
      console.error('Error ensuring ProjectCreated on deleteProject:', e);
    }
  }

  const filter = getProjectMutationFilter(project);
  await supabaseQuery(`projects?${filter}`, { method: 'DELETE' });
  return success(res, { success: true, message: 'Project berhasil dihapus' });
}

async function handleReopenProject(payload, res) {
  const projectId = (payload.projectId || payload.id || payload.token || '').trim();
  const project = await requireProjectAccess(payload.authUser, projectId, res);
  if (!project) return;

  const updateBody = { Status: 'Sedang Memilih', 'Status Client': 'Sedang Memilih' };
  if (payload.newMax !== undefined && payload.newMax !== null && String(payload.newMax).trim() !== '') {
    const validMax = validatePhotoQuota(payload.newMax, MAX_PHOTO_QUOTA);
    if (validMax === null) {
      return error(res, `Batas maksimal foto harus berupa bilangan bulat (0 - ${MAX_PHOTO_QUOTA}).`, 400);
    }
    updateBody['Max Foto'] = String(validMax);
  }

  const filter = getProjectMutationFilter(project);
  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true, message: 'Project berhasil dibuka kembali' });
}

async function handleToggleProjectWatermark(payload, res) {
  const idOrToken = (payload.id || payload.token || payload.projectId || '').trim();
  const project = await requireProjectAccess(payload.authUser, idOrToken, res);
  if (!project) return;

  const currentVal = String(project.UseWatermark).toUpperCase() === 'TRUE';
  const newVal = !currentVal;

  if (newVal === true) {
    const userPro = await getUserProEntitlement(payload.authUser.username);
    if (!userPro.isPro) {
      return error(res, 'Fitur Watermark membutuhkan Add-On PRO yang aktif. Silakan aktifkan Add-On PRO.', 403);
    }
  }

  const filter = getProjectMutationFilter(project);

  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: { UseWatermark: String(newVal).toUpperCase() }
  });

  return success(res, { success: true, newValue: newVal, message: 'Watermark berhasil diubah' });
}

async function handleUpdateProjectMusic(payload, res) {
  const authUser = payload.authUser || {};
  const projectId = (payload.projectId || payload.id || '').trim();
  const musicUrl = (payload.musicUrl !== undefined ? payload.musicUrl : (payload.music || '')).trim();

  if (!projectId) return error(res, 'Project ID wajib diisi.', 400);

  const project = await requireProjectAccess(authUser, projectId, res);
  if (!project) return;

  if (musicUrl && !isSafeAudioReference(musicUrl)) {
    return error(res, 'Format musik tidak valid. Gunakan URL HTTPS atau file audio MP3/WAV (maks 2.5 MB).', 400);
  }

  if (musicUrl) {
    const userPro = await getUserProEntitlement(authUser.username);
    if (!userPro.isPro) {
      return error(res, 'Fitur Musik Galeri membutuhkan Add-On PRO yang aktif.', 403);
    }
  }

  const filter = getProjectMutationFilter(project);
  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: { MusicUrl: musicUrl, MusicURL: musicUrl }
  });

  return success(res, { success: true, musicUrl: musicUrl }, 'Musik galeri berhasil diperbarui.');
}

const audioUploadSessions = new Map();

async function uploadToSupabaseStorage(bucket, path, buffer, contentType) {
  const activeUrl = getActiveSupabaseUrl();
  const activeKey = getActiveSupabaseKey();
  try {
    await fetch(`${activeUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'apikey': activeKey,
        'Authorization': `Bearer ${activeKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: bucket, name: bucket, public: true })
    });
  } catch (_) {}

  const uploadRes = await fetch(`${activeUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': activeKey,
      'Authorization': `Bearer ${activeKey}`,
      'Content-Type': contentType || 'audio/mpeg',
      'x-upsert': 'true'
    },
    body: buffer
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error('Supabase storage upload error:', errText);
    return null;
  }

  return `${activeUrl}/storage/v1/object/public/${bucket}/${path}`;
}

async function handleUploadAudioChunk(payload, req, res) {
  const authUser = payload.authUser || {};
  const projectId = String(payload.projectId || payload.id || '').trim();
  const uploadId = String(payload.uploadId || '').trim();
  const chunkIndex = parseInt(payload.chunkIndex, 10);
  const totalChunks = parseInt(payload.totalChunks, 10);
  const chunkData = String(payload.chunkData || '').trim();
  const mimeType = String(payload.mimeType || 'audio/mpeg').trim();

  if (!projectId || !uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !chunkData) {
    return error(res, 'Parameter potongan audio tidak lengkap.', 400);
  }

  const project = await requireProjectAccess(authUser, projectId, res);
  if (!project) return;

  const userPro = await getUserProEntitlement(authUser.username);
  if (!userPro.isPro) {
    return error(res, 'Fitur Musik Galeri membutuhkan Add-On PRO yang aktif.', 403);
  }

  let session = audioUploadSessions.get(uploadId);
  if (!session) {
    session = {
      projectId,
      totalChunks,
      mimeType,
      chunks: new Map(),
      timer: setTimeout(() => audioUploadSessions.delete(uploadId), 15 * 60 * 1000)
    };
    audioUploadSessions.set(uploadId, session);
  }

  try {
    const chunkBuf = Buffer.from(chunkData, 'base64');
    session.chunks.set(chunkIndex, chunkBuf);
  } catch (e) {
    return error(res, 'Gagal mendecode potongan audio.', 400);
  }

  if (session.chunks.size < totalChunks) {
    return success(res, { success: true, chunkReceived: chunkIndex, remaining: totalChunks - session.chunks.size });
  }

  clearTimeout(session.timer);
  audioUploadSessions.delete(uploadId);

  const chunkBuffers = [];
  for (let i = 0; i < totalChunks; i++) {
    const buf = session.chunks.get(i);
    if (!buf) {
      return error(res, `Potongan audio index ${i} hilang. Harap coba unggah ulang.`, 400);
    }
    chunkBuffers.push(buf);
  }
  const fullAudioBuffer = Buffer.concat(chunkBuffers);

  let publicUrl = null;
  try {
    publicUrl = await uploadToSupabaseStorage('project-audio', `${projectId}.mp3`, fullAudioBuffer, mimeType);
  } catch (err) {
    console.error('Storage upload error:', err.message);
  }

  const finalAudioUrl = publicUrl || `${APP_URL}/api/bridge?action=getProjectAudio&projectId=${encodeURIComponent(projectId)}`;

  const filter = getProjectMutationFilter(project);
  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: { MusicUrl: finalAudioUrl, MusicURL: finalAudioUrl }
  });

  return success(res, { success: true, audioUrl: finalAudioUrl }, 'File musik berhasil diunggah dan disimpan.');
}

async function handleGetProjectAudio(payload, req, res) {
  const projectId = String(payload.projectId || payload.id || (req && req.query && req.query.projectId) || '').trim();
  if (!projectId) return error(res, 'Project ID wajib disertakan.', 400);

  const storageUrl = `${getActiveSupabaseUrl()}/storage/v1/object/public/project-audio/${projectId}.mp3`;
  res.writeHead(302, { 'Location': storageUrl });
  return res.end();
}

async function handleToggleProjectDownload(payload, res) {
  const idOrToken = (payload.id || payload.token || payload.projectId || '').trim();
  const project = await requireProjectAccess(payload.authUser, idOrToken, res);
  if (!project) return;

  const currentVal = String(project.AksesDownload || project.Akses_Download).toUpperCase() !== 'FALSE';
  const newVal = !currentVal;
  const filter = getProjectMutationFilter(project);

  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: {
      AksesDownload: String(newVal).toUpperCase(),
      'Akses_Download': String(newVal).toUpperCase()
    }
  });

  return success(res, { success: true, newValue: newVal, message: 'Akses download berhasil diubah' });
}

async function handleUpdateProjectMaxFoto(payload, res) {
  const idOrToken = (payload.id || payload.token || payload.projectId || '').trim();
  const project = await requireProjectAccess(payload.authUser, idOrToken, res);
  if (!project) return;

  const validMax = validatePhotoQuota(payload.newMax, MAX_PHOTO_QUOTA);
  if (validMax === null) {
    return error(res, `Batas maksimal foto harus berupa bilangan bulat (0 - ${MAX_PHOTO_QUOTA}).`, 400);
  }

  const filter = getProjectMutationFilter(project);
  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: {
      'Max Foto': String(validMax)
    }
  });

  return success(res, { success: true, newMax: validMax, message: 'Batas maksimal foto berhasil diperbarui' });
}

async function handleProcessPayment(payload, res) {
  const projectId = (payload.projectId || payload.id || payload.token || '').trim();
  const project = await requireProjectAccess(payload.authUser, projectId, res);
  if (!project) return;

  const ALLOWED_PAYMENT_STATUSES = new Set(['Selesai', 'Sedang Memilih']);
  const rawStatus = (payload.status !== undefined && payload.status !== null ? String(payload.status) : 'Selesai').trim();
  if (!ALLOWED_PAYMENT_STATUSES.has(rawStatus)) {
    return error(res, 'Status pembayaran tidak valid. Hanya status Selesai atau Sedang Memilih yang didukung.', 400);
  }

  const filter = getProjectMutationFilter(project);

  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: { Status: rawStatus, 'Status Client': rawStatus }
  });

  return success(res, { success: true, message: 'Pembayaran berhasil diproses' });
}

async function handleGetDashboardStats(payload, res) {
  if (!requireAdmin(payload.authUser)) return error(res, 'Unauthorized', 403);
  const filterRange = payload.filterRange || 'all';
  const startDate = payload.startDate;
  const endDate = payload.endDate;

  let allUsers = [];
  let allProjects = [];
  let analyticsRows = [];

  try {
    const results = await Promise.all([
      supabaseQuery('users?select=*'),
      supabaseQuery('projects?select=*'),
      supabaseQuery('analytics?select=*&order=created_at.desc')
    ]);
    allUsers = results[0] || [];
    allProjects = results[1] || [];
    analyticsRows = results[2] || [];
  } catch (e) {
    allUsers = await supabaseQuery('users?select=*').catch(() => []);
    allProjects = await supabaseQuery('projects?select=id,created_at').catch(() => []);
    analyticsRows = await supabaseQuery('analytics?select=*').catch(() => []);
  }

  const now = new Date();
  let filterStartDate = null;
  let filterEndDate = null;

  if (filterRange === 'today') {
    filterStartDate = new Date();
    filterStartDate.setHours(0, 0, 0, 0);
  } else if (filterRange === 'week') {
    filterStartDate = new Date();
    filterStartDate.setDate(now.getDate() - 7);
    filterStartDate.setHours(0, 0, 0, 0);
  } else if (filterRange === 'month') {
    filterStartDate = new Date();
    filterStartDate.setDate(now.getDate() - 30);
    filterStartDate.setHours(0, 0, 0, 0);
  } else if (filterRange === 'custom' && startDate && endDate) {
    filterStartDate = new Date(startDate);
    filterStartDate.setHours(0, 0, 0, 0);
    filterEndDate = new Date(endDate);
    filterEndDate.setHours(23, 59, 59, 999);
  }

  const isWithinFilter = (dateStr) => {
    if (!filterStartDate && !filterEndDate) return true;
    if (!dateStr) return true;
    const d = parseSafeDate(dateStr);
    if (!d || isNaN(d.getTime())) return true;
    if (filterStartDate && d < filterStartDate) return false;
    if (filterEndDate && d > filterEndDate) return false;
    return true;
  };

  const filteredAnalytics = (analyticsRows || []).filter(r => {
    const ts = r.Timestamp || r.timestamp || r.created_at;
    return isWithinFilter(ts);
  });

  const filteredProjects = (allProjects || []).filter(p => {
    const ts = p['Dibuat Pada'] || p.created_at || p.TanggalDibuat;
    return isWithinFilter(ts);
  });

  const totalUsers = allUsers ? allUsers.length : 0;
  const activeUsers = allUsers ? allUsers.filter(u => u.Status === 'Active').length : 0;
  const pendingUsers = allUsers ? allUsers.filter(u => u.Status === 'Pending').length : 0;
  const inactiveUsers = allUsers ? allUsers.filter(u => u.Status === 'Inactive').length : 0;
  const totalProjects = filterRange === 'all' ? (allProjects ? allProjects.length : 0) : filteredProjects.length;

  const totalViews = filteredAnalytics.length;
  const uniqueVisitors = new Set(filteredAnalytics.map(r => r.VisitorID || r.visitor_id || r.VisitorId || r.id || 'anon')).size;

  let metaViews = 0;
  let googleViews = 0;
  let directViews = 0;
  let otherViews = 0;

  filteredAnalytics.forEach(r => {
    const src = (r.UtmSource || r.utm_source || '').toLowerCase();
    const fbclid = r.Fbclid || r.fbclid || '';
    if (src.includes('facebook') || src.includes('instagram') || src.includes('meta') || src.includes('fb') || fbclid) {
      metaViews++;
    } else if (src.includes('google') || src.includes('gads')) {
      googleViews++;
    } else if (!src && !fbclid) {
      directViews++;
    } else {
      otherViews++;
    }
  });

  const metaUsers = (allUsers || []).filter(u => {
    const src = (u.UtmSource || u.utm_source || '').toLowerCase();
    const fbclid = u.Fbclid || u.fbclid || '';
    return src.includes('facebook') || src.includes('instagram') || src.includes('meta') || src.includes('fb') || fbclid;
  }).length;

  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(now.getDate() + 30);

  const expiringSoon = (allUsers || []).filter(u => {
    const exp = u.ExpiredAt;
    const role = u.Role;
    if (role === 'Admin' || exp === 'Lifetime' || !exp) return false;
    const expDate = parseSafeDate(exp);
    if (!expDate) return false;
    return expDate >= now && expDate <= thirtyDaysLater;
  }).map(u => ({ username: u.Username, expiredAt: u.ExpiredAt }));

  // Hitung Data Riil Trafik 7 Hari Terakhir dari Database
  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const trafficSeries = [];

  for (let i = 6; i >= 0; i--) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - i);
    const dayKey = targetDate.toISOString().split('T')[0];
    const dayLabel = (i === 0) ? 'Hari Ini' : (i === 1 ? 'Kemarin' : `${dayNames[targetDate.getDay()]} (${targetDate.getDate()}/${targetDate.getMonth() + 1})`);

    const count = (analyticsRows || []).filter(r => {
      const ts = r.Timestamp || r.timestamp || r.created_at;
      if (!ts) return false;
      if (typeof ts === 'string' && ts.startsWith(dayKey)) return true;
      const d = parseSafeDate(ts);
      if (d && !isNaN(d.getTime())) {
        return d.getFullYear() === targetDate.getFullYear() &&
          d.getMonth() === targetDate.getMonth() &&
          d.getDate() === targetDate.getDate();
      }
      return false;
    }).length;

    trafficSeries.push({ label: dayLabel, count: count, date: dayKey });
  }

  const safeActiveUsers = Math.max(0, activeUsers - expiringSoon.length);

  return success(res, {
    success: true,
    data: {
      totalViews,
      uniqueVisitors,
      views: totalViews,
      visitors: uniqueVisitors,
      totalProjects,
      totalUsers,
      activeUsers,
      inactiveUsers,
      pendingUsers,
      expiringSoonCount: expiringSoon.length,
      expiringUsers: expiringSoon,
      trafficSeries: trafficSeries,
      statusBreakdown: {
        safeActive: safeActiveUsers,
        expiringSoon: expiringSoon.length,
        pending: pendingUsers,
        inactive: inactiveUsers
      },
      packageBreakdown: {
        demo: allUsers.filter(u => (u.Paket || '').toUpperCase().includes('DEMO')).length,
        bulan1: allUsers.filter(u => u.Paket === '1 Bulan').length,
        bulan6: allUsers.filter(u => u.Paket === '6 Bulan').length,
        tahun1: allUsers.filter(u => u.Paket === '1 Tahun').length,
        lifetime: allUsers.filter(u => u.Paket === 'Lifetime').length
      },
      trafficSources: {
        metaViews,
        googleViews,
        directViews,
        otherViews,
        metaUsers
      }
    }
  });
}

async function handleLogVisit(payload, res) {
  const type = payload.type || 'VIEW';
  const page = payload.page || 'LANDING_PAGE';
  const visitorId = payload.visitorId || 'anon';
  const nowIso = new Date().toISOString();

  await supabaseQuery('analytics', {
    method: 'POST',
    body: {
      Type: type,
      Page: page,
      VisitorID: visitorId,
      Timestamp: nowIso
    }
  }).catch(() => { });

  return success(res, { success: true, logged: true });
}

async function handleGetUsers(payload, res) {
  const authUser = payload.authUser || {};
  if (authUser.role !== 'Admin') return error(res, 'Unauthorized', 403);

  const rows = await supabaseQuery('users?select=*&order=created_at.desc');
  const now = new Date();

  const users = (rows || []).map(u => {
    let isOnline = false;
    let lastActiveRaw = u.LastActive || u.created_at || '';
    if (lastActiveRaw) {
      const lastActiveDate = new Date(lastActiveRaw);
      if (!isNaN(lastActiveDate.getTime())) {
        const diffSeconds = (now.getTime() - lastActiveDate.getTime()) / 1000;
        // Ping dikirim tiap 30 detik. Toleransi online 75 detik.
        if (diffSeconds >= 0 && diffSeconds <= 75) {
          isOnline = true;
        }
      }
    }

    return {
      username: u.Username,
      Username: u.Username,
      nama: u.Nama,
      Nama: u.Nama,
      role: u.Role,
      Role: u.Role,
      status: u.Status,
      Status: u.Status,
      brand_name: u.BrandName,
      BrandName: u.BrandName,
      brand_logo: u.BrandLogo,
      BrandLogo: u.BrandLogo,
      email: u.Email,
      Email: u.Email,
      no_hp: u['No HP'],
      'No HP': u['No HP'],
      paket: u.Paket,
      Paket: u.Paket,
      expired_at: u.ExpiredAt,
      ExpiredAt: u.ExpiredAt,
      project_created: Number(u.ProjectCreated) || 0,
      ProjectCreated: Number(u.ProjectCreated) || 0,
      akses_watermark: String(u.Akses_Watermark).toUpperCase() === 'TRUE',
      Akses_Watermark: String(u.Akses_Watermark).toUpperCase() === 'TRUE',
      last_active: lastActiveRaw,
      LastActive: lastActiveRaw,
      isOnline: isOnline,
      IsOnline: isOnline
    };
  });

  return success(res, { success: true, data: users });
}

async function handleApproveUser(payload, res) {
  if (!requireAdmin(payload.authUser)) return error(res, 'Unauthorized', 403);
  const username = (payload.username || '').trim();
  const expiredAt = payload.expiredAt || payload.expiryValue || 'Lifetime';
  const role = payload.role || 'Photographer';

  await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { Status: 'Active', ExpiredAt: expiredAt, Role: role }
  });

  // Kirim email aktivasi ke fotografer
  try {
    const users = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=*`);
    if (users && users.length > 0) {
      const u = users[0];
      if (u.Email) {
        await sendEmailViaGAS({
          to: u.Email,
          subject: `Akun Photo Selection Anda Telah Aktif!`,
          htmlBody: buildPhotographerActivatedEmail({
            nama: u.Nama || u.Username,
            username: u.Username,
            email: u.Email,
            paket: u.Paket || '1 Bulan',
            expiredAt: expiredAt
          })
        });
      }
    }
  } catch (e) { }

  return success(res, { success: true, message: 'User approved' });
}

async function handleUpdateExpiry(payload, res) {
  if (!requireAdmin(payload.authUser)) return error(res, 'Unauthorized', 403);
  const username = (payload.username || '').trim();
  const expiredAt = payload.expiredAt || payload.expiryValue;
  const paket = payload.paket || '1 Bulan';

  // Automatically promote Demo accounts to Photographer role upon active subscription assignment
  let newRole = payload.role;
  if (!newRole) {
    try {
      const uRes = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=Role`);
      if (uRes && uRes.length > 0 && uRes[0].Role === 'Demo') {
        newRole = 'Photographer';
      }
    } catch (_) {}
  }

  const patchBody = { ExpiredAt: expiredAt, Paket: paket, Status: 'Active' };
  if (newRole) patchBody.Role = newRole;

  await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: patchBody
  });

  return success(res, { success: true, message: 'Expiry updated' });
}

async function handleSendExpiryReminder(payload, res) {
  if (!requireAdmin(payload.authUser)) return error(res, 'Unauthorized', 403);
  const targetUsername = (payload.targetUsername || payload.username || '').trim();
  try {
    const users = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(targetUsername)}&select=*`);
    if (users && users.length > 0) {
      const u = users[0];
      if (u.Email) {
        await sendEmailViaGAS({
          to: u.Email,
          subject: `Pengingat Masa Aktif Akun Photo Selection - @${u.Username}`,
          htmlBody: buildExpiryReminderEmail({
            nama: u.Nama || u.Username,
            username: u.Username,
            expiredAt: u.ExpiredAt || 'Segera Berakhir'
          })
        });
      }
    }
  } catch (e) { }
  return success(res, { success: true, message: `Email pengingat berhasil dikirim ke @${targetUsername}.` });
}

async function handleDeleteUser(payload, res) {
  if (!requireAdmin(payload.authUser)) return error(res, 'Unauthorized', 403);
  const username = (payload.username || '').trim();
  await supabaseQuery(`projects?Owner=ilike.${encodeURIComponent(username)}`, { method: 'DELETE' });
  await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}`, { method: 'DELETE' });
  return success(res, { success: true, message: 'User berhasil dihapus' });
}

async function handleRequestOTP(payload, res) {
  const emailOrUser = (payload.email || payload.username || '').trim().toLowerCase();
  const explicitUsername = (payload.username || '').trim().toLowerCase();
  if (!emailOrUser) return error(res, 'Masukkan Username atau Email Anda.');
  if (emailOrUser.length > 254) return error(res, 'Email atau Username tidak terdaftar.');

  let targetUser = null;

  // 1. Try finding by exact Username first (Username is unique)
  const byUsername = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
  if (byUsername && byUsername.length === 1) {
    targetUser = byUsername[0];
  }

  // 2. If not found by Username, check by Email
  if (!targetUser) {
    const byEmail = await supabaseQuery(`users?Email=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
    if (byEmail && byEmail.length > 0) {
      if (byEmail.length === 1) {
        // Single account matching this email -> unambiguous
        targetUser = byEmail[0];
      } else {
        // Blocker 3: Shared-email accounts (e.g. adminps & kamavisual)
        // Check if explicit username was also provided to identify the target account
        if (explicitUsername && explicitUsername !== emailOrUser) {
          targetUser = byEmail.find(u => String(u.Username || '').trim().toLowerCase() === explicitUsername);
        }
        if (!targetUser) {
          // Ambiguous shared-email: DO NOT arbitrarily pick users[0]!
          return error(res, 'Email ini terhubung dengan beberapa akun. Masukkan Username Anda untuk melanjutkan reset password.', 400);
        }
      }
    }
  }

  if (!targetUser) return error(res, 'Email atau Username tidak terdaftar.');

  const uName = targetUser.Username;
  const userEmail = targetUser.Email;

  if (!userEmail) {
    return error(res, 'Akun ini tidak memiliki email yang tersimpan. Hubungi Admin.');
  }

  // Phase 4.5: OTP Resend cooldown (60 detik)
  const existingTokens = await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}&order=id.desc&limit=1`);
  if (Array.isArray(existingTokens) && existingTokens.length > 0) {
    const latestTok = existingTokens[0];
    const tokDate = parseSafeDate(latestTok.CreatedAt);
    if (tokDate) {
      const timeSince = Date.now() - tokDate.getTime();
      if (timeSince >= 0 && timeSince < OTP_RESEND_COOLDOWN_MS) {
        return error(res, 'Harap tunggu 60 detik sebelum meminta kode OTP baru.');
      }
    }
  }

  // Invalidate old tokens & reset attempt counter for this user
  await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}`, { method: 'DELETE' }).catch(() => { });
  await clearOtpFailedAttempts(uName);

  // Generate 6-digit OTP using crypto.randomInt
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = createOtpHash(otp);

  // Simpan OTP ter-hash ke tabel reset_tokens
  await supabaseQuery('reset_tokens', {
    method: 'POST',
    body: { Username: uName, OTP: otpHash, CreatedAt: new Date().toISOString() }
  });

  // Kirim email OTP ke fotografer (harus diawait dan dicek hasilnya)
  let mailSent = false;
  try {
    mailSent = await sendEmailViaGAS({
      to: userEmail,
      subject: 'Kode Keamanan Reset Password - Photo Selection',
      htmlBody: buildOtpResetPasswordEmail({
        nama: targetUser.Nama || uName,
        username: uName,
        otp: otp
      })
    });
  } catch (mailErr) {
    console.error('[MAILER] Error kirim email OTP via GAS:', mailErr && mailErr.message ? mailErr.message : mailErr);
    mailSent = false;
  }

  // Jika pengiriman email gagal, bersihkan token agar tidak menghalangi retry dan jangan berikan respon sukses palsu
  if (!mailSent) {
    try {
      await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}`, { method: 'DELETE' });
    } catch (cleanupErr) {
      console.error('[MAILER] Gagal menghapus reset token setelah pengiriman email gagal:', cleanupErr && cleanupErr.message ? cleanupErr.message : cleanupErr);
    }
    return error(res, 'Gagal mengirim kode OTP. Silakan coba kembali beberapa saat lagi.', 500);
  }

  // Sensor email untuk keamanan (contoh: pu***15@gmail.com)
  const parts = userEmail.split('@');
  const maskedName = parts[0].length > 3 ? (parts[0].substring(0, 2) + '***' + parts[0].slice(-2)) : (parts[0] + '***');
  const maskedEmail = maskedName + '@' + (parts[1] || 'gmail.com');

  return success(res, {
    success: true,
    maskedEmail: maskedEmail,
    message: `Kode OTP 6 digit telah dikirim ke email ${maskedEmail}. Silakan periksa inbox/spam email Anda.`
  });
}

async function handleResetPasswordWithOTP(payload, res) {
  const emailOrUser = (payload.email || payload.username || '').trim().toLowerCase();
  const explicitUsername = (payload.username || '').trim().toLowerCase();
  const otp = (payload.otp || '').trim();
  const newPassword = (payload.newPassword || '').trim();

  if (!emailOrUser || !otp || !newPassword) return error(res, 'Lengkapi semua isian form.');
  if (emailOrUser.length > 254) return error(res, 'User tidak ditemukan.');
  if (!/^\d{6}$/.test(otp)) return error(res, 'Kode OTP salah atau sudah kedaluwarsa.');
  if (newPassword.length > 128) return error(res, 'Password baru minimal 8 karakter dan maksimal 128 karakter.');

  let targetUser = null;

  // 1. Try finding by exact Username first
  const byUsername = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
  if (byUsername && byUsername.length === 1) {
    targetUser = byUsername[0];
  }

  // 2. Check by Email
  if (!targetUser) {
    const byEmail = await supabaseQuery(`users?Email=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
    if (byEmail && byEmail.length > 0) {
      if (byEmail.length === 1) {
        targetUser = byEmail[0];
      } else {
        if (explicitUsername && explicitUsername !== emailOrUser) {
          targetUser = byEmail.find(u => String(u.Username || '').trim().toLowerCase() === explicitUsername);
        }
        if (!targetUser) {
          return error(res, 'Email ini terhubung dengan beberapa akun. Masukkan Username Anda untuk mereset password.', 400);
        }
      }
    }
  }

  if (!targetUser) return error(res, 'User tidak ditemukan.');

  const uName = targetUser.Username;

  // Query latest reset token by Username only (DO NOT query by OTP)
  const tokens = await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}&order=id.desc&limit=1`);
  if (!tokens || tokens.length === 0) return error(res, 'Kode OTP salah atau sudah kedaluwarsa.');

  const tokenRow = tokens[0];

  // Fail-closed attempt count query
  let failedAttempts = 0;
  try {
    failedAttempts = await getRecentOtpFailedAttempts(uName);
  } catch (attemptErr) {
    console.error('Error checking OTP attempt security:', attemptErr);
    return error(res, 'Keamanan reset password sedang tidak dapat diverifikasi. Silakan coba beberapa saat lagi.', 500);
  }

  // Check attempt lockout: maximum 5 failed attempts
  // DO NOT delete reset_tokens row so 60-second cooldown is preserved in requestOTP
  if (failedAttempts >= 5) {
    return error(res, 'Terlalu banyak percobaan salah. Silakan minta kode OTP baru.');
  }

  // Check OTP expiration (10 minutes TTL)
  const createdAt = tokenRow.CreatedAt;
  const createdDate = parseSafeDate(createdAt);
  if (!createdDate) {
    await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}`, { method: 'DELETE' }).catch(() => { });
    await clearOtpFailedAttempts(uName);
    return error(res, 'Kode OTP salah atau sudah kedaluwarsa.');
  }

  const now = Date.now();
  const tokenAge = now - createdDate.getTime();
  if (tokenAge < -60000 || tokenAge > OTP_TTL_MS) {
    await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}`, { method: 'DELETE' }).catch(() => { });
    await clearOtpFailedAttempts(uName);
    return error(res, 'Kode OTP salah atau sudah kedaluwarsa.');
  }

  // Verify OTP
  const isOtpValid = verifyOtp(otp, tokenRow.OTP, createdAt);
  if (!isOtpValid) {
    try {
      await recordOtpFailedAttempt(uName);
    } catch (recErr) {
      console.error('Failed to persist OTP attempt record:', recErr);
      return error(res, 'Keamanan reset password sedang tidak dapat diverifikasi. Silakan coba beberapa saat lagi.', 500);
    }
    const newAttemptCount = failedAttempts + 1;
    if (newAttemptCount >= 5) {
      // Logically locked, DO NOT physically delete token so 60-sec cooldown is preserved
      return error(res, 'Terlalu banyak percobaan salah. Silakan minta kode OTP baru.');
    }
    return error(res, 'Kode OTP salah atau sudah kedaluwarsa.');
  }

  // Password Policy check (8 - 128 characters)
  if (!validatePasswordPolicy(newPassword)) {
    return error(res, 'Password baru minimal 8 karakter dan maksimal 128 karakter.');
  }

  // Hash new password using modern scrypt
  const newHash = createPasswordHash(newPassword);

  // Safe fail-closed sequence:
  // A. Revoke existing normal account sessions (MUST succeed)
  // B. PATCH users.Password with new scrypt hash (MUST succeed)
  // C. Revoke normal account sessions AGAIN (MUST succeed)
  // D. Delete reset_tokens for Username (MUST succeed, single-use enforcement)
  try {
    await revokeAccountSessionsOrThrow(uName);

    await supabaseQuery(`users?Username=ilike.${encodeURIComponent(uName)}`, {
      method: 'PATCH',
      body: { Password: newHash }
    });

    await revokeAccountSessionsOrThrow(uName);

    await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}`, {
      method: 'DELETE'
    });
  } catch (resetErr) {
    console.error('Critical failure during password reset sequence for user:', uName, resetErr);
    return error(res, 'Terjadi kendala saat memperbarui kata sandi akun. Silakan coba beberapa saat lagi.', 500);
  }

  // E. Clear ResetOTPAttempt rows (best-effort only after A-D succeed)
  await clearOtpFailedAttempts(uName).catch(() => { });

  return success(res, { success: true, message: 'Password Anda berhasil direset! Silakan login dengan password baru.' });
}

async function handleConfirmEmail(payload, res) {
  const token = (payload.token || '').trim();
  await supabaseQuery(`users?ConfirmToken=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: { Status: 'Active', ConfirmToken: '' }
  });
  return success(res, { success: true, message: 'Email confirmed' });
}

async function handleGetDriveContent(payload, req, res) {
  // Backwards compatibility if called with (payload, res)
  if (!res && req && typeof req.writeHead === 'function') {
    res = req;
    req = null;
  }

  // 1. Resolve Session: Exclusively via authoritative server-side verifyUserSession (NEVER trust payload.authUser)
  let authUser = null;
  try {
    authUser = await verifyUserSession(payload, req);
  } catch (_) {
    authUser = null;
  }

  let projectToken = (payload.token || payload.projectToken || '').trim();
  if (!projectToken && req && req.headers) {
    projectToken = String(req.headers['x-client-token'] || req.headers['x-project-token'] || '').trim();
  }

  // Extract client session token if provided
  let clientSessionToken = '';
  if (req && req.headers && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      clientSessionToken = parts[1].trim();
    }
  }
  if (!clientSessionToken && payload.clientAccessToken) {
    clientSessionToken = String(payload.clientAccessToken).trim();
  }
  if (!clientSessionToken && payload.sessionToken) {
    clientSessionToken = String(payload.sessionToken).trim();
  }
  if (!clientSessionToken && payload.session) {
    clientSessionToken = String(payload.session).trim();
  }

  let project = null;
  let authoritativeFolderId = null;

  // Case A: Photographer / Admin Session
  if (authUser && authUser.username) {
    if (projectToken) {
      project = await findProjectForClient(projectToken);
      if (!project) {
        return error(res, 'Project tidak ditemukan.', 404);
      }
      const isOwner = project.Owner === authUser.username || authUser.role === 'Admin' || authUser.username === 'admin';
      if (!isOwner) {
        return error(res, 'Akses ditolak: Akun Anda tidak memiliki hak akses untuk project ini.', 403);
      }
      const rootFolderId = urlParser.extractFolderId(project['Drive Link'] || project.driveLink || project.DriveLink);
      if (!rootFolderId) {
        return error(res, 'Link atau ID Google Drive pada project ini tidak valid atau belum diatur.', 400);
      }

      // ISSUE 3: Authorized subfolder navigation for photographer
      let targetFolderId = rootFolderId;
      const rawRequested = (payload.folder_id || payload.folderId || '').trim();
      if (rawRequested) {
        const canonicalRequested = urlParser.extractFolderId(rawRequested);
        if (!canonicalRequested) {
          return error(res, 'Format link atau ID Google Drive subfolder tidak valid.', 400);
        }
        if (canonicalRequested !== rootFolderId) {
          const prov = getDriveProvider();
          if (typeof prov.verifyFolderHierarchy === 'function') {
            const hierCheck = await prov.verifyFolderHierarchy({ folderId: canonicalRequested, rootFolderId });
            if (!hierCheck || !hierCheck.allowed) {
              return error(res, 'Akses ditolak: Folder ini bukan bagian dari proyek galeri ini (Cross-project / invalid subfolder).', 403);
            }
          }
          targetFolderId = canonicalRequested;
        }
      }
      authoritativeFolderId = targetFolderId;
    } else {
      // Photographer previewing folder during project creation form
      const clientFolderUrl = payload.folder_id || payload.folderId || payload.driveLink || payload.link;
      if (clientFolderUrl) {
        authoritativeFolderId = urlParser.extractFolderId(clientFolderUrl);
      }

      // Safe Folder Onboarding Boundary: Prevent Cross-Photographer Folder Enumeration
      if (authoritativeFolderId && authUser.role !== 'Admin') {
        // 1. Check if folder is already bound to another photographer's project in database
        try {
          const existingProjects = await supabaseQuery(`projects?or=(Drive%20Link.ilike.*${encodeURIComponent(authoritativeFolderId)}*,driveLink.ilike.*${encodeURIComponent(authoritativeFolderId)}*)&select=id,Owner`);
          if (Array.isArray(existingProjects) && existingProjects.length > 0) {
            const alien = existingProjects.find(p => p.Owner && String(p.Owner).toLowerCase().trim() !== String(authUser.username).toLowerCase().trim());
            if (alien) {
              return error(res, 'Akses ditolak: Folder Google Drive ini sudah terdaftar pada project milik fotografer lain.', 403);
            }
          }
        } catch (_) { }

        // 2. Check authoritative folder ownership with active drive provider
        const prov = getDriveProvider();
        if (prov && typeof prov.verifyFolderOwnership === 'function') {
          const ownerCheck = await prov.verifyFolderOwnership(authoritativeFolderId, authUser.email || authUser.username);
          if (!ownerCheck.verified) {
            return error(res, `Akses ditolak: Folder Google Drive ini tidak dimiliki atau dibagikan oleh akun Anda (${authUser.username}).`, 403);
          }
        }
      }
    }
  } else {
    // Case B: Client Gallery Visitor
    if (!projectToken) {
      return error(res, 'Akses ditolak: Token project wajib disertakan.', 400);
    }

    // Client must have an active session
    if (!clientSessionToken) {
      return error(res, 'Akses ditolak: Memerlukan otorisasi sesi PIN terverifikasi atau login fotografer.', 403);
    }

    project = await findProjectForClient(projectToken);
    if (!project) {
      return error(res, 'Project tidak ditemukan.', 404);
    }

    const verifiedSession = await verifyClientGallerySession(clientSessionToken, project);
    if (!verifiedSession) {
      return error(res, 'Akses ditolak: Sesi galeri tidak valid atau telah kedaluwarsa.', 403);
    }

    // Authoritative folder ID from the server-side project record ONLY!
    const rootFolderId = urlParser.extractFolderId(project['Drive Link'] || project.driveLink || project.DriveLink);
    if (!rootFolderId) {
      return error(res, 'Link atau ID Google Drive pada project ini tidak valid atau belum diatur.', 400);
    }

    // ISSUE 3: Authorized subfolder navigation for verified client gallery visitor
    let targetFolderId = rootFolderId;
    const rawRequested = (payload.folder_id || payload.folderId || '').trim();
    if (rawRequested) {
      const canonicalRequested = urlParser.extractFolderId(rawRequested);
      if (!canonicalRequested) {
        return error(res, 'Format link atau ID Google Drive subfolder tidak valid.', 400);
      }
      if (canonicalRequested !== rootFolderId) {
        const prov = getDriveProvider();
        if (typeof prov.verifyFolderHierarchy === 'function') {
          const hierCheck = await prov.verifyFolderHierarchy({ folderId: canonicalRequested, rootFolderId });
          if (!hierCheck || !hierCheck.allowed) {
            return error(res, 'Akses ditolak: Folder ini bukan bagian dari proyek galeri ini (Cross-project / invalid subfolder).', 403);
          }
        }
        targetFolderId = canonicalRequested;
      }
    }
    authoritativeFolderId = targetFolderId;
  }

  if (!authoritativeFolderId) {
    return error(res, 'Link atau ID Google Drive pada project ini tidak valid atau belum diatur.', 400);
  }

  try {
    const provider = getDriveProvider();
    const pageToken = payload.pageToken || payload.nextPageToken || null;
    const pageSize = parseInt(payload.pageSize, 10) || 100;
    const canonicalProjectToken = (project && project.Token) || projectToken;
    const result = await provider.getFolderContent({
      folderId: authoritativeFolderId,
      projectToken: canonicalProjectToken,
      pageToken,
      pageSize
    });
    if (!result.success) {
      const statusCode = result.code === 'FOLDER_NOT_FOUND' ? 404
        : (result.code === 'FOLDER_ACCESS_DENIED' || result.code === 'SESSION_REQUIRED') ? 403
        : 500;
      return error(res, result.message, statusCode);
    }

    return success(res, {
      success: true,
      images: result.data.images,
      folders: result.data.folders,
      rawFiles: result.data.rawFiles || [],
      nextPageToken: result.data.nextPageToken || null,
      isMockDrive: result.data.isMockDrive || false,
      data: result.data
    });
  } catch (err) {
    console.error('Drive fetch error:', err);
    return error(res, 'Gagal memuat isi Google Drive.', 500);
  }
}

async function handleDownloadOriginalFile(payload, req, res) {
  const fileId = payload.fileId || payload.id;
  let projectToken = (payload.token || payload.projectToken || '').trim();
  if (!projectToken && req && req.headers) {
    projectToken = String(req.headers['x-client-token'] || req.headers['x-project-token'] || '').trim();
  }

  if (!fileId) {
    return error(res, 'Parameter fileId wajib disertakan.', 400);
  }

  let sessionToken = '';
  if (req && req.headers && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      sessionToken = parts[1].trim();
    }
  }
  if (!sessionToken && payload.clientAccessToken) {
    sessionToken = payload.clientAccessToken.trim();
  }
  if (!sessionToken && payload.sessionToken) {
    sessionToken = payload.sessionToken.trim();
  }
  if (!sessionToken && payload.session) {
    sessionToken = payload.session.trim();
  }

  if (!sessionToken) {
    return error(res, 'Akses ditolak: Memerlukan otorisasi sesi untuk mengunduh berkas asli.', 403, { code: 'KMBC_SESSION_DENIED' });
  }

  const provider = payload.testProviderOverride || getDriveProvider();

  const tAuthStart = Date.now();
  const downloadService = new DownloadService({
    driveProvider: provider,
    sessionVerifier: payload.testSessionVerifier || (async (token) => {
      if (projectToken) {
        const p = await findProjectForClient(projectToken);
        if (p) {
          const s = await verifyClientGallerySession(token, p);
          if (s) {
            return {
              token: s.SessionID,
              projectToken: projectToken,
              project: p,
              isDownloadActive: String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE',
              expiresAt: new Date(s.CreatedAt).getTime() + CLIENT_GALLERY_SESSION_TTL_MS
            };
          }
        }
      }
      return null;
    }),
    projectFinder: payload.testProjectFinder || (async (tok) => {
      return await findProjectForClient(tok);
    })
  });

  const purpose = payload.purpose || (req && req.query && req.query.purpose) || '';
  const folderId = payload.folderId || (req && req.query && req.query.folderId) || null;
  const authCheck = await downloadService.authorizeDownload({
    sessionToken,
    projectToken,
    fileId,
    provider,
    purpose,
    folderId
  });
  const tAuth = Date.now() - tAuthStart;

  if (!authCheck.authorized) {
    const isSessionErr = (authCheck.error && (authCheck.error.code === 'SESSION_REQUIRED' || authCheck.error.code === 'INVALID_SESSION' || authCheck.error.code === 'SESSION_EXPIRED'));
    const safeCode = isSessionErr ? 'KMBC_SESSION_DENIED' : 'KMBC_PROJECT_FILE_DENIED';
    return error(res, authCheck.error.message, authCheck.error.status || 403, { code: safeCode, originalCode: authCheck.error?.code });
  }

  const rangeHeader = req && req.headers ? (req.headers['range'] || payload.range) : payload.range;

  if (provider.name === 'google' || provider.isStreamingProvider || payload.forceStreamDelivery) {
    const tMetaStart = Date.now();
    let meta = authCheck.meta || await provider.getFileMetadata(fileId);
    if (!meta && typeof provider.resolveProjectFile === 'function' && authCheck.project) {
      const rawFolder = authCheck.project['Drive Link'] || authCheck.project.driveLink || authCheck.project.DriveLink || authCheck.project.google_drive_folder_id || authCheck.project.folderId || '';
      const projectFolderId = extractFolderId(rawFolder) || rawFolder;
      if (projectFolderId) {
        meta = await provider.resolveProjectFile(fileId, projectFolderId, folderId);
      }
    }
    const tMeta = Date.now() - tMetaStart;

    if (!meta) {
      return error(res, 'Berkas foto tidak ditemukan di Google Drive.', 404, { code: 'GOOGLE_ORIGINAL_NOT_FOUND' });
    }
    const byteSize = parseInt(meta.size, 10) || 0;
    const delivery = downloadService.evaluateDeliveryStrategy(byteSize);

    const rangeInfo = downloadService.parseRangeHeader(rangeHeader, byteSize);
    if (rangeInfo.invalid) {
      res.writeHead(416, { 'Content-Range': `bytes */${byteSize}` });
      return res.end();
    }

    // Direct authentic streaming is supported on all environments including Vercel
    // via Node.js stream/pipeline chunked transfer encoding (no 4.5MB buffered limit).
    // If range is NOT requested, stream full authentic original without artificial 413.

    const streamOpts = rangeInfo.isRange ? { range: `bytes=${rangeInfo.start}-${rangeInfo.end}` } : {};
    const tStreamStart = Date.now();
    const streamRes = await provider.fetchOriginalStream(fileId, streamOpts);
    const tStreamInit = Date.now() - tStreamStart;

    if (!streamRes.success) {
      const errStatus = streamRes.status || 502;
      return error(res, streamRes.message, errStatus, {
        code: streamRes.code || 'GOOGLE_ORIGINAL_UPSTREAM_DENIED',
        upstreamStatus: streamRes.upstreamStatus || streamRes.status || 502,
        upstreamCategory: streamRes.upstreamCategory || (streamRes.upstreamStatus === 403 ? 'GOOGLE_HTTP_FORBIDDEN' : (streamRes.code === 'GOOGLE_DOWNLOAD_HTML_WALL' ? 'GOOGLE_HTML_WALL' : 'GOOGLE_REFUSAL')),
        timeToFailureMs: tStreamInit,
        bytesReceived: 0,
        filename: meta ? meta.name : ''
      });
    }

    // FIX 3: Upstream status verification when Range requested — If 200 returned for <=4.5MB, safely serve full response!
    if (rangeInfo.isRange && streamRes.status !== 206) {
      if (streamRes.status === 200) {
        const contentLength = parseInt(streamRes.headers?.['Content-Length'] || streamRes.headers?.['content-length'], 10) || byteSize;
        const MAX_VERCEL_BYTES = 4.5 * 1024 * 1024;
        if (contentLength > 0 && contentLength <= MAX_VERCEL_BYTES) {
          rangeInfo.isRange = false;
        } else {
          return error(res, 'Upstream Google Drive mengabaikan header Range dan mengirim respons penuh.', 502, { code: 'UNEXPECTED_FULL_RESPONSE' });
        }
      } else {
        return error(res, 'Upstream Google Drive mengabaikan header Range dan mengirim respons penuh.', 502, { code: 'UNEXPECTED_FULL_RESPONSE' });
      }
    }

    // FIX 3: Parse and verify upstream Content-Range against requested bounds and authoritative file size
    let verifiedUpstreamCr = null;
    let expectedChunkBytes = 0;
    if (rangeInfo.isRange) {
      const cr = streamRes.headers?.['Content-Range'] || streamRes.headers?.['content-range'];
      if (!cr) {
        return error(res, 'Header Content-Range tidak ditemukan pada respons partial upstream.', 502, { code: 'INVALID_CONTENT_RANGE' });
      }
      const match = String(cr).match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
      if (!match) {
        return error(res, `Format Content-Range upstream tidak valid: ${cr}`, 502, { code: 'INVALID_CONTENT_RANGE' });
      }
      const crStart = parseInt(match[1], 10);
      const crEnd = parseInt(match[2], 10);
      const crTotal = parseInt(match[3], 10);
      const authoritativeTotal = meta.size ? parseInt(meta.size, 10) : crTotal;

      if (crStart !== rangeInfo.start || crEnd !== rangeInfo.end || (authoritativeTotal && crTotal !== authoritativeTotal)) {
        return error(res, `Content-Range upstream (${cr}) tidak cocok dengan rentang yang diminta (bytes ${rangeInfo.start}-${rangeInfo.end}/${authoritativeTotal}).`, 502, { code: 'INVALID_CONTENT_RANGE' });
      }

      expectedChunkBytes = crEnd - crStart + 1;
      const upCl = parseInt(streamRes.headers?.['Content-Length'] || streamRes.headers?.['content-length'], 10);
      if (upCl && upCl !== expectedChunkBytes) {
        return error(res, `Content-Length upstream (${upCl}) tidak cocok dengan ukuran rentang chunk (${expectedChunkBytes}).`, 502, { code: 'INVALID_CONTENT_RANGE' });
      }
      verifiedUpstreamCr = cr;
    } else {
      expectedChunkBytes = meta.size ? parseInt(meta.size, 10) : (byteSize || 0);
      if (!expectedChunkBytes && (streamRes.contentLength || streamRes.headers?.['Content-Length'] || streamRes.headers?.['content-length'])) {
        expectedChunkBytes = parseInt(streamRes.contentLength || streamRes.headers?.['Content-Length'] || streamRes.headers?.['content-length'], 10) || 0;
      }
    }

    const cleanName = downloadService.sanitizeHeaderFilename(meta.name);
    const nodeStream = toNodeReadable(streamRes.body);
    if (!nodeStream) {
      return error(res, 'Upstream stream tidak valid.', 502);
    }

    const isViewOnly = (purpose === 'view');
    let responseMime = streamRes.headers?.['Content-Type'] || streamRes.headers?.['content-type'] || (meta && meta.mimeType);
    if (!responseMime || responseMime === 'application/octet-stream') {
      const ext = path.extname(cleanName || '').toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg') responseMime = 'image/jpeg';
      else if (ext === '.png') responseMime = 'image/png';
      else if (ext === '.webp') responseMime = 'image/webp';
      else responseMime = 'application/octet-stream';
    }

    const resStatus = rangeInfo.isRange ? 206 : (streamRes.status || 200);
    const headers = {
      'Content-Type': responseMime,
      'Content-Disposition': `${isViewOnly ? 'inline' : 'attachment'}; filename="${cleanName}"`,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'X-Delivery-Mode': rangeInfo.isRange ? 'CHUNKED_RANGE' : 'DIRECT_STREAM',
      'X-Original-Transport': 'phase6-stream-v2',
      'X-Drive-Provider': provider.name || 'unknown',
      'Cache-Control': 'private, max-age=300',
      'Server-Timing': `auth;dur=${tAuth}, meta;dur=${tMeta}, stream_init;dur=${tStreamInit}`
    };
    if (rangeInfo.isRange) {
      // Forward genuine verified upstream Content-Range (never fabricate mismatched expected headers)
      headers['Content-Range'] = verifiedUpstreamCr;
      headers['Content-Length'] = String(expectedChunkBytes);
    } else if (expectedChunkBytes > 0) {
      headers['Content-Length'] = String(expectedChunkBytes);
    } else if (streamRes.headers?.['Content-Length'] || streamRes.headers?.['content-length']) {
      headers['Content-Length'] = streamRes.headers['Content-Length'] || streamRes.headers['content-length'];
    }

    let streamedBytes = 0;
    const MAX_CHUNK_LIMIT = 4.5 * 1024 * 1024;

    const validatorTransform = new Transform({
      transform(chunk, encoding, callback) {
        streamedBytes += chunk.length;
        if (rangeInfo.isRange && streamedBytes > MAX_CHUNK_LIMIT) {
          return callback(new Error('CHUNK_OVERSIZED: Streamed chunk exceeded 4.5MB Vercel boundary'));
        }
        if (expectedChunkBytes > 0 && streamedBytes > expectedChunkBytes) {
          return callback(new Error(`CHUNK_OVERSIZED: Streamed ${streamedBytes} bytes, expected ${expectedChunkBytes}`));
        }
        callback(null, chunk);
      },
      flush(callback) {
        if (expectedChunkBytes > 0 && streamedBytes !== expectedChunkBytes) {
          return callback(new Error(`CHUNK_TRUNCATED: Streamed ${streamedBytes} bytes, expected ${expectedChunkBytes}`));
        }
        callback();
      }
    });

    res.writeHead(resStatus, headers);

    const onResClose = () => {
      // Reliable response cancellation cleanup: only destroy if connection dropped before finish
      if (!res.writableFinished && !res.writableEnded) {
        if (typeof nodeStream.destroy === 'function') {
          nodeStream.destroy(new Error('CLIENT_ABORTED'));
        }
        if (typeof validatorTransform.destroy === 'function') {
          validatorTransform.destroy(new Error('CLIENT_ABORTED'));
        }
      }
    };
    res.on('close', onResClose);

    pipeline(nodeStream, validatorTransform, res, (err) => {
      res.removeListener('close', onResClose);
      if (err) {
        if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.message !== 'CLIENT_ABORTED') {
          console.error('Download stream error:', err.message);
        }
        if (!res.headersSent) {
          error(res, 'Gagal mengalirkan berkas.', 502);
        } else if (!res.destroyed) {
          res.destroy(err);
        }
      }
    });
    return;
  } else {
    // Mock Provider delivery
    let rangeOpts = null;
    const preCheck = await provider.getFileBuffer({ fileId });
    if (!preCheck.success) {
      return error(res, preCheck.message, 404);
    }

    const rangeInfo = downloadService.parseRangeHeader(rangeHeader, preCheck.totalSize || preCheck.size);
    if (rangeInfo.invalid) {
      res.writeHead(416, { 'Content-Range': `bytes */${preCheck.totalSize || preCheck.size}` });
      return res.end();
    }

    if (rangeInfo.isRange) {
      rangeOpts = { start: rangeInfo.start, end: rangeInfo.end };
    }

    const fileRes = await provider.getFileBuffer({ fileId, range: rangeOpts });
    if (!fileRes.success) {
      return error(res, fileRes.message, 404);
    }

    const isViewOnly = (purpose === 'view');
    const cleanName = downloadService.sanitizeHeaderFilename(fileRes.filename);
    const resStatus = fileRes.isRange ? 206 : 200;
    const respHeaders = {
      'Content-Type': fileRes.mimeType,
      'Content-Length': fileRes.size,
      'Content-Disposition': `${isViewOnly ? 'inline' : 'attachment'}; filename="${cleanName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
      'X-Drive-Provider': provider.name || 'mock',
      'X-Delivery-Mode': fileRes.isRange ? 'CHUNKED_RANGE' : 'DIRECT_STREAM',
      'X-Original-Transport': 'phase6-stream-v2',
      'Cache-Control': 'private, max-age=300'
    };
    if (fileRes.contentRange) {
      respHeaders['Content-Range'] = fileRes.contentRange;
    }

    res.writeHead(resStatus, respHeaders);
    return res.end(fileRes.buffer);
  }
}

async function handleGetPreviewImage(payload, req, res) {
  const fileId = payload.fileId || payload.id;
  let projectToken = (payload.token || payload.projectToken || '').trim();
  if (!projectToken && req && req.headers) {
    projectToken = String(req.headers['x-client-token'] || req.headers['x-project-token'] || '').trim();
  }

  if (!fileId) return error(res, 'Parameter fileId wajib disertakan.', 400);

  // Reject RAW files from preview (RAW must not be returned as image/jpeg)
  const previewExt = path.extname(fileId || '').toLowerCase();
  const isRawFile = types.SUPPORTED_RAW_EXTENSIONS.includes(previewExt) || types.SUPPORTED_RAW_MIMES.includes(previewExt);
  if (isRawFile) {
    return error(res, 'Berkas RAW tidak dapat ditampilkan sebagai preview gambar langsung.', 415);
  }

  let sessionToken = '';
  if (req && req.headers && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      sessionToken = parts[1].trim();
    }
  }
  if (!sessionToken && payload.clientAccessToken) sessionToken = payload.clientAccessToken.trim();
  if (!sessionToken && payload.sessionToken) sessionToken = payload.sessionToken.trim();
  if (!sessionToken && payload.session) sessionToken = payload.session.trim();

  // 1. Resolve Session: Exclusively via authoritative server-side verifyUserSession (NEVER trust payload.authUser)
  let authUser = null;
  try {
    authUser = await verifyUserSession(payload, req);
  } catch (_) {
    authUser = null;
  }

  let project = null;
  if (projectToken) {
    project = await findProjectForClient(projectToken);
  }

  let isAuthorized = false;
  if (authUser && authUser.username && project) {
    const isOwner = (
      String(project.Owner || '').toLowerCase().trim() === String(authUser.username || '').toLowerCase().trim() ||
      authUser.role === 'Admin' ||
      String(authUser.username || '').toLowerCase().trim() === 'admin'
    );
    if (isOwner) isAuthorized = true;
  }

  if (!isAuthorized && sessionToken && project) {
    const s = await verifyClientGallerySession(sessionToken, project);
    if (s) isAuthorized = true;
  }

  if (!isAuthorized) {
    return error(res, 'Akses ditolak: Memerlukan otorisasi sesi untuk melihat foto preview.', 403);
  }

  const provider = getDriveProvider();

  const downloadService = new DownloadService({ driveProvider: provider });
  const folderId = payload.folderId || (req && req.query && req.query.folderId) || null;
  const memCheck = await downloadService.verifyFileMembership({ project, session: { projectToken }, fileId, provider, folderId });
  if (!memCheck.allowed) {
    return error(res, memCheck.error.message, memCheck.error.status);
  }

  // Authoritative MIME resolution from metadata or extension
  const metaName = (memCheck.meta && memCheck.meta.name) || fileId || '';
  const metaExt = path.extname(metaName).toLowerCase();
  const metaMime = (memCheck.meta && memCheck.meta.mimeType) || '';

  // Reject RAW files from preview (authoritative metadata check)
  const isAuthoritativeRaw = types.SUPPORTED_RAW_EXTENSIONS.includes(metaExt) ||
    types.SUPPORTED_RAW_MIMES.includes(metaMime) ||
    types.SUPPORTED_RAW_EXTENSIONS.includes(previewExt);
  if (isAuthoritativeRaw) {
    return error(res, 'Berkas RAW tidak dapat ditampilkan sebagai preview gambar langsung.', 415);
  }

  let previewMime = metaMime || (previewExt === '.png' ? 'image/png' : (previewExt === '.webp' ? 'image/webp' : 'image/jpeg'));
  if (!previewMime.startsWith('image/')) previewMime = 'image/jpeg';

  // Private size-bounded thumbnail streaming (Never send 25MB+ camera originals as gallery previews)
  let requestedSize = parseInt(payload.size || payload.width || payload.s || (req && req.query && (req.query.size || req.query.width || req.query.s)) || '1200', 10);
  if (isNaN(requestedSize) || requestedSize <= 0) requestedSize = 1200;
  if (requestedSize > 2400) requestedSize = 2400;
  if (requestedSize < 100) requestedSize = 100;

  const streamRes = await provider.fetchThumbnailStream(fileId, { size: requestedSize });
  if (!streamRes.success) {
    return error(res, streamRes.message || 'Gagal memuat thumbnail.', streamRes.status || 500);
  }

  const resHeaders = {
    'Content-Type': streamRes.headers?.['Content-Type'] || previewMime,
    'Cache-Control': 'private, max-age=86400, stale-while-revalidate=3600',
    'X-Content-Type-Options': 'nosniff'
  };
  if (streamRes.headers && streamRes.headers['Content-Length']) {
    resHeaders['Content-Length'] = streamRes.headers['Content-Length'];
  }

  res.writeHead(200, resHeaders);

  const nodeStream = toNodeReadable(streamRes.body);
  if (!nodeStream) return error(res, 'Upstream stream tidak valid.', 502);

  const onPreviewResClose = () => {
    // Reliable response cancellation cleanup: only destroy if connection dropped before finish
    if (!res.writableFinished && !res.writableEnded) {
      if (typeof nodeStream.destroy === 'function') {
        nodeStream.destroy(new Error('CLIENT_ABORTED'));
      }
    }
  };
  res.on('close', onPreviewResClose);

  pipeline(nodeStream, res, (err) => {
    res.removeListener('close', onPreviewResClose);
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.message !== 'CLIENT_ABORTED') {
      console.error('Preview stream error:', err.message);
    }
  });
}

async function handleGetAudioStream(payload, req, res) {
  const fileId = String(payload.fileId || payload.id || (req && req.query && req.query.fileId) || '').trim();
  if (!fileId || !/^[a-zA-Z0-9_\-]{10,128}$/.test(fileId)) {
    return error(res, 'Parameter fileId tidak valid.', 400);
  }

  try {
    let provider = null;
    try {
      provider = getDriveProvider();
    } catch (_) {
      provider = null;
    }

    const rangeHeader = req && req.headers ? req.headers['range'] : null;
    const streamOpts = rangeHeader ? { range: rangeHeader } : {};
    let streamRes = null;

    if (provider && typeof provider.fetchOriginalStream === 'function') {
      try {
        streamRes = await provider.fetchOriginalStream(fileId, streamOpts);
      } catch (_) {
        streamRes = null;
      }
    }

    if (!streamRes || !streamRes.success) {
      try {
        const PublicDriveProvider = require('./drive/publicProvider');
        const publicProvider = new PublicDriveProvider();
        streamRes = await publicProvider.fetchOriginalStream(fileId, streamOpts);
      } catch (_) {
        streamRes = null;
      }
    }

    if (!streamRes || !streamRes.success) {
      // Fallback redirect with export=open to hint inline streaming instead of attachment download
      res.writeHead(302, { 'Location': `https://docs.google.com/uc?export=open&id=${encodeURIComponent(fileId)}` });
      return res.end();
    }

    const contentType = (streamRes.contentType && streamRes.contentType.startsWith('audio/')) ? streamRes.contentType : 'audio/mpeg';
    const resHeaders = {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff'
    };
    if (streamRes.contentLength) {
      resHeaders['Content-Length'] = streamRes.contentLength;
    }
    if (streamRes.contentRange) {
      resHeaders['Content-Range'] = streamRes.contentRange;
      res.writeHead(206, resHeaders);
    } else {
      res.writeHead(200, resHeaders);
    }

    const nodeStream = toNodeReadable(streamRes.stream || streamRes.body);
    if (!nodeStream) {
      res.writeHead(302, { 'Location': `https://docs.google.com/uc?export=open&id=${encodeURIComponent(fileId)}` });
      return res.end();
    }

    pipeline(nodeStream, res, (err) => {
      if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        console.error('Audio stream pipeline error:', err.message);
      }
    });
  } catch (err) {
    console.error('Audio stream handler error:', err);
    res.writeHead(302, { 'Location': `https://docs.google.com/uc?export=open&id=${encodeURIComponent(fileId)}` });
    return res.end();
  }
}

async function handleGetAudioData(payload, res) {
  const musicUrl = (payload.musicUrl || payload.url || '').trim();
  if (payload.fileId && typeof payload.fileId === 'string') {
    const safeFileId = payload.fileId.replace(/[^a-zA-Z0-9_\-]/g, '');
    if (safeFileId) {
      return success(res, { success: true, url: `https://docs.google.com/uc?export=download&id=${safeFileId}` });
    }
  }
  if (musicUrl && !isSafeHttpsUrl(musicUrl)) {
    return error(res, 'URL audio tidak valid. Hanya URL HTTPS yang diizinkan.', 400);
  }
  return success(res, { success: true, url: musicUrl });
}

async function handleSubmitFeedback(payload, res) {
  const authUser = payload.authUser || {};
  const d = payload.data || payload;
  const pesan = cleanPlainString(d.pesan || d.feedback || '', true);
  const lampiranUrl = (d.lampiranUrl || d.lampiran || d.base64Data || '').trim();
  if (!pesan) return error(res, 'Pesan feedback tidak boleh kosong.');
  if (pesan.length > 5000) return error(res, 'Pesan feedback maksimal 5000 karakter.');
  if (lampiranUrl && !isSafeFeedbackImageReference(lampiranUrl, 5 * 1024 * 1024)) {
    return error(res, 'Lampiran bukti harus berupa URL HTTPS atau data gambar (JPEG, PNG, WebP) yang valid (maks 5MB).');
  }

  const fbId = 'fb_' + Date.now();
  await supabaseQuery('feedbacks', {
    method: 'POST',
    body: {
      ID: fbId,
      Username: authUser.username || 'Anonymous',
      Role: authUser.role || 'Photographer',
      Pesan: pesan,
      LampiranURL: lampiranUrl,
      Tanggal: new Date().toISOString(),
      StatusAdmin: 'Unread',
      StatusUser: 'Read'
    }
  });

  return success(res, { success: true, message: 'Feedback berhasil dikirim' });
}

async function handleGetFeedbacks(payload, res) {
  const authUser = payload.authUser || {};
  let endpoint = 'feedbacks?select=*&order=created_at.desc';
  if (authUser.role !== 'Admin') {
    endpoint = `feedbacks?Username=eq.${encodeURIComponent(authUser.username)}&select=*&order=created_at.desc`;
  }
  const rows = await supabaseQuery(endpoint);
  return success(res, { success: true, data: rows || [] });
}

async function handleReplyFeedback(payload, res) {
  if (!requireAdmin(payload.authUser)) return error(res, 'Unauthorized', 403);
  const id = (payload.id || '').trim();
  const balasan = cleanPlainString(payload.reply || payload.balasan || '', true);
  if (!id) return error(res, 'ID feedback wajib diisi.');
  if (!validateSafeIdentifier(id, 128)) return error(res, 'Format ID feedback tidak valid.');
  if (!balasan) return error(res, 'Balasan tidak boleh kosong.');
  if (balasan.length > 5000) return error(res, 'Balasan maksimal 5000 karakter.');

  await supabaseQuery(`feedbacks?ID=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { Balasan: balasan, TglBalas: new Date().toISOString(), StatusUser: 'Unread' }
  });
  return success(res, { success: true, message: 'Balasan terkirim' });
}

let isSyncingUpdates = false;
let cachedSystemUpdates = null;
let lastSystemUpdatesFetch = 0;
const SYSTEM_UPDATES_CACHE_TTL = 60000; // 60s in-memory cache

async function getOrSyncSystemUpdates(force = false) {
  const now = Date.now();
  if (!force && cachedSystemUpdates && (now - lastSystemUpdatesFetch < SYSTEM_UPDATES_CACHE_TTL)) {
    return cachedSystemUpdates;
  }
  let rows = [];
  try {
    rows = await supabaseQuery('system_updates?Status=eq.Active&select=*&order=created_at.desc');
  } catch (err) {
    console.error('getOrSyncSystemUpdates query error:', err && err.message);
  }

  const legacyIds = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'];
  const hasLegacy = Array.isArray(rows) && rows.some(r => legacyIds.includes(r.ID));
  const hasV8 = Array.isArray(rows) && rows.some(r => r.ID === 'v8');

  // Trigger automated synchronization whenever legacy rows are detected or V2.0 items missing
  if ((force || hasLegacy || !hasV8) && !isSyncingUpdates) {
    isSyncingUpdates = true;
    try {
      // 1. Delete legacy notifications from database
      if (hasLegacy || force) {
        await supabaseQuery(`system_updates?ID=in.(${legacyIds.join(',')})`, {
          method: 'DELETE'
        }).catch(async (delErr) => {
          console.warn('system_updates DELETE fallback to PATCH:', delErr && delErr.message);
          await supabaseQuery(`system_updates?ID=in.(${legacyIds.join(',')})`, {
            method: 'PATCH',
            body: { Status: 'Archived' }
          }).catch(() => {});
        });
      }

      // 2. Insert the 5 official V2.0 updates if missing
      const existingIds = new Set((Array.isArray(rows) ? rows : []).map(r => r.ID));
      for (const item of OFFICIAL_SYSTEM_UPDATES) {
        if (!existingIds.has(item.ID) || force) {
          await supabaseQuery('system_updates', {
            method: 'POST',
            body: {
              ID: item.ID,
              Judul: item.Judul,
              Versi: item.Versi,
              Tanggal: item.Tanggal,
              Pesan: item.Pesan,
              Status: item.Status,
              created_at: item.created_at
            }
          }).catch(postErr => {
            console.error(`Failed inserting system update ${item.ID}:`, postErr && postErr.message);
          });
        }
      }

      // 3. Re-query fresh rows
      const freshRows = await supabaseQuery('system_updates?Status=eq.Active&select=*&order=created_at.desc').catch(() => null);
      if (Array.isArray(freshRows) && freshRows.length > 0) {
        rows = freshRows;
      }
    } catch (syncErr) {
      console.error('System updates sync error:', syncErr && syncErr.message);
    } finally {
      isSyncingUpdates = false;
    }
  }

  // Pure filter: NEVER leak legacy v1-v7 items into client responses
  const filtered = (Array.isArray(rows) ? rows : []).filter(r => !legacyIds.includes(r.ID));
  const result = (filtered.length > 0) ? filtered : OFFICIAL_SYSTEM_UPDATES;
  cachedSystemUpdates = result;
  lastSystemUpdatesFetch = now;
  return result;
}

async function handleGetAllNotifications(payload, res) {
  const authUser = payload.authUser || payload.currentUser || {};
  let feedbacks = [];
  if (authUser && authUser.username) {
    let fbEndpoint = 'feedbacks?select=*&order=created_at.desc';
    if (authUser.role !== 'Admin') {
      fbEndpoint = `feedbacks?Username=${encodeURIComponent(authUser.username)}&select=*&order=created_at.desc`;
    }
    feedbacks = (await supabaseQuery(fbEndpoint)) || [];
  }
  const systemUpdates = await getOrSyncSystemUpdates();

  return success(res, { success: true, feedbacks, systemUpdates });
}

async function handleMarkFeedbackRead(payload, res) {
  const authUser = payload.authUser || {};
  const type = payload.type || 'user';
  if (type === 'admin') {
    if (requireAdmin(authUser)) {
      await supabaseQuery('feedbacks?StatusAdmin=eq.Unread', { method: 'PATCH', body: { StatusAdmin: 'Read' } }).catch(() => { });
    }
  } else if (authUser.username) {
    await supabaseQuery(`feedbacks?Username=${encodeURIComponent(authUser.username)}&StatusUser=eq.Unread`, { method: 'PATCH', body: { StatusUser: 'Read' } }).catch(() => { });
  }
  return success(res, { success: true, ok: true });
}

async function handleGetSystemUpdates(payload, res) {
  const rows = await getOrSyncSystemUpdates();
  return success(res, { success: true, data: rows || [] });
}

async function handleSyncSystemUpdates(payload, res) {
  if (!requireAdmin(payload.authUser)) return error(res, 'Unauthorized', 403);
  const rows = await getOrSyncSystemUpdates(true);
  return success(res, { success: true, count: rows.length, data: rows });
}

async function handleSyncBackground(payload, res) {
  const authUser = payload.authUser || {};
  const username = authUser.username;
  const role = authUser.role || 'Photographer';
  if (!username) return error(res, 'User required');

  let endpoint = 'projects?select=*&order=created_at.desc';
  if (role !== 'Admin') {
    endpoint = `projects?Owner=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc`;
  }

  let users = null;
  let projectsRows = null;
  let feedbacks = null;
  let systemUpdates = null;

  try {
    const results = await Promise.all([
      supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}&select=*`),
      supabaseQuery(endpoint),
      supabaseQuery(`feedbacks?${role === 'Admin' ? '' : `Username=eq.${encodeURIComponent(username)}&`}Status${role === 'Admin' ? 'Admin' : 'User'}=eq.Unread&select=id`),
      supabaseQuery('system_updates?Status=eq.Active&select=id&order=created_at.desc&limit=1')
    ]);
    users = results[0];
    projectsRows = results[1];
    feedbacks = results[2];
    systemUpdates = results[3];
  } catch (e) {
    projectsRows = await supabaseQuery(endpoint).catch(() => []);
  }

  const formatted = (projectsRows || []).map(p => {
    let dp = p['Daftar Pilihan'] || p.DaftarPilihan || p.daftar_pilihan || [];
    if (typeof dp === 'string') {
      try { dp = JSON.parse(dp); } catch (e) { dp = dp.split(',').map(s => s.trim()).filter(Boolean); }
    }
    let nt = p.Notes || p.notes || {};
    if (typeof nt === 'string') {
      try { nt = JSON.parse(nt); } catch (e) { }
    }
    let kat = p.Kategori || p.kategori || p.categories || [];
    if (typeof kat === 'string') {
      try { kat = JSON.parse(kat); } catch (e) { }
    }

    const token = p.Token || p.ID;
    const shortSlug = p['Short Slug'] || p.Slug || token;
    const clientName = p['Nama Client'] || p.NamaClient || 'Client';
    const nomorWA = p['Nomor WA'] || p.NomorWA || '';
    const passClient = p['Password Client'] || p.PasswordClient || '';
    const maxFoto = parseProjectMaxFoto(p['Max Foto'], p.MaxFoto);
    const driveLink = p['Drive Link'] || p.DriveLink || '';
    const dibuatPada = p['Dibuat Pada'] || p.created_at || new Date().toISOString();
    const lastUpdate = p['Last Update'] || p.LastUpdate || p.last_update || p.updated_at || dibuatPada;
    const statusClient = p['Status Client'] || p.Status || 'Belum Memilih';
    const fotoTerpilih = Number(p['Foto Terpilih']) || 0;
    const shortLink = p['Short Link'] || `https://ps.kamacreative.my.id/app?c=${shortSlug}`;
    const paymentProof = p['Payment Proof'] || p.PaymentProof || '';

    return {
      ID: p.id || p.ID || token,
      Token: token,
      'Short Slug': shortSlug,
      ShortSlug: shortSlug,
      Slug: shortSlug,
      'Nama Client': clientName,
      NamaClient: clientName,
      'Nomor WA': nomorWA,
      NomorWA: nomorWA,
      'Password Client': passClient,
      PasswordClient: passClient,
      'Max Foto': maxFoto,
      MaxFoto: maxFoto,
      'Drive Link': driveLink,
      DriveLink: driveLink,
      Owner: p.Owner || 'admin',
      'Short Link': shortLink,
      ShortLink: shortLink,
      Kategori: kat,
      UseWatermark: String(p.UseWatermark).toUpperCase() === 'TRUE',
      UseWatermarkTiled: String(p.UseWatermarkTiled).toUpperCase() === 'TRUE',
      ClientLayout: p.ClientLayout || 'masonry',
      ExtraPrice: Number(p.ExtraPrice) || 0,
      MusicUrl: p.MusicUrl || p.MusicURL || '',
      MusicURL: p.MusicUrl || p.MusicURL || '',
      AksesPilih: String(p.AksesPilih || p.Akses_Pilih).toUpperCase() !== 'FALSE',
      AksesDownload: String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE',
      'Akses_Pilih': String(p.AksesPilih || p.Akses_Pilih).toUpperCase() !== 'FALSE',
      'Akses_Download': String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE',
      DurasiPilih: p.DurasiPilih || p.Durasi_Pilih || 'Selamanya',
      DurasiDownload: p.DurasiDownload || p.Durasi_Download || 'Selamanya',
      'Durasi_Pilih': p.DurasiPilih || p.Durasi_Pilih || 'Selamanya',
      'Durasi_Download': p.DurasiDownload || p.Durasi_Download || 'Selamanya',
      Deadline: p.Deadline || '',
      Status: statusClient,
      'Status Client': statusClient,
      StatusClient: statusClient,
      'Foto Terpilih': fotoTerpilih,
      FotoTerpilih: fotoTerpilih,
      'Daftar Pilihan': dp,
      DaftarPilihan: dp,
      Notes: nt,
      'Payment Proof': paymentProof,
      PaymentProof: paymentProof,
      'Dibuat Pada': dibuatPada,
      TanggalDibuat: dibuatPada,
      'Last Update': lastUpdate,
      LastUpdate: lastUpdate,
      last_update: lastUpdate,
      updated_at: lastUpdate
    };
  });

  const u = (users && users.length > 0) ? users[0] : null;
  const rawPaket = u ? (u.Paket || '') : '';
  let proStatus = { isPro: false, isLifetime: false, expiresAt: null };
  if (u) {
    proStatus = await getUserProEntitlement(u.Username);
  }
  const isPro = proStatus.isPro;

  let projCreatedCount = u ? (Number(u.ProjectCreated) || 0) : 0;
  if (u && isDemoUser(u) && projCreatedCount === 0 && projectsRows && projectsRows.length > 0) {
    projCreatedCount = projectsRows.length;
    supabaseQuery(`users?Username=ilike.${encodeURIComponent(u.Username)}`, {
      method: 'PATCH',
      body: { ProjectCreated: String(projCreatedCount) }
    }).catch(() => {});
  }

  const userData = u ? {
    success: true,
    username: u.Username,
    nama: u.Nama || u.Username,
    role: u.Role || 'Photographer',
    status: u.Status || 'Active',
    brandName: u.BrandName || 'Photo Selection',
    brandLogo: u.BrandLogo || '',
    watermarkUrl: u.WatermarkUrl || '',
    bankName: u.BankName || '',
    bankAccount: u.BankAccount || '',
    bankAccountName: u.BankAccountName || '',
    email: u.Email || '',
    nohp: u['No HP'] || '',
    paket: rawPaket || '1 Bulan',
    expiredAt: u.ExpiredAt || 'Lifetime',
    projectCreated: projCreatedCount,
    ProjectCreated: projCreatedCount,
    isPremiumAddon: isPro,
    isProLifetime: proStatus.isLifetime,
    proExpiredAt: proStatus.expiresAt ? proStatus.expiresAt.substring(0, 10) : (proStatus.isLifetime ? 'Lifetime' : null),
    proIsActive: isPro
  } : null;

  return success(res, {
    success: true,
    userData: userData,
    projects: { success: true, data: formatted },
    notifStats: {
      success: true,
      count: feedbacks ? feedbacks.length : 0,
      latestSystemUpdateId: (systemUpdates && systemUpdates.length > 0) ? systemUpdates[0].id : null
    }
  });
}

async function handleMayarWebhook(payload, req, res) {
  const auth = verifyWebhookAuthenticity(req);
  if (!auth.configured) {
    return error(res, 'Webhook authentication is not configured.', 503);
  }
  if (!auth.valid) {
    return error(res, 'Unauthorized webhook request', 401);
  }

  const rawEvent = String(payload.event || '').trim();
  if (!rawEvent) {
    return error(res, 'Webhook event is required', 400);
  }
  const event = rawEvent;

  const d = payload.data || payload || {};
  const customer = d.customer || payload.customer || {};

  // Ekstraksi data customer yang fleksibel (mendukung berbagai format payload Mayar)
  const email = (customer.email || d.customerEmail || d.email || '').trim().toLowerCase();
  const mobile = (customer.mobile || customer.phone || d.customerMobile || d.mobile || d.phone || '').trim();
  const name = (customer.name || d.customerName || d.name || '').trim();
  const rawProductName = d.productName || d.description || d.title || (d.product && d.product.name) || '';
  const productUpper = rawProductName.toUpperCase();

  // Handle New Membership event safely (no Photo Selection mutation)
  if (isNewMembershipEvent(rawEvent)) {
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: rawEvent,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName || 'Membership',
        'Hasil Aktivasi': `Membership event dicatat (${rawEvent}) - Tanpa aktivasi Photo Selection`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, {
      success: true,
      status: 'acknowledged',
      result: `New membership event logged without payment mutation: ${rawEvent}`
    });
  }

  if (!isConfirmedPaymentSuccess(rawEvent, d, payload)) {
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: rawEvent,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName || 'Non-success event',
        'Hasil Aktivasi': `Event diabaikan (bukan pembayaran sukses: event=${rawEvent}, status=${d.status || payload.status || 'none'})`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, { success: true, status: 'ignored', result: `Webhook event acknowledged without mutation: ${rawEvent}` });
  }

  // 1. Validasi Identitas Transaksi Wajib (F3 Fix)
  // Webhook event tanpa stable transaction ID DILARANG mengaktifkan akun secara otomatis
  const transactionId = extractMayarTransactionId(d, payload);
  if (!transactionId) {
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName,
        'Hasil Aktivasi': 'MANUAL_REVIEW_REQUIRED: Missing stable transaction ID',
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return error(res, 'Missing stable transaction ID. Payment cannot be verified for automatic activation.', 422);
  }

  // 2. Klasifikasi Produk Eksplisit (F5 Fix)
  // Menolak produk non-Photo-Selection seperti "Paket 1 Bulan Kursus Editing" atau "Canva Pro 1 Bulan"
  const productInfo = classifyMayarProduct(rawProductName);
  const isPhotoSelection = productInfo.isPhotoSelection;

  // Helper ekstraksi kode referral dari Mayar
  function extractMayarRefCode(payloadData, userObj = null) {
    if (userObj && userObj.ConfirmToken && userObj.ConfirmToken.includes('REF:')) {
      const parts = userObj.ConfirmToken.split('REF:');
      if (parts[1]) return parts[1].split('|')[0].trim().toUpperCase();
    }
    if (payloadData.couponUsed) {
      return String(payloadData.couponUsed).trim().toUpperCase();
    }
    const combinedNotes = `${payloadData.notes || ''} ${payloadData.description || ''} ${payloadData.customField || ''} ${payloadData.extra || ''}`;
    const match = combinedNotes.toUpperCase().match(/REF[:=\s]+([A-Z0-9_\-]+)/);
    if (match && match[1]) {
      return match[1].trim().toUpperCase();
    }
    return 'DIRECT';
  }

  // ============================================================
  // KASUS A: PRODUK BUKAN PHOTO SELECTION (KURSUS, CANVA, DLL)
  // ============================================================
  if (!isPhotoSelection) {
    const userRefCode = extractMayarRefCode(d, null);
    const paidAmount = Number(d.amount || d.netAmount || 0);
    const qty = Number(d.qty || 1);

    // Catat log transaksi langsung ke Supabase tanpa mutasi akun fotografer
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName,
        'Hasil Aktivasi': `[TX:${transactionId}] Transaksi dicatat (${rawProductName}) - Ref: ${userRefCode} - Rp ${paidAmount} (Qty: ${qty}) - Tanpa aktivasi Photo Selection`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    });

    return success(res, { success: true, status: 'processed', result: `Store sale tracked without subscription mutation: ${rawProductName}` });
  }

  // ============================================================
  // KASUS B: PRODUK PHOTO SELECTION (IDEMPOTENSI ATOMIK + AKTIVASI)
  // ============================================================

  // Normalisasi Nomor HP
  function normalizePhone(phoneStr) {
    if (!phoneStr) return '';
    let num = String(phoneStr).replace(/[^0-9]/g, '');
    if (num.startsWith('62')) num = num.substring(2);
    else if (num.startsWith('0')) num = num.substring(1);
    return num;
  }

  const cleanIncomingPhone = normalizePhone(mobile);

  // 3. Cek Idempotensi Pembayaran (F2 Fix: TIDAK PERNAH menelan error dengan .catch(() => []))
  try {
    const existingLedger = await supabaseQuery(`processed_payments?payment_id=eq.${encodeURIComponent(transactionId)}&select=payment_id,status`);
    if (existingLedger && existingLedger.length > 0) {
      const st = existingLedger[0].status;
      if (st === 'SUCCESS' || st === 'STORE_SALE' || st === 'HISTORICAL_SETTLED' || st === 'ALREADY_PROCESSED_LEGACY') {
        return success(res, {
          success: true,
          status: 'already_processed',
          result: `Payment ${transactionId} already processed (idempotent duplicate skipped)`
        });
      }
      if (st === 'MANUAL_RECONCILIATION_REQUIRED') {
        return success(res, {
          success: false,
          status: 'manual_reconciliation_needed',
          code: 'MANUAL_RECONCILIATION_REQUIRED',
          result: `Payment ${transactionId} requires manual reconciliation and was not auto-processed`
        });
      }
    }
  } catch (ledgerCheckErr) {
    const msg = String(ledgerCheckErr.message || '');
    if (!msg.includes('404') && !msg.includes('relation "public.processed_payments" does not exist') && !msg.includes('does not exist')) {
      throw ledgerCheckErr; // Lempar jika error koneksi / DB asli
    }
  }


  if (productInfo.isUnverifiedProduct) {
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName,
        'Hasil Aktivasi': `[TX:${transactionId}] MANUAL_RECONCILIATION_REQUIRED - Unverified product catalog: ${rawProductName}`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, {
      success: true,
      status: 'manual_reconciliation_needed',
      code: 'UNVERIFIED_PRODUCT_CATALOG',
      result: `Unverified product catalog: ${rawProductName}. Held for manual reconciliation.`
    });
  }

  const paketName = productInfo.paketName || '1 Bulan';
  const addDays = typeof productInfo.addDays === 'number' ? productInfo.addDays : 30;
  const isProAddon = Boolean(productInfo.isProAddon);

  // Validate Currency (Mayar operates in IDR)
  const rawCurrency = String(d.currency || payload.currency || 'IDR').trim().toUpperCase();
  if (rawCurrency !== 'IDR') {
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName || paketName,
        'Hasil Aktivasi': `[TX:${transactionId}] MANUAL_RECONCILIATION_REQUIRED - Mata uang tidak didukung: ${rawCurrency}`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, {
      success: true,
      status: 'manual_reconciliation_needed',
      code: 'INVALID_CURRENCY',
      result: `Unsupported currency: ${rawCurrency}. Held for manual reconciliation.`
    });
  }

  // Validate Payment Amount: Provider amount cannot be fabricated or assumed
  const rawAmountVal = d.amount !== undefined ? d.amount : (d.netAmount !== undefined ? d.netAmount : (payload.amount !== undefined ? payload.amount : undefined));
  const hasRawAmount = (rawAmountVal !== undefined && rawAmountVal !== null && String(rawAmountVal).trim() !== '');
  const parsedAmount = hasRawAmount ? Number(rawAmountVal) : NaN;

  if (!hasRawAmount || isNaN(parsedAmount) || parsedAmount < 0) {
    const reasonMsg = !hasRawAmount
      ? 'Missing payment amount from provider'
      : 'Invalid payment amount';

    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName || paketName,
        'Hasil Aktivasi': `[TX:${transactionId}] MANUAL_RECONCILIATION_REQUIRED - ${reasonMsg} (${rawAmountVal})`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, {
      success: true,
      status: 'manual_reconciliation_needed',
      code: 'INVALID_PAYMENT_AMOUNT',
      result: `${reasonMsg}. Held for manual reconciliation without mutating account.`
    });
  }

  // Check if coupon, voucher, promotion, or discount was applied and verified by Mayar
  const rawCoupon = d.couponUsed || d.coupon || payload.couponUsed || payload.coupon || d.promoCode || payload.promoCode || d.voucher || payload.voucher || '';
  const couponCode = (typeof rawCoupon === 'string' ? rawCoupon : (rawCoupon && rawCoupon.code ? rawCoupon.code : '')).trim();
  const rawDiscount = d.discount !== undefined ? d.discount : (payload.discount !== undefined ? payload.discount : (d.discountAmount !== undefined ? d.discountAmount : 0));
  const hasDiscountValue = Number(rawDiscount) > 0 || Boolean(d.isDiscount || payload.isDiscount);
  const isFreeCheckout = Boolean(d.isFree || payload.isFree || d.freeProduct || payload.freeProduct);
  const isVerifiedCoupon = Boolean(couponCode || hasDiscountValue || isFreeCheckout);

  // If amount is zero and there is NO verified coupon/promo, reject as unverified zero payment
  if (parsedAmount === 0 && !isVerifiedCoupon) {
    const reasonMsg = 'Zero payment amount without verified promotion';
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName || paketName,
        'Hasil Aktivasi': `[TX:${transactionId}] MANUAL_RECONCILIATION_REQUIRED - ${reasonMsg} (${rawAmountVal})`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, {
      success: true,
      status: 'manual_reconciliation_needed',
      code: 'INVALID_PAYMENT_AMOUNT',
      result: `${reasonMsg}. Held for manual reconciliation without mutating account.`
    });
  }

  // Exact verified price match check:
  // If no verified coupon is present, ensure standard price match to prevent arbitrary positive amounts (e.g. IDR 1)
  if (!isVerifiedCoupon && productInfo.standardPrice && parsedAmount !== productInfo.standardPrice) {
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName || paketName,
        'Hasil Aktivasi': `[TX:${transactionId}] MANUAL_RECONCILIATION_REQUIRED - Price mismatch: expected ${productInfo.standardPrice}, received ${parsedAmount}`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, {
      success: true,
      status: 'manual_reconciliation_needed',
      code: 'PRICE_MISMATCH_RECONCILIATION',
      result: `Payment amount (${parsedAmount} IDR) does not match catalog price (${productInfo.standardPrice} IDR). Held for manual reconciliation.`
    });
  }

  const paidAmount = parsedAmount;

  // Extract explicit @username hint from notes / description / customField if available
  let explicitUsernameHint = null;
  const combinedNotes = `${d.notes || ''} ${d.description || ''} ${d.customField || ''} ${d.extra || ''}`;
  const userMatch = combinedNotes.match(/@([a-zA-Z0-9_\-\.]+)/);
  if (userMatch && userMatch[1]) {
    explicitUsernameHint = userMatch[1].trim();
  }


  // Generate secure candidate credentials for atomic new-account creation inside the database transaction
  let temporaryPassword = '';
  let candidateUsername = null;
  let passHash = null;

  if (email && !isProAddon) {
    const baseClean = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'photographer';
    candidateUsername = `${baseClean}_${crypto.randomBytes(3).toString('hex')}`;
    temporaryPassword = 'Kama-' + crypto.randomBytes(6).toString('base64url');
    passHash = createPasswordHash(temporaryPassword);
  }

  // 4. ATOMIC RPC EXECUTION (STRICT FAIL-CLOSED — ZERO REST MUTATION FALLBACK)
  // Per Phase 4.7.5 Blocker Resolution: All financial activations and account creations
  // MUST execute atomically inside process_mayar_payment. If the RPC is unavailable,
  // the handler fails closed with HTTP 500 so Mayar can retry safely without double-extension.
  let rpcResponse = null;
  try {
    rpcResponse = await supabaseQuery('rpc/process_mayar_payment', {
      method: 'POST',
      body: {
        p_payment_id: transactionId,
        p_email: email,
        p_phone: mobile,
        p_username_hint: explicitUsernameHint,
        p_product_name: rawProductName,
        p_is_pro_addon: isProAddon,
        p_add_days: addDays,
        p_plan_name: paketName,
        p_amount: paidAmount,
        p_currency: 'IDR',
        p_create_new_user: Boolean(email && !isProAddon),
        p_new_username: candidateUsername,
        p_new_password_hash: passHash,
        p_customer_name: name || (email ? email.split('@')[0] : 'Photographer')
      }
    });
  } catch (rpcErr) {
    console.error('[MAYAR_WEBHOOK] Atomic RPC execution failed or unavailable:', rpcErr);
    // FAIL CLOSED: Do NOT perform non-atomic REST fallback!
    return error(res, 'Payment processing engine unavailable. Transaction deferred for retry.', 500);
  }

  if (!rpcResponse || typeof rpcResponse !== 'object') {
    return error(res, 'Unexpected response from atomic payment processing engine.', 500);
  }

  // Handle idempotent duplicate delivery
  if (rpcResponse.status === 'already_processed') {
    return success(res, {
      success: true,
      status: 'already_processed',
      result: rpcResponse.message || `Payment ${transactionId} already processed (idempotent duplicate skipped)`
    });
  }

  // Handle manual reconciliation required (ambiguous identity / duplicate conflict / incomplete data)
  if (rpcResponse.status === 'manual_reconciliation_needed') {
    const reconMsg = rpcResponse.message || 'Payment held for manual reconciliation; no user mutated.';
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName || paketName,
        'Hasil Aktivasi': `[TX:${transactionId}] MANUAL_RECONCILIATION_REQUIRED - ${reconMsg}`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, {
      success: true,
      status: 'manual_reconciliation_needed',
      code: rpcResponse.code,
      result: reconMsg
    });
  }

  // If status is not processed, fail closed
  if (rpcResponse.status !== 'processed') {
    return error(res, rpcResponse.message || 'Payment could not be processed atomically.', 500);
  }

  // At this point, PostgreSQL has atomically committed the mutation and ledger!
  const userActivatedName = rpcResponse.account_name || name || 'Photographer';
  const userActivatedUsername = rpcResponse.account_username || '';
  const userActivatedEmail = rpcResponse.account_email || email;
  const userActivatedPhone = rpcResponse.account_phone || mobile;
  const expiredAt = rpcResponse.expired_at || 'Active';
  const hasilAktivasi = rpcResponse.result_message || `Aktivasi berhasil untuk @${userActivatedUsername}`;
  const isNewUser = (rpcResponse.action_type === 'NEW_USER_CREATED');

  // 5. Catat log mayar_logs (Audit trail)
  const txPrefix = `[TX:${transactionId}] `;
  const finalLogHasil = `${txPrefix}SUKSES - ${hasilAktivasi}`;

  await supabaseQuery('mayar_logs', {
    method: 'POST',
    body: {
      Event: event,
      'Customer Email': email,
      'Customer Name': name,
      'Status/Product': rawProductName || paketName,
      'Hasil Aktivasi': finalLogHasil,
      'Raw JSON Payload': JSON.stringify(payload),
      Timestamp: new Date().toISOString()
    }
  }).catch(() => { });

  // 6. Side Effects: Meta CAPI & Email
  const purEventId = 'pur_' + transactionId;
  sendMetaCAPIEvent('Purchase', {
    eventId: purEventId,
    email: userActivatedEmail,
    phone: userActivatedPhone,
    customData: {
      content_name: rawProductName || paketName,
      value: paidAmount,
      currency: 'IDR'
    }
  }).catch(() => { });

  // Fix C: Await GAS email delivery to prevent Vercel Serverless early process freeze.
  // If email fails or times out, account is already safely Active in DB.
  // The customer can recover immediately via 'Lupa Password' (requestOTP) workflow.
  if (userActivatedEmail) {
    try {
      await sendEmailViaGAS({
        to: userActivatedEmail,
        subject: `Pembayaran Diterima - Akun Photo Selection Anda Telah Aktif!`,
        htmlBody: buildPhotographerActivatedEmail({
          nama: userActivatedName,
          username: userActivatedUsername,
          email: userActivatedEmail,
          paket: paketName,
          expiredAt: expiredAt,
          tempPassword: isNewUser ? temporaryPassword : undefined
        })
      });
    } catch (mailErr) {
      console.error('[MAILER] Gagal mengirim email aktivasi Mayar ke fotografer (user dapat login/reset via OTP):', mailErr);
    }
  }

  try {
    await sendEmailViaGAS({
      to: ADMIN_EMAIL,
      subject: `Pembayaran Mayar Diterima: ${userActivatedName} (@${userActivatedUsername}) - ${paketName}`,
      htmlBody: buildAdminPaymentSuccessEmail({
        nama: userActivatedName,
        username: userActivatedUsername,
        email: userActivatedEmail,
        nohp: userActivatedPhone,
        paket: paketName,
        amount: paidAmount,
        expiredAt: expiredAt
      })
    });
  } catch (adminMailErr) {
    console.error('[MAILER] Gagal mengirim email notifikasi pembayaran ke Admin:', adminMailErr);
  }

  return success(res, { success: true, status: 'processed', result: hasilAktivasi });
}


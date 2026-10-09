/**
 * API Handler Backend Berbasis Supabase (PostgreSQL)
 * Lengkap dengan 100% Dukungan Seluruh Fitur & Menu Aplikasi Photo Selection
 */

const crypto = require('crypto');
const { URL } = require('url');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jqptagcbkyxxqqmxqusf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_TL_Et1x8IlEwxKASjF0K8Q_t72R3f_9';
const LEGACY_KAMA_SALT = "KamaSecretSalt";
const GAS_MAILER_URL = process.env.GAS_MAILER_URL || 'https://script.google.com/macros/s/AKfycbwzw3k--HOqHS0As2PCrz6m7c3VKqKlifdJVrb9Cy15ScvmHNB5lFFDNTRR5xfmzf4/exec';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'kamabalicreative@gmail.com';
const APP_URL = process.env.APP_URL || 'https://ps.kamacreative.my.id';

async function supabaseQuery(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
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

async function sendEmailViaGAS({ to, subject, htmlBody, textBody }) {
  const mailerUrl = process.env.GAS_MAILER_URL || GAS_MAILER_URL;
  if (!mailerUrl) {
    console.warn('[MAILER] GAS_MAILER_URL belum diatur di Environment Variables. Email tidak dapat dikirim.');
    return false;
  }
  try {
    const res = await fetch(mailerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  return sendJSON(res, statusCode, { status: 'error', message: message, data: data });
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
    rawUser: u
  };
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
  'processPayment',
  'getDashboardStats',
  'submitFeedback',
  'getFeedbacks',
  'replyFeedback',
  'getAllNotifications',
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
  'replyFeedback'
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

  let queryToken = '';
  if (req && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      queryToken = parsedUrl.searchParams.get('token') || '';
    } catch (e) { }
  }

  queryToken = String(queryToken || '').trim();
  if (!queryToken) {
    return { configured: true, valid: false };
  }

  const secretBuf = Buffer.from(configuredSecret);
  const tokenBuf = Buffer.from(queryToken);

  if (secretBuf.length !== tokenBuf.length) {
    return { configured: true, valid: false };
  }

  const isMatch = crypto.timingSafeEqual(secretBuf, tokenBuf);
  return { configured: true, valid: isMatch };
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
    'payment.pending'
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

  if (rawStatus && nonSuccessStatuses.has(rawStatus)) {
    return false;
  }

  if (rawStatus) {
    const successStatuses = new Set(['PAID', 'SUCCESS', 'SETTLED', 'COMPLETED']);
    if (!successStatuses.has(rawStatus)) {
      return false;
    }
  }

  return true;
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
    'https://photo-selector.vercel.app'
  ]);

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

  if (validatedOrigin && allowedOrigins.has(validatedOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', validatedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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
      try { payload = JSON.parse(payload); } catch (e) { }
    }
    payload = payload || {};

    let isWebhookRequest = false;
    if (payload.action === 'mayarWebhook') {
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

    const action = payload.action;
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
      case 'updateProjectMaxFoto': return await handleUpdateProjectMaxFoto(payload, res);
      case 'processPayment': return await handleProcessPayment(payload, res);
      case 'getDashboardStats': return await handleGetDashboardStats(payload, res);
      case 'logVisit': return await handleLogVisit(payload, res);
      case 'getDriveContent': return await handleGetDriveContent(payload, res);
      case 'getPhotos': return await handleGetDriveContent(payload, res);
      case 'getAudioData': return await handleGetAudioData(payload, res);
      case 'submitFeedback': return await handleSubmitFeedback(payload, res);
      case 'getFeedbacks': return await handleGetFeedbacks(payload, res);
      case 'replyFeedback': return await handleReplyFeedback(payload, res);
      case 'getAllNotifications': return await handleGetAllNotifications(payload, res);
      case 'markFeedbackRead': return await handleMarkFeedbackRead(payload, res);
      case 'getSystemUpdates': return await handleGetSystemUpdates(payload, res);
      case 'syncBackground': return await handleSyncBackground(payload, res);
      default: return error(res, `Unknown action: ${action}`, 404);
    }
  } catch (err) {
    console.error('Supabase API Handler Error:', err);
    return error(res, 'Terjadi kesalahan pada server.', 500);
  }
}

module.exports = handler;
module.exports.parseAndValidateOrigin = parseAndValidateOrigin;
module.exports.getAllowedOrigins = getAllowedOrigins;
module.exports.handleCors = handleCors;

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

  const rawPaket = u.Paket || '';
  const isPro = Boolean(String(u.Akses_Watermark).toUpperCase() === 'TRUE' || rawPaket.toUpperCase().includes('PRO') || rawPaket.toUpperCase().includes('LIFETIME'));

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
    email: u.Email || '',
    nohp: u['No HP'] || '',
    paket: rawPaket || '1 Bulan',
    expiredAt: u.ExpiredAt || 'Lifetime',
    isPremiumAddon: isPro,
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
  const VALID_PAKETS = new Set(['1 Bulan', '6 Bulan', '1 Tahun', 'Lifetime', 'Demo', 'Demo 7 Hari', 'Free']);
  if (!VALID_PAKETS.has(paket)) return error(res, 'Pilihan paket tidak valid.');
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

  let expiredAt = 'Lifetime';
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

  // Kirim email notifikasi ke Admin (kamabalicreative@gmail.com)
  sendEmailViaGAS({
    to: ADMIN_EMAIL,
    subject: `Pendaftaran Fotografer Baru - Photo Selection (${nama})`,
    htmlBody: buildAdminNewUserEmail({
      nama: nama,
      username: username,
      email: email,
      nohp: nohp,
      paket: paket,
      status: initialStatus
    })
  }).catch(e => console.error('[MAILER] Error kirim email ke Admin:', e));

  // Kirim email notifikasi ke Fotografer pendaftar
  sendEmailViaGAS({
    to: email,
    subject: `Pendaftaran Akun Berhasil - Photo Selection`,
    htmlBody: buildPhotographerWelcomeEmail({
      nama: nama,
      username: username,
      email: email,
      paket: paket,
      status: initialStatus,
      paymentUrl: paymentUrl
    })
  }).catch(e => console.error('[MAILER] Error kirim email ke Fotografer:', e));

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
  const brandName = cleanPlainString(payload.brandName || '', false);
  const brandLogo = (payload.brandLogo || '').trim();
  const watermarkUrl = (payload.watermarkUrl || '').trim();

  if (!username) return error(res, 'Username required');
  if (brandName.length > 100) return error(res, 'Nama brand maksimal 100 karakter.');

  if (brandLogo && !isSafeImageReference(brandLogo, 2 * 1024 * 1024)) {
    return error(res, 'Format URL atau data gambar logo brand tidak valid.');
  }
  if (watermarkUrl && !isSafeImageReference(watermarkUrl, 2 * 1024 * 1024)) {
    return error(res, 'Format URL atau data gambar watermark tidak valid.');
  }

  const updateBody = { BrandName: brandName, BrandLogo: brandLogo };
  if (watermarkUrl !== undefined) updateBody.WatermarkUrl = watermarkUrl;

  await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true, brandName, brandLogo, message: 'Settings saved' });
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
      const rawPaket = u.Paket || '';
      const isPro = Boolean(String(u.Akses_Watermark).toUpperCase() === 'TRUE' || rawPaket.toUpperCase().includes('PRO') || rawPaket.toUpperCase().includes('LIFETIME'));

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
        email: u.Email || '',
        nohp: u['No HP'] || '',
        paket: rawPaket || '1 Bulan',
        expiredAt: u.ExpiredAt || 'Lifetime',
        isPremiumAddon: isPro
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
    let dp = p['Daftar Pilihan'] || [];
    if (typeof dp === 'string') {
      try { dp = JSON.parse(dp); } catch (e) { dp = dp.split(',').map(s => s.trim()).filter(Boolean); }
    }
    let nt = p.Notes || {};
    if (typeof nt === 'string') {
      try { nt = JSON.parse(nt); } catch (e) { }
    }
    let kat = p.Kategori || [];
    if (typeof kat === 'string') {
      try { kat = JSON.parse(kat); } catch (e) { }
    }

    const token = p.Token || p.ID;
    const shortSlug = p['Short Slug'] || p.Slug || token;
    const clientName = p['Nama Client'] || p.NamaClient || 'Client';
    const nomorWA = p['Nomor WA'] || p.NomorWA || '';
    const passClient = p['Password Client'] || p.PasswordClient || '';
    const maxFoto = Number(p['Max Foto']) || Number(p.MaxFoto) || 50;
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

  return success(res, { success: true, data: formatted });
}

async function handleCreateProject(payload, res) {
  const d = payload.formData || payload.data || payload || {};
  const authUser = payload.authUser || {};
  const username = String(authUser.username || '').trim();
  if (!username) {
    return error(res, 'Sesi tidak valid atau telah berakhir. Silakan login kembali.', 401);
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
  if (musicUrl && !isSafeHttpsUrl(musicUrl)) {
    return error(res, 'Music URL harus berupa link HTTPS yang valid.');
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

async function verifyClientGallerySession(clientAccessToken, project) {
  if (!clientAccessToken || typeof clientAccessToken !== 'string') return null;
  const token = clientAccessToken.trim();
  if (!token) return null;

  const stableId = getStableProjectId(project);
  if (!stableId) return null;

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
    return null;
  }

  return s;
}

function buildAuthorizedProjectData(p, ownerBrand, clientAccessToken) {
  let dp = p['Daftar Pilihan'] || [];
  if (typeof dp === 'string') {
    try { dp = JSON.parse(dp); } catch (e) { dp = dp.split(',').map(s => s.trim()).filter(Boolean); }
  }

  let nt = p.Notes || {};
  if (typeof nt === 'string') {
    try { nt = JSON.parse(nt); } catch (e) { }
  }

  let kat = p.Kategori || [];
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
    maxFoto: Number(p['Max Foto']) || 50,
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
    isPremiumAddon: ownerBrand.isPremiumAddon
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
    isPremiumAddon: false
  };

  if (ownerName) {
    try {
      const owners = await supabaseQuery(`users?Username=eq.${encodeURIComponent(ownerName)}&select=*`);
      if (owners && owners.length > 0) {
        const o = owners[0];
        ownerBrand = {
          brandName: o.BrandName || 'Photo Selection',
          brandLogo: o.BrandLogo || '',
          watermarkUrl: o.WatermarkUrl || '',
          bankName: o.BankName || '',
          bankAccount: o.BankAccount || '',
          bankAccountName: o.BankAccountName || '',
          isPremiumAddon: Boolean(String(o.Akses_Watermark).toUpperCase() === 'TRUE')
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
  const publicData = {
    token: p.Token,
    slug: p['Short Slug'] || p.Slug || p.Token,
    namaClient: p['Nama Client'] || '',
    name: p['Nama Client'] || '',
    hasPassword: true,
    needsPassword: true,
    accessGranted: false,
    brandName: ownerBrand.brandName,
    brandLogo: ownerBrand.brandLogo
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
    isPremiumAddon: false
  };

  if (ownerName) {
    try {
      const owners = await supabaseQuery(`users?Username=eq.${encodeURIComponent(ownerName)}&select=*`);
      if (owners && owners.length > 0) {
        const o = owners[0];
        ownerBrand = {
          brandName: o.BrandName || 'Photo Selection',
          brandLogo: o.BrandLogo || '',
          watermarkUrl: o.WatermarkUrl || '',
          bankName: o.BankName || '',
          bankAccount: o.BankAccount || '',
          bankAccountName: o.BankAccountName || '',
          isPremiumAddon: Boolean(String(o.Akses_Watermark).toUpperCase() === 'TRUE')
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
  let currentMax = Number(project['Max Foto']) || Number(project.MaxFoto) || 50;
  let isDownloadActive = String(project.AksesDownload || project.Akses_Download).toUpperCase() !== 'FALSE';

  const ALLOWED_CLIENT_STATUSES = new Set([
    'Belum Memilih',
    'Sedang Memilih',
    'Dalam Proses',
    'Selesai',
    'Menunggu Konfirmasi Pembayaran'
  ]);
  if (payload.status !== undefined) {
    if (typeof payload.status !== 'string' || !ALLOWED_CLIENT_STATUSES.has(payload.status.trim())) {
      return error(res, 'Status client tidak valid.', 400);
    }
  }

  const isAlreadyDone = (curStatus === 'Selesai' || curStatus === 'Menunggu Konfirmasi Pembayaran');
  const isIncomingDraft = (payload.status === 'Sedang Memilih' || payload.status === 'Dalam Proses' || payload.status === 'Belum Memilih');

  if (isAlreadyDone && isIncomingDraft) {
    // Tetap pertahankan status Selesai, jangan ditimpa status draft/heartbeat
  } else if (payload.status) {
    const cleanStatus = payload.status.trim();
    updateBody.Status = cleanStatus;
    updateBody['Status Client'] = cleanStatus;
    currentStatus = cleanStatus;
  }

  if (payload.selectedCount !== undefined || payload.fotoTerpilih !== undefined) {
    const rawCount = payload.selectedCount !== undefined ? payload.selectedCount : payload.fotoTerpilih;
    const countNum = Number(rawCount);
    if (!Number.isInteger(countNum) || countNum < 0 || countNum > 10000) {
      return error(res, 'Jumlah foto terpilih tidak valid (harus bilangan bulat 0 - 10000).', 400);
    }
    updateBody['Foto Terpilih'] = String(countNum);
  }

  if (payload.selectedFiles !== undefined || payload.daftarPilihan !== undefined) {
    let files = payload.selectedFiles !== undefined ? payload.selectedFiles : payload.daftarPilihan;
    if (typeof files === 'string') {
      try { files = JSON.parse(files); } catch (_) { return error(res, 'Format daftar pilihan tidak valid.', 400); }
    }
    if (!Array.isArray(files)) return error(res, 'Daftar pilihan harus berupa array.', 400);
    if (files.length > 10000) return error(res, 'Daftar pilihan melebihi batas maksimal 10.000 foto.', 400);

    const cleanFiles = [];
    for (const f of files) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        return error(res, 'Item daftar pilihan tidak valid.', 400);
      }
      const rawName = f.name !== undefined && f.name !== null ? f.name : (f.n !== undefined && f.n !== null ? f.n : (f.filename || f.fileName || ''));
      const rawFolder = f.folder !== undefined && f.folder !== null ? f.folder : (f.f !== undefined && f.f !== null ? f.f : '');
      const rawRef = f.url !== undefined && f.url !== null ? f.url : (f.u !== undefined && f.u !== null ? f.u : (f.id !== undefined && f.id !== null ? f.id : ''));
      const rawCat = f.category !== undefined && f.category !== null ? f.category : (f.c !== undefined && f.c !== null ? f.c : (f.kategori !== undefined && f.kategori !== null ? f.kategori : ''));

      const name = cleanPlainString(String(rawName), false);
      const folder = cleanPlainString(String(rawFolder), false);
      const category = cleanPlainString(String(rawCat), false);

      if (name.length > 500) return error(res, 'Nama file dalam daftar pilihan maksimal 500 karakter.', 400);
      if (folder.length > 500) return error(res, 'Nama folder dalam daftar pilihan maksimal 500 karakter.', 400);
      if (category.length > 500) return error(res, 'Nama kategori dalam daftar pilihan maksimal 500 karakter.', 400);

      let cleanRef = '';
      if (rawRef !== undefined && rawRef !== null && String(rawRef).trim() !== '') {
        const refStr = String(rawRef).trim();
        if (refStr.length > 2048) return error(res, 'URL atau ID file foto maksimal 2048 karakter.', 400);
        if (/[\u0000-\u001F\u007F]/.test(refStr)) {
          return error(res, 'URL atau ID file foto mengandung karakter kontrol tidak valid.', 400);
        }
        if (/^[a-zA-Z0-9_-]{10,128}$/.test(refStr)) {
          cleanRef = refStr;
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
    updateBody['Daftar Pilihan'] = JSON.stringify(cleanFiles);
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
  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true, status: currentStatus, maxFoto: currentMax, isDownloadActive: isDownloadActive });
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
  const filter = getProjectMutationFilter(project);

  await supabaseQuery(`projects?${filter}`, {
    method: 'PATCH',
    body: { UseWatermark: String(newVal).toUpperCase() }
  });

  return success(res, { success: true, newValue: newVal, message: 'Watermark berhasil diubah' });
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
        sendEmailViaGAS({
          to: u.Email,
          subject: `Akun Photo Selection Anda Telah Aktif! 🎉`,
          htmlBody: buildPhotographerActivatedEmail({
            nama: u.Nama || u.Username,
            username: u.Username,
            email: u.Email,
            paket: u.Paket || '1 Bulan',
            expiredAt: expiredAt
          })
        }).catch(e => console.error('[MAILER] Error kirim email aktivasi ke user:', e));
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

  await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { ExpiredAt: expiredAt, Paket: paket, Status: 'Active' }
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
  if (!emailOrUser) return error(res, 'Masukkan Username atau Email Anda.');
  if (emailOrUser.length > 254) return error(res, 'Email atau Username tidak terdaftar.');

  let users = await supabaseQuery(`users?Email=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
  if (!users || users.length === 0) {
    users = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
  }
  if (!users || users.length === 0) return error(res, 'Email atau Username tidak terdaftar.');

  const user = users[0];
  const uName = user.Username;
  const userEmail = user.Email;

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
        nama: user.Nama || uName,
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
  const otp = (payload.otp || '').trim();
  const newPassword = (payload.newPassword || '').trim();

  if (!emailOrUser || !otp || !newPassword) return error(res, 'Lengkapi semua isian form.');
  if (emailOrUser.length > 254) return error(res, 'User tidak ditemukan.');
  if (!/^\d{6}$/.test(otp)) return error(res, 'Kode OTP salah atau sudah kedaluwarsa.');
  if (newPassword.length > 128) return error(res, 'Password baru minimal 8 karakter dan maksimal 128 karakter.');

  let users = await supabaseQuery(`users?Email=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
  if (!users || users.length === 0) {
    users = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
  }
  if (!users || users.length === 0) return error(res, 'User tidak ditemukan.');

  const uName = users[0].Username;

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

async function handleGetDriveContent(payload, res) {
  const folderUrlOrId = payload.folder_id || payload.folderId || payload.driveLink || payload.link;
  if (!folderUrlOrId) return error(res, 'ID Folder tidak ditemukan.');

  function extractFolderId(input) {
    if (!input || typeof input !== 'string') return null;
    const str = input.trim();
    if (/[\u0000-\u001F\u007F]/.test(str)) return null;

    if (str.startsWith('http://') || str.startsWith('https://')) {
      if (!isSafeHttpsUrl(str)) return null;
      try {
        const u = new URL(str);
        if (!isAllowedDriveHost(u.hostname)) return null;
        const match = str.match(/[-\w]{25,}/);
        return match ? match[0] : null;
      } catch (_) {
        return null;
      }
    }

    if (/^[a-zA-Z0-9_-]{10,128}$/.test(str)) {
      return str;
    }
    return null;
  }

  const folderId = extractFolderId(folderUrlOrId);
  if (!folderId || !/^[a-zA-Z0-9_-]{10,128}$/.test(folderId)) {
    return error(res, 'Format link/ID Google Drive tidak valid.');
  }

  try {
    const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await fetchRes.text();

    const images = [];
    const folders = [];

    const entryRegex = /<div class="flip-entry"[^>]*id="entry-([^"]+)"[^>]*>(.*?)<div class="flip-entry-title">([^<]+)<\/div>/g;
    let m;
    while ((m = entryRegex.exec(html)) !== null) {
      const id = m[1];
      const block = m[2];
      const name = m[3].trim();
      const isSubFolder = block.includes('/drive/folders/') || block.includes('folder');

      if (isSubFolder) {
        if (!name.startsWith('Selected Photos - ') && name !== 'MP3') {
          folders.push({ id, name });
        }
      } else {
        images.push({
          id: id,
          name: name,
          url: `https://lh3.googleusercontent.com/d/${id}=w1000`
        });
      }
    }

    images.sort((a, b) => a.name.localeCompare(b.name));
    folders.sort((a, b) => a.name.localeCompare(b.name));

    return success(res, {
      success: true,
      images: images,
      folders: folders,
      data: { images, folders }
    });
  } catch (err) {
    console.error('Drive fetch error:', err);
    return error(res, 'Gagal memuat isi Google Drive.', 500);
  }
}

async function handleGetAudioData(payload, res) {
  const musicUrl = (payload.musicUrl || payload.url || '').trim();
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

async function handleGetAllNotifications(payload, res) {
  const authUser = payload.authUser || {};
  let fbEndpoint = 'feedbacks?select=*&order=created_at.desc';
  if (authUser.role !== 'Admin') {
    fbEndpoint = `feedbacks?Username=eq.${encodeURIComponent(authUser.username)}&select=*&order=created_at.desc`;
  }
  const feedbacks = (await supabaseQuery(fbEndpoint)) || [];
  const systemUpdates = (await supabaseQuery('system_updates?Status=eq.Active&select=*&order=created_at.desc')) || [];

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
    await supabaseQuery(`feedbacks?Username=eq.${encodeURIComponent(authUser.username)}&StatusUser=eq.Unread`, { method: 'PATCH', body: { StatusUser: 'Read' } }).catch(() => { });
  }
  return success(res, { success: true, ok: true });
}

async function handleGetSystemUpdates(payload, res) {
  const rows = await supabaseQuery('system_updates?Status=eq.Active&select=*&order=created_at.desc');
  return success(res, { success: true, data: rows || [] });
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
    let dp = p['Daftar Pilihan'] || [];
    if (typeof dp === 'string') {
      try { dp = JSON.parse(dp); } catch (e) { dp = dp.split(',').map(s => s.trim()).filter(Boolean); }
    }
    let nt = p.Notes || {};
    if (typeof nt === 'string') {
      try { nt = JSON.parse(nt); } catch (e) { }
    }
    let kat = p.Kategori || [];
    if (typeof kat === 'string') {
      try { kat = JSON.parse(kat); } catch (e) { }
    }

    const token = p.Token || p.ID;
    const shortSlug = p['Short Slug'] || p.Slug || token;
    const clientName = p['Nama Client'] || p.NamaClient || 'Client';
    const nomorWA = p['Nomor WA'] || p.NomorWA || '';
    const passClient = p['Password Client'] || p.PasswordClient || '';
    const maxFoto = Number(p['Max Foto']) || Number(p.MaxFoto) || 50;
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
  const isPro = u ? Boolean(String(u.Akses_Watermark).toUpperCase() === 'TRUE' || rawPaket.toUpperCase().includes('PRO') || rawPaket.toUpperCase().includes('LIFETIME')) : false;

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
    isPremiumAddon: isPro
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

  const isPhotoSelection = productUpper.includes('PHOTO') ||
    productUpper.includes('SELECTION') ||
    productUpper.includes('PAKET') ||
    productUpper.includes('BULAN') ||
    productUpper.includes('TAHUN') ||
    productUpper.includes('LIFETIME') ||
    productUpper.includes('PRO') ||
    productUpper.includes('PERPANJANG') ||
    productUpper.includes('RENEW') ||
    productUpper.includes('LANGGANAN');

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
  // KASUS A: PRODUK BUKAN PHOTO SELECTION (NETFLIX, CANVA, DLL)
  // ============================================================
  if (!isPhotoSelection) {
    const userRefCode = extractMayarRefCode(d, null);
    const paidAmount = Number(d.amount || d.netAmount || 0);
    const qty = Number(d.qty || 1);

    // Catat log transaksi langsung ke Supabase
    await supabaseQuery('mayar_logs', {
      method: 'POST',
      body: {
        Event: event,
        'Customer Email': email,
        'Customer Name': name,
        'Status/Product': rawProductName,
        'Hasil Aktivasi': `Transaksi dicatat (${rawProductName}) - Ref: ${userRefCode} - Rp ${paidAmount} (Qty: ${qty})`,
        'Raw JSON Payload': JSON.stringify(payload),
        Timestamp: new Date().toISOString()
      }
    }).catch(() => { });

    return success(res, { success: true, status: 'processed', result: `Store sale tracked to Supabase: ${rawProductName}` });
  }

  // ============================================================
  // KASUS B: PRODUK PHOTO SELECTION (AKTIVASI AKUN + TRACK STORE)
  // ============================================================

  // Fungsi Normalisasi Nomor HP (menghilangkan awalan 0 / 62 / +62 / spasi / strip)
  function normalizePhone(phoneStr) {
    if (!phoneStr) return '';
    let num = String(phoneStr).replace(/[^0-9]/g, '');
    if (num.startsWith('62')) num = num.substring(2);
    else if (num.startsWith('0')) num = num.substring(1);
    return num;
  }

  const cleanIncomingPhone = normalizePhone(mobile);

  // Layer 1: Cocokkan via Email
  let targetUser = null;
  if (email) {
    const byEmail = await supabaseQuery(`users?Email=ilike.${encodeURIComponent(email)}&select=*`);
    if (byEmail && byEmail.length > 0) targetUser = byEmail[0];
  }

  // Layer 2: Cocokkan via Nomor HP / WhatsApp (kebal format 0 / 62 / +62)
  if (!targetUser && cleanIncomingPhone.length >= 7) {
    const byPhone = await supabaseQuery(`users?No%20HP=like.*${encodeURIComponent(cleanIncomingPhone)}*&select=*`);
    if (byPhone && byPhone.length > 0) {
      targetUser = byPhone[0];
    } else {
      const allUsers = await supabaseQuery('users?select=*').catch(() => []);
      if (allUsers && allUsers.length > 0) {
        targetUser = allUsers.find(u => {
          const uPhoneNorm = normalizePhone(u['No HP']);
          return uPhoneNorm && (uPhoneNorm === cleanIncomingPhone || uPhoneNorm.endsWith(cleanIncomingPhone) || cleanIncomingPhone.endsWith(uPhoneNorm));
        });
      }
    }
  }

  // Layer 3: Cocokkan via Username / Nama Studio jika email & no hp tidak sama
  if (!targetUser && name) {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanName.length >= 3) {
      const byName = await supabaseQuery(`users?or=(Username.ilike.${encodeURIComponent(cleanName)},Nama.ilike.*${encodeURIComponent(name)}*)&select=*`);
      if (byName && byName.length > 0) targetUser = byName[0];
    }
  }

  // Layer 4: Cek jika ada customField / notes yang mengandung username
  if (!targetUser) {
    const combinedNotes = `${d.notes || ''} ${d.description || ''} ${d.customField || ''} ${d.extra || ''}`;
    const userMatch = combinedNotes.match(/@([a-zA-Z0-9_\-\.]+)/);
    if (userMatch && userMatch[1]) {
      const byUsername = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(userMatch[1].trim())}&select=*`);
      if (byUsername && byUsername.length > 0) targetUser = byUsername[0];
    }
  }

  let addDays = 30;
  let paketName = '1 Bulan';
  if (productUpper.includes('6 BULAN') || productUpper.includes('6-BULAN') || productUpper.includes('6BULAN') || productUpper.includes('SEMESTER')) {
    addDays = 180;
    paketName = '6 Bulan';
  }
  else if (productUpper.includes('1 TAHUN') || productUpper.includes('1-TAHUN') || productUpper.includes('TAHUNN') || productUpper.includes('TAHUN') || productUpper.includes('ANNUAL') || productUpper.includes('YEAR')) {
    addDays = 365;
    paketName = '1 Tahun';
  }
  else if (productUpper.includes('LIFETIME') || productUpper.includes('SELAMANYA') || productUpper.includes('PERMANEN')) {
    addDays = 36500;
    paketName = 'Lifetime';
  }

  // Hitung Masa Aktif Bertingkat (Akumulasi jika masa aktif sebelumnya belum habis)
  let baseDate = new Date();
  if (targetUser && targetUser.ExpiredAt && targetUser.ExpiredAt !== 'Lifetime') {
    const currExp = parseSafeDate(targetUser.ExpiredAt);
    if (currExp && currExp.getTime() > baseDate.getTime()) {
      baseDate = new Date(currExp.getTime()); // Perpanjang dari tanggal berakhir yang sekarang
    }
  }
  baseDate.setDate(baseDate.getDate() + addDays);
  const expiredAt = (paketName === 'Lifetime') ? 'Lifetime' : baseDate.toISOString().split('T')[0];

  let hasilAktivasi = 'User tidak ditemukan';
  let userActivatedName = name;
  let userActivatedUsername = '';
  let userActivatedEmail = email;
  let userActivatedPhone = mobile;
  let temporaryPassword = '';

  if (targetUser) {
    const uName = targetUser.Username;
    userActivatedName = targetUser.Nama || name;
    userActivatedUsername = uName;
    userActivatedEmail = targetUser.Email || email;
    userActivatedPhone = targetUser['No HP'] || mobile;

    const isProAddon = productUpper.includes('ADD-ON') || productUpper.includes('PRO');

    if (isProAddon) {
      await supabaseQuery(`users?Username=eq.${encodeURIComponent(uName)}`, {
        method: 'PATCH',
        body: { Akses_Watermark: 'TRUE' }
      });
      hasilAktivasi = `Aktivasi PRO Add-on untuk ${uName}`;
    } else {
      await supabaseQuery(`users?Username=eq.${encodeURIComponent(uName)}`, {
        method: 'PATCH',
        body: { Status: 'Active', Paket: paketName, ExpiredAt: expiredAt }
      });
      hasilAktivasi = `Perpanjangan ${paketName} berhasil untuk @${uName} (s/d ${expiredAt})`;
    }

    // Trigger Meta CAPI Purchase
    const purEventId = d.id || ('pur_' + uName + '_' + Date.now());
    const purAmount = Number(d.amount || d.netAmount || 100000);
    sendMetaCAPIEvent('Purchase', {
      eventId: purEventId,
      email: userActivatedEmail,
      phone: userActivatedPhone,
      customData: {
        content_name: rawProductName || paketName,
        value: purAmount,
        currency: 'IDR'
      }
    }).catch(() => { });

  } else if (email) {
    // KASUS: Fotografer membayar langsung di Mayar sebelum membuat akun di app.html
    const baseUser = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'photographer';
    let newUsername = baseUser;
    const existingCheck = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(newUsername)}&select=id`);
    if (existingCheck && existingCheck.length > 0) {
      newUsername = `${baseUser}_${Math.floor(100 + Math.random() * 900)}`;
    }

    // Buat password default yang aman menggunakan crypto
    temporaryPassword = 'Kama-' + crypto.randomBytes(6).toString('base64url');
    const passHash = createPasswordHash(temporaryPassword);

    const autoUser = {
      Username: newUsername,
      Password: passHash,
      Nama: name || baseUser,
      Role: 'Photographer',
      Status: 'Active',
      Email: email,
      'No HP': mobile,
      Paket: paketName,
      ExpiredAt: expiredAt,
      ConfirmToken: '',
      ProjectCreated: '0',
      Akses_Watermark: productUpper.includes('ADD-ON') || productUpper.includes('PRO') ? 'TRUE' : 'FALSE'
    };

    await supabaseQuery('users', { method: 'POST', body: autoUser });
    userActivatedName = name || baseUser;
    userActivatedUsername = newUsername;
    hasilAktivasi = `Akun baru otomatis dibuat & diaktifkan: ${newUsername} (${paketName})`;

    // Meta CAPI Purchase Event
    const purEventId = d.id || ('pur_' + newUsername + '_' + Date.now());
    const purAmount = Number(d.amount || d.netAmount || 100000);
    sendMetaCAPIEvent('Purchase', {
      eventId: purEventId,
      email: email,
      phone: mobile,
      customData: {
        content_name: rawProductName || paketName,
        value: purAmount,
        currency: 'IDR'
      }
    }).catch(() => { });
  }

  // Ekstrak Kode Referal dari profil user atau payload Mayar
  const userRefCode = extractMayarRefCode(d, targetUser);

  const paidAmount = Number(d.amount || d.netAmount || (paketName === '1 Bulan' ? 50000 : (paketName === '6 Bulan' ? 250000 : (paketName === '1 Tahun' ? 450000 : 750000))));

  // Kirim email notifikasi aktivasi ke Fotografer
  if (userActivatedEmail) {
    sendEmailViaGAS({
      to: userActivatedEmail,
      subject: `Pembayaran Diterima - Akun Photo Selection Anda Telah Aktif!`,
      htmlBody: buildPhotographerActivatedEmail({
        nama: userActivatedName,
        username: userActivatedUsername,
        email: userActivatedEmail,
        paket: paketName,
        expiredAt: expiredAt,
        tempPassword: temporaryPassword || undefined
      })
    }).catch(e => console.error('[MAILER] Error kirim email aktivasi Mayar ke fotografer:', e));
  }

  // Kirim email notifikasi pembayaran sukses ke Admin
  sendEmailViaGAS({
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
  }).catch(e => console.error('[MAILER] Error kirim email pembayaran ke Admin:', e));

  await supabaseQuery('mayar_logs', {
    method: 'POST',
    body: {
      Event: event,
      'Customer Email': email,
      'Customer Name': name,
      'Status/Product': rawProductName || paketName,
      'Hasil Aktivasi': hasilAktivasi,
      'Raw JSON Payload': JSON.stringify(payload),
      Timestamp: new Date().toISOString()
    }
  }).catch(() => { });

  return success(res, { success: true, status: 'processed', result: hasilAktivasi });
}

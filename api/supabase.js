/**
 * API Handler Backend Berbasis Supabase (PostgreSQL)
 * Lengkap dengan 100% Dukungan Seluruh Fitur & Menu Aplikasi Photo Selection
 */

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jqptagcbkyxxqqmxqusf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_TL_Et1x8IlEwxKASjF0K8Q_t72R3f_9';
const KAMA_SALT = "KamaSecretSalt";
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

function hashPassword(password) {
  if (!password) return '';
  return crypto.createHash('sha256').update(password + KAMA_SALT).digest('hex');
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
    console.warn('[MAILER] GAS_MAILER_URL belum diatur di Environment Variables. Email ke', to, 'tidak dapat dikirim.');
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
    return res.ok;
  } catch (err) {
    console.error('[MAILER] Gagal mengirim email via GAS:', err);
    return false;
  }
}

function buildAdminNewUserEmail({ nama, username, email, nohp, paket, status }) {
  const isPending = status === 'Pending';
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
          <td style="padding: 10px 0; color: #0f172a; font-weight: 500;">${nama}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Username</td>
          <td style="padding: 10px 0; color: #0f172a;"><code>@${username}</code></td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Email</td>
          <td style="padding: 10px 0;"><a href="mailto:${email}" style="color: #2563eb; text-decoration: none;">${email}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">No HP / WA</td>
          <td style="padding: 10px 0;"><a href="https://wa.me/${(nohp || '').replace(/[^0-9]/g, '')}" style="color: #059669; text-decoration: none; font-weight: 600;">${nohp || '-'}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Pilihan Paket</td>
          <td style="padding: 10px 0;"><span style="display: inline-block; background: #dbeafe; color: #1e40af; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 6px;">${paket}</span></td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Status Akun</td>
          <td style="padding: 10px 0;"><span style="display: inline-block; background: ${isPending ? '#fef3c7; color: #92400e;' : '#d1fae5; color: #065f46;'} font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 6px;">${status}</span></td>
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
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 26px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">Selamat Datang di Photo Selection!</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #bfdbfe;">Aplikasi Galeri &amp; Seleksi Foto Klien Praktis</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>${nama}</strong>,</p>
      <p>Terima kasih telah mendaftar di <strong>Photo Selection</strong>. Akun Anda berhasil dicatat dengan rincian:</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748b; width: 130px;"><strong>Username:</strong></td><td style="color: #0f172a; font-weight: 600;">@${username}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;"><strong>Email:</strong></td><td style="color: #0f172a;">${email}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;"><strong>Paket:</strong></td><td style="color: #0f172a;"><span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${paket}</span></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;"><strong>Status Akun:</strong></td><td><span style="background: ${isPending ? '#fef3c7; color: #b45309;' : '#dcfce7; color: #15803d;'} padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${isPending ? 'Menunggu Pembayaran' : 'Aktif'}</span></td></tr>
        </table>
      </div>
      ${isPending && paymentUrl ? `
        <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 14px; margin: 18px 0; border-radius: 0 8px 8px 0;">
          <strong style="color: #1e40af; font-size: 14px;">Langkah Aktivasi Otomatis:</strong>
          <p style="margin: 6px 0 12px 0; font-size: 13px; color: #1e3a8a;">Selesaikan pembayaran Anda untuk langsung mengaktifkan akun secara otomatis tanpa perlu konfirmasi:</p>
          <a href="${paymentUrl}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 13px;">Bayar Sekarang via Mayar &rarr;</a>
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
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 26px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">Akun Photo Selection Anda Telah Aktif!</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #d1fae5;">Selamat berkarya dan selamat menikmati alur kerja seleksi foto otomatis</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>${nama}</strong>,</p>
      <p>Kabar gembira! Akun <strong>Photo Selection</strong> Anda telah resmi <strong>diaktifkan</strong>.</p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #166534; width: 140px;"><strong>Username:</strong></td><td style="color: #0f172a; font-weight: 600;">@${username}</td></tr>
          <tr><td style="padding: 6px 0; color: #166534;"><strong>Email:</strong></td><td style="color: #0f172a;">${email}</td></tr>
          ${tempPassword ? `<tr><td style="padding: 6px 0; color: #166534;"><strong>Password Login:</strong></td><td style="color: #b91c1c; font-weight: 700;"><code>${tempPassword}</code></td></tr>` : ''}
          <tr><td style="padding: 6px 0; color: #166534;"><strong>Paket:</strong></td><td style="color: #0f172a;"><span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">${paket}</span></td></tr>
          <tr><td style="padding: 6px 0; color: #166534;"><strong>Masa Aktif Sampai:</strong></td><td style="color: #0f172a; font-weight: 600;">${expiredAt || 'Lifetime'}</td></tr>
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
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: #065f46; padding: 24px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Pembayaran Mayar Diterima</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #a7f3d0;">Akun fotografer berhasil diaktifkan otomatis</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>Admin Kama Creative</strong>, pembayaran baru telah sukses diterima melalui Mayar:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b; width: 140px;">Nama Customer</td><td style="padding: 8px 0; color: #0f172a; font-weight: 500;">${nama}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Username</td><td style="padding: 8px 0; color: #0f172a;">@${username}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #2563eb; text-decoration: none;">${email}</a></td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">No HP / WA</td><td style="padding: 8px 0;"><a href="https://wa.me/${(nohp || '').replace(/[^0-9]/g, '')}" style="color: #059669; text-decoration: none; font-weight: 600;">${nohp || '-'}</a></td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Paket</td><td style="padding: 8px 0; color: #065f46; font-weight: 700;">${paket}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Nominal</td><td style="padding: 8px 0; color: #0f172a; font-weight: 600;">Rp ${(amount || 0).toLocaleString('id-ID')}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #64748b;">Masa Aktif</td><td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${expiredAt || 'Lifetime'}</td></tr>
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
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
    <div style="background: #d97706; padding: 24px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Pengingat Masa Aktif Akun Photo Selection</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #fef3c7;">Perpanjang masa aktif untuk menjaga galeri klien tetap dapat diakses</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>${nama}</strong> (<code>@${username}</code>),</p>
      <p>Masa aktif akun Photo Selection Anda akan segera berakhir pada: <strong style="color: #b45309;">${expiredAt}</strong>.</p>
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
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 26px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">Kode Keamanan Reset Password</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Permintaan Pengaturan Ulang Kata Sandi Akun</p>
    </div>
    <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
      <p style="margin-top: 0;">Halo <strong>${nama || username}</strong> (<code>@${username}</code>),</p>
      <p>Kami menerima permintaan untuk mereset kata sandi akun <strong>Photo Selection</strong> Anda. Gunakan 6 digit Kode OTP berikut untuk memverifikasi akun Anda:</p>
      
      <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1e40af; display: inline-block;">${otp}</span>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">Kode OTP ini berlaku selama 15 menit. Jangan berikan kode ini kepada siapa pun.</p>
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

module.exports = async function handler(req, res) {
  const allowedOrigins = [
    'https://ps.kamacreative.my.id',
    'https://photo-selector.vercel.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || (origin && origin.endsWith('.vercel.app')) || (origin && origin.includes('mayar.id'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) { }
    }
    payload = payload || {};

    if ((payload.action === 'mayarWebhook') || (payload.event && payload.data && (payload.event.includes('payment') || payload.event.includes('invoice') || payload.event.includes('transaction')))) {
      return await handleMayarWebhook(payload, res);
    }

    const action = payload.action;
    if (!action) return error(res, 'Action is required', 400);

    switch (action) {
      case 'mayarWebhook': return await handleMayarWebhook(payload, res);
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
    return error(res, err.message || 'Internal Server Error', 500);
  }
};

// =========================================================================
// CONTROLLERS
// =========================================================================

async function handleLogin(payload, res) {
  const username = (payload.username || '').trim();
  const password = (payload.password || '').trim();
  if (!username || !password) return error(res, 'Username dan Password wajib diisi.');

  const users = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=*`);
  if (!users || users.length === 0) return error(res, 'Username atau password salah.');

  const u = users[0];
  const storedPass = u.Password || '';
  const inputHash = hashPassword(password);

  const isMatch = (storedPass === inputHash) || (storedPass === password);
  if (!isMatch) return error(res, 'Username atau password salah.');

  const status = u.Status || 'Active';
  const role = u.Role || 'Photographer';
  const uName = u.Username;

  if (status === 'Unverified') return error(res, 'Akun Anda belum diverifikasi. Silakan cek email Anda.');
  if (status === 'Pending') return error(res, 'Akun Anda sedang menunggu persetujuan (ACC) dari Admin.');

  const sessionId = crypto.randomUUID();
  try {
    await supabaseQuery('sessions', {
      method: 'POST',
      body: { SessionID: sessionId, Username: uName, Role: role, CreatedAt: new Date().toISOString() }
    });
  } catch (e) { }

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
  const nama = (d.nama || '').trim();
  const email = (d.email || '').trim().toLowerCase();
  const nohp = (d.nohp || '').trim();
  const username = (d.username || '').trim().toLowerCase().replace(/\s+/g, '');
  const password = (d.password || '').trim();
  const paket = d.paket || '1 Bulan';

  if (!nama || !email || !username || !password) return error(res, 'Lengkapi semua isian pendaftaran.');

  const existing = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}&select=id`);
  if (existing && existing.length > 0) return error(res, 'Username sudah digunakan.');

  const passHash = hashPassword(password);
  const confirmToken = crypto.randomUUID();
  const isDemo = (paket.toUpperCase().includes('DEMO') || paket === 'Free');

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
    ConfirmToken: confirmToken,
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
  const username = (payload.username || '').trim();
  const brandName = (payload.brandName || '').trim();
  const brandLogo = (payload.brandLogo || '').trim();
  const watermarkUrl = (payload.watermarkUrl || '').trim();

  if (!username) return error(res, 'Username required');

  const updateBody = { BrandName: brandName, BrandLogo: brandLogo };
  if (watermarkUrl !== undefined) updateBody.WatermarkUrl = watermarkUrl;

  await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true, brandName, brandLogo, message: 'Settings saved' });
}

async function handleUploadBrandLogo(payload, res) {
  const base64Data = payload.base64Data || '';
  if (!base64Data) return error(res, 'File gambar tidak ditemukan');
  return success(res, { success: true, url: base64Data });
}

async function handleSavePaymentSettings(payload, res) {
  const username = (payload.username || '').trim();
  const bankName = (payload.bankName || '').trim();
  const bankAccount = (payload.bankAccount || '').trim();
  const bankAccountName = (payload.bankAccountName || '').trim();

  await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { BankName: bankName, BankAccount: bankAccount, BankAccountName: bankAccountName }
  });

  return success(res, { success: true, bankName, bankAccount, bankAccountName, message: 'Payment settings saved' });
}

async function handleUploadPaymentProof(payload, res) {
  return success(res, { success: true });
}

async function handlePingUser(payload, res) {
  const user = payload.currentUser || {};
  const username = (user.username || payload.username || '').trim();
  if (username) {
    await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}`, {
      method: 'PATCH',
      body: { LastActive: new Date().toISOString() }
    }).catch(() => { });
  }
  return success(res, { success: true, ok: true });
}

async function handleGetProjects(payload, res) {
  const user = payload.currentUser || {};
  const username = user.username || payload.username || '';
  const role = user.role || payload.role || 'Photographer';

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
  const user = payload.currentUser || d.currentUser || {};
  const username = user.username || d.username || payload.username || 'admin';

  const token = crypto.randomBytes(6).toString('hex');
  const projectId = crypto.randomUUID();
  const clientName = d.namaClient || d.nama || d['Nama Client'] || 'Untitled Client';
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

  let deadline = d.deadline || '';
  if (!deadline && d.durasiPilih && d.durasiPilih !== 'Selamanya') {
    const days = parseInt(d.durasiPilih) || 7;
    const dlDate = new Date();
    dlDate.setDate(dlDate.getDate() + days);
    deadline = dlDate.toISOString();
  }

  const newProject = {
    id: projectId,
    ID: projectId,
    Token: token,
    Slug: shortSlug,
    'Short Slug': shortSlug,
    'Nama Client': clientName,
    'Nomor WA': d.nomorWA || d.wa || d['Nomor WA'] || '',
    'Password Client': d.passwordClient || d.pass || d['Password Client'] || '',
    'Max Foto': String(d.maxFoto || d.max || d['Max Foto'] || 50),
    'Drive Link': d.driveLink || d.link || d['Drive Link'] || '',
    Owner: username,
    'Short Link': shortLink,
    Kategori: typeof d.categories === 'string' ? d.categories : JSON.stringify(d.categories || []),
    UseWatermark: String(Boolean(d.useWatermark)).toUpperCase(),
    UseWatermarkTiled: String(Boolean(d.useWatermarkTiled)).toUpperCase(),
    ClientLayout: d.clientLayout || d.layout || 'masonry',
    ExtraPrice: String(d.extraPrice || d.extra || 0),
    MusicUrl: d.musicUrl || d.music || '',
    MusicURL: d.musicUrl || d.music || '',
    AksesPilih: String(d.aksesPilih !== false).toUpperCase(),
    AksesDownload: String(d.aksesDownload !== false).toUpperCase(),
    'Akses_Pilih': String(d.aksesPilih !== false).toUpperCase(),
    'Akses_Download': String(d.aksesDownload !== false).toUpperCase(),
    DurasiPilih: d.durasiPilih || 'Selamanya',
    DurasiDownload: d.durasiDownload || 'Selamanya',
    'Durasi_Pilih': d.durasiPilih || 'Selamanya',
    'Durasi_Download': d.durasiDownload || 'Selamanya',
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

async function handleGetProjectForClient(payload, res) {
  const tokenOrSlug = (payload.token || '').trim();
  if (!tokenOrSlug) return error(res, 'Token or slug is required');

  let projects = await supabaseQuery(`projects?or=(Token.eq.${encodeURIComponent(tokenOrSlug)},Slug.eq.${encodeURIComponent(tokenOrSlug)},%22Short%20Slug%22.eq.${encodeURIComponent(tokenOrSlug)})&select=*`);
  if (!projects || projects.length === 0) return error(res, 'Project tidak ditemukan.', 404);

  const p = projects[0];
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

  const projectData = {
    token: p.Token,
    slug: p['Short Slug'] || p.Slug || p.Token,
    namaClient: p['Nama Client'],
    name: p['Nama Client'],
    nomorWA: p['Nomor WA'],
    hasPassword: Boolean(pass && pass.trim() !== ''),
    maxFoto: Number(p['Max Foto']) || 50,
    driveLink: p['Drive Link'],
    owner: ownerName,
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
    paymentProof: p.PaymentProof || p['Payment Proof'],
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

  return success(res, {
    success: true,
    project: projectData,
    ...projectData
  });
}

async function handleVerifyClientPassword(payload, res) {
  const token = (payload.token || '').trim();
  const password = (payload.passwordInput || payload.password || '').trim();

  let projects = await supabaseQuery(`projects?or=(Token.eq.${encodeURIComponent(token)},Slug.eq.${encodeURIComponent(token)},%22Short%20Slug%22.eq.${encodeURIComponent(token)})&select=*`);
  if (!projects || projects.length === 0) return error(res, 'Project tidak ditemukan');

  const p = projects[0];
  const storedPass = (p['Password Client'] || '').trim();
  const isValid = (!storedPass || storedPass === password);
  return success(res, { success: isValid, valid: isValid });
}

async function handleUpdateClientPassword(payload, res) {
  const idOrToken = (payload.id || payload.token || '').trim();
  const newPassword = (payload.newPassword || '').trim();
  await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})`, {
    method: 'PATCH',
    body: { 'Password Client': newPassword }
  });
  return success(res, { success: true, message: 'Password berhasil diubah' });
}

async function handleUpdateClientStatus(payload, res) {
  const token = (payload.token || '').trim();
  if (!token) return error(res, 'Token required');

  const updateBody = {};
  let currentStatus = payload.status || 'Belum Memilih';
  let currentMax = 50;

  let isDownloadActive = true;
  try {
    const existing = await supabaseQuery(`projects?or=(Token.eq.${encodeURIComponent(token)},Slug.eq.${encodeURIComponent(token)},%22Short%20Slug%22.eq.${encodeURIComponent(token)})&select=Status,"Status Client","Max Foto",AksesDownload,Akses_Download`);
    if (existing && existing.length > 0) {
      const curStatus = existing[0].Status || existing[0]['Status Client'] || 'Belum Memilih';
      currentStatus = curStatus;
      currentMax = Number(existing[0]['Max Foto']) || Number(existing[0].MaxFoto) || 50;
      isDownloadActive = String(existing[0].AksesDownload || existing[0].Akses_Download).toUpperCase() !== 'FALSE';
      const isAlreadyDone = (curStatus === 'Selesai' || curStatus === 'Menunggu Konfirmasi Pembayaran');
      const isIncomingDraft = (payload.status === 'Sedang Memilih' || payload.status === 'Dalam Proses' || payload.status === 'Belum Memilih');

      if (isAlreadyDone && isIncomingDraft) {
        // Tetap pertahankan status Selesai, jangan ditimpa status draft/heartbeat
      } else if (payload.status) {
        updateBody.Status = payload.status;
        updateBody['Status Client'] = payload.status;
        currentStatus = payload.status;
      }
    } else if (payload.status) {
      updateBody.Status = payload.status;
      updateBody['Status Client'] = payload.status;
      currentStatus = payload.status;
    }
  } catch (e) {
    if (payload.status) {
      updateBody.Status = payload.status;
      updateBody['Status Client'] = payload.status;
      currentStatus = payload.status;
    }
  }

  if (payload.selectedCount !== undefined) {
    updateBody['Foto Terpilih'] = String(payload.selectedCount);
  } else if (payload.fotoTerpilih !== undefined) {
    updateBody['Foto Terpilih'] = String(payload.fotoTerpilih);
  }

  if (payload.selectedFiles !== undefined) {
    updateBody['Daftar Pilihan'] = typeof payload.selectedFiles === 'string' ? payload.selectedFiles : JSON.stringify(payload.selectedFiles);
  } else if (payload.daftarPilihan !== undefined) {
    updateBody['Daftar Pilihan'] = typeof payload.daftarPilihan === 'string' ? payload.daftarPilihan : JSON.stringify(payload.daftarPilihan);
  }

  if (payload.notes !== undefined) {
    updateBody.Notes = typeof payload.notes === 'string' ? payload.notes : JSON.stringify(payload.notes);
  }

  if (payload.paymentProof) {
    updateBody.PaymentProof = payload.paymentProof;
    updateBody['Payment Proof'] = payload.paymentProof;
  }

  const nowIso = new Date().toISOString();
  updateBody['Last Update'] = nowIso;

  await supabaseQuery(`projects?or=(Token.eq.${encodeURIComponent(token)},Slug.eq.${encodeURIComponent(token)},%22Short%20Slug%22.eq.${encodeURIComponent(token)})`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true, status: currentStatus, maxFoto: currentMax, isDownloadActive: isDownloadActive });
}

async function handleReleaseClientSession(payload, res) {
  return success(res, { success: true });
}

async function handleUpdateDeadline(payload, res) {
  const idOrToken = (payload.id || payload.token || '').trim();
  const newDeadline = payload.newDeadline || '';

  await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})`, {
    method: 'PATCH',
    body: { Deadline: newDeadline }
  });

  return success(res, { success: true, message: 'Deadline berhasil diperbarui' });
}

async function handleDeleteProject(payload, res) {
  const idOrToken = (payload.id || payload.token || '').trim();
  await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})`, { method: 'DELETE' });
  return success(res, { success: true, message: 'Project berhasil dihapus' });
}

async function handleReopenProject(payload, res) {
  const projectId = (payload.projectId || payload.id || payload.token || '').trim();
  const updateBody = { Status: 'Sedang Memilih', 'Status Client': 'Sedang Memilih' };
  if (payload.newMax) {
    updateBody['Max Foto'] = String(payload.newMax);
  }

  await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(projectId)},Token.eq.${encodeURIComponent(projectId)})`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true, message: 'Project berhasil dibuka kembali' });
}

async function handleToggleProjectWatermark(payload, res) {
  const idOrToken = (payload.id || payload.token || '').trim();
  const existing = await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})&select=*`);
  if (!existing || existing.length === 0) return error(res, 'Project tidak ditemukan');

  const p = existing[0];
  const currentVal = String(p.UseWatermark).toUpperCase() === 'TRUE';
  const newVal = !currentVal;

  await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})`, {
    method: 'PATCH',
    body: { UseWatermark: String(newVal).toUpperCase() }
  });

  return success(res, { success: true, newValue: newVal, message: 'Watermark berhasil diubah' });
}

async function handleToggleProjectDownload(payload, res) {
  const idOrToken = (payload.id || payload.token || '').trim();
  const existing = await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})&select=*`);
  if (!existing || existing.length === 0) return error(res, 'Project tidak ditemukan');

  const p = existing[0];
  const currentVal = String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE';
  const newVal = !currentVal;

  await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})`, {
    method: 'PATCH',
    body: {
      AksesDownload: String(newVal).toUpperCase(),
      'Akses_Download': String(newVal).toUpperCase()
    }
  });

  return success(res, { success: true, newValue: newVal, message: 'Akses download berhasil diubah' });
}

async function handleUpdateProjectMaxFoto(payload, res) {
  const idOrToken = (payload.id || payload.token || '').trim();
  const newMax = parseInt(payload.newMax);
  if (isNaN(newMax) || newMax < 0) return error(res, 'Batas maksimal foto tidak valid');

  const existing = await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})&select=*`);
  if (!existing || existing.length === 0) return error(res, 'Project tidak ditemukan');

  await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(idOrToken)},Token.eq.${encodeURIComponent(idOrToken)})`, {
    method: 'PATCH',
    body: {
      'Max Foto': String(newMax)
    }
  });

  return success(res, { success: true, newMax: newMax, message: 'Batas maksimal foto berhasil diperbarui' });
}

async function handleProcessPayment(payload, res) {
  const projectId = (payload.projectId || payload.id || payload.token || '').trim();
  const status = payload.status || 'Selesai';

  await supabaseQuery(`projects?or=(id.eq.${encodeURIComponent(projectId)},Token.eq.${encodeURIComponent(projectId)})`, {
    method: 'PATCH',
    body: { Status: status, 'Status Client': status }
  });

  return success(res, { success: true, message: 'Pembayaran berhasil diproses' });
}

async function handleGetDashboardStats(payload, res) {
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
  const user = payload.currentUser || {};
  if (user.role !== 'Admin') return error(res, 'Unauthorized', 403);

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
  const username = (payload.username || '').trim();
  await supabaseQuery(`projects?Owner=ilike.${encodeURIComponent(username)}`, { method: 'DELETE' });
  await supabaseQuery(`users?Username=ilike.${encodeURIComponent(username)}`, { method: 'DELETE' });
  return success(res, { success: true, message: 'User berhasil dihapus' });
}

async function handleRequestOTP(payload, res) {
  const emailOrUser = (payload.email || payload.username || '').trim().toLowerCase();
  if (!emailOrUser) return error(res, 'Masukkan Username atau Email Anda.');

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

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Simpan OTP ke tabel reset_tokens
  await supabaseQuery('reset_tokens', {
    method: 'POST',
    body: { Username: uName, OTP: otp, CreatedAt: new Date().toISOString() }
  });

  // Kirim email OTP ke fotografer
  sendEmailViaGAS({
    to: userEmail,
    subject: `Kode Keamanan Reset Password (${otp}) - Photo Selection`,
    htmlBody: buildOtpResetPasswordEmail({
      nama: user.Nama || uName,
      username: uName,
      otp: otp
    })
  }).catch(e => console.error('[MAILER] Error kirim email OTP:', e));

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

  let users = await supabaseQuery(`users?Email=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
  if (!users || users.length === 0) {
    users = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(emailOrUser)}&select=*`);
  }
  if (!users || users.length === 0) return error(res, 'User tidak ditemukan.');

  const uName = users[0].Username;
  const tokens = await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}&OTP=eq.${encodeURIComponent(otp)}&order=id.desc&limit=1`);
  if (!tokens || tokens.length === 0) return error(res, 'Kode OTP salah atau sudah kedaluwarsa.');

  const newHash = hashPassword(newPassword);
  await supabaseQuery(`users?Username=ilike.${encodeURIComponent(uName)}`, {
    method: 'PATCH',
    body: { Password: newHash }
  });

  // Bersihkan token yang sudah digunakan
  await supabaseQuery(`reset_tokens?Username=ilike.${encodeURIComponent(uName)}`, { method: 'DELETE' }).catch(() => {});

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

  function extractFolderId(url) {
    if (!url) return null;
    if (!url.includes('http')) return url;
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
  }

  const folderId = extractFolderId(folderUrlOrId);
  if (!folderId) return error(res, 'Format link/ID Google Drive tidak valid.');

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
    return error(res, 'Gagal memuat isi Google Drive: ' + err.message);
  }
}

async function handleGetAudioData(payload, res) {
  const musicUrl = payload.musicUrl || payload.url || '';
  return success(res, { success: true, url: musicUrl });
}

async function handleSubmitFeedback(payload, res) {
  const user = payload.currentUser || {};
  const d = payload.data || payload;
  const pesan = (d.pesan || d.feedback || '').trim();
  const lampiranUrl = d.lampiranUrl || d.lampiran || '';
  if (!pesan) return error(res, 'Pesan feedback tidak boleh kosong.');

  const fbId = 'fb_' + Date.now();
  await supabaseQuery('feedbacks', {
    method: 'POST',
    body: {
      ID: fbId,
      Username: user.username || 'Anonymous',
      Role: user.role || 'Photographer',
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
  const user = payload.currentUser || {};
  let endpoint = 'feedbacks?select=*&order=created_at.desc';
  if (user.role !== 'Admin') {
    endpoint = `feedbacks?Username=eq.${encodeURIComponent(user.username)}&select=*&order=created_at.desc`;
  }
  const rows = await supabaseQuery(endpoint);
  return success(res, { success: true, data: rows || [] });
}

async function handleReplyFeedback(payload, res) {
  const id = payload.id;
  const balasan = payload.reply || payload.balasan || '';
  await supabaseQuery(`feedbacks?ID=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { Balasan: balasan, TglBalas: new Date().toISOString(), StatusUser: 'Unread' }
  });
  return success(res, { success: true, message: 'Balasan terkirim' });
}

async function handleGetAllNotifications(payload, res) {
  const user = payload.currentUser || {};
  let fbEndpoint = 'feedbacks?select=*&order=created_at.desc';
  if (user.role !== 'Admin') {
    fbEndpoint = `feedbacks?Username=eq.${encodeURIComponent(user.username)}&select=*&order=created_at.desc`;
  }
  const feedbacks = (await supabaseQuery(fbEndpoint)) || [];
  const systemUpdates = (await supabaseQuery('system_updates?Status=eq.Active&select=*&order=created_at.desc')) || [];

  return success(res, { success: true, feedbacks, systemUpdates });
}

async function handleMarkFeedbackRead(payload, res) {
  const user = payload.currentUser || {};
  const type = payload.type || 'user';
  if (type === 'admin') {
    await supabaseQuery('feedbacks?StatusAdmin=eq.Unread', { method: 'PATCH', body: { StatusAdmin: 'Read' } }).catch(() => { });
  } else if (user.username) {
    await supabaseQuery(`feedbacks?Username=eq.${encodeURIComponent(user.username)}&StatusUser=eq.Unread`, { method: 'PATCH', body: { StatusUser: 'Read' } }).catch(() => { });
  }
  return success(res, { success: true, ok: true });
}

async function handleGetSystemUpdates(payload, res) {
  const rows = await supabaseQuery('system_updates?Status=eq.Active&select=*&order=created_at.desc');
  return success(res, { success: true, data: rows || [] });
}

async function handleSyncBackground(payload, res) {
  const user = payload.currentUser || {};
  const username = user.username;
  const role = user.role || 'Photographer';
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

async function handleMayarWebhook(payload, res) {
  const event = payload.event;
  const d = payload.data || {};
  const customer = d.customer || {};
  const email = (customer.email || '').trim().toLowerCase();
  const mobile = (customer.mobile || customer.phone || '').trim();
  const name = (customer.name || '').trim();
  const product = (d.productName || d.description || '').toUpperCase();

  let addDays = 30;
  let paketName = '1 Bulan';
  if (product.includes('6 BULAN')) { addDays = 180; paketName = '6 Bulan'; }
  else if (product.includes('1 TAHUN')) { addDays = 365; paketName = '1 Tahun'; }
  else if (product.includes('LIFETIME')) { addDays = 36500; paketName = 'Lifetime'; }

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + addDays);
  const expiredAt = (paketName === 'Lifetime') ? 'Lifetime' : expDate.toISOString().split('T')[0];

  let targetUser = null;
  if (email) {
    const byEmail = await supabaseQuery(`users?Email=ilike.${encodeURIComponent(email)}&select=*`);
    if (byEmail && byEmail.length > 0) targetUser = byEmail[0];
  }
  if (!targetUser && mobile) {
    const cleanPhone = mobile.replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 7) {
      const byPhone = await supabaseQuery(`users?No%20HP=like.*${encodeURIComponent(cleanPhone)}*&select=*`);
      if (byPhone && byPhone.length > 0) targetUser = byPhone[0];
    }
  }

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

    const isProAddon = product.includes('ADD-ON') || product.includes('PRO');

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
      hasilAktivasi = `Aktivasi ${paketName} untuk ${uName}`;
    }

    // Trigger Meta CAPI Purchase
    const purEventId = d.id || ('pur_' + uName + '_' + Date.now());
    const purAmount = Number(d.amount || d.netAmount || 100000);
    sendMetaCAPIEvent('Purchase', {
      eventId: purEventId,
      email: userActivatedEmail,
      phone: userActivatedPhone,
      customData: {
        content_name: product || paketName,
        value: purAmount,
        currency: 'IDR'
      }
    }).catch(() => { });

  } else if (email) {
    // KASUS: Fotografer membayar langsung di Mayar sebelum membuat akun di app.html
    // Otomatis buatkan akun agar fotografer langsung mendapatkan akses & detail login
    const baseUser = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'photographer';
    let newUsername = baseUser;
    const existingCheck = await supabaseQuery(`users?Username=ilike.${encodeURIComponent(newUsername)}&select=id`);
    if (existingCheck && existingCheck.length > 0) {
      newUsername = `${baseUser}_${Math.floor(100 + Math.random() * 900)}`;
    }

    // Buat password default yang mudah & aman
    temporaryPassword = 'Kama' + Math.floor(1000 + Math.random() * 9000);
    const passHash = hashPassword(temporaryPassword);

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
      Akses_Watermark: product.includes('ADD-ON') || product.includes('PRO') ? 'TRUE' : 'FALSE'
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
        content_name: product || paketName,
        value: purAmount,
        currency: 'IDR'
      }
    }).catch(() => { });
  }

  // Kirim email notifikasi aktivasi ke Fotografer
  if (userActivatedEmail) {
    sendEmailViaGAS({
      to: userActivatedEmail,
      subject: `Pembayaran Diterima - Akun Photo Selection Anda Telah Aktif! 🎉`,
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
  const paidAmount = Number(d.amount || d.netAmount || 0);
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
      'Status/Product': product,
      'Hasil Aktivasi': hasilAktivasi,
      'Raw JSON Payload': JSON.stringify(payload),
      Timestamp: new Date().toISOString()
    }
  }).catch(() => { });

  return success(res, { success: true, status: 'processed', result: hasilAktivasi });
}

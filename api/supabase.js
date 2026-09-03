/**
 * API Handler Backend Berbasis Supabase (PostgreSQL)
 * Menggantikan Google Apps Script dengan Kecepatan Tinggi (< 50ms), 
 * Zero Downtime, dan Bebas dari Batasan Google.
 */

const crypto = require('crypto');

// Konfigurasi Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jqptagcbkyxxqqmxqusf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_TL_Et1x8IlEwxKASjF0K8Q_t72R3f_9';

const KAMA_SALT = "KamaSecretSalt";

// Helper Query ke Supabase REST API
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
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = text;
  }

  if (!response.ok) {
    const errMsg = (data && data.message) ? data.message : (data && data.error ? data.error : text);
    throw new Error(errMsg || `Supabase HTTP ${response.status}`);
  }

  return data;
}

// Helper Hash Password SHA-256 (Sama persis dengan sistem lama untuk kecocokan akun)
function hashPassword(password) {
  if (!password) return '';
  return crypto.createHash('sha256').update(password + KAMA_SALT).digest('hex');
}

// Helper Response JSON
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
  // CORS Configuration
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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) { }
    }
    payload = payload || {};

    // 1. Deteksi Webhook Mayar.id
    if (payload.event && payload.data && (payload.event.includes('payment') || payload.event.includes('invoice') || payload.event.includes('transaction'))) {
      return await handleMayarWebhook(payload, res);
    }

    const action = payload.action;
    if (!action) {
      return error(res, 'Action is required', 400);
    }

    // Router Aksi
    switch (action) {
      // --- AUTH & USER MANAGEMENT ---
      case 'login':
        return await handleLogin(payload, res);
      case 'register':
        return await handleRegister(payload, res);
      case 'getGlobalBranding':
        return await handleGetGlobalBranding(payload, res);
      case 'saveBrandSettings':
        return await handleSaveBrandSettings(payload, res);
      case 'savePaymentSettings':
        return await handleSavePaymentSettings(payload, res);
      case 'pingUser':
        return await handlePingUser(payload, res);
      case 'getUsers':
        return await handleGetUsers(payload, res);
      case 'approveUser':
        return await handleApproveUser(payload, res);
      case 'updateExpiry':
        return await handleUpdateExpiry(payload, res);
      case 'deleteUser':
        return await handleDeleteUser(payload, res);
      case 'requestOTP':
        return await handleRequestOTP(payload, res);
      case 'resetPasswordWithOTP':
        return await handleResetPasswordWithOTP(payload, res);
      case 'confirmEmail':
        return await handleConfirmEmail(payload, res);

      // --- PROJECT & CLIENT GALLERY ---
      case 'getProjects':
        return await handleGetProjects(payload, res);
      case 'createProject':
        return await handleCreateProject(payload, res);
      case 'getProjectForClient':
        return await handleGetProjectForClient(payload, res);
      case 'verifyClientPassword':
        return await handleVerifyClientPassword(payload, res);
      case 'updateClientPassword':
        return await handleUpdateClientPassword(payload, res);
      case 'updateClientStatus':
        return await handleUpdateClientStatus(payload, res);
      case 'deleteProject':
        return await handleDeleteProject(payload, res);
      case 'reopenProject':
        return await handleReopenProject(payload, res);
      case 'toggleProjectWatermark':
        return await handleToggleProjectWatermark(payload, res);

      // --- DASHBOARD & ANALYTICS ---
      case 'getDashboardStats':
        return await handleGetDashboardStats(payload, res);
      case 'logVisit':
        return await handleLogVisit(payload, res);

      // --- FEEDBACK & NOTIFICATIONS ---
      case 'submitFeedback':
        return await handleSubmitFeedback(payload, res);
      case 'getFeedbacks':
        return await handleGetFeedbacks(payload, res);
      case 'replyFeedback':
        return await handleReplyFeedback(payload, res);
      case 'getAllNotifications':
        return await handleGetAllNotifications(payload, res);
      case 'markFeedbackRead':
        return await handleMarkFeedbackRead(payload, res);
      case 'getSystemUpdates':
        return await handleGetSystemUpdates(payload, res);
      case 'syncBackground':
        return await handleSyncBackground(payload, res);

      // Fallback
      default:
        return error(res, `Unknown action: ${action}`, 404);
    }

  } catch (err) {
    console.error('Supabase API Handler Error:', err);
    return error(res, err.message || 'Internal Server Error', 500);
  }
};

// ==========================================
// CONTROLLERS IMPLEMENTATION
// ==========================================

// 1. LOGIN
async function handleLogin(payload, res) {
  const username = (payload.username || '').trim();
  const password = (payload.password || '').trim();

  if (!username || !password) {
    return error(res, 'Username dan Password wajib diisi.');
  }

  const users = await supabaseQuery(`users?username=ilike.${encodeURIComponent(username)}&select=*`);
  if (!users || users.length === 0) {
    return error(res, 'Username atau password salah.');
  }

  const user = users[0];
  const hashedInput = hashPassword(password);

  // Verifikasi hash (atau plain-text fallback jika ada user migrasi lama)
  const isMatch = (user.password_hash === hashedInput) || (user.password_hash === password);
  if (!isMatch) {
    return error(res, 'Username atau password salah.');
  }

  if (user.status === 'Unverified') {
    return error(res, 'Akun Anda belum diverifikasi. Silakan cek email Anda.');
  }

  if (user.status === 'Pending') {
    return error(res, 'Akun Anda sedang menunggu persetujuan (ACC) dari Admin.');
  }

  // Generate Session
  const sessionId = crypto.randomUUID();
  try {
    await supabaseQuery('sessions', {
      method: 'POST',
      body: { session_id: sessionId, username: user.username, role: user.role }
    });
  } catch (e) { }

  // Update Last Active
  await supabaseQuery(`users?username=eq.${encodeURIComponent(user.username)}`, {
    method: 'PATCH',
    body: { last_active: new Date().toISOString() }
  }).catch(() => { });

  const rawPaket = user.paket || '';
  const isDemo = (!rawPaket || rawPaket.toUpperCase().includes('DEMO') || user.role === 'Demo');
  const isPro = Boolean(user.akses_watermark || rawPaket.toUpperCase().includes('PRO'));

  const userData = {
    username: user.username,
    nama: user.nama,
    role: user.role,
    status: user.status,
    brandName: user.brand_name || 'Photo Selection',
    brandLogo: user.brand_logo || '',
    watermarkUrl: user.watermark_url || '',
    bankName: user.bank_name || '',
    bankAccount: user.bank_account || '',
    bankAccountName: user.bank_account_name || '',
    email: user.email || '',
    nohp: user.no_hp || '',
    paket: user.paket || '1 Bulan',
    expiredAt: user.expired_at || 'Lifetime',
    isPremiumAddon: isPro,
    sessionId: sessionId
  };

  return success(res, userData, 'Login Berhasil');
}

// 2. REGISTER
async function handleRegister(payload, res) {
  const d = payload.data || {};
  const nama = (d.nama || '').trim();
  const email = (d.email || '').trim().toLowerCase();
  const nohp = (d.nohp || '').trim();
  const username = (d.username || '').trim().toLowerCase().replace(/\s+/g, '');
  const password = (d.password || '').trim();
  const paket = d.paket || '1 Bulan';

  if (!nama || !email || !username || !password) {
    return error(res, 'Lengkapi semua isian pendaftaran.');
  }

  // Cek apakah username sudah ada
  const existing = await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}&select=id`);
  if (existing && existing.length > 0) {
    return error(res, 'Username sudah digunakan. Silakan pilih username lain.');
  }

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
    username: username,
    password_hash: passHash,
    nama: nama,
    role: isDemo ? 'Demo' : 'Photographer',
    status: initialStatus,
    email: email,
    no_hp: nohp,
    paket: paket,
    expired_at: expiredAt,
    confirm_token: confirmToken,
    project_created: 0,
    created_at: new Date().toISOString()
  };

  await supabaseQuery('users', { method: 'POST', body: newUser });

  // Tentukan link pembayaran Mayar jika bukan paket demo
  let paymentUrl = '';
  if (paket === '1 Bulan') paymentUrl = 'https://kamacreative.myr.id/pl/paket-1-bulan-photo-selection';
  else if (paket === '6 Bulan') paymentUrl = 'https://kamacreative.myr.id/pl/paket-6-bulan-photo-selection';
  else if (paket === '1 Tahun') paymentUrl = 'https://kamacreative.myr.id/pl/paket-1-tahunn-photo-selection';
  else if (paket === 'Lifetime') paymentUrl = 'https://kamacreative.myr.id/pl/paket-lifetime-photo-selection';

  return success(res, { success: true, paymentUrl: paymentUrl }, 'Pendaftaran berhasil');
}

// 3. GET GLOBAL BRANDING
async function handleGetGlobalBranding(payload, res) {
  try {
    const adminUsers = await supabaseQuery('users?role=eq.Admin&select=brand_name,brand_logo&limit=1');
    if (adminUsers && adminUsers.length > 0) {
      return success(res, {
        success: true,
        brandName: adminUsers[0].brand_name || 'Photo Selection',
        brandLogo: adminUsers[0].brand_logo || ''
      });
    }
  } catch (e) { }
  return success(res, { success: true, brandName: 'Photo Selection', brandLogo: '' });
}

// 4. SAVE BRAND SETTINGS
async function handleSaveBrandSettings(payload, res) {
  const username = (payload.username || '').trim();
  const brandName = (payload.brandName || '').trim();
  const brandLogo = (payload.brandLogo || '').trim();
  const watermarkUrl = (payload.watermarkUrl || '').trim();

  if (!username) return error(res, 'Username required');

  const updateBody = { brand_name: brandName, brand_logo: brandLogo, updated_at: new Date().toISOString() };
  if (watermarkUrl) updateBody.watermark_url = watermarkUrl;

  await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true, brandName: brandName, brandLogo: brandLogo }, 'Pengaturan brand disimpan');
}

// 5. SAVE PAYMENT SETTINGS
async function handleSavePaymentSettings(payload, res) {
  const username = (payload.username || '').trim();
  const bankName = (payload.bankName || '').trim();
  const bankAccount = (payload.bankAccount || '').trim();
  const bankAccountName = (payload.bankAccountName || '').trim();

  if (!username) return error(res, 'Username required');

  await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { bank_name: bankName, bank_account: bankAccount, bank_account_name: bankAccountName, updated_at: new Date().toISOString() }
  });

  return success(res, { success: true, bankName, bankAccount, bankAccountName }, 'Data pembayaran disimpan');
}

// 6. PING USER
async function handlePingUser(payload, res) {
  const user = payload.currentUser || {};
  if (user.username) {
    await supabaseQuery(`users?username=eq.${encodeURIComponent(user.username)}`, {
      method: 'PATCH',
      body: { last_active: new Date().toISOString() }
    }).catch(() => { });
  }
  return success(res, { ok: true });
}

// 7. GET PROJECTS
async function handleGetProjects(payload, res) {
  const user = payload.currentUser || {};
  const username = user.username || payload.username || '';
  const role = user.role || payload.role || 'Photographer';

  let endpoint = 'projects?select=*&order=created_at.desc';
  if (role !== 'Admin') {
    endpoint = `projects?owner=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc`;
  }

  const rows = await supabaseQuery(endpoint);
  
  // Format ke objek respons standar aplikasi
  const formatted = (rows || []).map(p => {
    let daftarPilihan = p.daftar_pilihan || [];
    if (typeof daftarPilihan === 'string') {
      try { daftarPilihan = JSON.parse(daftarPilihan); } catch (e) { }
    }
    let notes = p.notes || {};
    if (typeof notes === 'string') {
      try { notes = JSON.parse(notes); } catch (e) { }
    }

    return {
      ID: p.id,
      Token: p.token,
      ShortSlug: p.short_slug,
      NamaClient: p.nama_client,
      NomorWA: p.nomor_wa,
      PasswordClient: p.password_client,
      MaxFoto: p.max_foto,
      DriveLink: p.drive_link,
      Owner: p.owner,
      ShortLink: p.short_link,
      Kategori: p.kategori || [],
      UseWatermark: p.use_watermark,
      UseWatermarkTiled: p.use_watermark_tiled,
      ClientLayout: p.client_layout,
      ExtraPrice: p.extra_price,
      MusicUrl: p.music_url,
      AksesPilih: p.akses_pilih,
      AksesDownload: p.akses_download,
      DurasiPilih: p.durasi_pilih,
      DurasiDownload: p.durasi_download,
      Deadline: p.deadline,
      StatusClient: p.status_client,
      FotoTerpilih: p.foto_terpilih,
      DaftarPilihan: daftarPilihan,
      Notes: notes,
      PaymentProof: p.payment_proof,
      BackupDrive: p.backup_drive,
      LastUpdate: p.last_update,
      TanggalDibuat: p.created_at
    };
  });

  return success(res, formatted);
}

// 8. CREATE PROJECT
async function handleCreateProject(payload, res) {
  const d = payload.data || {};
  const user = payload.currentUser || {};
  const username = user.username || d.username;

  if (!username) return error(res, 'User authentication required');

  const token = crypto.randomBytes(6).toString('hex');
  const baseSlug = (d.nama || 'client').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const shortSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
  const shortLink = `https://ps.kamacreative.my.id/app?c=${shortSlug}`;

  let deadline = '';
  if (d.durasiPilih && d.durasiPilih !== 'Selamanya') {
    const days = parseInt(d.durasiPilih) || 7;
    const dlDate = new Date();
    dlDate.setDate(dlDate.getDate() + days);
    deadline = dlDate.toISOString();
  }

  const newProject = {
    token: token,
    short_slug: shortSlug,
    nama_client: d.nama || 'Untitled Client',
    nomor_wa: d.wa || '',
    password_client: d.pass || '',
    max_foto: parseInt(d.max) || 50,
    drive_link: d.link || '',
    owner: username,
    short_link: shortLink,
    kategori: d.categories || [],
    use_watermark: Boolean(d.useWatermark),
    use_watermark_tiled: Boolean(d.useWatermarkTiled),
    client_layout: d.layout || 'masonry',
    extra_price: parseInt(d.extra) || 0,
    music_url: d.music || '',
    akses_pilih: d.aksesPilih !== false,
    akses_download: d.aksesDownload !== false,
    durasi_pilih: d.durasiPilih || 'Selamanya',
    durasi_download: d.durasiDownload || 'Selamanya',
    deadline: deadline,
    status_client: 'Belum Memilih',
    foto_terpilih: 0,
    daftar_pilihan: [],
    notes: {},
    created_at: new Date().toISOString()
  };

  const created = await supabaseQuery('projects', { method: 'POST', body: newProject });

  // Increment project count on user
  try {
    const uRows = await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}&select=project_created`);
    if (uRows && uRows.length > 0) {
      const currentCount = uRows[0].project_created || 0;
      await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: { project_created: currentCount + 1 }
      });
    }
  } catch (e) { }

  return success(res, {
    success: true,
    token: token,
    shortSlug: shortSlug,
    url: shortLink,
    project: created ? created[0] : newProject
  }, 'Project berhasil dibuat');
}

// 9. GET PROJECT FOR CLIENT
async function handleGetProjectForClient(payload, res) {
  const tokenOrSlug = (payload.token || '').trim();
  if (!tokenOrSlug) return error(res, 'Token or slug is required');

  // Cari berdasarkan token atau short_slug
  let projects = await supabaseQuery(`projects?token=eq.${encodeURIComponent(tokenOrSlug)}&select=*`);
  if (!projects || projects.length === 0) {
    projects = await supabaseQuery(`projects?short_slug=eq.${encodeURIComponent(tokenOrSlug)}&select=*`);
  }

  if (!projects || projects.length === 0) {
    return error(res, 'Project tidak ditemukan atau link sudah kedaluwarsa.', 404);
  }

  const project = projects[0];

  // Ambil info branding pemilik project (fotografer)
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
    const owners = await supabaseQuery(`users?username=eq.${encodeURIComponent(project.owner)}&select=*`);
    if (owners && owners.length > 0) {
      const o = owners[0];
      ownerBrand = {
        brandName: o.brand_name || 'Photo Selection',
        brandLogo: o.brand_logo || '',
        watermarkUrl: o.watermark_url || '',
        bankName: o.bank_name || '',
        bankAccount: o.bank_account || '',
        bankAccountName: o.bank_account_name || '',
        isPremiumAddon: Boolean(o.akses_watermark || (o.paket && o.paket.includes('PRO')))
      };
    }
  } catch (e) { }

  let daftarPilihan = project.daftar_pilihan || [];
  if (typeof daftarPilihan === 'string') {
    try { daftarPilihan = JSON.parse(daftarPilihan); } catch (e) { }
  }

  let notes = project.notes || {};
  if (typeof notes === 'string') {
    try { notes = JSON.parse(notes); } catch (e) { }
  }

  return success(res, {
    success: true,
    token: project.token,
    slug: project.short_slug,
    namaClient: project.nama_client,
    nomorWA: project.nomor_wa,
    hasPassword: Boolean(project.password_client && project.password_client.trim() !== ''),
    maxFoto: project.max_foto,
    driveLink: project.drive_link,
    owner: project.owner,
    kategori: project.kategori || [],
    useWatermark: project.use_watermark,
    useWatermarkTiled: project.use_watermark_tiled,
    clientLayout: project.client_layout || 'masonry',
    extraPrice: project.extra_price || 0,
    musicUrl: project.music_url || '',
    aksesPilih: project.akses_pilih,
    aksesDownload: project.akses_download,
    durasiPilih: project.durasi_pilih,
    durasiDownload: project.durasi_download,
    deadline: project.deadline,
    statusClient: project.status_client,
    fotoTerpilih: project.foto_terpilih,
    daftarPilihan: daftarPilihan,
    notes: notes,
    paymentProof: project.payment_proof,
    brandName: ownerBrand.brandName,
    brandLogo: ownerBrand.brandLogo,
    watermarkUrl: ownerBrand.watermarkUrl,
    bankName: ownerBrand.bankName,
    bankAccount: ownerBrand.bankAccount,
    bankAccountName: ownerBrand.bankAccountName,
    isPremiumAddon: ownerBrand.isPremiumAddon
  });
}

// 10. VERIFY CLIENT PASSWORD
async function handleVerifyClientPassword(payload, res) {
  const token = (payload.token || '').trim();
  const password = (payload.password || '').trim();

  let projects = await supabaseQuery(`projects?token=eq.${encodeURIComponent(token)}&select=password_client`);
  if (!projects || projects.length === 0) {
    projects = await supabaseQuery(`projects?short_slug=eq.${encodeURIComponent(token)}&select=password_client`);
  }

  if (!projects || projects.length === 0) return error(res, 'Project tidak ditemukan');

  const p = projects[0];
  const isValid = (!p.password_client || p.password_client === password);
  return success(res, { success: isValid }, isValid ? 'Password benar' : 'Password salah');
}

// 11. UPDATE CLIENT PASSWORD
async function handleUpdateClientPassword(payload, res) {
  const token = (payload.token || '').trim();
  const password = (payload.password || '').trim();
  await supabaseQuery(`projects?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: { password_client: password, last_update: new Date().toISOString() }
  });
  return success(res, { success: true }, 'Password galeri diperbarui');
}

// 12. UPDATE CLIENT STATUS & SELECTIONS
async function handleUpdateClientStatus(payload, res) {
  const token = (payload.token || '').trim();
  if (!token) return error(res, 'Token required');

  const status = payload.status || 'Sedang Memilih';
  const fotoTerpilih = parseInt(payload.fotoTerpilih) || 0;
  let daftarPilihan = payload.daftarPilihan || [];
  let notes = payload.notes || {};
  const paymentProof = payload.paymentProof || '';

  const updateBody = {
    status_client: status,
    foto_terpilih: fotoTerpilih,
    daftar_pilihan: daftarPilihan,
    notes: notes,
    last_update: new Date().toISOString()
  };

  if (paymentProof) updateBody.payment_proof = paymentProof;

  await supabaseQuery(`projects?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true }, 'Status pilihan berhasil disimpan');
}

// 13. DELETE PROJECT
async function handleDeleteProject(payload, res) {
  const token = (payload.token || '').trim();
  const user = payload.currentUser || {};

  let query = `projects?token=eq.${encodeURIComponent(token)}`;
  if (user.role !== 'Admin') {
    query += `&owner=eq.${encodeURIComponent(user.username)}`;
  }

  await supabaseQuery(query, { method: 'DELETE' });
  return success(res, { success: true }, 'Project berhasil dihapus');
}

// 14. REOPEN PROJECT
async function handleReopenProject(payload, res) {
  const token = (payload.token || '').trim();
  await supabaseQuery(`projects?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: { status_client: 'Sedang Memilih', last_update: new Date().toISOString() }
  });
  return success(res, { success: true }, 'Project berhasil dibuka kembali');
}

// 15. TOGGLE PROJECT WATERMARK
async function handleToggleProjectWatermark(payload, res) {
  const token = (payload.token || '').trim();
  const useWatermark = Boolean(payload.useWatermark);
  await supabaseQuery(`projects?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: { use_watermark: useWatermark, last_update: new Date().toISOString() }
  });
  return success(res, { success: true, useWatermark }, 'Status watermark diperbarui');
}

// 16. DASHBOARD STATS
async function handleGetDashboardStats(payload, res) {
  const allUsers = await supabaseQuery('users?select=id,status,expired_at,username,role');
  const allProjects = await supabaseQuery('projects?select=id');
  const analyticsRows = await supabaseQuery('analytics?select=id,visitor_id');

  const totalUsers = allUsers ? allUsers.length : 0;
  const activeUsers = allUsers ? allUsers.filter(u => u.status === 'Active').length : 0;
  const pendingUsers = allUsers ? allUsers.filter(u => u.status === 'Pending').length : 0;
  const inactiveUsers = allUsers ? allUsers.filter(u => u.status === 'Inactive' || u.status === 'Expired').length : 0;
  const totalProjects = allProjects ? allProjects.length : 0;

  const totalViews = analyticsRows ? analyticsRows.length : 0;
  const uniqueVisitors = analyticsRows ? new Set(analyticsRows.map(r => r.visitor_id)).size : 0;

  // Hitung user yang akan expired dalam <= 30 hari
  const now = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(now.getDate() + 30);

  const expiringSoon = (allUsers || []).filter(u => {
    if (u.role === 'Admin' || u.expired_at === 'Lifetime' || !u.expired_at) return false;
    const exp = new Date(u.expired_at);
    return exp >= now && exp <= thirtyDaysLater;
  }).map(u => ({ username: u.username, expiredAt: u.expired_at }));

  return success(res, {
    totalViews,
    uniqueVisitors,
    totalProjects,
    totalUsers,
    activeUsers,
    inactiveUsers,
    pendingUsers,
    expiringSoon
  });
}

// 17. LOG VISIT
async function handleLogVisit(payload, res) {
  const type = payload.type || 'VIEW';
  const page = payload.page || 'LANDING_PAGE';
  const visitorId = payload.visitorId || 'anon';

  await supabaseQuery('analytics', {
    method: 'POST',
    body: { type, page, visitor_id: visitorId, timestamp: new Date().toISOString() }
  }).catch(() => { });

  return success(res, { logged: true });
}

// 18. GET USERS (ADMIN ONLY)
async function handleGetUsers(payload, res) {
  const user = payload.currentUser || {};
  if (user.role !== 'Admin') return error(res, 'Unauthorized access', 403);

  const users = await supabaseQuery('users?select=id,username,nama,role,status,brand_name,brand_logo,email,no_hp,paket,expired_at,project_created,akses_watermark,last_active,created_at&order=created_at.desc');
  return success(res, users || []);
}

// 19. APPROVE USER
async function handleApproveUser(payload, res) {
  const username = (payload.username || '').trim();
  const expiredAt = payload.expiredAt || 'Lifetime';
  const role = payload.role || 'Photographer';

  await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { status: 'Active', expired_at: expiredAt, role: role, updated_at: new Date().toISOString() }
  });

  return success(res, { success: true }, 'User disetujui');
}

// 20. UPDATE EXPIRY
async function handleUpdateExpiry(payload, res) {
  const username = (payload.username || '').trim();
  const expiredAt = payload.expiredAt;
  const paket = payload.paket || '1 Bulan';

  await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { expired_at: expiredAt, paket: paket, status: 'Active', updated_at: new Date().toISOString() }
  });

  return success(res, { success: true }, 'Masa aktif diperbarui');
}

// 21. DELETE USER
async function handleDeleteUser(payload, res) {
  const username = (payload.username || '').trim();
  await supabaseQuery(`projects?owner=eq.${encodeURIComponent(username)}`, { method: 'DELETE' });
  await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}`, { method: 'DELETE' });
  return success(res, { success: true }, 'User dan project berhasil dihapus');
}

// 22. REQUEST OTP
async function handleRequestOTP(payload, res) {
  const email = (payload.email || '').trim().toLowerCase();
  const users = await supabaseQuery(`users?email=eq.${encodeURIComponent(email)}&select=username,email`);
  if (!users || users.length === 0) return error(res, 'Email tidak terdaftar.');

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await supabaseQuery('reset_tokens', {
    method: 'POST',
    body: { username: users[0].username, otp: otp, created_at: new Date().toISOString() }
  });

  // Kirim email via provider email jika ada
  return success(res, { success: true, otp: otp }, 'Kode OTP berhasil dibuat');
}

// 23. RESET PASSWORD WITH OTP
async function handleResetPasswordWithOTP(payload, res) {
  const email = (payload.email || '').trim().toLowerCase();
  const otp = (payload.otp || '').trim();
  const newPassword = (payload.newPassword || '').trim();

  const users = await supabaseQuery(`users?email=eq.${encodeURIComponent(email)}&select=username`);
  if (!users || users.length === 0) return error(res, 'User tidak ditemukan.');

  const username = users[0].username;
  const tokens = await supabaseQuery(`reset_tokens?username=eq.${encodeURIComponent(username)}&otp=eq.${encodeURIComponent(otp)}&order=created_at.desc&limit=1`);
  if (!tokens || tokens.length === 0) return error(res, 'Kode OTP salah atau tidak berlaku.');

  const newHash = hashPassword(newPassword);
  await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { password_hash: newHash, updated_at: new Date().toISOString() }
  });

  // Hapus token yang sudah dipakai
  await supabaseQuery(`reset_tokens?username=eq.${encodeURIComponent(username)}`, { method: 'DELETE' }).catch(() => { });

  return success(res, { success: true }, 'Password berhasil direset. Silakan login.');
}

// 24. CONFIRM EMAIL
async function handleConfirmEmail(payload, res) {
  const token = (payload.token || '').trim();
  const users = await supabaseQuery(`users?confirm_token=eq.${encodeURIComponent(token)}&select=username`);
  if (!users || users.length === 0) return error(res, 'Token verifikasi tidak valid atau sudah kedaluwarsa.');

  await supabaseQuery(`users?confirm_token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: { status: 'Active', confirm_token: '', updated_at: new Date().toISOString() }
  });

  return success(res, { success: true }, 'Email berhasil diverifikasi! Akun Anda kini aktif.');
}

// 25. SUBMIT FEEDBACK
async function handleSubmitFeedback(payload, res) {
  const user = payload.currentUser || {};
  const pesan = (payload.pesan || '').trim();
  const lampiranUrl = payload.lampiranUrl || '';

  if (!pesan) return error(res, 'Pesan feedback tidak boleh kosong.');

  const fbId = 'fb_' + Date.now();
  await supabaseQuery('feedbacks', {
    method: 'POST',
    body: {
      id: fbId,
      username: user.username || 'Anonymous',
      role: user.role || 'Photographer',
      pesan: pesan,
      lampiran_url: lampiranUrl,
      tanggal: new Date().toISOString(),
      status_admin: 'Unread',
      status_user: 'Read'
    }
  });

  return success(res, { success: true }, 'Feedback berhasil dikirim.');
}

// 26. GET FEEDBACKS
async function handleGetFeedbacks(payload, res) {
  const user = payload.currentUser || {};
  let endpoint = 'feedbacks?select=*&order=tanggal.desc';
  if (user.role !== 'Admin') {
    endpoint = `feedbacks?username=eq.${encodeURIComponent(user.username)}&select=*&order=tanggal.desc`;
  }
  const rows = await supabaseQuery(endpoint);
  return success(res, rows || []);
}

// 27. REPLY FEEDBACK
async function handleReplyFeedback(payload, res) {
  const id = payload.id;
  const balasan = payload.balasan || '';

  await supabaseQuery(`feedbacks?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { balasan: balasan, tgl_balas: new Date().toISOString(), status_user: 'Unread' }
  });

  return success(res, { success: true }, 'Balasan berhasil dikirim.');
}

// 28. GET ALL NOTIFICATIONS
async function handleGetAllNotifications(payload, res) {
  const user = payload.currentUser || {};
  let fbEndpoint = 'feedbacks?select=*&order=tanggal.desc';
  if (user.role !== 'Admin') {
    fbEndpoint = `feedbacks?username=eq.${encodeURIComponent(user.username)}&select=*&order=tanggal.desc`;
  }

  const feedbacks = (await supabaseQuery(fbEndpoint)) || [];
  const systemUpdates = (await supabaseQuery('system_updates?status=eq.Active&select=*&order=tanggal.desc')) || [];

  const formattedFeedbacks = feedbacks.map(f => ({
    ID: f.id,
    Username: f.username,
    Pesan: f.pesan,
    Balasan: f.balasan,
    Tanggal: f.tanggal,
    StatusAdmin: f.status_admin,
    StatusUser: f.status_user
  }));

  const formattedUpdates = systemUpdates.map(s => ({
    ID: s.id,
    Tanggal: s.tanggal,
    Judul: s.judul,
    Pesan: s.pesan,
    Versi: s.versi
  }));

  return success(res, { feedbacks: formattedFeedbacks, systemUpdates: formattedUpdates });
}

// 29. MARK FEEDBACK READ
async function handleMarkFeedbackRead(payload, res) {
  const user = payload.currentUser || {};
  const type = payload.type || 'user';

  if (type === 'admin' && user.role === 'Admin') {
    await supabaseQuery('feedbacks?status_admin=eq.Unread', {
      method: 'PATCH',
      body: { status_admin: 'Read' }
    }).catch(() => { });
  } else if (user.username) {
    await supabaseQuery(`feedbacks?username=eq.${encodeURIComponent(user.username)}&status_user=eq.Unread`, {
      method: 'PATCH',
      body: { status_user: 'Read' }
    }).catch(() => { });
  }

  return success(res, { ok: true });
}

// 30. GET SYSTEM UPDATES
async function handleGetSystemUpdates(payload, res) {
  const rows = await supabaseQuery('system_updates?status=eq.Active&select=*&order=tanggal.desc');
  return success(res, rows || []);
}

// 31. SYNC BACKGROUND
async function handleSyncBackground(payload, res) {
  const user = payload.currentUser || {};
  const username = user.username;
  if (!username) return error(res, 'User required');

  const users = await supabaseQuery(`users?username=eq.${encodeURIComponent(username)}&select=*`);
  const projects = await supabaseQuery(`projects?owner=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc`);

  return success(res, {
    user: users && users.length > 0 ? users[0] : null,
    projects: projects || []
  });
}

// 32. MAYAR WEBHOOK AUTO-ACTIVATION
async function handleMayarWebhook(payload, res) {
  const event = payload.event;
  const d = payload.data || {};
  const customer = d.customer || {};
  const email = (customer.email || '').trim().toLowerCase();
  const mobile = (customer.mobile || customer.phone || '').trim();
  const name = (customer.name || '').trim();
  const product = (d.productName || d.description || '').toUpperCase();

  let targetUser = null;

  // 1. Cari user di Supabase berdasarkan email
  if (email) {
    const byEmail = await supabaseQuery(`users?email=eq.${encodeURIComponent(email)}&select=*`);
    if (byEmail && byEmail.length > 0) targetUser = byEmail[0];
  }

  // 2. Cari berdasarkan No HP jika belum ketemu
  if (!targetUser && mobile) {
    const cleanPhone = mobile.replace(/[^0-9]/g, '');
    const byPhone = await supabaseQuery(`users?no_hp=like.*${encodeURIComponent(cleanPhone)}*&select=*`);
    if (byPhone && byPhone.length > 0) targetUser = byPhone[0];
  }

  let hasilAktivasi = 'User tidak ditemukan';

  if (targetUser) {
    let addDays = 30;
    let paketName = '1 Bulan';

    if (product.includes('6 BULAN') || product.includes('6-BULAN')) {
      addDays = 180;
      paketName = '6 Bulan';
    } else if (product.includes('1 TAHUN') || product.includes('1-TAHUN') || product.includes('12 BULAN')) {
      addDays = 365;
      paketName = '1 Tahun';
    } else if (product.includes('LIFETIME') || product.includes('SELAMANYA')) {
      addDays = 36500;
      paketName = 'Lifetime';
    }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + addDays);
    const expiredAt = (paketName === 'Lifetime') ? 'Lifetime' : expDate.toISOString().split('T')[0];

    const isProAddon = product.includes('ADD-ON') || product.includes('ADDON') || product.includes('PRO');

    const updateData = {
      status: 'Active',
      updated_at: new Date().toISOString()
    };

    if (isProAddon) {
      updateData.akses_watermark = true;
      hasilAktivasi = `Berhasil aktivasi Add-On PRO untuk @${targetUser.username}`;
    } else {
      updateData.paket = paketName;
      updateData.expired_at = expiredAt;
      hasilAktivasi = `Berhasil perpanjang ${paketName} (Exp: ${expiredAt}) untuk @${targetUser.username}`;
    }

    await supabaseQuery(`users?username=eq.${encodeURIComponent(targetUser.username)}`, {
      method: 'PATCH',
      body: updateData
    });
  }

  // Catat Log ke tabel mayar_logs
  await supabaseQuery('mayar_logs', {
    method: 'POST',
    body: {
      event: event,
      customer_email: email,
      customer_name: name,
      status_product: product,
      hasil_aktivasi: hasilAktivasi,
      raw_payload: payload,
      timestamp: new Date().toISOString()
    }
  }).catch(() => { });

  return success(res, { status: 'processed', result: hasilAktivasi });
}

/**
 * API Handler Backend Berbasis Supabase (PostgreSQL)
 * 100% Kompatibel dengan Struktur Kolom Asli Google Sheets & Frontend app.html
 */

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jqptagcbkyxxqqmxqusf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_TL_Et1x8IlEwxKASjF0K8Q_t72R3f_9';
const KAMA_SALT = "KamaSecretSalt";

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

    if (payload.event && payload.data && (payload.event.includes('payment') || payload.event.includes('invoice') || payload.event.includes('transaction'))) {
      return await handleMayarWebhook(payload, res);
    }

    const action = payload.action;
    if (!action) return error(res, 'Action is required', 400);

    switch (action) {
      case 'login': return await handleLogin(payload, res);
      case 'register': return await handleRegister(payload, res);
      case 'getGlobalBranding': return await handleGetGlobalBranding(payload, res);
      case 'saveBrandSettings': return await handleSaveBrandSettings(payload, res);
      case 'savePaymentSettings': return await handleSavePaymentSettings(payload, res);
      case 'pingUser': return await handlePingUser(payload, res);
      case 'getUsers': return await handleGetUsers(payload, res);
      case 'approveUser': return await handleApproveUser(payload, res);
      case 'updateExpiry': return await handleUpdateExpiry(payload, res);
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
      case 'deleteProject': return await handleDeleteProject(payload, res);
      case 'reopenProject': return await handleReopenProject(payload, res);
      case 'toggleProjectWatermark': return await handleToggleProjectWatermark(payload, res);
      case 'getDashboardStats': return await handleGetDashboardStats(payload, res);
      case 'logVisit': return await handleLogVisit(payload, res);
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

// --- CONTROLLERS ---

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

  let paymentUrl = '';
  if (paket === '1 Bulan') paymentUrl = 'https://kamacreative.myr.id/pl/paket-1-bulan-photo-selection';
  else if (paket === '6 Bulan') paymentUrl = 'https://kamacreative.myr.id/pl/paket-6-bulan-photo-selection';
  else if (paket === '1 Tahun') paymentUrl = 'https://kamacreative.myr.id/pl/paket-1-tahunn-photo-selection';
  else if (paket === 'Lifetime') paymentUrl = 'https://kamacreative.myr.id/pl/paket-lifetime-photo-selection';

  return success(res, { success: true, paymentUrl: paymentUrl }, 'Pendaftaran berhasil');
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
  if (watermarkUrl) updateBody.WatermarkUrl = watermarkUrl;

  await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true, brandName, brandLogo });
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

  return success(res, { success: true, bankName, bankAccount, bankAccountName });
}

async function handlePingUser(payload, res) {
  const user = payload.currentUser || {};
  if (user.username) {
    await supabaseQuery(`users?Username=eq.${encodeURIComponent(user.username)}`, {
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
    const statusClient = p['Status Client'] || p.Status || 'Belum Memilih';
    const fotoTerpilih = Number(p['Foto Terpilih']) || 0;
    const shortLink = p['Short Link'] || `https://ps.kamacreative.my.id/app?c=${shortSlug}`;
    const paymentProof = p['Payment Proof'] || p.PaymentProof || '';

    return {
      ID: p.id || p.ID,
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
      TanggalDibuat: dibuatPada
    };
  });

  return success(res, { success: true, data: formatted });
}

async function handleCreateProject(payload, res) {
  const d = payload.formData || payload.data || payload || {};
  const user = payload.currentUser || d.currentUser || {};
  const username = user.username || d.username || payload.username || 'admin';

  const token = crypto.randomBytes(6).toString('hex');
  const clientName = d.namaClient || d.nama || d['Nama Client'] || 'Untitled Client';
  const baseSlug = clientName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'client';
  const shortSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
  const shortLink = `https://ps.kamacreative.my.id/app?c=${shortSlug}`;

  let deadline = d.deadline || '';
  if (!deadline && d.durasiPilih && d.durasiPilih !== 'Selamanya') {
    const days = parseInt(d.durasiPilih) || 7;
    const dlDate = new Date();
    dlDate.setDate(dlDate.getDate() + days);
    deadline = dlDate.toISOString();
  }

  const newProject = {
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

  let projects = await supabaseQuery(`projects?or=(Token.eq.${encodeURIComponent(tokenOrSlug)},Slug.eq.${encodeURIComponent(tokenOrSlug)},"Short Slug".eq.${encodeURIComponent(tokenOrSlug)})&select=*`);
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
    useWatermark: String(p.UseWatermark).toUpperCase() === 'TRUE',
    useWatermarkTiled: String(p.UseWatermarkTiled).toUpperCase() === 'TRUE',
    clientLayout: p.ClientLayout || 'masonry',
    extraPrice: Number(p.ExtraPrice) || 0,
    musicUrl: p.MusicUrl || p.MusicURL || '',
    aksesPilih: String(p.AksesPilih || p.Akses_Pilih).toUpperCase() !== 'FALSE',
    aksesDownload: String(p.AksesDownload || p.Akses_Download).toUpperCase() !== 'FALSE',
    durasiPilih: p.DurasiPilih || p.Durasi_Pilih,
    durasiDownload: p.DurasiDownload || p.Durasi_Download,
    deadline: p.Deadline,
    statusClient: p.Status || p['Status Client'] || 'Belum Memilih',
    fotoTerpilih: Number(p['Foto Terpilih']) || 0,
    daftarPilihan: dp,
    notes: nt,
    paymentProof: p.PaymentProof || p['Payment Proof'],
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
  const password = (payload.password || '').trim();

  let projects = await supabaseQuery(`projects?or=(Token.eq.${encodeURIComponent(token)},Slug.eq.${encodeURIComponent(token)})&select=*`);
  if (!projects || projects.length === 0) return error(res, 'Project tidak ditemukan');

  const p = projects[0];
  const storedPass = p['Password Client'] || '';
  const isValid = (!storedPass || storedPass === password);
  return success(res, { success: isValid });
}

async function handleUpdateClientPassword(payload, res) {
  const token = (payload.token || '').trim();
  const password = (payload.password || '').trim();
  await supabaseQuery(`projects?Token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: { 'Password Client': password }
  });
  return success(res, { success: true });
}

async function handleUpdateClientStatus(payload, res) {
  const token = (payload.token || '').trim();
  if (!token) return error(res, 'Token required');

  const status = payload.status || 'Sedang Memilih';
  const fotoTerpilih = String(payload.fotoTerpilih || 0);
  const daftarPilihan = JSON.stringify(payload.daftarPilihan || []);
  const notes = JSON.stringify(payload.notes || {});
  const paymentProof = payload.paymentProof || '';

  const updateBody = {
    Status: status,
    'Status Client': status,
    'Foto Terpilih': fotoTerpilih,
    'Daftar Pilihan': daftarPilihan,
    Notes: notes
  };
  if (paymentProof) {
    updateBody.PaymentProof = paymentProof;
    updateBody['Payment Proof'] = paymentProof;
  }

  await supabaseQuery(`projects?Token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: updateBody
  });

  return success(res, { success: true });
}

async function handleDeleteProject(payload, res) {
  const token = (payload.token || '').trim();
  await supabaseQuery(`projects?Token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' });
  return success(res, { success: true });
}

async function handleReopenProject(payload, res) {
  const token = (payload.token || '').trim();
  await supabaseQuery(`projects?Token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: { Status: 'Sedang Memilih', 'Status Client': 'Sedang Memilih' }
  });
  return success(res, { success: true });
}

async function handleToggleProjectWatermark(payload, res) {
  const token = (payload.token || payload.id || '').trim();
  const useWatermark = Boolean(payload.useWatermark);
  await supabaseQuery(`projects?or=(Token.eq.${encodeURIComponent(token)},id.eq.${encodeURIComponent(token)})`, {
    method: 'PATCH',
    body: { UseWatermark: String(useWatermark).toUpperCase() }
  });
  return success(res, { success: true, useWatermark });
}

async function handleGetDashboardStats(payload, res) {
  const allUsers = await supabaseQuery('users?select=*');
  const allProjects = await supabaseQuery('projects?select=id');
  const analyticsRows = await supabaseQuery('analytics?select=id,VisitorID');

  const totalUsers = allUsers ? allUsers.length : 0;
  const activeUsers = allUsers ? allUsers.filter(u => u.Status === 'Active').length : 0;
  const pendingUsers = allUsers ? allUsers.filter(u => u.Status === 'Pending').length : 0;
  const inactiveUsers = allUsers ? allUsers.filter(u => u.Status === 'Inactive').length : 0;
  const totalProjects = allProjects ? allProjects.length : 0;

  const totalViews = analyticsRows ? analyticsRows.length : 0;
  const uniqueVisitors = analyticsRows ? new Set(analyticsRows.map(r => r.VisitorID)).size : 0;

  const now = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(now.getDate() + 30);

  const expiringSoon = (allUsers || []).filter(u => {
    const exp = u.ExpiredAt;
    const role = u.Role;
    if (role === 'Admin' || exp === 'Lifetime' || !exp) return false;
    const expDate = new Date(exp);
    return expDate >= now && expDate <= thirtyDaysLater;
  }).map(u => ({ username: u.Username, expiredAt: u.ExpiredAt }));

  return success(res, {
    success: true,
    data: {
      totalViews,
      uniqueVisitors,
      totalProjects,
      totalUsers,
      activeUsers,
      inactiveUsers,
      pendingUsers,
      expiringSoonCount: expiringSoon.length,
      expiringUsers: expiringSoon
    }
  });
}

async function handleLogVisit(payload, res) {
  const type = payload.type || 'VIEW';
  const page = payload.page || 'LANDING_PAGE';
  const visitorId = payload.visitorId || 'anon';

  await supabaseQuery('analytics', {
    method: 'POST',
    body: { Type: type, Page: page, VisitorID: visitorId, Timestamp: new Date().toISOString() }
  }).catch(() => { });

  return success(res, { success: true, logged: true });
}

async function handleGetUsers(payload, res) {
  const user = payload.currentUser || {};
  if (user.role !== 'Admin') return error(res, 'Unauthorized', 403);

  const rows = await supabaseQuery('users?select=*&order=created_at.desc');
  const users = (rows || []).map(u => ({
    username: u.Username,
    nama: u.Nama,
    role: u.Role,
    status: u.Status,
    brand_name: u.BrandName,
    brand_logo: u.BrandLogo,
    email: u.Email,
    no_hp: u['No HP'],
    paket: u.Paket,
    expired_at: u.ExpiredAt,
    project_created: Number(u.ProjectCreated) || 0,
    akses_watermark: String(u.Akses_Watermark).toUpperCase() === 'TRUE',
    last_active: u.LastActive || u.created_at
  }));

  return success(res, { success: true, data: users });
}

async function handleApproveUser(payload, res) {
  const username = (payload.username || '').trim();
  const expiredAt = payload.expiredAt || 'Lifetime';
  const role = payload.role || 'Photographer';

  await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { Status: 'Active', ExpiredAt: expiredAt, Role: role }
  });

  return success(res, { success: true });
}

async function handleUpdateExpiry(payload, res) {
  const username = (payload.username || '').trim();
  const expiredAt = payload.expiredAt;
  const paket = payload.paket || '1 Bulan';

  await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: { ExpiredAt: expiredAt, Paket: paket, Status: 'Active' }
  });

  return success(res, { success: true });
}

async function handleDeleteUser(payload, res) {
  const username = (payload.username || '').trim();
  await supabaseQuery(`projects?Owner=eq.${encodeURIComponent(username)}`, { method: 'DELETE' });
  await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}`, { method: 'DELETE' });
  return success(res, { success: true });
}

async function handleRequestOTP(payload, res) {
  const email = (payload.email || '').trim().toLowerCase();
  const users = await supabaseQuery(`users?Email=eq.${encodeURIComponent(email)}&select=*`);
  if (!users || users.length === 0) return error(res, 'Email tidak terdaftar.');

  const uName = users[0].Username;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await supabaseQuery('reset_tokens', {
    method: 'POST',
    body: { Username: uName, OTP: otp, CreatedAt: new Date().toISOString() }
  });

  return success(res, { success: true, otp: otp });
}

async function handleResetPasswordWithOTP(payload, res) {
  const email = (payload.email || '').trim().toLowerCase();
  const otp = (payload.otp || '').trim();
  const newPassword = (payload.newPassword || '').trim();

  const users = await supabaseQuery(`users?Email=eq.${encodeURIComponent(email)}&select=*`);
  if (!users || users.length === 0) return error(res, 'User tidak ditemukan.');

  const uName = users[0].Username;
  const tokens = await supabaseQuery(`reset_tokens?Username=eq.${encodeURIComponent(uName)}&OTP=eq.${encodeURIComponent(otp)}&limit=1`);
  if (!tokens || tokens.length === 0) return error(res, 'Kode OTP salah.');

  const newHash = hashPassword(newPassword);
  await supabaseQuery(`users?Username=eq.${encodeURIComponent(uName)}`, {
    method: 'PATCH',
    body: { Password: newHash }
  });

  return success(res, { success: true });
}

async function handleConfirmEmail(payload, res) {
  const token = (payload.token || '').trim();
  await supabaseQuery(`users?ConfirmToken=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    body: { Status: 'Active', ConfirmToken: '' }
  });
  return success(res, { success: true });
}

async function handleSubmitFeedback(payload, res) {
  const user = payload.currentUser || {};
  const pesan = (payload.pesan || '').trim();
  const lampiranUrl = payload.lampiranUrl || '';
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

  return success(res, { success: true });
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
  const balasan = payload.balasan || '';
  await supabaseQuery(`feedbacks?ID=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { Balasan: balasan, TglBalas: new Date().toISOString(), StatusUser: 'Unread' }
  });
  return success(res, { success: true });
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
  if (!username) return error(res, 'User required');

  const users = await supabaseQuery(`users?Username=eq.${encodeURIComponent(username)}&select=*`);
  const projects = await supabaseQuery(`projects?Owner=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc`);

  return success(res, { success: true, user: users ? users[0] : null, projects: projects || [] });
}

async function handleMayarWebhook(payload, res) {
  const event = payload.event;
  const d = payload.data || {};
  const customer = d.customer || {};
  const email = (customer.email || '').trim().toLowerCase();
  const mobile = (customer.mobile || customer.phone || '').trim();
  const name = (customer.name || '').trim();
  const product = (d.productName || d.description || '').toUpperCase();

  let targetUser = null;
  if (email) {
    const byEmail = await supabaseQuery(`users?Email=eq.${encodeURIComponent(email)}&select=*`);
    if (byEmail && byEmail.length > 0) targetUser = byEmail[0];
  }
  if (!targetUser && mobile) {
    const cleanPhone = mobile.replace(/[^0-9]/g, '');
    const byPhone = await supabaseQuery(`users?No HP=like.*${encodeURIComponent(cleanPhone)}*&select=*`);
    if (byPhone && byPhone.length > 0) targetUser = byPhone[0];
  }

  let hasilAktivasi = 'User tidak ditemukan';
  if (targetUser) {
    let addDays = 30;
    let paketName = '1 Bulan';
    if (product.includes('6 BULAN')) { addDays = 180; paketName = '6 Bulan'; }
    else if (product.includes('1 TAHUN')) { addDays = 365; paketName = '1 Tahun'; }
    else if (product.includes('LIFETIME')) { addDays = 36500; paketName = 'Lifetime'; }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + addDays);
    const expiredAt = (paketName === 'Lifetime') ? 'Lifetime' : expDate.toISOString().split('T')[0];

    const uName = targetUser.Username;
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
  }

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

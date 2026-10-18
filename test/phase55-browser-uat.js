/**
 * PHOTO SELECTION PHASE 5.5 — ISOLATED MOCK SERVER & BROWSER UAT HARNESS
 * 
 * Server pengujian terisolasi 100% lokal untuk menjalankan UAT browser nyata:
 * - Menyajikan file aplikasi frontend (app.html, index.html, assets/css/*, assets/js/*).
 * - Menangani seluruh request `/api/bridge` dengan respon mock fixtures terkontrol.
 * - Mengisolasi mutlak dari Supabase Produksi, Mayar, GAS, WhatsApp.
 * - Digunakan oleh Antigravity browser_subagent untuk interaksi browser nyata.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.UAT_PORT || 4173;
const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

const zlib = require('zlib');
const FIXTURES_DIR = path.join(__dirname, 'phase55-fixtures');

// Generator PNG murni Node.js (400x500px, warna elegan dengan aksen border emas champagne)
function generateSolidPng(width, height, r, g, b) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    
    function makeChunk(type, data) {
        let c = 0xffffffff;
        const typeBuf = Buffer.from(type);
        for (let i = 0; i < 4; i++) c = (c >>> 8) ^ table[(c ^ typeBuf[i]) & 0xff];
        for (let i = 0; i < data.length; i++) c = (c >>> 8) ^ table[(c ^ data[i]) & 0xff];
        const crc = (c ^ 0xffffffff) >>> 0;
        
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(data.length, 0);
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc, 0);
        return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
    }
    
    const rawData = Buffer.alloc(height * (1 + width * 3));
    let offset = 0;
    for (let y = 0; y < height; y++) {
        rawData[offset++] = 0;
        // Border emas champagne 6px di sekeliling gambar
        const isBorder = (y < 6 || y >= height - 6);
        for (let x = 0; x < width; x++) {
            if (isBorder || x < 6 || x >= width - 6) {
                rawData[offset++] = 216; // R #D8BA83
                rawData[offset++] = 186; // G
                rawData[offset++] = 131; // B
            } else {
                rawData[offset++] = r;
                rawData[offset++] = g;
                rawData[offset++] = b;
            }
        }
    }
    
    const compressed = zlib.deflateSync(rawData);
    return Buffer.concat([signature, makeChunk('IHDR', ihdr), makeChunk('IDAT', compressed), makeChunk('IEND', Buffer.alloc(0))]);
}

function getFixtureBase64(filename, r, g, b) {
    const filePath = path.join(FIXTURES_DIR, filename);
    if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        return 'data:image/png;base64,' + buf.toString('base64');
    }
    const buf = generateSolidPng(400, 500, r, g, b);
    try {
        if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });
        fs.writeFileSync(filePath, buf);
    } catch (_) {}
    return 'data:image/png;base64,' + buf.toString('base64');
}

// Fixture 5 foto dummy berformat PNG base64 valid:
// Memenuhi regex app.html isSafeDataImageUrl: /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i
// Mencegah safeImageUrl jatuh ke fallback placehold.co!
const DUMMY_PHOTOS = [
    {
        id: 'img1',
        name: 'DSC_0001.JPG',
        url: getFixtureBase64('photo1.png', 24, 24, 36) // Noir Slate
    },
    {
        id: 'img2',
        name: 'DSC_0002.JPG',
        url: getFixtureBase64('photo2.png', 34, 34, 48) // Warm Charcoal
    },
    {
        id: 'img3',
        name: 'DSC_0003.JPG',
        url: getFixtureBase64('photo3.png', 44, 36, 32) // Deep Bronze
    },
    {
        id: 'img4',
        name: 'DSC_0004.JPG',
        url: getFixtureBase64('photo4.png', 28, 32, 48) // Midnight Indigo
    },
    {
        id: 'img5',
        name: 'DSC_0005.JPG',
        url: getFixtureBase64('photo5.png', 40, 38, 30) // Champagne Ochre
    }
];

function handleApiBridge(req, res, body) {
    let payload = {};
    try {
        payload = JSON.parse(body || '{}');
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
    }

    const action = payload.action;
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Photo-Selection-Isolation': 'MOCK-LOCAL-STRICT'
    });

    // 1. Client App Auth & Verification
    if (action === 'getProjectForClient') {
        return res.end(JSON.stringify({
            status: 'success',
            data: {
                needsPassword: true,
                hasPassword: true,
                namaClient: 'Siti & Budi Wedding',
                brandName: 'The Atelier Collection',
                brandLogo: ''
            }
        }));
    }

    if (action === 'verifyClientPassword') {
        const pin = String(payload.passwordInput || '').trim();
        if (pin === '1234') {
            return res.end(JSON.stringify({
                status: 'success',
                data: {
                    valid: true,
                    accessGranted: true,
                    clientAccessToken: 'mock-access-token-uat-55',
                    project: {
                        token: 'dummy-client-token',
                        namaClient: 'Siti & Budi Wedding',
                        brandName: 'The Atelier Collection',
                        nomorWA: '6281234567890',
                        maxFoto: 3,
                        extraPrice: 0,
                        isPilihActive: true,
                        isDownloadActive: false,
                        driveLink: 'mock-folder-root',
                        statusClient: 'Sedang Memilih',
                        selectedFiles: '[]',
                        clientLayout: 'masonry',
                        watermarkEnabled: false
                    }
                }
            }));
        } else {
            return res.end(JSON.stringify({
                status: 'error',
                message: 'Password galeri salah.'
            }));
        }
    }

    if (action === 'getDriveContent') {
        return res.end(JSON.stringify({
            status: 'success',
            data: {
                folders: [],
                images: DUMMY_PHOTOS
            }
        }));
    }

    if (action === 'pingClientStatus' || action === 'saveClientSelections' || action === 'saveSelections') {
        return res.end(JSON.stringify({
            status: 'success',
            message: 'Selections saved to isolated mock'
        }));
    }

    // 2. Authentication: Login Photographer & Admin
    if (action === 'login' || action === 'auth') {
        const username = String(payload.username || payload.email || '').toLowerCase();
        if (username.includes('admin')) {
            return res.end(JSON.stringify({
                status: 'success',
                data: {
                    token: 'mock-admin-token-uat',
                    sessionId: 'mock-admin-session',
                    user: {
                        id: 'admin-uat-1',
                        username: 'admin_atelier',
                        email: 'admin@atelier.local',
                        role: 'Admin',
                        paket: 'Lifetime',
                        status: 'Active',
                        sessionId: 'mock-admin-session'
                    }
                }
            }));
        } else {
            // Default: Photographer
            return res.end(JSON.stringify({
                status: 'success',
                data: {
                    token: 'mock-photographer-token-uat',
                    sessionId: 'mock-photo-session',
                    user: {
                        id: 'photo-uat-1',
                        username: 'kama_photographer',
                        email: 'photo@atelier.local',
                        role: 'Photographer',
                        paket: '1 Tahun',
                        status: 'Active',
                        expiredAt: '2027-10-18',
                        sessionId: 'mock-photo-session'
                    }
                }
            }));
        }
    }

    // 3. Photographer Workspace Mock Actions
    if (action === 'getProjects' || action === 'fetchProjects') {
        return res.end(JSON.stringify({
            status: 'success',
            data: [
                {
                    id: 'proj-1',
                    Token: 'token-proj-1',
                    Nama_Client: 'Siti & Budi Wedding',
                    Created_At: '2026-10-10',
                    Status_Client: 'Sedang Memilih',
                    Max_Foto: 3,
                    selectedFiles: '[]'
                },
                {
                    id: 'proj-2',
                    Token: 'token-proj-2',
                    Nama_Client: 'Annisa & Dimas Prewedding',
                    Created_At: '2026-10-12',
                    Status_Client: 'Selesai',
                    Max_Foto: 20,
                    selectedFiles: '[]'
                }
            ]
        }));
    }

    // 4. Admin Workspace Mock Actions
    if (action === 'getUsers' || action === 'adminGetUsers') {
        return res.end(JSON.stringify({
            status: 'success',
            data: [
                { id: 'u1', username: 'admin_atelier', email: 'admin@atelier.local', role: 'Admin', paket: 'Lifetime', status: 'Active' },
                { id: 'u2', username: 'pro_studio', email: 'pro@atelier.local', role: 'Photographer', paket: '1 Tahun', status: 'Active' },
                { id: 'u3', username: 'reguler_studio', email: 'reguler@atelier.local', role: 'Photographer', paket: '1 Bulan', status: 'Active' },
                { id: 'u4', username: 'demo_user', email: 'demo@atelier.local', role: 'Photographer', paket: 'Demo', status: 'Active' }
            ]
        }));
    }

    if (action === 'getAdminMetrics' || action === 'adminGetAnalytics' || action === 'getAnalytics') {
        return res.end(JSON.stringify({
            status: 'success',
            data: {
                totalUsers: 4,
                totalProjects: 12,
                traffic: [15, 30, 45, 60, 80, 110, 140],
                statusDistribution: { active: 3, pending: 1, expired: 0 }
            }
        }));
    }

    // Default Fallback
    return res.end(JSON.stringify({
        status: 'success',
        message: 'Mock fallback action processed cleanly',
        data: []
    }));
}

const server = http.createServer((req, res) => {
    let parsedUrl;
    try {
        parsedUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end('Bad Request');
    }
    let pathname = parsedUrl.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end();
    }

    // Intercept API Bridge
    if (pathname === '/api/bridge') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            handleApiBridge(req, res, body);
        });
        return;
    }

    // Default document mapping
    if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
    } else if (pathname === '/app') {
        pathname = '/app.html';
    } else if (pathname === '/login' || pathname === '/register') {
        pathname = '/app.html';
    }

    const filePath = path.join(ROOT_DIR, pathname);

    // Security check: ensure path stays within ROOT_DIR
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('File Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // STRICT CONTENT SECURITY POLICY (CSP):
        // Membatasi koneksi jaringan browser (fetch, XHR, WebSocket, EventSource)
        // HANYA ke server mock lokal ('self', 127.0.0.1:PORT, localhost:PORT).
        // Setiap upaya koneksi ke Supabase, Mayar, GAS, WhatsApp, atau host remote lainnya
        // akan langsung DIBLOKIR oleh browser sebelum paket jaringan keluar!
        const cspDirectives = [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com",
            `connect-src 'self' http://127.0.0.1:${PORT} http://localhost:${PORT}`,
            "img-src 'self' data: blob: https://images.unsplash.com",
            "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
            "media-src 'self' data: blob:",
            "form-action 'self'",
            "frame-ancestors 'none'"
        ].join('; ');

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Isolation-Status': 'PHOTO-SELECTION-MOCK-SANDBOX',
            'Content-Security-Policy': cspDirectives,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
    });
});

async function runIsolationAudit() {
    console.log('\n--- AUDIT KEMAMPUAN BROWSER & INTEGRITAS ISOLASI SERVER LOKAL ---');
    
    // 1. Audit Playwright / Puppeteer
    let pwStatus = 'TIDAK TERSEDIA';
    try { require.resolve('playwright'); pwStatus = 'TERSEDIA'; } catch (e) { }
    let pupStatus = 'TIDAK TERSEDIA';
    try { require.resolve('puppeteer'); pupStatus = 'TERSEDIA'; } catch (e) { }
    
    console.log(`- Playwright Framework : ${pwStatus}`);
    console.log(`- Puppeteer Framework  : ${pupStatus}`);
    console.log(`- Antigravity Subagent : DICOBA (Upstream Playwright Driver 404: https://playwright.azureedge.net/builds/driver/playwright-1.57.0-win32_x64.zip)`);
    console.log(`- Status Otomasi Browser: BLOCKED (Keterbatasan driver lingkungan upstream)`);

    // 2. HTTP Self-Tests terhadap mock server
    const http = require('http');
    function postJson(action, bodyObj = {}) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({ action, ...bodyObj });
            const req = http.request({
                hostname: '127.0.0.1',
                port: PORT,
                path: '/api/bridge',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            }, res => {
                let resBody = '';
                res.on('data', chunk => { resBody += chunk; });
                res.on('end', () => {
                    try { resolve({ status: res.statusCode, data: JSON.parse(resBody), headers: res.headers }); }
                    catch (err) { resolve({ status: res.statusCode, raw: resBody, headers: res.headers }); }
                });
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    function getPath(pathUrl) {
        return new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${PORT}${pathUrl}`, res => {
                let resBody = '';
                res.on('data', chunk => { resBody += chunk; });
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: resBody }));
            }).on('error', reject);
        });
    }

    let passCount = 0;
    function check(cond, id, desc) {
        if (cond) {
            passCount++;
            console.log(`✅ [ISOLATION PASS] ${id}: ${desc}`);
        } else {
            console.error(`❌ [ISOLATION FAIL] ${id}: ${desc}`);
        }
    }

    try {
        const rStatic = await getPath('/index.html');
        check(rStatic.status === 200 && rStatic.headers['x-isolation-status'] === 'PHOTO-SELECTION-MOCK-SANDBOX', 'ISO-01', 'Server lokal menyajikan file statis dengan header sandbox isolasi');

        const csp = rStatic.headers['content-security-policy'] || '';
        const hasCspConnectSrc = csp.includes(`connect-src 'self' http://127.0.0.1:${PORT}`);
        check(hasCspConnectSrc, 'ISO-02', `Content-Security-Policy connect-src dibatasi ketat ke 'self' dan http://127.0.0.1:${PORT}`);

        const blocksRemoteApis = !csp.includes('supabase.co') && !csp.includes('mayar.id') && !csp.includes('script.google.com') && !csp.includes('whatsapp.com');
        check(blocksRemoteApis, 'ISO-03', 'CSP memblokir mutlak endpoint remote: Supabase, Mayar, Google Apps Script, WhatsApp');

        const rClient = await postJson('getProjectForClient', { token: 'dummy-client-token' });
        check(rClient.status === 200 && rClient.data.data.needsPassword === true, 'ISO-04', 'Mock getProjectForClient mengembalikan status needsPassword: true');

        const rWrongPin = await postJson('verifyClientPassword', { token: 'dummy-client-token', passwordInput: '9999' });
        check(rWrongPin.status === 200 && rWrongPin.data.status === 'error', 'ISO-05', 'PIN galeri salah ditolak dengan pesan error');

        const rRightPin = await postJson('verifyClientPassword', { token: 'dummy-client-token', passwordInput: '1234' });
        check(rRightPin.status === 200 && rRightPin.data.data.valid === true && rRightPin.data.data.project.maxFoto === 3, 'ISO-06', 'PIN galeri benar (1234) membuka proyek dengan batas kuota 3 foto');

        const rPhotos = await postJson('getDriveContent', { folder_id: 'mock-folder-root' });
        check(rPhotos.status === 200 && rPhotos.data.data.images.length === 5, 'ISO-07', 'Mock getDriveContent menyajikan tepat 5 foto sampel untuk UAT');

        const rPhotoLogin = await postJson('login', { username: 'kama_photographer', password: 'password' });
        check(rPhotoLogin.status === 200 && rPhotoLogin.data.data.user.role === 'Photographer', 'ISO-08', 'Login fotografer mengembalikan peran Photographer secara terisolasi');

        const rAdminLogin = await postJson('login', { username: 'admin_atelier', password: 'password' });
        check(rAdminLogin.status === 200 && rAdminLogin.data.data.user.role === 'Admin', 'ISO-09', 'Login admin mengembalikan peran Admin dengan hak akses penuh');

        const rUsers = await postJson('getUsers');
        check(rUsers.status === 200 && rUsers.data.data.length === 4, 'ISO-10', 'Mock tabel pengguna menyajikan 4 tingkat akun berbeda (Admin, PRO, Reguler, Demo)');

        const rProjects = await postJson('getProjects');
        check(rProjects.status === 200 && rProjects.data.data.length === 2, 'ISO-11', 'Mock getProjects menyajikan daftar proyek fotografer dummy');

        const rSecurity = await getPath('/../package.json');
        check(rSecurity.status === 403 || rSecurity.status === 404, 'ISO-12', 'Proteksi directory traversal aktif mencegah akses file di luar root proyek');

        // AUDIT KHUSUS PERBAIKAN THUMBNAIL (TASK A, B, C, D)
        const isSafeDataRegex = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
        const allPhotosValidBase64 = DUMMY_PHOTOS.every(p => isSafeDataRegex.test(p.url));
        check(allPhotosValidBase64, 'ISO-13', 'Semua 5 dummy photo URL lolos regex isSafeDataImageUrl (PNG base64 valid, zero fallback)');

        let allFixturesServed = true;
        for (let i = 1; i <= 5; i++) {
            const rFix = await getPath(`/test/phase55-fixtures/photo${i}.png`);
            if (rFix.status !== 200 || !rFix.headers['content-type'].includes('image/png')) {
                allFixturesServed = false;
            }
        }
        check(allFixturesServed, 'ISO-14', 'Semua berkas fisik /test/phase55-fixtures/photo{1..5}.png disajikan HTTP 200 image/png');

        const cspImgSrcOk = csp.includes("img-src 'self' data:");
        check(cspImgSrcOk, 'ISO-15', 'CSP img-src mengizinkan data: dan self (100% lolos tanpa memicu CSP violation)');

        // Simulasi fungsi safeImageUrl persis app.html:
        function simSafeImageUrl(urlStr, fallback) {
            if (!urlStr || typeof urlStr !== 'string') return fallback || '';
            const trimmed = urlStr.trim();
            if (isSafeDataRegex.test(trimmed)) return trimmed;
            return fallback || '';
        }
        const zeroFallback = DUMMY_PHOTOS.every(p => simSafeImageUrl(p.url, 'FALLBACK') !== 'FALLBACK');
        check(zeroFallback, 'ISO-16', 'Fungsi safeImageUrl app.html mengembalikan data URL asli (zero onerror loop trigger)');

        console.log(`\nTOTAL UJI ISOLASI & THUMBNAIL FIX: ${passCount}/16 PASSED`);
        console.log('Server mock 100% siap untuk peninjauan interaktif manual oleh operator di browser lokal.');
    } catch (err) {
        console.error('Error saat menjalankan audit isolasi:', err.message);
    }
}

if (require.main === module) {
    server.listen(PORT, '127.0.0.1', async () => {
        console.log(`================================================================`);
        console.log(`PHOTO SELECTION PHASE 5.5 — ISOLATED MOCK SERVER RUNNING`);
        console.log(`================================================================`);
        console.log(`URL Local Host   : http://127.0.0.1:${PORT}`);
        console.log(`Galeri Klien UAT : http://127.0.0.1:${PORT}/app.html?token=dummy-client-token`);
        console.log(`Landing Page UAT : http://127.0.0.1:${PORT}/index.html`);
        console.log(`Isolasi Jaringan : 100% Mock Terisolasi (Zero Supabase/Mayar/GAS)`);
        console.log(`================================================================`);
        
        await runIsolationAudit();
    });

    server.on('error', async (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[INFO] Server mock sudah aktif berjalan pada port ${PORT}. Menjalankan audit isolasi langsung...`);
            await runIsolationAudit();
            process.exit(0);
        } else {
            console.error('Server error:', err);
        }
    });
}

module.exports = { server, PORT, DUMMY_PHOTOS, runIsolationAudit };


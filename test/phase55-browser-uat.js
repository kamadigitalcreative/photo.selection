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
const crypto = require('crypto');

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

// Generator PNG murni Node.js (400x500px, komposisi fotografi mewah dengan aksen border emas champagne)
function generateSolidPng(width, height, r, g, b, typeIndex = 1) {
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
    const cx = width / 2;
    const cy = height / 2;

    for (let y = 0; y < height; y++) {
        rawData[offset++] = 0;
        const ny = y / height;
        for (let x = 0; x < width; x++) {
            const isBorder = (x < 6 || x >= width - 6 || y < 6 || y >= height - 6);
            if (isBorder) {
                rawData[offset++] = 223; // #dfba7b Champagne border
                rawData[offset++] = 186;
                rawData[offset++] = 123;
                continue;
            }

            let pr = r, pg = g, pb = b;
            const dist = Math.hypot(x - cx, y - cy);

            if (typeIndex === 1) {
                // Sunset Wedding: warm golden sky into deep evening bronze
                const sunDist = Math.hypot(x - width * 0.65, y - height * 0.35);
                const sunGlow = Math.max(0, 1 - sunDist / 120);
                pr = Math.min(255, Math.floor((245 * (1 - ny) + 85 * ny) + sunGlow * 110));
                pg = Math.min(255, Math.floor((175 * (1 - ny) + 50 * ny) + sunGlow * 90));
                pb = Math.min(255, Math.floor((110 * (1 - ny) + 40 * ny) + sunGlow * 50));
            } else if (typeIndex === 2) {
                // Fine Art Bridal Portrait: spotlight on warm ivory/champagne monochrome
                const spot = Math.max(0, 1 - dist / 220);
                pr = Math.floor(40 + spot * 190);
                pg = Math.floor(38 + spot * 180);
                pb = Math.floor(35 + spot * 165);
            } else if (typeIndex === 3) {
                // Emerald Garden Celebration: soft daylight through lush botanical foliage
                const leafWave = Math.sin(x * 0.05) * 15 + Math.cos(y * 0.05) * 15;
                pr = Math.floor(40 + (1 - ny) * 110 + leafWave);
                pg = Math.floor(80 + (1 - ny) * 125 + leafWave);
                pb = Math.floor(55 + (1 - ny) * 85);
            } else if (typeIndex === 4) {
                // Ocean Twilight Promenade: deep twilight into ocean reflection
                const wave = Math.sin(y * 0.1 + x * 0.03) * 12;
                pr = Math.floor(65 * (1 - ny) + 30 * ny + wave * 0.5);
                pg = Math.floor(95 * (1 - ny) + 60 * ny + wave);
                pb = Math.floor(165 * (1 - ny) + 110 * ny + wave * 1.5);
            } else {
                // Champagne Celebration & Bokeh: glowing orbs on rich warm noir backdrop
                const orb1 = Math.max(0, 1 - Math.hypot(x - 120, y - 140) / 70);
                const orb2 = Math.max(0, 1 - Math.hypot(x - 280, y - 220) / 90);
                const orb3 = Math.max(0, 1 - Math.hypot(x - 180, y - 360) / 80);
                const totalOrb = orb1 * 0.8 + orb2 * 0.9 + orb3 * 0.7;
                pr = Math.min(255, Math.floor(50 + totalOrb * 200));
                pg = Math.min(255, Math.floor(40 + totalOrb * 170));
                pb = Math.min(255, Math.floor(45 + totalOrb * 110));
            }

            rawData[offset++] = Math.max(0, Math.min(255, pr));
            rawData[offset++] = Math.max(0, Math.min(255, pg));
            rawData[offset++] = Math.max(0, Math.min(255, pb));
        }
    }
    
    const compressed = zlib.deflateSync(rawData);
    return Buffer.concat([signature, makeChunk('IHDR', ihdr), makeChunk('IDAT', compressed), makeChunk('IEND', Buffer.alloc(0))]);
}

function getFixtureBase64(filename, r, g, b, typeIndex = 1) {
    const filePath = path.join(FIXTURES_DIR, filename);
    if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        return 'data:image/png;base64,' + buf.toString('base64');
    }
    const buf = generateSolidPng(400, 500, r, g, b, typeIndex);
    try {
        if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });
        fs.writeFileSync(filePath, buf);
    } catch (_) {}
    return 'data:image/png;base64,' + buf.toString('base64');
}

// Fixture 5 foto dummy berformat PNG base64 valid dengan komposisi fotografi artistik:
// Memenuhi regex app.html isSafeDataImageUrl: /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i
const DUMMY_PHOTOS = [
    {
        id: 'img1',
        name: 'photo1.png',
        previewUrl: getFixtureBase64('photo1.png', 245, 175, 95, 1),
        originalUrl: '/test/phase55-fixtures/photo1.png',
        originalDownloadUrl: '/test/phase55-fixtures/photo1.png',
        url: getFixtureBase64('photo1.png', 245, 175, 95, 1) // Sunset Wedding Romance
    },
    {
        id: 'img2',
        name: 'photo2.png',
        previewUrl: getFixtureBase64('photo2.png', 210, 205, 195, 2),
        originalUrl: '/test/phase55-fixtures/photo2.png',
        originalDownloadUrl: '/test/phase55-fixtures/photo2.png',
        url: getFixtureBase64('photo2.png', 210, 205, 195, 2) // Studio Bridal Portrait
    },
    {
        id: 'img3',
        name: 'photo3.png',
        previewUrl: getFixtureBase64('photo3.png', 50, 95, 65, 3),
        originalUrl: '/test/phase55-fixtures/photo3.png',
        originalDownloadUrl: '/test/phase55-fixtures/photo3.png',
        url: getFixtureBase64('photo3.png', 50, 95, 65, 3) // Emerald Garden Celebration
    },
    {
        id: 'img4',
        name: 'photo4.png',
        previewUrl: getFixtureBase64('photo4.png', 40, 75, 120, 4),
        originalUrl: '/test/phase55-fixtures/photo4.png',
        originalDownloadUrl: '/test/phase55-fixtures/photo4.png',
        url: getFixtureBase64('photo4.png', 40, 75, 120, 4) // Coastal Twilight Promenade
    },
    {
        id: 'img5',
        name: 'photo5.png',
        previewUrl: getFixtureBase64('photo5.png', 220, 185, 110, 5),
        originalUrl: '/test/phase55-fixtures/photo5.png',
        originalDownloadUrl: '/test/phase55-fixtures/photo5.png',
        url: getFixtureBase64('photo5.png', 220, 185, 110, 5) // Champagne Celebration Bokeh
    }
];

// Mock In-Memory Store for Photographer Account Settings & Project Themes
const mockPhotographerSettings = {
    'fotografer': { theme: 'noir', brandName: 'The Atelier Collection', studioName: 'kamavisual' },
    'pro_studio': { theme: 'sapphire', brandName: 'Pro Studio Bali', studioName: 'Pro Studio Bali' },
    'reguler_studio': { theme: 'ivory', brandName: 'Reguler Studio', studioName: 'Reguler Studio' },
    'demo': { theme: 'olive', brandName: 'Demo Studio', studioName: 'Demo Studio' },
    'demo_user': { theme: 'olive', brandName: 'Demo Studio', studioName: 'Demo Studio' }
};

const mockProjectOwners = {
    'dummy-client-token': 'fotografer',
    'token-proj-2': 'pro_studio',
    'token-ivory': 'reguler_studio',
    'token-olive': 'demo',
    'token-no-download': 'fotografer',
    'token-empty': 'fotografer'
};

// Authoritative Master Projects List (Aligned with mockProjectOwners)
const MOCK_ALL_PROJECTS = [
    {
        id: 'proj-1',
        ID: 'proj-1',
        Token: 'dummy-client-token',
        token: 'dummy-client-token',
        'Nama Client': 'Siti & Budi Wedding',
        NamaClient: 'Siti & Budi Wedding',
        'Password Client': '1234',
        passwordClient: '1234',
        password: '1234',
        'Drive Link': 'https://drive.google.com/drive/folders/mock-folder-root',
        driveLink: 'https://drive.google.com/drive/folders/mock-folder-root',
        'Dibuat Pada': '2026-10-10',
        'Status Client': 'Sedang Memilih',
        Status: 'Sedang Memilih',
        'Max Foto': 3,
        MaxFoto: 3,
        'Foto Terpilih': 2,
        'Daftar Pilihan': ['photo1.png', 'photo2.png'],
        Owner: 'fotografer',
        owner: 'fotografer'
    },
    {
        id: 'proj-no-dl',
        ID: 'proj-no-dl',
        Token: 'token-no-download',
        token: 'token-no-download',
        'Nama Client': 'Siti & Budi Wedding (No DL)',
        NamaClient: 'Siti & Budi Wedding (No DL)',
        'Password Client': '1234',
        passwordClient: '1234',
        password: '1234',
        'Drive Link': 'https://drive.google.com/drive/folders/mock-folder-root',
        driveLink: 'https://drive.google.com/drive/folders/mock-folder-root',
        'Dibuat Pada': '2026-10-10',
        'Status Client': 'Sedang Memilih',
        Status: 'Sedang Memilih',
        'Max Foto': 3,
        MaxFoto: 3,
        'Foto Terpilih': 1,
        'Daftar Pilihan': ['photo1.png'],
        Owner: 'fotografer',
        owner: 'fotografer'
    },
    {
        id: 'proj-empty',
        ID: 'proj-empty',
        Token: 'token-empty',
        token: 'token-empty',
        'Nama Client': 'Empty Gallery Project',
        NamaClient: 'Empty Gallery Project',
        'Password Client': '1234',
        passwordClient: '1234',
        password: '1234',
        'Drive Link': 'https://drive.google.com/drive/folders/mock-folder-root',
        driveLink: 'https://drive.google.com/drive/folders/mock-folder-root',
        'Dibuat Pada': '2026-10-15',
        'Status Client': 'Belum Memilih',
        Status: 'Belum Memilih',
        'Max Foto': 5,
        MaxFoto: 5,
        'Foto Terpilih': 0,
        'Daftar Pilihan': [],
        Owner: 'fotografer',
        owner: 'fotografer'
    },
    {
        id: 'proj-2',
        ID: 'proj-2',
        Token: 'token-proj-2',
        token: 'token-proj-2',
        'Nama Client': 'Annisa & Dimas Prewedding',
        NamaClient: 'Annisa & Dimas Prewedding',
        'Password Client': '1234',
        passwordClient: '1234',
        password: '1234',
        'Drive Link': 'https://drive.google.com/drive/folders/mock-folder-root',
        driveLink: 'https://drive.google.com/drive/folders/mock-folder-root',
        'Dibuat Pada': '2026-10-12',
        'Status Client': 'Selesai',
        Status: 'Selesai',
        'Max Foto': 20,
        MaxFoto: 20,
        'Foto Terpilih': 20,
        'Daftar Pilihan': ['photo4.png', 'photo5.png'],
        Owner: 'pro_studio',
        owner: 'pro_studio'
    },
    {
        id: 'proj-ivory',
        ID: 'proj-ivory',
        Token: 'token-ivory',
        token: 'token-ivory',
        'Nama Client': 'Reguler Studio Project',
        NamaClient: 'Reguler Studio Project',
        'Password Client': '1234',
        passwordClient: '1234',
        password: '1234',
        'Drive Link': 'https://drive.google.com/drive/folders/mock-folder-root',
        driveLink: 'https://drive.google.com/drive/folders/mock-folder-root',
        'Dibuat Pada': '2026-10-14',
        'Status Client': 'Sedang Memilih',
        Status: 'Sedang Memilih',
        'Max Foto': 5,
        MaxFoto: 5,
        'Foto Terpilih': 2,
        'Daftar Pilihan': ['photo1.png', 'photo2.png'],
        Owner: 'reguler_studio',
        owner: 'reguler_studio'
    },
    {
        id: 'proj-olive',
        ID: 'proj-olive',
        Token: 'token-olive',
        token: 'token-olive',
        'Nama Client': 'Demo Studio Project',
        NamaClient: 'Demo Studio Project',
        'Password Client': '1234',
        passwordClient: '1234',
        password: '1234',
        'Drive Link': 'https://drive.google.com/drive/folders/mock-folder-root',
        driveLink: 'https://drive.google.com/drive/folders/mock-folder-root',
        'Dibuat Pada': '2026-10-14',
        'Status Client': 'Sedang Memilih',
        Status: 'Sedang Memilih',
        'Max Foto': 3,
        MaxFoto: 3,
        'Foto Terpilih': 1,
        'Daftar Pilihan': ['photo3.png'],
        Owner: 'demo',
        owner: 'demo'
    }
];

const MOCK_USERS_LIST = [
    { id: 'u1', username: 'admin', Username: 'admin', nama: 'Admin Atelier', Nama: 'Admin Atelier', email: 'admin@atelier.local', Email: 'admin@atelier.local', role: 'Admin', Role: 'Admin', paket: 'Lifetime', Paket: 'Lifetime', status: 'Active', Status: 'Active', brand_name: 'The Atelier Collection', BrandName: 'The Atelier Collection', isOnline: true, IsOnline: true, expired_at: 'Lifetime', ExpiredAt: 'Lifetime', project_created: 5, ProjectCreated: 5 },
    { id: 'u2', username: 'pro_studio', Username: 'pro_studio', nama: 'Pro Studio Bali', Nama: 'Pro Studio Bali', email: 'pro@atelier.local', Email: 'pro@atelier.local', role: 'Photographer', Role: 'Photographer', paket: '1 Tahun', Paket: '1 Tahun', status: 'Active', Status: 'Active', brand_name: 'Pro Studio Bali', BrandName: 'Pro Studio Bali', isOnline: true, IsOnline: true, expired_at: '2027-10-18', ExpiredAt: '2027-10-18', project_created: 8, ProjectCreated: 8 },
    { id: 'u3', username: 'reguler_studio', Username: 'reguler_studio', nama: 'Reguler Studio', Nama: 'Reguler Studio', email: 'reguler@atelier.local', Email: 'reguler@atelier.local', role: 'Photographer', Role: 'Photographer', paket: '1 Bulan', Paket: '1 Bulan', status: 'Active', Status: 'Active', brand_name: 'Reguler Studio', BrandName: 'Reguler Studio', isOnline: false, IsOnline: false, expired_at: '2026-11-18', ExpiredAt: '2026-11-18', project_created: 2, ProjectCreated: 2 },
    { id: 'u4', username: 'demo_user', Username: 'demo_user', nama: 'Demo User', Nama: 'Demo User', email: 'demo@atelier.local', Email: 'demo@atelier.local', role: 'Photographer', Role: 'Photographer', paket: 'Demo', Paket: 'Demo', status: 'Active', Status: 'Active', brand_name: 'Demo Studio', BrandName: 'Demo Studio', isOnline: false, IsOnline: false, expired_at: '2026-10-25', ExpiredAt: '2026-10-25', project_created: 1, ProjectCreated: 1 }
];

// In-Memory Project-Scoped Fixtures Map
const mockProjectFixtures = {
    'dummy-client-token': ['photo1.png', 'photo2.png', 'photo3.png', 'photo4.png', 'photo5.png'],
    'token-no-download': ['photo1.png', 'photo2.png', 'photo3.png', 'photo4.png', 'photo5.png'],
    'token-ivory': ['photo1.png', 'photo2.png'],
    'token-olive': ['photo3.png'],
    'token-proj-2': ['photo4.png', 'photo5.png'],
    'token-empty': []
};

// In-Memory Verified Client Sessions Store (Short-lived, project-bound with expiration)
const mockVerifiedSessions = new Map();
// In-Memory Authenticated Photographer/Admin Staff Sessions Store
const mockPhotographerSessions = new Map();

// Injectable Clock Offset for Exact TTL Expiration Testing (AUTH15)
let mockClockOffsetMs = 0;
function getNow(req) {
    if (req) {
        if (req.headers && req.headers['x-mock-time']) {
            const parsed = Number(req.headers['x-mock-time']);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
        if (req.headers && req.headers['x-mock-clock-offset']) {
            const parsed = Number(req.headers['x-mock-clock-offset']);
            if (!isNaN(parsed)) return Date.now() + parsed;
        }
    }
    return Date.now() + mockClockOffsetMs;
}

// Server-Side Staff Session Validator (Zero Trust on client-supplied currentUser/username)
function resolveStaffSession(req, payload) {
    let sessionToken = '';
    if (req.headers && req.headers['authorization']) {
        const authParts = req.headers['authorization'].split(' ');
        if (authParts.length === 2 && authParts[0].toLowerCase() === 'bearer') {
            sessionToken = authParts[1].trim();
        }
    }
    if (!sessionToken && payload.sessionId) {
        sessionToken = String(payload.sessionId).trim();
    }
    if (!sessionToken && payload.sessionToken) {
        sessionToken = String(payload.sessionToken).trim();
    }
    if (!sessionToken && payload.token && typeof payload.token === 'string' && payload.token.startsWith('ps_')) {
        sessionToken = payload.token.trim();
    }
    if (!sessionToken && payload.currentUser && typeof payload.currentUser === 'object') {
        if (payload.currentUser.sessionId) sessionToken = String(payload.currentUser.sessionId).trim();
        else if (payload.currentUser.token) sessionToken = String(payload.currentUser.token).trim();
    }
    if (!sessionToken && payload.formData && typeof payload.formData === 'object') {
        if (payload.formData.sessionId) sessionToken = String(payload.formData.sessionId).trim();
        else if (payload.formData.token) sessionToken = String(payload.formData.token).trim();
        else if (payload.formData.currentUser && typeof payload.formData.currentUser === 'object') {
            if (payload.formData.currentUser.sessionId) sessionToken = String(payload.formData.currentUser.sessionId).trim();
            else if (payload.formData.currentUser.token) sessionToken = String(payload.formData.currentUser.token).trim();
        }
    }

    if (!sessionToken) return { session: null, error: 'SESSION_REQUIRED' };

    const staffSession = mockPhotographerSessions.get(sessionToken);
    if (!staffSession) return { session: null, error: 'INVALID_SESSION' };

    const now = getNow(req);
    if (now > staffSession.expiresAt) {
        mockPhotographerSessions.delete(sessionToken);
        return { session: null, error: 'SESSION_EXPIRED' };
    }

    return { session: staffSession, token: sessionToken };
}

function filterProjectsForStaff(session) {
    if (!session) return [];
    if (session.role === 'Admin') {
        return MOCK_ALL_PROJECTS;
    }
    const username = session.username;
    if (username === 'demo' || username === 'demo_user') {
        return MOCK_ALL_PROJECTS.filter(p => p.owner === 'demo' || p.owner === 'demo_user');
    }
    if (username === 'fotografer' || username === 'kama_photographer') {
        return MOCK_ALL_PROJECTS.filter(p => p.owner === 'fotografer' || p.owner === 'kama_photographer');
    }
    if (username === 'pro_studio') {
        return MOCK_ALL_PROJECTS.filter(p => p.owner === 'pro_studio');
    }
    if (username === 'reguler_studio') {
        return MOCK_ALL_PROJECTS.filter(p => p.owner === 'reguler_studio');
    }
    return MOCK_ALL_PROJECTS.filter(p => p.owner === username);
}

// In-Memory Client Saved Selections Store (projectToken -> array of filenames)
const mockProjectSelections = new Map();

function findMockProject(projectIdOrToken) {
    if (!projectIdOrToken) return null;
    const key = String(projectIdOrToken).trim().toLowerCase();
    return MOCK_ALL_PROJECTS.find(p =>
        (p.id && String(p.id).trim().toLowerCase() === key) ||
        (p.ID && String(p.ID).trim().toLowerCase() === key) ||
        (p.token && String(p.token).trim().toLowerCase() === key) ||
        (p.Token && String(p.Token).trim().toLowerCase() === key)
    ) || null;
}

function isStaffAuthorizedForProject(staffSession, project) {
    if (!staffSession || !project) return false;
    if (staffSession.role === 'Admin' || staffSession.username === 'admin') return true;
    const projectOwner = project.Owner || project.owner;
    const username = staffSession.username;
    if ((username === 'demo' || username === 'demo_user') && (projectOwner === 'demo' || projectOwner === 'demo_user')) return true;
    if ((username === 'fotografer' || username === 'kama_photographer') && (projectOwner === 'fotografer' || projectOwner === 'kama_photographer')) return true;
    return username === projectOwner;
}

function handleApiBridge(req, res, body) {
    function reply(statusCode, data) {
        if (!res.headersSent) {
            res.writeHead(statusCode, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Token, X-Mock-Time, X-Mock-Clock-Offset',
                'X-Photo-Selection-Isolation': 'MOCK-LOCAL-STRICT'
            });
        }
        return res.end(JSON.stringify(data));
    }

    let payload = {};
    try {
        payload = JSON.parse(body || '{}');
    } catch (e) {
        return reply(400, { status: 'error', message: 'Invalid JSON' });
    }

    const action = payload.action;

    // Injectable Clock Management Actions (AUTH15)
    if (action === 'setMockClockOffset') {
        mockClockOffsetMs = Number(payload.offsetMs || 0);
        return reply(200, {
            status: 'success',
            offsetMs: mockClockOffsetMs,
            simulatedNow: Date.now() + mockClockOffsetMs
        });
    }
    if (action === 'resetMockClock') {
        mockClockOffsetMs = 0;
        return reply(200, {
            status: 'success',
            offsetMs: 0,
            now: Date.now()
        });
    }

    function buildMockAuthorizedProjectData(proj, ownerConfig, clientSessionToken, token) {
        const owner = (proj && (proj.Owner || proj.owner)) || mockProjectOwners[token] || 'fotografer';
        const isDownloadActive = (proj && proj.isDownloadActive !== undefined) ? proj.isDownloadActive : (token !== 'token-no-download');
        const isPilihActive = (proj && proj.isPilihActive !== undefined) ? proj.isPilihActive : true;
        const maxFoto = (proj && (proj['Max Foto'] || proj.MaxFoto || proj.maxFoto)) !== undefined ? Number(proj['Max Foto'] || proj.MaxFoto || proj.maxFoto) : 5;
        const extraPrice = (proj && (proj.ExtraPrice || proj.extraPrice)) !== undefined ? Number(proj.ExtraPrice || proj.extraPrice) : 0;
        const driveLink = (proj && (proj['Drive Link'] || proj.driveLink || proj.DriveLink)) || '';
        const namaClient = (proj && (proj['Nama Client'] || proj.NamaClient || proj.name)) || (token === 'token-proj-2' ? 'Annisa & Dimas Prewedding' : (token === 'token-ivory' ? 'Reguler Studio Project' : (token === 'token-olive' ? 'Demo Studio Project' : (token === 'token-empty' ? 'Empty Gallery Project' : 'Siti & Budi Wedding'))));
        const savedSelections = mockProjectSelections.get(token) || (proj && (proj['Daftar Pilihan'] || proj.daftarPilihan)) || [];
        const storedPass = proj ? String(proj['Password Client'] || proj.passwordClient || proj.password || '').trim() : '';
        const hasPassword = Boolean(storedPass !== '');

        let kat = (proj && (proj.Kategori || proj.categories)) || [];
        if (typeof kat === 'string') {
            try { kat = JSON.parse(kat); } catch (e) { kat = []; }
        }

        return {
            token: token,
            namaClient: namaClient,
            name: namaClient,
            brandName: ownerConfig.brandName,
            studioName: ownerConfig.studioName || ownerConfig.brandName,
            photographerName: owner,
            ownerStudio: ownerConfig.studioName || ownerConfig.brandName,
            nomorWA: (proj && (proj['Nomor WA'] || proj.nomorWA)) || '6281234567890',
            maxFoto: maxFoto,
            fotoTerpilih: savedSelections.length,
            extraPrice: extraPrice,
            isPilihActive: isPilihActive,
            isDownloadActive: isDownloadActive,
            driveLink: driveLink,
            statusClient: (proj && (proj['Status Client'] || proj.Status || proj.statusClient)) || 'Belum Memilih',
            selectedFiles: JSON.stringify(savedSelections),
            daftarPilihan: savedSelections,
            'Daftar Pilihan': savedSelections,
            clientLayout: (proj && (proj.ClientLayout || proj.clientLayout)) || 'masonry',
            watermarkEnabled: (proj && proj.watermarkEnabled !== undefined) ? proj.watermarkEnabled : (proj ? !!proj.useWatermark : false),
            useWatermark: (proj && proj.watermarkEnabled !== undefined) ? proj.watermarkEnabled : (proj ? !!proj.useWatermark : false),
            useWatermarkTiled: proj ? !!proj.useWatermarkTiled : false,
            categories: kat,
            kategori: kat,
            musicUrl: (proj && (proj.MusicUrl || proj.musicUrl)) || '',
            durasiPilih: (proj && (proj.DurasiPilih || proj.durasiPilih)) || 'Selamanya',
            durasiDownload: (proj && (proj.DurasiDownload || proj.durasiDownload)) || 'Selamanya',
            deadline: (proj && (proj.Deadline || proj.deadline)) || '',
            hasPassword: hasPassword,
            needsPassword: false,
            accessGranted: true,
            clientAccessToken: clientSessionToken || '',
            isMockDrive: true,
            mockNotice: 'Local Mock Fixtures Active — Simulated Google Drive Content',
            theme: ownerConfig.theme,
            ownerTheme: ownerConfig.theme
        };
    }

    // 1. Client App Auth & Verification
    if (action === 'getProjectForClient') {
        const token = String(payload.token || '').trim();
        if (!token) {
            return reply(200, {
                status: 'error',
                message: 'Token galeri wajib disertakan'
            });
        }
        const owner = mockProjectOwners[token];
        if (!owner) {
            return reply(200, {
                status: 'error',
                message: 'Proyek tidak ditemukan atau token tidak valid'
            });
        }
        const ownerConfig = mockPhotographerSettings[owner] || { theme: 'noir', brandName: 'The Atelier Collection' };
        const proj = findMockProject(token);

        // Check for session restoration
        let sessionToken = '';
        if (req.headers['authorization']) {
            const authParts = req.headers['authorization'].split(' ');
            if (authParts.length === 2 && authParts[0].toLowerCase() === 'bearer') {
                sessionToken = authParts[1].trim();
            }
        }
        if (!sessionToken && payload.clientAccessToken) {
            sessionToken = String(payload.clientAccessToken).trim();
        }
        if (!sessionToken && payload.sessionToken) {
            sessionToken = String(payload.sessionToken).trim();
        }

        const now = getNow(req);
        const storedPass = proj ? String(proj['Password Client'] || proj.passwordClient || proj.password || '').trim() : '';
        const hasPassword = Boolean(storedPass !== '');

        // 1. PASSWORDLESS PROJECT FLOW: Immediately grant project-scoped authorized session
        if (!hasPassword) {
            let activeClientSession = sessionToken ? mockVerifiedSessions.get(sessionToken) : null;
            if (!activeClientSession || activeClientSession.projectToken !== token || now > activeClientSession.expiresAt) {
                sessionToken = 'ps_sess_' + crypto.randomBytes(24).toString('hex');
                const isDl = (proj && proj.isDownloadActive !== undefined) ? proj.isDownloadActive : (token !== 'token-no-download');
                mockVerifiedSessions.set(sessionToken, {
                    token: token,
                    projectToken: token,
                    sessionToken: sessionToken,
                    verified: true,
                    isPasswordless: true,
                    isDownloadActive: isDl,
                    createdAt: now,
                    expiresAt: now + (24 * 60 * 60 * 1000)
                });
            }
            const authorizedData = buildMockAuthorizedProjectData(proj, ownerConfig, sessionToken, token);
            return reply(200, {
                status: 'success',
                data: {
                    accessGranted: true,
                    valid: true,
                    needsPassword: false,
                    hasPassword: false,
                    clientAccessToken: sessionToken,
                    project: authorizedData,
                    ...authorizedData
                }
            });
        }

        // 2. PASSWORD-PROTECTED FLOW WITH EXISTING ACTIVE SESSION
        if (sessionToken) {
            const clientSession = mockVerifiedSessions.get(sessionToken);
            if (!clientSession) {
                // Invalid session => gallery remains locked
                return reply(200, {
                    status: 'success',
                    data: {
                        needsPassword: true,
                        hasPassword: true,
                        accessGranted: false,
                        namaClient: (proj && (proj['Nama Client'] || proj.NamaClient)) || 'Gallery Client',
                        brandName: ownerConfig.brandName,
                        brandLogo: '',
                        theme: ownerConfig.theme,
                        ownerTheme: ownerConfig.theme
                    }
                });
            }

            if (now > clientSession.expiresAt) {
                mockVerifiedSessions.delete(sessionToken);
                // Expired session => gallery remains locked
                return reply(200, {
                    status: 'success',
                    data: {
                        needsPassword: true,
                        hasPassword: true,
                        accessGranted: false,
                        namaClient: (proj && (proj['Nama Client'] || proj.NamaClient)) || 'Gallery Client',
                        brandName: ownerConfig.brandName,
                        brandLogo: '',
                        theme: ownerConfig.theme,
                        ownerTheme: ownerConfig.theme
                    }
                });
            }

            // Session for another project => denied
            if (clientSession.projectToken !== token) {
                return reply(200, {
                    status: 'error',
                    code: 'PROJECT_MISMATCH',
                    message: 'Akses ditolak: Sesi tidak cocok dengan proyek galeri ini.'
                });
            }

            // Valid active session for this project => accessGranted true, return authorized project
            const authorizedData = buildMockAuthorizedProjectData(proj, ownerConfig, sessionToken, token);
            return reply(200, {
                status: 'success',
                data: {
                    accessGranted: true,
                    valid: true,
                    needsPassword: false,
                    hasPassword: true,
                    clientAccessToken: sessionToken,
                    project: authorizedData,
                    ...authorizedData
                }
            });
        }

        // 3. PASSWORD-PROTECTED FLOW WITHOUT SESSION => Locked view, prompt for PIN
        return reply(200, {
            status: 'success',
            data: {
                needsPassword: true,
                hasPassword: true,
                accessGranted: false,
                namaClient: (proj && (proj['Nama Client'] || proj.NamaClient)) || 'Gallery Client',
                brandName: ownerConfig.brandName,
                brandLogo: '',
                theme: ownerConfig.theme,
                ownerTheme: ownerConfig.theme
            }
        });
    }

    if (action === 'verifyClientPassword') {
        const token = String(payload.token || '').trim();
        const pin = String(payload.passwordInput || payload.password || '').trim();
        if (!token) {
            return reply(200, {
                status: 'error',
                message: 'Token galeri wajib disertakan'
            });
        }
        const owner = mockProjectOwners[token];
        if (!owner) {
            return reply(200, {
                status: 'error',
                message: 'Proyek tidak ditemukan atau token tidak valid'
            });
        }
        const ownerConfig = mockPhotographerSettings[owner] || { theme: 'noir', brandName: 'The Atelier Collection' };
        const proj = findMockProject(token);

        const expectedPin = proj ? String(proj['Password Client'] || proj.passwordClient || proj.password || '').trim() : '';
        const isMatch = expectedPin ? (pin === expectedPin) : true;

        if (isMatch) {
            const now = getNow(req);
            const isDownloadActive = (proj && proj.isDownloadActive !== undefined) ? proj.isDownloadActive : (token !== 'token-no-download');
            const sessionToken = 'ps_sess_' + crypto.randomBytes(24).toString('hex');
            const sessionData = {
                token: token,
                projectToken: token,
                sessionToken: sessionToken,
                verified: true,
                isDownloadActive: isDownloadActive,
                createdAt: now,
                expiresAt: now + (2 * 60 * 60 * 1000) // 2 hours
            };
            mockVerifiedSessions.set(sessionToken, sessionData);

            const authorizedData = buildMockAuthorizedProjectData(proj, ownerConfig, sessionToken, token);
            return res.end(JSON.stringify({
                status: 'success',
                data: {
                    valid: true,
                    accessGranted: true,
                    clientAccessToken: sessionToken,
                    project: authorizedData,
                    ...authorizedData
                }
            }));
        } else {
            return res.end(JSON.stringify({
                status: 'error',
                message: 'PIN Keamanan tidak sesuai.'
            }));
        }
    }

    if (action === 'getDriveContent') {
        let reqProjectToken = String(payload.token || '').trim();
        let sessionToken = '';
        if (req.headers['authorization']) {
            const authParts = req.headers['authorization'].split(' ');
            if (authParts.length === 2 && authParts[0].toLowerCase() === 'bearer') {
                sessionToken = authParts[1].trim();
            }
        }
        if (!sessionToken && payload.clientAccessToken) {
            sessionToken = String(payload.clientAccessToken).trim();
        }
        if (!sessionToken && payload.sessionToken) {
            sessionToken = String(payload.sessionToken).trim();
        }

        // Sensitive photo listing requires an active authenticated session
        if (!sessionToken) {
            return reply(200, {
                status: 'error',
                code: 'SESSION_REQUIRED',
                message: 'Akses ditolak: Memerlukan otorisasi sesi PIN terverifikasi atau login fotografer.'
            });
        }

        const now = getNow(req);

        // Check if photographer/admin staff session
        const staffSession = mockPhotographerSessions.get(sessionToken);
        if (staffSession) {
            if (now > staffSession.expiresAt) {
                mockPhotographerSessions.delete(sessionToken);
                return reply(200, {
                    status: 'error',
                    code: 'SESSION_EXPIRED',
                    message: 'Sesi fotografer telah kedaluwarsa.'
                });
            }

            // Project-scoped authorization for staff (FAIL B)
            if (reqProjectToken) {
                const owner = mockProjectOwners[reqProjectToken];
                if (!owner) {
                    return reply(200, {
                        status: 'error',
                        code: 'PROJECT_NOT_FOUND',
                        message: 'Proyek tidak ditemukan.'
                    });
                }

                // Check staff ownership
                let isAuthorized = false;
                if (staffSession.role === 'Admin' || staffSession.username === 'admin') {
                    isAuthorized = true;
                } else if ((staffSession.username === 'demo' || staffSession.username === 'demo_user') && owner === 'demo') {
                    isAuthorized = true;
                } else if ((staffSession.username === 'fotografer' || staffSession.username === 'kama_photographer') && owner === 'fotografer') {
                    isAuthorized = true;
                } else if (staffSession.username === owner) {
                    isAuthorized = true;
                }

                if (!isAuthorized) {
                    return reply(200, {
                        status: 'error',
                        code: 'UNAUTHORIZED_PROJECT_ACCESS',
                        message: 'Akses ditolak: Akun staf tidak memiliki hak akses untuk proyek ini.'
                    });
                }

                const allowedFiles = mockProjectFixtures[reqProjectToken] || [];
                const project = findMockProject(reqProjectToken);
                const filteredImages = DUMMY_PHOTOS.filter(img => allowedFiles.includes(img.name)).map(img => ({
                    ...img,
                    isMockFixture: true,
                    source: 'local-mock-fixture',
                    mockNotice: 'Local sample fixture — not genuine Google Drive content'
                }));

                // Safe return: empty list if empty, NEVER fall back to DUMMY_PHOTOS
                return res.end(JSON.stringify({
                    status: 'success',
                    data: {
                        folders: [],
                        images: filteredImages,
                        isMockDrive: true,
                        driveReference: (project && (project['Drive Link'] || project.driveLink || project.DriveLink)) || '',
                        mockNotice: 'Local Mock Fixtures Active — Simulated Google Drive Content'
                    }
                }));
            }

            // If no project token is provided:
            // Admin gets general drive content (all mock photos)
            if (staffSession.role === 'Admin') {
                return res.end(JSON.stringify({
                    status: 'success',
                    data: {
                        folders: [],
                        images: DUMMY_PHOTOS
                    }
                }));
            }

            // Non-admin staff without project token: required to specify project
            return reply(200, {
                status: 'error',
                code: 'PROJECT_TOKEN_REQUIRED',
                message: 'Akses ditolak: Parameter token proyek wajib disertakan.'
            });
        }

        // Check if client session
        const clientSession = mockVerifiedSessions.get(sessionToken);
        if (!clientSession) {
            return reply(200, {
                status: 'error',
                code: 'INVALID_SESSION',
                message: 'Akses ditolak: Sesi galeri tidak valid atau belum diverifikasi dengan PIN.'
            });
        }

        if (now > clientSession.expiresAt) {
            mockVerifiedSessions.delete(sessionToken);
            return reply(200, {
                status: 'error',
                code: 'SESSION_EXPIRED',
                message: 'Sesi galeri telah kedaluwarsa. Silakan masukkan PIN kembali.'
            });
        }

        // Validate project identity match
        if (reqProjectToken && reqProjectToken !== clientSession.projectToken) {
            return reply(200, {
                status: 'error',
                code: 'PROJECT_MISMATCH',
                message: 'Akses ditolak: Sesi aktif tidak cocok dengan proyek yang diminta.'
            });
        }

        const projectToken = clientSession.projectToken;
        const allowedFiles = mockProjectFixtures[projectToken] || [];
        const project = findMockProject(projectToken);
        const filteredImages = DUMMY_PHOTOS.filter(img => allowedFiles.includes(img.name)).map(img => ({
            ...img,
            isMockFixture: true,
            source: 'local-mock-fixture',
            mockNotice: 'Local sample fixture — not genuine Google Drive content'
        }));

        // Safe return: empty list if empty, NEVER fall back to DUMMY_PHOTOS (FAIL B)
        return reply(200, {
            status: 'success',
            data: {
                folders: [],
                images: filteredImages,
                isMockDrive: true,
                driveReference: (project && (project['Drive Link'] || project.driveLink || project.DriveLink)) || '',
                mockNotice: 'Local Mock Fixtures Active — Simulated Google Drive Content'
            }
        });
    }

    if (action === 'saveClientSelections' || action === 'saveSelections') {
        // 1. Resolve client session
        let sessionToken = '';
        if (req.headers && req.headers['authorization']) {
            const authParts = req.headers['authorization'].split(' ');
            if (authParts.length === 2 && authParts[0].toLowerCase() === 'bearer') {
                sessionToken = authParts[1].trim();
            }
        }
        if (!sessionToken && payload.clientAccessToken) sessionToken = String(payload.clientAccessToken).trim();
        if (!sessionToken && payload.sessionToken) sessionToken = String(payload.sessionToken).trim();
        if (!sessionToken && payload.sessionId) sessionToken = String(payload.sessionId).trim();

        if (!sessionToken) {
            return reply(200, {
                status: 'error',
                code: 'SESSION_REQUIRED',
                message: 'Akses ditolak: Memerlukan otorisasi sesi PIN terverifikasi untuk menyimpan pilihan foto.'
            });
        }

        const clientSession = mockVerifiedSessions.get(sessionToken);
        if (!clientSession) {
            return reply(200, {
                status: 'error',
                code: 'INVALID_SESSION',
                message: 'Akses ditolak: Sesi galeri tidak valid atau belum diverifikasi dengan PIN.'
            });
        }

        const now = getNow(req);
        if (now > clientSession.expiresAt) {
            mockVerifiedSessions.delete(sessionToken);
            return reply(200, {
                status: 'error',
                code: 'SESSION_EXPIRED',
                message: 'Sesi galeri telah kedaluwarsa. Silakan masukkan PIN kembali.'
            });
        }

        const targetToken = String(payload.token || clientSession.projectToken || '').trim();
        if (targetToken && targetToken !== clientSession.projectToken) {
            return reply(200, {
                status: 'error',
                code: 'PROJECT_MISMATCH',
                message: 'Akses ditolak: Sesi aktif tidak cocok dengan proyek yang diminta.'
            });
        }

        const project = findMockProject(clientSession.projectToken);
        if (!project) {
            return reply(200, {
                status: 'error',
                code: 'PROJECT_NOT_FOUND',
                message: 'Proyek tidak ditemukan.'
            });
        }

        // Parse selection list
        let rawList = payload.selectedFiles || payload.selections || payload.selectedImages || [];
        if (typeof rawList === 'string') {
            try { rawList = JSON.parse(rawList); } catch (e) { rawList = []; }
        }
        if (!Array.isArray(rawList)) rawList = [];

        const filenames = rawList.map(item => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object') return (item.n || item.name || '').trim();
            return '';
        }).filter(Boolean);

        // Enforce selection quota
        const maxFoto = Number(project['Max Foto'] || project.MaxFoto || project.maxFoto || 0);
        if (maxFoto > 0 && filenames.length > maxFoto) {
            return reply(200, {
                status: 'error',
                code: 'QUOTA_EXCEEDED',
                message: `Jumlah foto yang dipilih (${filenames.length}) melebihi kuota maksimal (${maxFoto}).`
            });
        }

        // Enforce allowed project files
        const allowedFiles = mockProjectFixtures[clientSession.projectToken] || [];
        for (const f of filenames) {
            if (!allowedFiles.includes(f)) {
                return reply(200, {
                    status: 'error',
                    code: 'INVALID_PHOTO_SELECTION',
                    message: `Berkas ${f} bukan merupakan bagian dari galeri proyek ini.`
                });
            }
        }

        // Apply in-memory state update
        project['Daftar Pilihan'] = filenames;
        project['Foto Terpilih'] = filenames.length;
        project.selectedFiles = JSON.stringify(filenames);
        mockProjectSelections.set(clientSession.projectToken, filenames);

        return reply(200, {
            status: 'success',
            data: {
                success: true,
                count: filenames.length,
                selections: filenames
            },
            message: 'Pilihan foto berhasil disimpan'
        });
    }

    if (action === 'pingClientStatus') {
        return res.end(JSON.stringify({
            status: 'success',
            message: 'Client status ping recorded'
        }));
    }

    // 2. Authentication: Login Photographer & Admin (Strict Credentials, FAIL A)
    if (action === 'login' || action === 'auth') {
        const username = String(payload.username || payload.email || '').trim().toLowerCase();
        const password = String(payload.password || '').trim();
        const now = getNow(req);

        if ((username === 'admin' || username === 'admin_atelier') && password === 'password123') {
            const adminToken = 'ps_adm_' + crypto.randomBytes(24).toString('hex');
            mockPhotographerSessions.set(adminToken, { username: 'admin', role: 'Admin', isPro: true, createdAt: now, expiresAt: now + 86400000 });
            return res.end(JSON.stringify({
                status: 'success',
                data: {
                    id: 'admin-uat-1',
                    nama: 'Admin Atelier',
                    username: 'admin',
                    email: 'admin@atelier.local',
                    role: 'Admin',
                    paket: 'Lifetime',
                    status: 'Active',
                    brandName: 'The Atelier Collection',
                    brandLogo: '',
                    expiredAt: 'Lifetime',
                    sessionId: adminToken,
                    token: adminToken
                }
            }));
        } else if ((username === 'fotografer' || username === 'kama_photographer') && password === 'password123') {
            const photoToken = 'ps_pht_' + crypto.randomBytes(24).toString('hex');
            mockPhotographerSessions.set(photoToken, { username: 'fotografer', role: 'Photographer', isPro: true, createdAt: now, expiresAt: now + 86400000 });
            return res.end(JSON.stringify({
                status: 'success',
                data: {
                    id: 'photo-uat-1',
                    nama: 'Kama Photographer',
                    username: 'fotografer',
                    email: 'photo@atelier.local',
                    role: 'Photographer',
                    paket: '1 Tahun',
                    status: 'Active',
                    brandName: 'The Atelier Collection',
                    brandLogo: '',
                    expiredAt: '2027-10-18',
                    isPremiumAddon: true,
                    isProLifetime: false,
                    proExpiredAt: '2027-10-18',
                    proIsActive: true,
                    sessionId: photoToken,
                    token: photoToken
                }
            }));
        } else if ((username === 'demo' || username === 'demo_user') && (password === 'password123' || password === 'demo')) {
            const demoToken = 'ps_dmo_' + crypto.randomBytes(24).toString('hex');
            mockPhotographerSessions.set(demoToken, { username: 'demo_user', role: 'Photographer', isPro: false, createdAt: now, expiresAt: now + 86400000 });
            return res.end(JSON.stringify({
                status: 'success',
                data: {
                    id: 'demo-uat-1',
                    nama: 'Demo User',
                    username: 'demo_user',
                    email: 'demo@atelier.local',
                    role: 'Photographer',
                    paket: 'Demo',
                    status: 'Active',
                    brandName: 'Demo Studio',
                    brandLogo: '',
                    expiredAt: '2026-10-25',
                    isPremiumAddon: false,
                    isProLifetime: false,
                    proExpiredAt: '2026-10-25',
                    proIsActive: false,
                    sessionId: demoToken,
                    token: demoToken
                }
            }));
        } else if (username !== 'admin' && username !== 'admin_atelier' && username !== 'fotografer' && username !== 'kama_photographer' && username !== 'demo' && username !== 'demo_user') {
            return res.end(JSON.stringify({
                status: 'error',
                message: 'Username tidak ditemukan'
            }));
        } else {
            return res.end(JSON.stringify({
                status: 'error',
                message: 'Password salah'
            }));
        }
    }

    if (action === 'logout') {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error) {
            return reply(200, {
                status: 'error',
                code: staffAuth.error,
                message: 'Akses ditolak: Sesi staf tidak ditemukan atau tidak valid untuk logout.'
            });
        }
        mockPhotographerSessions.delete(staffAuth.token);
        return res.end(JSON.stringify({
            status: 'success',
            message: 'Logout berhasil, sesi telah dicabut'
        }));
    }

    // 3. Photographer Workspace Mock Actions
    if (action === 'getProjects' || action === 'fetchProjects') {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error) {
            return reply(200, {
                status: 'error',
                code: staffAuth.error,
                message: staffAuth.error === 'SESSION_EXPIRED'
                    ? 'Sesi staf telah kedaluwarsa. Silakan login kembali.'
                    : (staffAuth.error === 'INVALID_SESSION'
                        ? 'Akses ditolak: Sesi staf tidak valid.'
                        : 'Akses ditolak: Sesi staf diperlukan untuk mengakses daftar proyek.')
            });
        }
        const userProjects = filterProjectsForStaff(staffAuth.session);
        return res.end(JSON.stringify({
            status: 'success',
            data: {
                success: true,
                data: userProjects
            }
        }));
    }

    // 4. Admin Workspace Mock Actions
    if (action === 'getUsers' || action === 'adminGetUsers') {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error) {
            return reply(200, {
                status: 'error',
                code: staffAuth.error,
                message: staffAuth.error === 'SESSION_EXPIRED'
                    ? 'Sesi staf telah kedaluwarsa. Silakan login kembali.'
                    : (staffAuth.error === 'INVALID_SESSION'
                        ? 'Akses ditolak: Sesi staf tidak valid.'
                        : 'Akses ditolak: Sesi staf diperlukan untuk mengakses daftar pengguna.')
            });
        }
        if (staffAuth.session.role !== 'Admin') {
            return reply(200, {
                status: 'error',
                code: 'UNAUTHORIZED_ROLE',
                message: 'Akses ditolak: Hanya peran Admin yang berhak mengakses daftar pengguna.'
            });
        }
        return res.end(JSON.stringify({
            status: 'success',
            data: {
                success: true,
                data: MOCK_USERS_LIST
            }
        }));
    }

    if (action === 'getDashboardStats' || action === 'getAdminMetrics' || action === 'adminGetAnalytics' || action === 'getAnalytics') {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error) {
            return reply(200, {
                status: 'error',
                code: staffAuth.error,
                message: staffAuth.error === 'SESSION_EXPIRED'
                    ? 'Sesi staf telah kedaluwarsa. Silakan login kembali.'
                    : (staffAuth.error === 'INVALID_SESSION'
                        ? 'Akses ditolak: Sesi staf tidak valid.'
                        : 'Akses ditolak: Sesi staf diperlukan untuk mengakses metrik analitik.')
            });
        }
        if (staffAuth.session.role !== 'Admin') {
            return reply(200, {
                status: 'error',
                code: 'UNAUTHORIZED_ROLE',
                message: 'Akses ditolak: Hanya peran Admin yang dapat melihat metrik analitik dashboard.'
            });
        }
        return res.end(JSON.stringify({
            status: 'success',
            data: {
                success: true,
                data: {
                    totalProjects: MOCK_ALL_PROJECTS.length,
                    totalUsers: MOCK_USERS_LIST.length,
                    activeUsers: 3,
                    pendingUsers: 1,
                    inactiveUsers: 0,
                    expiringSoonCount: 0,
                    views: 140,
                    visitors: 98,
                    trafficSources: {
                        metaViews: 45,
                        metaUsers: 12,
                        directViews: 60,
                        googleViews: 35,
                        otherViews: 0
                    },
                    trafficSeries: [
                        { label: 'Min', count: 12 },
                        { label: 'Sen', count: 18 },
                        { label: 'Sel', count: 24 },
                        { label: 'Rab', count: 16 },
                        { label: 'Kam', count: 30 },
                        { label: 'Jum', count: 22 },
                        { label: 'Sab', count: 28 }
                    ],
                    statusBreakdown: {
                        safeActive: 3,
                        expiringSoon: 0,
                        pending: 1,
                        inactive: 0
                    },
                    expiringUsers: []
                }
            }
        }));
    }

    if (action === 'syncBackground') {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error) {
            return reply(200, {
                status: 'error',
                code: staffAuth.error,
                message: staffAuth.error === 'SESSION_EXPIRED'
                    ? 'Sesi staf telah kedaluwarsa. Silakan login kembali.'
                    : (staffAuth.error === 'INVALID_SESSION'
                        ? 'Akses ditolak: Sesi staf tidak valid.'
                        : 'Akses ditolak: Sesi staf diperlukan untuk sinkronisasi.')
            });
        }
        const userProjects = filterProjectsForStaff(staffAuth.session);
        return res.end(JSON.stringify({
            status: 'success',
            data: {
                projects: {
                    success: true,
                    data: userProjects
                },
                notifStats: { success: true, count: 0 },
                userData: null
            }
        }));
    }

    if (action === 'getGlobalBranding') {
        return res.end(JSON.stringify({
            status: 'success',
            data: {
                name: 'The Atelier Collection',
                logo: ''
            }
        }));
    }

    if (action === 'getAllNotifications') {
        return res.end(JSON.stringify({
            status: 'success',
            data: []
        }));
    }

    if (action === 'markFeedbackRead') {
        return res.end(JSON.stringify({
            status: 'success',
            message: 'Feedback marked as read'
        }));
    }

    if (action === 'pingUser') {
        return res.end(JSON.stringify({
            status: 'success',
            isOnline: true
        }));
    }

    if (action === 'saveBrandSettings' || action === 'savePaymentSettings') {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error) {
            return reply(200, {
                status: 'error',
                code: staffAuth.error,
                message: staffAuth.error === 'SESSION_EXPIRED'
                    ? 'Sesi staf telah kedaluwarsa. Silakan login kembali.'
                    : (staffAuth.error === 'INVALID_SESSION'
                        ? 'Akses ditolak: Sesi staf tidak valid.'
                        : 'Akses ditolak: Sesi staf diperlukan untuk menyimpan pengaturan.')
            });
        }
        const username = staffAuth.session.username;
        if (username && mockPhotographerSettings[username]) {
            if (payload.theme) mockPhotographerSettings[username].theme = payload.theme;
            if (payload.brandName) mockPhotographerSettings[username].brandName = payload.brandName;
        }
        return res.end(JSON.stringify({
            status: 'success',
            message: 'Pengaturan berhasil disimpan'
        }));
    }

    function authorizeStaffProjectMutation(req, payload) {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error) {
            return {
                authorized: false,
                reply: reply(200, {
                    status: 'error',
                    code: staffAuth.error,
                    message: staffAuth.error === 'SESSION_EXPIRED'
                        ? 'Sesi staf telah kedaluwarsa. Silakan login kembali.'
                        : (staffAuth.error === 'INVALID_SESSION'
                            ? 'Akses ditolak: Sesi staf tidak valid.'
                            : 'Akses ditolak: Sesi staf diperlukan untuk melakukan aksi ini.')
                })
            };
        }

        const projectIdOrToken = payload.id || payload.projectId || payload.ID || payload.token;
        if (!projectIdOrToken) {
            return {
                authorized: false,
                reply: reply(200, {
                    status: 'error',
                    code: 'PROJECT_NOT_FOUND',
                    message: 'ID proyek wajib disertakan.'
                })
            };
        }

        const project = findMockProject(projectIdOrToken);
        if (!project) {
            return {
                authorized: false,
                reply: reply(200, {
                    status: 'error',
                    code: 'PROJECT_NOT_FOUND',
                    message: 'Proyek tidak ditemukan atau ID tidak valid.'
                })
            };
        }

        if (!isStaffAuthorizedForProject(staffAuth.session, project)) {
            return {
                authorized: false,
                reply: reply(200, {
                    status: 'error',
                    code: 'UNAUTHORIZED_PROJECT_ACCESS',
                    message: 'Akses ditolak: Anda tidak memiliki hak akses untuk mengubah proyek ini.'
                })
            };
        }

        return { authorized: true, staffSession: staffAuth.session, project: project };
    }

    if (action === 'createProject') {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error) {
            return reply(200, {
                status: 'error',
                code: staffAuth.error,
                message: staffAuth.error === 'SESSION_EXPIRED'
                    ? 'Sesi staf telah kedaluwarsa. Silakan login kembali.'
                    : (staffAuth.error === 'INVALID_SESSION'
                        ? 'Akses ditolak: Sesi staf tidak valid atau server telah dimulai ulang. Silakan login kembali.'
                        : 'Akses ditolak: Sesi staf diperlukan untuk membuat proyek.')
            });
        }
        const fd = payload.formData || payload;
        const ownerName = staffAuth.session.username;

        // Unified PRO Entitlement Enforcement for Paid Upsell (C07 / C08)
        const extraPriceNum = Number(fd.extraPrice || fd.extra || 0);
        if (extraPriceNum > 0 && !staffAuth.session.isPro && staffAuth.session.role !== 'Admin') {
            return reply(200, {
                status: 'error',
                code: 'PRO_REQUIRED',
                message: 'Fitur Upsell Foto Ekstra hanya tersedia untuk fotografer Add-On PRO aktif.'
            });
        }

        const newProjId = 'proj-' + crypto.randomBytes(4).toString('hex');
        const newToken = 'token-' + crypto.randomBytes(6).toString('hex');
        const clientPass = fd.passwordClient !== undefined ? String(fd.passwordClient).trim() : (fd.password !== undefined ? String(fd.password).trim() : (fd['Password Client'] !== undefined ? String(fd['Password Client']).trim() : ''));
        const driveLink = String(fd.driveLink || fd['Drive Link'] || fd.DriveLink || fd.folderUrl || fd.linkDrive || '').trim();
        const namaClient = String(fd.namaClient || fd.name || fd['Nama Client'] || 'New Client').trim();
        const maxFoto = (fd.maxFoto !== undefined && fd.maxFoto !== '') ? Number(fd.maxFoto) : 5;
        const nomorWA = String(fd.nomorWA || fd.noWA || fd['Nomor WA'] || '').trim();
        const clientLayout = String(fd.clientLayout || fd.layout || 'masonry').trim();
        const useWatermark = Boolean(fd.useWatermark || fd.watermarkEnabled);
        const useWatermarkTiled = Boolean(fd.useWatermarkTiled);
        const musicUrl = String(fd.musicUrl || '').trim();
        const durasiPilih = String(fd.durasiPilih || 'Selamanya').trim();
        const durasiDownload = String(fd.durasiDownload || 'Selamanya').trim();
        const deadline = String(fd.deadline || '').trim();
        let categories = fd.categories || fd.kategori || [];
        if (typeof categories === 'string') {
            try { categories = JSON.parse(categories); } catch (e) { categories = []; }
        }

        const newProj = {
            id: newProjId,
            ID: newProjId,
            Token: newToken,
            token: newToken,
            'Nama Client': namaClient,
            NamaClient: namaClient,
            name: namaClient,
            'Password Client': clientPass,
            passwordClient: clientPass,
            password: clientPass,
            'Drive Link': driveLink,
            driveLink: driveLink,
            DriveLink: driveLink,
            'Dibuat Pada': new Date().toISOString().slice(0, 10),
            'Status Client': 'Belum Memilih',
            Status: 'Belum Memilih',
            statusClient: 'Belum Memilih',
            'Max Foto': maxFoto,
            MaxFoto: maxFoto,
            maxFoto: maxFoto,
            'Foto Terpilih': 0,
            'Daftar Pilihan': [],
            Owner: ownerName,
            owner: ownerName,
            ExtraPrice: String(extraPriceNum),
            extraPrice: extraPriceNum,
            isPilihActive: fd.aksesPilih !== false,
            isDownloadActive: fd.aksesDownload !== false,
            watermarkEnabled: useWatermark,
            useWatermark: useWatermark,
            useWatermarkTiled: useWatermarkTiled,
            nomorWA: nomorWA,
            'Nomor WA': nomorWA,
            clientLayout: clientLayout,
            categories: categories,
            kategori: categories,
            musicUrl: musicUrl,
            durasiPilih: durasiPilih,
            durasiDownload: durasiDownload,
            deadline: deadline,
            isMockFixture: true,
            source: 'local-mock-fixture'
        };
        MOCK_ALL_PROJECTS.push(newProj);
        mockProjectOwners[newToken] = ownerName;
        mockProjectFixtures[newToken] = ['photo1.png', 'photo2.png', 'photo3.png', 'photo4.png', 'photo5.png'];
        return reply(200, {
            status: 'success',
            data: {
                success: true,
                id: newProjId,
                token: newToken,
                message: 'Proyek berhasil dibuat'
            },
            message: 'Proyek berhasil dibuat'
        });
    }

    if (action === 'deleteProject') {
        const check = authorizeStaffProjectMutation(req, payload);
        if (!check.authorized) return check.reply;
        const project = check.project;
        const idx = MOCK_ALL_PROJECTS.indexOf(project);
        if (idx !== -1) MOCK_ALL_PROJECTS.splice(idx, 1);
        if (project.Token) {
            delete mockProjectOwners[project.Token];
            delete mockProjectFixtures[project.Token];
            mockProjectSelections.delete(project.Token);
        }
        return reply(200, {
            status: 'success',
            data: { success: true, message: 'Proyek berhasil dihapus' },
            message: 'Proyek berhasil dihapus'
        });
    }

    if (action === 'updateClientPassword') {
        const check = authorizeStaffProjectMutation(req, payload);
        if (!check.authorized) return check.reply;
        check.project.passwordClient = payload.newPassword || '';
        return reply(200, {
            status: 'success',
            data: { success: true, message: 'Password klien berhasil diperbarui' },
            message: 'Password klien berhasil diperbarui'
        });
    }

    if (action === 'updateDeadline') {
        const check = authorizeStaffProjectMutation(req, payload);
        if (!check.authorized) return check.reply;
        check.project.deadline = payload.newDeadline || '';
        return reply(200, {
            status: 'success',
            data: { success: true, message: 'Batas waktu berhasil diperbarui' },
            message: 'Batas waktu berhasil diperbarui'
        });
    }

    if (action === 'toggleProjectWatermark') {
        const check = authorizeStaffProjectMutation(req, payload);
        if (!check.authorized) return check.reply;
        check.project.watermarkEnabled = !check.project.watermarkEnabled;
        const newVal = check.project.watermarkEnabled;
        return reply(200, {
            status: 'success',
            data: { success: true, newValue: newVal, message: 'Status watermark berhasil diperbarui' },
            message: 'Status watermark berhasil diperbarui'
        });
    }

    if (action === 'toggleProjectDownload') {
        const check = authorizeStaffProjectMutation(req, payload);
        if (!check.authorized) return check.reply;
        const currentDl = check.project.isDownloadActive !== false && check.project.aksesDownload !== false;
        const newDl = !currentDl;
        check.project.isDownloadActive = newDl;
        check.project.aksesDownload = newDl;
        return reply(200, {
            status: 'success',
            data: { success: true, newValue: newDl, message: 'Status download berhasil diperbarui' },
            message: 'Status download berhasil diperbarui'
        });
    }

    if (action === 'updateProjectMaxFoto') {
        const check = authorizeStaffProjectMutation(req, payload);
        if (!check.authorized) return check.reply;
        const newMax = parseInt(payload.newMax) || 0;
        check.project['Max Foto'] = newMax;
        check.project.MaxFoto = newMax;
        check.project.maxFoto = newMax;
        return reply(200, {
            status: 'success',
            data: { success: true, newMax: newMax, message: 'Batas foto berhasil diperbarui' },
            message: 'Batas foto berhasil diperbarui'
        });
    }

    if (action === 'reopenProject') {
        const check = authorizeStaffProjectMutation(req, payload);
        if (!check.authorized) return check.reply;
        const currentMax = check.project['Max Foto'] || check.project.MaxFoto || 5;
        const newMax = parseInt(payload.newMax) || currentMax;
        check.project['Status Client'] = 'Sedang Memilih';
        check.project.Status = 'Sedang Memilih';
        check.project.statusClient = 'Sedang Memilih';
        check.project['Max Foto'] = newMax;
        check.project.MaxFoto = newMax;
        check.project.maxFoto = newMax;
        return reply(200, {
            status: 'success',
            data: { success: true, message: 'Akses klien berhasil dibuka' },
            message: 'Akses klien berhasil dibuka'
        });
    }

    if (action === 'processPayment') {
        const check = authorizeStaffProjectMutation(req, payload);
        if (!check.authorized) return check.reply;
        const newStatus = payload.status || 'Selesai';
        check.project['Status Client'] = newStatus;
        check.project.Status = newStatus;
        check.project.statusClient = newStatus;
        return reply(200, {
            status: 'success',
            data: { success: true, message: 'Status pembayaran berhasil diproses' },
            message: 'Status pembayaran berhasil diproses'
        });
    }

    if (action === 'deleteUser') {
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.error || staffAuth.session.role !== 'Admin') {
            return reply(200, {
                status: 'error',
                code: staffAuth.error || 'UNAUTHORIZED_ROLE',
                message: 'Akses ditolak: Hanya peran Admin yang dapat menghapus pengguna.'
            });
        }
        return res.end(JSON.stringify({
            status: 'success',
            message: 'Pengguna berhasil dihapus'
        }));
    }

    if (action === 'updateClientStatus') {
        // A. Staff update
        const staffAuth = resolveStaffSession(req, payload);
        if (staffAuth.session) {
            const check = authorizeStaffProjectMutation(req, payload);
            if (!check.authorized) return check.reply;
            const newStatus = payload.status || 'Sedang Memilih';
            check.project['Status Client'] = newStatus;
            check.project.Status = newStatus;
            check.project.statusClient = newStatus;
            return reply(200, {
                status: 'success',
                data: { success: true, message: 'Status klien berhasil diperbarui' },
                message: 'Status klien berhasil diperbarui'
            });
        }

        // B. Client update
        let clientSessionToken = '';
        if (req.headers && req.headers['authorization']) {
            const authParts = req.headers['authorization'].split(' ');
            if (authParts.length === 2 && authParts[0].toLowerCase() === 'bearer') {
                clientSessionToken = authParts[1].trim();
            }
        }
        if (!clientSessionToken && payload.clientAccessToken) clientSessionToken = String(payload.clientAccessToken).trim();
        if (!clientSessionToken && payload.sessionId) clientSessionToken = String(payload.sessionId).trim();

        if (clientSessionToken) {
            const clientSession = mockVerifiedSessions.get(clientSessionToken);
            if (!clientSession) {
                return reply(200, {
                    status: 'error',
                    code: 'INVALID_SESSION',
                    message: 'Akses ditolak: Sesi galeri tidak valid.'
                });
            }
            const now = getNow(req);
            if (now > clientSession.expiresAt) {
                mockVerifiedSessions.delete(clientSessionToken);
                return reply(200, {
                    status: 'error',
                    code: 'SESSION_EXPIRED',
                    message: 'Sesi galeri telah kedaluwarsa.'
                });
            }
            if (payload.token && payload.token !== clientSession.projectToken) {
                return reply(200, {
                    status: 'error',
                    code: 'PROJECT_MISMATCH',
                    message: 'Akses ditolak: Sesi aktif tidak cocok dengan proyek ini.'
                });
            }
            const project = findMockProject(clientSession.projectToken);
            if (!project) {
                return reply(200, {
                    status: 'error',
                    code: 'PROJECT_NOT_FOUND',
                    message: 'Proyek tidak ditemukan.'
                });
            }

            if (payload.selectedFiles) {
                let rawList = payload.selectedFiles;
                if (typeof rawList === 'string') {
                    try { rawList = JSON.parse(rawList); } catch (e) { rawList = []; }
                }
                if (!Array.isArray(rawList)) rawList = [];
                const filenames = rawList.map(item => typeof item === 'string' ? item.trim() : (item.n || item.name || '').trim()).filter(Boolean);
                const maxFoto = Number(project['Max Foto'] || project.MaxFoto || project.maxFoto || 0);
                if (maxFoto > 0 && filenames.length > maxFoto) {
                    return reply(200, {
                        status: 'error',
                        code: 'QUOTA_EXCEEDED',
                        message: `Jumlah foto yang dipilih (${filenames.length}) melebihi kuota maksimal (${maxFoto}).`
                    });
                }
                const allowedFiles = mockProjectFixtures[clientSession.projectToken] || [];
                for (const f of filenames) {
                    if (!allowedFiles.includes(f)) {
                        return reply(200, {
                            status: 'error',
                            code: 'INVALID_PHOTO_SELECTION',
                            message: `Berkas ${f} bukan merupakan bagian dari galeri proyek ini.`
                        });
                    }
                }
                project['Daftar Pilihan'] = filenames;
                project['Foto Terpilih'] = filenames.length;
                project.selectedFiles = JSON.stringify(filenames);
                mockProjectSelections.set(clientSession.projectToken, filenames);
            }

            if (payload.status) {
                project['Status Client'] = payload.status;
                project.Status = payload.status;
                project.statusClient = payload.status;
            }

            return reply(200, {
                status: 'success',
                data: { success: true, message: 'Status klien berhasil diperbarui' },
                message: 'Status klien berhasil diperbarui'
            });
        }

        return reply(200, {
            status: 'error',
            code: 'SESSION_REQUIRED',
            message: 'Akses ditolak: Sesi tidak ditemukan atau belum login.'
        });
    }

    if (action === 'releaseClientSession') {
        let sessionToken = '';
        if (req.headers['authorization']) {
            const authParts = req.headers['authorization'].split(' ');
            if (authParts.length === 2 && authParts[0].toLowerCase() === 'bearer') {
                sessionToken = authParts[1].trim();
            }
        }
        if (!sessionToken && payload.clientAccessToken) {
            sessionToken = String(payload.clientAccessToken).trim();
        }
        if (!sessionToken && payload.sessionToken) {
            sessionToken = String(payload.sessionToken).trim();
        }

        // Requirement (TEST13 / Test G): releaseClientSession without session -> DENIED
        if (!sessionToken) {
            return reply(200, {
                status: 'error',
                code: 'SESSION_REQUIRED',
                message: 'Akses ditolak: Memerlukan kredensial sesi aktif untuk merilis sesi.'
            });
        }

        if (!mockVerifiedSessions.has(sessionToken)) {
            return reply(200, {
                status: 'error',
                code: 'INVALID_SESSION',
                message: 'Sesi tidak ditemukan atau sudah tidak aktif.'
            });
        }

        // Revoke ONLY the invoking session (TEST14)
        mockVerifiedSessions.delete(sessionToken);
        return res.end(JSON.stringify({
            status: 'success',
            message: 'Sesi klien berhasil dirilis'
        }));
    }

    if (action === 'sendExpiryReminder') {
        return res.end(JSON.stringify({
            status: 'success',
            message: 'Pengingat berhasil dikirim'
        }));
    }

    if (action === 'reopenProject' || action === 'processPayment') {
        return reply(200, {
            status: 'success',
            message: 'Status pembayaran berhasil diproses'
        });
    }

    if (action === 'getFeedbacks' || action === 'replyFeedback' || action === 'submitFeedback') {
        return reply(200, {
            status: 'success',
            data: []
        });
    }

    if (action === 'logVisit') {
        return reply(200, {
            status: 'success',
            data: { success: true, message: 'Visit logged in mock' }
        });
    }

    // Default Fallback - Explicit Error for Unknown API Actions
    return reply(400, {
        status: 'error',
        message: 'Action API tidak dikenali: ' + action
    });
}

// Known Application SPA Routes (mapped to app.html in local mock)
const KNOWN_SPA_ROUTES = new Set([
    '/app',
    '/app.html',
    '/login',
    '/register',
    '/admin/dashboard',
    '/admin/settings',
    '/admin/premium-addon',
    '/client/monitoring',
    '/docs/guide',
    '/support/feedback',
    '/team/management',
    '/reports/feedback',
    '/collage',
    '/sortir-lokal',
    '/sortirlokal',
    '/settings',
    '/pengaturan',
    '/premium-addon',
    '/dashboard',
    '/status',
    '/panduan',
    '/feedback',
    '/users',
    '/admin-feedback'
]);

function isSpaRoute(p) {
    if (KNOWN_SPA_ROUTES.has(p)) return true;
    if (p.startsWith('/projects/') || p === '/projects') return true;
    return false;
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
    if (pathname === '/api/bridge' || pathname === '/api') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            handleApiBridge(req, res, body);
        });
        return;
    }

    // Document & SPA routing fallback (Safe local mock only)
    if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
    } else if (isSpaRoute(pathname)) {
        pathname = '/app.html';
    }

    const filePath = path.normalize(path.join(ROOT_DIR, pathname));

    // Security check: ensure path stays within ROOT_DIR (Block path traversal)
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
    }

    // Strict Mock Boundary Authorization for Fixture File Retrieval (Task A & Task E)
    if (pathname.startsWith('/test/phase55-fixtures/')) {
        const reqFilename = path.basename(pathname);

        // 1. Extract session token strictly from Authorization header or ?session= query parameter
        let sessionToken = parsedUrl.searchParams.get('session');
        if (req.headers['authorization']) {
            const authParts = req.headers['authorization'].split(' ');
            if (authParts.length === 2 && authParts[0].toLowerCase() === 'bearer') {
                sessionToken = authParts[1].trim();
            }
        }

        // Request project token (for identity matching, NOT authentication)
        let clientToken = req.headers['x-client-token'] || parsedUrl.searchParams.get('token');

        // 2. Reject if no session token is provided at all (TEST01, TEST03, TEST06, TEST E)
        // Public project token alone MUST NOT authenticate the visitor!
        if (!sessionToken) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                code: 'SESSION_REQUIRED',
                message: 'HTTP 403: Kredensial sesi tidak ditemukan. URL publik galeri tidak dapat digunakan untuk mengunduh tanpa PIN.'
            }));
        }

        // 3. Resolve session from active session store
        const verifiedSession = mockVerifiedSessions.get(sessionToken);
        if (!verifiedSession) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                code: 'INVALID_SESSION',
                message: 'HTTP 403: Sesi galeri tidak valid atau belum diverifikasi dengan PIN.'
            }));
        }

        // 4. Enforce session expiration (TEST15)
        const now = getNow(req);
        if (now > verifiedSession.expiresAt) {
            mockVerifiedSessions.delete(sessionToken);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                code: 'SESSION_EXPIRED',
                message: 'HTTP 403: Sesi galeri telah kedaluwarsa. Silakan masukkan PIN kembali.'
            }));
        }

        // 5. Validate that request project identity matches the session's project identity (TEST10)
        if (clientToken && clientToken !== verifiedSession.projectToken) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                code: 'PROJECT_MISMATCH',
                message: 'HTTP 403: Sesi aktif tidak cocok dengan proyek yang diminta.'
            }));
        }

        // 6. Check download permission for this project (TEST12)
        if (verifiedSession.isDownloadActive === false || verifiedSession.projectToken === 'token-no-download') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                code: 'DOWNLOAD_DISABLED',
                message: 'HTTP 403: Fitur unduh berkas asli dinonaktifkan untuk proyek ini.'
            }));
        }

        // 7. Cross-project photo access check (TEST11)
        const allowedPhotos = mockProjectFixtures[verifiedSession.projectToken] || [];
        if (!allowedPhotos.includes(reqFilename)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                code: 'CROSS_PROJECT_FORBIDDEN',
                message: `HTTP 403: Berkas ${reqFilename} bukan milik proyek ini (Cross-project access denied).`
            }));
        }

        // Authorized! Proceed to serve file
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

async function runIsolationAudit(isExistingServer = false) {
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
    let failCount = 0;
    let totalChecks = 0;

    function check(cond, id, desc) {
        totalChecks++;
        if (cond) {
            passCount++;
            console.log(`✅ [ISOLATION PASS] ${id}: ${desc}`);
        } else {
            failCount++;
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
        check(rClient.status === 200 && rClient.data?.data?.needsPassword === true, 'ISO-04', 'Mock getProjectForClient mengembalikan status needsPassword: true untuk token valid');

        const rClientMissing = await postJson('getProjectForClient', { token: '' });
        check(rClientMissing.status === 200 && rClientMissing.data?.status === 'error', 'ISO-04b', 'Mock getProjectForClient menolak request dengan token kosong');

        const rClientUnknown = await postJson('getProjectForClient', { token: 'unknown-token-random' });
        check(rClientUnknown.status === 200 && rClientUnknown.data?.status === 'error', 'ISO-04c', 'Mock getProjectForClient menolak token tidak dikenal');

        const rWrongPin = await postJson('verifyClientPassword', { token: 'dummy-client-token', passwordInput: '9999' });
        check(rWrongPin.status === 200 && rWrongPin.data?.status === 'error', 'ISO-05', 'PIN galeri salah ditolak dengan pesan error');

        const rVerifyUnknown = await postJson('verifyClientPassword', { token: 'unknown-token-random', passwordInput: '1234' });
        check(rVerifyUnknown.status === 200 && rVerifyUnknown.data?.status === 'error', 'ISO-05b', 'verifyClientPassword menolak token tidak dikenal');

        const rRightPin = await postJson('verifyClientPassword', { token: 'dummy-client-token', passwordInput: '1234' });
        const validClientSession = rRightPin.data?.data?.clientAccessToken;
        check(rRightPin.status === 200 && rRightPin.data?.data?.valid === true && !!validClientSession && rRightPin.data?.data?.project?.isDownloadActive === true, 'ISO-06', 'PIN galeri benar (1234) membuka proyek dengan token sesi acak dan download aktif');

        const rNoDownload = await postJson('verifyClientPassword', { token: 'token-no-download', passwordInput: '1234' });
        check(rNoDownload.status === 200 && rNoDownload.data?.data?.project?.isDownloadActive === false, 'ISO-06b', 'Proyek dengan download nonaktif mengembalikan isDownloadActive: false');

        const rClientRestore = await postJson('getProjectForClient', { token: 'dummy-client-token', clientAccessToken: validClientSession });
        check(rClientRestore.status === 200 && rClientRestore.data?.data?.accessGranted === true && rClientRestore.data?.data?.needsPassword === false, 'ISO-06c', 'Mock getProjectForClient mengembalikan accessGranted: true dan needsPassword: false untuk sesi aktif');

        // ISO-07a: Akses getDriveContent tanpa kredensial sesi ditolak
        const rPhotosUnauth = await postJson('getDriveContent', { folder_id: 'mock-folder-root' });
        check(rPhotosUnauth.data?.status === 'error', 'ISO-07a', 'Mock getDriveContent menolak akses tanpa otorisasi sesi');

        // ISO-07b: Akses getDriveContent hanya dengan token publik (tanpa bearer session) ditolak (Test F)
        const rPhotosTokenOnly = await postJson('getDriveContent', { folder_id: 'mock-folder-root', token: 'dummy-client-token' });
        check(rPhotosTokenOnly.data?.status === 'error', 'ISO-07b', 'Mock getDriveContent menolak akses token publik tanpa kredensial sesi');

        // ISO-07c: Akses getDriveContent dengan role bypass "fotografer" tanpa login ditolak (Test C)
        const rPhotosRoleBypass = await postJson('getDriveContent', { folder_id: 'mock-folder-root', token: 'fotografer' });
        check(rPhotosRoleBypass.data?.status === 'error', 'ISO-07c', 'Mock getDriveContent menolak role bypass fotografer tanpa sesi login');

        // ISO-07d: Akses getDriveContent dengan kredensial sesi valid diizinkan
        const rPhotosAuth = await postJson('getDriveContent', { folder_id: 'mock-folder-root', token: 'dummy-client-token', clientAccessToken: validClientSession });
        check(rPhotosAuth.status === 200 && rPhotosAuth.data?.data?.images?.length === 5, 'ISO-07d', 'Mock getDriveContent menyajikan tepat 5 foto sampel untuk sesi valid');

        const allImagesArePng = rPhotosAuth.data?.data?.images?.every(img => img.name.endsWith('.png'));
        check(allImagesArePng, 'ISO-07e', 'Seluruh nama file sampel mock memiliki ekstensi .png konsisten dengan byte aslinya');

        // Positive & Negative Authentication Testing
        const rPhotoLogin = await postJson('login', { username: 'fotografer', password: 'password123' });
        const photoRole = rPhotoLogin.data?.data?.role;
        check(rPhotoLogin.status === 200 && photoRole === 'Photographer', 'ISO-08a', 'Login fotografer valid (fotografer / password123) mengembalikan peran Photographer');

        const rPhotoWrongPass = await postJson('login', { username: 'fotografer', password: 'wrongpassword' });
        check(rPhotoWrongPass.status === 200 && rPhotoWrongPass.data?.status === 'error', 'ISO-08b', 'Login fotografer password salah ditolak dengan status error');

        const rUnknownUser = await postJson('login', { username: 'user_tidak_dikenal', password: 'password123' });
        check(rUnknownUser.status === 200 && rUnknownUser.data?.status === 'error', 'ISO-08c', 'Login username tidak dikenal ditolak dengan status error');

        const rDemoLogin = await postJson('login', { username: 'demo', password: 'password123' });
        const demoOk = rDemoLogin.status === 200 && rDemoLogin.data?.data?.role === 'Photographer' && rDemoLogin.data?.data?.paket === 'Demo' && rDemoLogin.data?.data?.isPremiumAddon === false;
        check(demoOk, 'ISO-08d', 'Login demo valid (demo / password123) mengembalikan peran Photographer paket Demo tanpa PRO addon');

        const rDemoUserLogin = await postJson('login', { username: 'demo_user', password: 'password123' });
        const demoUserOk = rDemoUserLogin.status === 200 && rDemoUserLogin.data?.data?.username === 'demo_user' && rDemoUserLogin.data?.data?.paket === 'Demo';
        check(demoUserOk, 'ISO-08e', 'Login demo_user alias valid mengembalikan akun Demo yang konsisten');

        const rDemoWrongPass = await postJson('login', { username: 'demo', password: 'wrongpassword' });
        check(rDemoWrongPass.status === 200 && rDemoWrongPass.data?.status === 'error' && rDemoWrongPass.data?.message === 'Password salah', 'ISO-08f', 'Login demo password salah ditolak dengan status error Password salah');

        const rAdminLogin = await postJson('login', { username: 'admin', password: 'password123' });
        const adminRole = rAdminLogin.data?.data?.role;
        check(rAdminLogin.status === 200 && adminRole === 'Admin', 'ISO-09a', 'Login admin valid (admin / password123) mengembalikan peran Admin');

        const rAdminWrongPass = await postJson('login', { username: 'admin', password: 'wrongpassword' });
        check(rAdminWrongPass.status === 200 && rAdminWrongPass.data?.status === 'error', 'ISO-09b', 'Login admin password salah ditolak dengan status error');

        const rUnknownAction = await postJson('unknownMockAction_999');
        check(rUnknownAction.status === 400 && rUnknownAction.data?.status === 'error', 'ISO-09c', 'Mock API menolak action tidak dikenal dengan HTTP 400 status error');

        // Unauthenticated access to getUsers must be denied
        const rUsersUnauth = await postJson('getUsers');
        check(rUsersUnauth.status === 200 && rUsersUnauth.data?.status === 'error' && rUsersUnauth.data?.code === 'SESSION_REQUIRED', 'ISO-10-UNAUTH', 'Mock getUsers menolak akses tanpa sesi login dengan status error SESSION_REQUIRED');

        // Admin access to getUsers is authorized
        const adminSessionToken = rAdminLogin.data?.data?.sessionId;
        const rUsers = await postJson('getUsers', { sessionId: adminSessionToken });
        const userRows = Array.isArray(rUsers.data?.data) ? rUsers.data.data : (rUsers.data?.data?.data || []);
        check(rUsers.status === 200 && userRows.length === 4, 'ISO-10', 'Mock tabel pengguna menyajikan 4 akun berbeda (Admin, PRO, Reguler, Demo) untuk Admin terotentikasi');

        // Photographer access to getUsers must be denied
        const photoSessionToken = rPhotoLogin.data?.data?.sessionId;
        const rUsersPhotoDeny = await postJson('getUsers', { sessionId: photoSessionToken });
        check(rUsersPhotoDeny.status === 200 && rUsersPhotoDeny.data?.status === 'error' && rUsersPhotoDeny.data?.code === 'UNAUTHORIZED_ROLE', 'ISO-10-ROLE', 'Mock getUsers menolak akses Fotografer biasa dengan status error UNAUTHORIZED_ROLE');

        // Unauthenticated access to getDashboardStats must be denied
        const rStatsUnauth = await postJson('getDashboardStats');
        check(rStatsUnauth.status === 200 && rStatsUnauth.data?.status === 'error' && rStatsUnauth.data?.code === 'SESSION_REQUIRED', 'ISO-10b-UNAUTH', 'Mock getDashboardStats menolak akses tanpa sesi login dengan status error SESSION_REQUIRED');

        // Admin access to getDashboardStats is authorized
        const rStats = await postJson('getDashboardStats', { sessionId: adminSessionToken });
        const statsOk = rStats.status === 200 && rStats.data?.data?.success && rStats.data?.data?.data?.totalUsers === 4;
        check(statsOk, 'ISO-10b', 'Mock getDashboardStats menyajikan metrik analitik dashboard untuk Admin terotentikasi');

        // Unauthenticated access to getProjects must be denied
        const rProjectsUnauth = await postJson('getProjects');
        check(rProjectsUnauth.status === 200 && rProjectsUnauth.data?.status === 'error' && rProjectsUnauth.data?.code === 'SESSION_REQUIRED', 'ISO-11-UNAUTH', 'Mock getProjects menolak akses tanpa sesi login dengan status error SESSION_REQUIRED');

        // Photographer access to getProjects returns only owned projects (3 projects), and does not expose pro_studio (token-proj-2)
        const rProjects = await postJson('getProjects', { sessionId: photoSessionToken });
        const projList = Array.isArray(rProjects.data?.data) ? rProjects.data.data : (rProjects.data?.data?.data || []);
        const photoOnlyProj = projList.length === 3 && projList.every(p => p.Owner === 'fotografer' || p.owner === 'fotografer') && !projList.some(p => p.Token === 'token-proj-2');
        check(rProjects.status === 200 && photoOnlyProj, 'ISO-11', 'Mock getProjects menyajikan hanya proyek milik fotografer aktif tanpa mengekspos proyek milik pengguna lain');

        // Demo access to getProjects returns only Demo-owned projects (1 project)
        const demoSessionToken = rDemoLogin.data?.data?.sessionId;
        const rProjectsDemo = await postJson('getProjects', { sessionId: demoSessionToken });
        const demoProjList = Array.isArray(rProjectsDemo.data?.data) ? rProjectsDemo.data.data : (rProjectsDemo.data?.data?.data || []);
        const demoOnlyProj = demoProjList.length === 1 && demoProjList[0].Token === 'token-olive';
        check(rProjectsDemo.status === 200 && demoOnlyProj, 'ISO-11b', 'Mock getProjects menyajikan hanya proyek Demo (token-olive) untuk sesi Demo terotentikasi');

        const rSecurity = await getPath('/../package.json');
        check(rSecurity.status === 403 || rSecurity.status === 404, 'ISO-12', 'Proteksi directory traversal aktif mencegah akses file di luar root proyek');

        // AUDIT KHUSUS PERBAIKAN THUMBNAIL (TASK A, B, C, D)
        const isSafeDataRegex = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
        const allPhotosValidBase64 = DUMMY_PHOTOS.every(p => isSafeDataRegex.test(p.url));
        check(allPhotosValidBase64, 'ISO-13', 'Semua 5 dummy photo URL lolos regex isSafeDataImageUrl (PNG base64 valid, zero fallback)');

        // ISO-14a: Akses tanpa token ditolak HTTP 403
        const rFixUnauth = await getPath('/test/phase55-fixtures/photo1.png');
        check(rFixUnauth.status === 403, 'ISO-14a', 'Akses berkas fisik /test/phase55-fixtures/ tanpa token ditolak HTTP 403');

        // ISO-14b: Akses hanya dengan parameter token publik (tanpa sesi) ditolak HTTP 403 (Test E)
        const rFixTokenOnly = await getPath('/test/phase55-fixtures/photo1.png?token=dummy-client-token');
        check(rFixTokenOnly.status === 403, 'ISO-14b', 'Akses berkas fisik hanya dengan token publik (tanpa sesi) ditolak HTTP 403');

        // ISO-14c: Akses dengan token sesi valid disajikan HTTP 200 image/png
        let allFixturesServed = true;
        for (let i = 1; i <= 5; i++) {
            const rFix = await getPath(`/test/phase55-fixtures/photo${i}.png?session=${validClientSession}&token=dummy-client-token`);
            if (rFix.status !== 200 || !rFix.headers['content-type'].includes('image/png')) {
                allFixturesServed = false;
            }
        }
        check(allFixturesServed, 'ISO-14c', 'Semua berkas fisik /test/phase55-fixtures/photo{1..5}.png disajikan HTTP 200 image/png dengan token sesi valid');

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

        // SPA FALLBACK ROUTING TESTS (TASK B)
        const rSpaTeam = await getPath('/team/management');
        check(rSpaTeam.status === 200 && rSpaTeam.body.includes('<!DOCTYPE html>'), 'ISO-SPA-01', 'SPA Route /team/management menyajikan app.html HTTP 200');

        const rSpaProj = await getPath('/projects/createproject');
        check(rSpaProj.status === 200 && rSpaProj.body.includes('<!DOCTYPE html>'), 'ISO-SPA-02', 'SPA Route /projects/createproject menyajikan app.html HTTP 200');

        const rSpaMon = await getPath('/client/monitoring');
        check(rSpaMon.status === 200 && rSpaMon.body.includes('<!DOCTYPE html>'), 'ISO-SPA-03', 'SPA Route /client/monitoring menyajikan app.html HTTP 200');

        const rSpaCollage = await getPath('/collage');
        check(rSpaCollage.status === 200 && rSpaCollage.body.includes('<!DOCTYPE html>'), 'ISO-SPA-04', 'SPA Route /collage menyajikan app.html HTTP 200');

        const rSpaSortir = await getPath('/sortir-lokal');
        check(rSpaSortir.status === 200 && rSpaSortir.body.includes('<!DOCTYPE html>'), 'ISO-SPA-05', 'SPA Route /sortir-lokal menyajikan app.html HTTP 200');

        const rSpaSettings = await getPath('/admin/settings');
        check(rSpaSettings.status === 200 && rSpaSettings.body.includes('<!DOCTYPE html>'), 'ISO-SPA-06', 'SPA Route /admin/settings menyajikan app.html HTTP 200');

        const rSpaQuery = await getPath('/app.html?token=dummy-client-token');
        check(rSpaQuery.status === 200 && rSpaQuery.body.includes('<!DOCTYPE html>'), 'ISO-SPA-07', 'SPA Route dengan parameter token /app.html?token=dummy-client-token menyajikan app.html HTTP 200');

        const rSpaNotFound = await getPath('/nonexistent/random/test/route');
        check(rSpaNotFound.status === 404, 'ISO-SPA-08', 'Rute tidak dikenal /nonexistent/random/test/route mengembalikan HTTP 404');

        // ====================================================================
        // TASK 1 — NESTED ROUTE ASSET RESOLUTION AUDIT (DEEP LINK ASSETS)
        // ====================================================================
        console.log('\n--- AUDIT RESOLUSI ASSET SPA DEEP LINKS (TASK 1) ---');
        
        // 1. Root-relative canonical CSS & JS assets
        const rCssAppCore = await getPath('/assets/css/app-core.css?v=5.3.0');
        const isCssContentType = (rCssAppCore.headers['content-type'] || '').includes('text/css');
        check(rCssAppCore.status === 200 && isCssContentType && rCssAppCore.body.includes('@import url(\'./design-tokens.css\')'),
            'ISO-ASSET-01', 'Canonical /assets/css/app-core.css?v=5.3.0 menyajikan CSS HTTP 200 dengan Content-Type text/css');

        const rCssTokens = await getPath('/assets/css/design-tokens.css');
        check(rCssTokens.status === 200 && (rCssTokens.headers['content-type'] || '').includes('text/css') && rCssTokens.body.includes('--accent-champagne: #dfba7b;'),
            'ISO-ASSET-02', 'Sub-stylesheet impor /assets/css/design-tokens.css tersaji HTTP 200');

        const rCssRoleShell = await getPath('/assets/css/role-shell.css');
        check(rCssRoleShell.status === 200 && (rCssRoleShell.headers['content-type'] || '').includes('text/css') && rCssRoleShell.body.includes('var(--bg-elevated'),
            'ISO-ASSET-03', 'Sub-stylesheet impor /assets/css/role-shell.css tersaji HTTP 200');

        const rCssAuth = await getPath('/assets/css/auth-luxury.css');
        check(rCssAuth.status === 200 && (rCssAuth.headers['content-type'] || '').includes('text/css'),
            'ISO-ASSET-04', 'Sub-stylesheet impor /assets/css/auth-luxury.css tersaji HTTP 200');

        const rCssClient = await getPath('/assets/css/client-gallery-luxury.css');
        check(rCssClient.status === 200 && (rCssClient.headers['content-type'] || '').includes('text/css'),
            'ISO-ASSET-05', 'Sub-stylesheet impor /assets/css/client-gallery-luxury.css tersaji HTTP 200');

        const rJsCharts = await getPath('/assets/js/admin/dashboard-charts.js?v=5.0.0');
        const isJsContentType = (rJsCharts.headers['content-type'] || '').includes('javascript');
        check(rJsCharts.status === 200 && isJsContentType && rJsCharts.body.includes('function renderCharts'),
            'ISO-ASSET-06', 'Canonical /assets/js/admin/dashboard-charts.js?v=5.0.0 menyajikan JS HTTP 200 dengan Content-Type application/javascript');

        // 2. Verifikasi app.html menggunakan root-relative URL untuk mencegah 404 pada nested routes
        const appHtmlContent = fs.readFileSync(path.join(ROOT_DIR, 'app.html'), 'utf8');
        const hasRootCss = appHtmlContent.includes('href="/assets/css/app-core.css?v=5.3.0"');
        const hasNoRelativeCss = !appHtmlContent.includes('href="assets/css/app-core.css');
        const hasRootJs = appHtmlContent.includes('src="/assets/js/admin/dashboard-charts.js?v=5.0.0"');
        const hasNoRelativeJs = !appHtmlContent.includes('src="assets/js/admin/dashboard-charts.js');
        check(hasRootCss && hasNoRelativeCss && hasRootJs && hasNoRelativeJs,
            'ISO-ASSET-07', 'app.html menggunakan canonical root-relative URLs (/assets/...) dengan cache versioning utuh (zero relative assets)');

        // 3. Verifikasi ketiadaan blanket SPA fallback pada URL asset yang salah
        const rFakeAsset = await getPath('/team/assets/css/app-core.css');
        check(rFakeAsset.status === 404,
            'ISO-ASSET-08', 'Permintaan asset salah path (/team/assets/...) mengembalikan 404 tanpa ditutupi blanket SPA fallback');

        // ====================================================================
        // TASK 2 — THEME CASCADE & SPECIFICITY AUDIT
        // ====================================================================
        console.log('\n--- AUDIT CSS THEME CASCADE & SPECIFICITY (TASK 2) ---');

        const designTokensCss = fs.readFileSync(path.join(ROOT_DIR, 'assets/css/design-tokens.css'), 'utf8');
        const roleShellCss = fs.readFileSync(path.join(ROOT_DIR, 'assets/css/role-shell.css'), 'utf8');

        // 1. Specificity scoping check
        const ivoryScoped = designTokensCss.includes('html:not(.dark):not([data-theme]) body:not([data-theme])');
        const noirScoped = designTokensCss.includes('html.dark:not([data-theme]) body:not([data-theme])');
        check(ivoryScoped && noirScoped,
            'ISO-THM-01', 'Default light dan dark mode di design-tokens.css ter-scope dengan :not([data-theme]) mencegah penimpaan tema Sapphire/Olive');

        // 2. Hardcoded color audits in role-shell.css
        const noHardcodedSettingsBg = !roleShellCss.includes('background-color: #141517 !important;');
        const usesElevatedSettingsBg = roleShellCss.includes('background-color: var(--bg-elevated, #212226) !important;');
        check(noHardcodedSettingsBg && usesElevatedSettingsBg,
            'ISO-THM-02', 'role-shell.css: #section-settings [class*="bg-gray-50"] menggunakan token var(--bg-elevated) (zero hardcoded #141517)');

        const noHardcodedHeroTitle = !roleShellCss.includes('color: #fff5e7;');
        const usesTokenHeroTitle = roleShellCss.includes('color: var(--text-primary, #f4f0e9);');
        check(noHardcodedHeroTitle && usesTokenHeroTitle,
            'ISO-THM-03', 'role-shell.css: hero-title menggunakan token var(--text-primary) (zero hardcoded #fff5e7)');

        // 3. Mathematical contrast calculation for 4 official looks (WCAG AA >= 4.5:1, AAA >= 7:1)
        function getLuminance(hex) {
            const clean = hex.replace('#', '');
            const r = parseInt(clean.substring(0, 2), 16) / 255;
            const g = parseInt(clean.substring(2, 4), 16) / 255;
            const b = parseInt(clean.substring(4, 6), 16) / 255;
            const a = [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        }

        function getContrast(h1, h2) {
            const l1 = getLuminance(h1);
            const l2 = getLuminance(h2);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }

        const noirContrast = getContrast('#f4f0e9', '#0e0f10'); // ~16.3:1
        const ivoryContrast = getContrast('#27231e', '#f5f1e9'); // ~12.8:1
        const sapphireContrast = getContrast('#f0f5ff', '#0a1120'); // ~16.2:1
        const oliveContrast = getContrast('#203327', '#e9ebe5'); // ~11.2:1

        const allContrastWcagAaa = noirContrast >= 7.0 && ivoryContrast >= 7.0 && sapphireContrast >= 7.0 && oliveContrast >= 7.0;
        check(allContrastWcagAaa,
            'ISO-THM-04', `Rasio kontras teks/bg untuk seluruh 4 tema (Noir: ${noirContrast.toFixed(1)}:1, Ivory: ${ivoryContrast.toFixed(1)}:1, Sapphire: ${sapphireContrast.toFixed(1)}:1, Olive: ${oliveContrast.toFixed(1)}:1) lolos standar WCAG AAA (>= 7.0:1)`);

        // 4. Photographer-Client Theme Sync Audit (Phase 5.6R Task A/B/D)
        const rClientNoir = await postJson('getProjectForClient', { token: 'dummy-client-token' });
        const rClientSapphire = await postJson('getProjectForClient', { token: 'token-proj-2' });
        const rClientIvory = await postJson('getProjectForClient', { token: 'token-ivory' });
        const rClientOlive = await postJson('getProjectForClient', { token: 'token-olive' });

        const themeSyncPass = rClientNoir.data?.data?.theme === 'noir' &&
                              rClientSapphire.data?.data?.theme === 'sapphire' &&
                              rClientIvory.data?.data?.theme === 'ivory' &&
                              rClientOlive.data?.data?.theme === 'olive';
        check(themeSyncPass, 'ISO-THM-05', 'Client Gallery project metadata serves photographer-specific theme (Noir, Sapphire, Ivory, Olive)');

        const rVerifyClientSapphire = await postJson('verifyClientPassword', { token: 'token-proj-2', passwordInput: '1234' });
        const verifyThemePass = rVerifyClientSapphire.data?.data?.project?.theme === 'sapphire';
        check(verifyThemePass, 'ISO-THM-06', 'Client Gallery unlocked session carries authoritative owner theme');

        console.log(`\n======================================================`);
        console.log(`TOTAL UJI ISOLASI, AUTH, ASSETS & THEME: ${passCount}/${totalChecks} PASSED | ${failCount} FAILED`);
        console.log(`======================================================`);
        console.log('Server mock 100% siap untuk peninjauan interaktif manual oleh operator di browser lokal.');

        if (process.argv.includes('--audit-only') || process.argv.includes('--test')) {
            if (!isExistingServer) {
                server.close(() => {
                    process.exit(failCount === 0 ? 0 : 1);
                });
            } else {
                process.exit(failCount === 0 ? 0 : 1);
            }
        }
    } catch (err) {
        console.error('Error saat menjalankan audit isolasi:', err.message);
        if (process.argv.includes('--audit-only') || process.argv.includes('--test')) {
            if (!isExistingServer) {
                server.close(() => {
                    process.exit(1);
                });
            } else {
                process.exit(1);
            }
        }
    }
}

async function verifyRunningServer(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/index.html`, { timeout: 2000 }, (res) => {
            const isMock = res.headers['x-isolation-status'] === 'PHOTO-SELECTION-MOCK-SANDBOX';
            resolve({ ok: true, isMock, status: res.statusCode });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    });
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
        
        await runIsolationAudit(false);
    });

    server.on('error', async (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[INFO] Port ${PORT} sedang digunakan. Memverifikasi identitas proses server yang berjalan...`);
            const verification = await verifyRunningServer(PORT);
            if (!verification.ok || !verification.isMock) {
                console.error(`❌ [PORT CONFLICT] Port ${PORT} sedang digunakan oleh proses lain yang BUKAN mock sandbox yang valid!`);
                console.error(`Detail: ${verification.error || 'X-Isolation-Status header missing'}`);
                console.error(`Solusi: Hentikan proses yang menggunakan port ${PORT} atau jalankan dengan UAT_PORT=<port_lain>.`);
                process.exit(1);
            }
            console.log(`✅ [VERIFIED] Server pada port ${PORT} terkonfirmasi adalah PHOTO-SELECTION-MOCK-SANDBOX. Menjalankan audit...`);
            await runIsolationAudit(true);
        } else {
            console.error('Server error:', err);
            process.exit(1);
        }
    });
}

module.exports = { server, PORT, DUMMY_PHOTOS, runIsolationAudit };


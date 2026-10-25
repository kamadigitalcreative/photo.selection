/**
 * PHOTO SELECTION PHASE 6 — ISOLATED MOCK DRIVE PROVIDER
 * 
 * Provides an isolated, predictable mock provider for offline local testing
 * and browser UAT. Never contacts external Google servers.
 */

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { ERROR_CODES, SUPPORTED_IMAGE_MIMES, SUPPORTED_RAW_EXTENSIONS } = require('./types');

const FIXTURES_DIR = path.resolve(__dirname, '..', '..', 'test', 'phase55-fixtures');

function generateSyntheticJpeg(sizeBytes, seed = 1) {
  const buf = Buffer.alloc(sizeBytes);
  // Valid JPEG header
  buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF; buf[3] = 0xE0;
  buf[4] = 0x00; buf[5] = 0x10; buf[6] = 0x4A; buf[7] = 0x46; // JFIF
  buf[8] = 0x49; buf[9] = 0x46; buf[10] = 0x00; buf[11] = 0x01;
  // Fill deterministic repeating payload
  for (let i = 12; i < sizeBytes - 2; i++) {
    buf[i] = (i * seed + 37) & 0xFF;
  }
  // Valid JPEG EOI
  buf[sizeBytes - 2] = 0xFF;
  buf[sizeBytes - 1] = 0xD9;
  return buf;
}

// Built-in mock fixture photos
const DEFAULT_MOCK_PHOTOS = [
  { id: 'mock-file-1', name: 'photo1.png', mimeType: 'image/png', size: 20768, filename: 'photo1.png' },
  { id: 'mock-file-2', name: 'photo2.png', mimeType: 'image/png', size: 49183, filename: 'photo2.png' },
  { id: 'mock-file-3', name: 'photo3.png', mimeType: 'image/png', size: 76985, filename: 'photo3.png' },
  { id: 'mock-file-4', name: 'photo4.png', mimeType: 'image/png', size: 47047, filename: 'photo4.png' },
  { id: 'mock-file-5', name: 'photo5.png', mimeType: 'image/png', size: 41480, filename: 'photo5.png' }
];

class MockDriveProvider {
  constructor(options = {}) {
    this.name = 'mock';
    this.fixturesDir = options.fixturesDir || FIXTURES_DIR;
    // Map of custom test folder configurations
    this.customFolders = new Map();
  }

  /**
   * Register a custom folder scenario for test assertions (e.g. empty, paginated, RAW)
   */
  setFolderScenario(folderId, scenario) {
    this.customFolders.set(folderId, scenario);
  }

  /**
   * Lists contents of a Google Drive folder in mock mode.
   */
  async getFolderContent({ folderId, pageToken = null, pageSize = 50, projectToken = null } = {}) {
    if (!folderId) {
      return {
        success: false,
        code: ERROR_CODES.INVALID_DRIVE_URL,
        message: 'ID Folder Google Drive wajib disertakan.'
      };
    }

    // Check simulated access denied
    if (folderId === 'forbidden-folder-id' || folderId.includes('access_denied')) {
      return {
        success: false,
        code: ERROR_CODES.FOLDER_ACCESS_DENIED,
        message: 'Akses ditolak: Folder Google Drive tidak dapat diakses atau izin belum diberikan.'
      };
    }

    // Check simulated not found
    if (folderId === 'notfound-folder-id' || folderId.includes('not_found')) {
      return {
        success: false,
        code: ERROR_CODES.FOLDER_NOT_FOUND,
        message: 'Folder Google Drive tidak ditemukan.'
      };
    }

    // Check simulated empty folder
    if (folderId === 'empty-folder-id' || folderId.includes('empty')) {
      return {
        success: true,
        data: {
          images: [],
          folders: [],
          rawFiles: [],
          unsupportedFiles: [],
          isMockDrive: true,
          isEmpty: true,
          nextPageToken: null,
          total: 0
        }
      };
    }

    // Check simulated custom folder scenario
    let sourceItems = DEFAULT_MOCK_PHOTOS;
    if (this.customFolders.has(folderId)) {
      sourceItems = this.customFolders.get(folderId);
    }

    // Categorize media items
    const images = [];
    const rawFiles = [];
    const unsupportedFiles = [];
    const folders = [];

    for (const item of sourceItems) {
      if (item.isFolder) {
        folders.push({ id: item.id, name: item.name });
        continue;
      }

      const ext = path.extname(item.name).toLowerCase();
      const isRaw = SUPPORTED_RAW_EXTENSIONS.includes(ext) || item.isRaw;
      const isImage = SUPPORTED_IMAGE_MIMES.includes(item.mimeType) || ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);

      if (isRaw) {
        rawFiles.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType || 'image/x-adobe-dng',
          size: item.size || 25000000,
          isRaw: true,
          isMockFixture: true,
          downloadOnly: true
        });
      } else if (isImage) {
        images.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType || 'image/png',
          size: item.size || 20000,
          url: `/test/phase55-fixtures/${item.filename || item.name}`,
          originalUrl: `/test/phase55-fixtures/${item.filename || item.name}`,
          isMockFixture: true,
          source: 'local-mock-fixture',
          mockNotice: 'Local sample fixture — not genuine Google Drive content'
        });
      } else {
        unsupportedFiles.push({
          id: item.id,
          name: item.name,
          mimeType: item.mimeType || 'application/octet-stream',
          size: item.size || 0
        });
      }
    }

    // Handle pagination simulation
    let pagedImages = images;
    let nextPageToken = null;
    const limit = Number(pageSize) || 50;

    if (pageToken || (images.length > limit)) {
      const startIndex = pageToken ? parseInt(pageToken, 10) : 0;
      pagedImages = images.slice(startIndex, startIndex + limit);
      if (startIndex + limit < images.length) {
        nextPageToken = String(startIndex + limit);
      }
    }

    return {
      success: true,
      data: {
        images: pagedImages,
        folders,
        rawFiles,
        unsupportedFiles,
        isMockDrive: true,
        nextPageToken,
        total: images.length
      }
    };
  }

  /**
   * Retrieves binary buffer of an authorized mock fixture or synthetic media.
   */
  async getFileBuffer({ fileId, filename, range } = {}) {
    let resolvedFilename = filename;
    if (!resolvedFilename && fileId) {
      const match = DEFAULT_MOCK_PHOTOS.find(p => p.id === fileId || p.name === fileId);
      if (match) resolvedFilename = match.filename;
      else resolvedFilename = fileId;
    }

    // Security check: reject path traversal
    const safeName = path.basename(resolvedFilename || '');

    // Synthetic media generator for large file Range testing (1MB, 6MB, 18MB)
    if (safeName === 'synthetic-1mb.jpg' || safeName === 'synthetic-6mb.jpg' || safeName === 'synthetic-18mb.jpg') {
      const sizeMap = {
        'synthetic-1mb.jpg': 1 * 1024 * 1024,
        'synthetic-6mb.jpg': 6 * 1024 * 1024,
        'synthetic-18mb.jpg': 18 * 1024 * 1024
      };
      const totalLen = sizeMap[safeName];
      const fullBuffer = generateSyntheticJpeg(totalLen, safeName.length);

      if (range && typeof range.start === 'number') {
        const start = range.start;
        const end = typeof range.end === 'number' ? Math.min(range.end, totalLen - 1) : totalLen - 1;
        const chunk = fullBuffer.subarray(start, end + 1);
        return {
          success: true,
          filename: safeName,
          totalSize: totalLen,
          size: chunk.length,
          mimeType: 'image/jpeg',
          buffer: chunk,
          isRange: true,
          status: 206,
          contentRange: `bytes ${start}-${end}/${totalLen}`
        };
      }

      return {
        success: true,
        filename: safeName,
        totalSize: totalLen,
        size: totalLen,
        mimeType: 'image/jpeg',
        buffer: fullBuffer
      };
    }

    const fullPath = path.join(this.fixturesDir, safeName);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        code: ERROR_CODES.FILE_NOT_FOUND,
        message: `Berkas fixture ${safeName} tidak ditemukan di server.`
      };
    }

    const fullBuffer = fs.readFileSync(fullPath);
    const ext = path.extname(safeName).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'application/octet-stream';

    if (range && typeof range.start === 'number') {
      const start = range.start;
      const end = typeof range.end === 'number' ? Math.min(range.end, fullBuffer.length - 1) : fullBuffer.length - 1;
      const chunk = fullBuffer.subarray(start, end + 1);
      return {
        success: true,
        filename: safeName,
        totalSize: fullBuffer.length,
        size: chunk.length,
        mimeType,
        buffer: chunk,
        isRange: true,
        status: 206,
        contentRange: `bytes ${start}-${end}/${fullBuffer.length}`
      };
    }

    return {
      success: true,
      filename: safeName,
      totalSize: fullBuffer.length,
      size: fullBuffer.length,
      mimeType,
      buffer: fullBuffer
    };
  }

  /**
   * Fetches stream for mock file.
   */
  async fetchOriginalStream(fileId, options = {}) {
    const res = await this.getFileBuffer({ fileId, range: options.range ? { start: 0 } : null });
    if (!res.success) return res;
    return {
      success: true,
      status: res.status || 200,
      headers: {
        'Content-Type': res.mimeType,
        'Content-Length': res.size,
        ...(res.contentRange ? { 'Content-Range': res.contentRange } : {})
      },
      body: Readable.from([res.buffer])
    };
  }

  /**
   * Fetches preview thumbnail stream.
   * Rejects RAW camera files with HTTP 415 and bounds synthetic previews to 64KB.
   */
  async fetchThumbnailStream(fileId, options = {}) {
    const safeName = path.basename(fileId || 'photo1.png');
    const ext = path.extname(safeName).toLowerCase();
    const isRaw = SUPPORTED_RAW_EXTENSIONS.includes(ext) || safeName.endsWith('.cr2') || safeName.endsWith('.nef') || safeName.endsWith('.arw') || safeName.endsWith('.dng');
    if (isRaw) {
      return {
        success: false,
        code: ERROR_CODES.UNSUPPORTED_FILE_TYPE,
        status: 415,
        message: 'Berkas RAW tidak dapat ditampilkan sebagai preview gambar langsung.'
      };
    }

    if (safeName.startsWith('synthetic-')) {
      const thumbBuf = generateSyntheticJpeg(64 * 1024, safeName.length);
      return {
        success: true,
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(thumbBuf.length),
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff'
        },
        body: Readable.from([thumbBuf])
      };
    }

    return await this.fetchOriginalStream(fileId, options);
  }

  /**
   * Verifies photographer folder onboarding boundary in mock mode.
   * Prevents cross-photographer folder enumeration during project creation.
   */
  async verifyFolderOwnership(folderId, userIdentifier) {
    if (!folderId) return { verified: false, reason: 'MISSING_FOLDER_ID' };
    const user = String(userIdentifier || '').toLowerCase().trim();
    if (user === 'admin' || user === 'admin@atelier.local') {
      return { verified: true };
    }

    const MOCK_FOLDER_OWNERS = {
      'mock-folder-fotografer': 'fotografer',
      'mock-folder-demo': 'demo',
      'mock-folder-pro': 'pro_studio',
      'mock-folder-root': 'fotografer'
    };

    const registeredOwner = MOCK_FOLDER_OWNERS[folderId];
    if (registeredOwner && registeredOwner !== user && !user.includes(registeredOwner)) {
      return { verified: false, reason: 'CROSS_PHOTOGRAPHER_FOLDER_FORBIDDEN', registeredOwner };
    }

    return { verified: true };
  }

  /**
   * Generates deterministic synthetic media fixture with SHA-256 hash.
   */
  getSyntheticMedia(filename) {
    const sizeMap = {
      'synthetic-1mb.jpg': 1 * 1024 * 1024,
      'synthetic-6mb.jpg': 6 * 1024 * 1024,
      'synthetic-18mb.jpg': 18 * 1024 * 1024
    };
    const size = sizeMap[filename] || 1024 * 1024;
    const buf = generateSyntheticJpeg(size, filename.length);
    const hash = require('crypto').createHash('sha256').update(buf).digest('hex');
    return { size, buffer: buf, sha256: hash };
  }
}

MockDriveProvider.generateSyntheticJpeg = generateSyntheticJpeg;
module.exports = MockDriveProvider;


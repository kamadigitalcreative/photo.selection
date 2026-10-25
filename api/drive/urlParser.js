/**
 * PHOTO SELECTION PHASE 6 — GOOGLE DRIVE URL PARSER & SSRF PROTECTOR
 * 
 * Safely extracts and validates Google Drive folder IDs.
 * Strictly prevents SSRF, local file inclusion, and malformed inputs.
 */

const ALLOWED_DRIVE_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com'
]);

/**
 * Validates whether a given hostname is an approved Google Drive host.
 * @param {string} hostname 
 * @returns {boolean}
 */
function isAllowedDriveHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  return ALLOWED_DRIVE_HOSTS.has(hostname.toLowerCase());
}

/**
 * Checks if a string contains any ASCII control characters or invalid bytes.
 * @param {string} str 
 * @returns {boolean}
 */
function hasControlChars(str) {
  return /[\u0000-\u001F\u007F]/.test(str);
}

/**
 * Extracts and sanitizes Google Drive folder ID from a raw URL or ID string.
 * @param {string} input 
 * @returns {string|null} Folder ID if valid, null otherwise.
 */
function extractFolderId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (!str || hasControlChars(str)) return null;

  // Direct folder ID check: 10 to 128 characters of [a-zA-Z0-9_-]
  if (/^[a-zA-Z0-9_-]{10,128}$/.test(str)) {
    return str;
  }

  // URL parsing
  if (str.startsWith('http://') || str.startsWith('https://')) {
    // Reject plain HTTP for security
    if (!str.startsWith('https://')) {
      return null;
    }

    try {
      const u = new URL(str);
      if (!isAllowedDriveHost(u.hostname)) {
        return null;
      }

      // 1. /drive/folders/{folderId} or /drive/u/{n}/folders/{folderId} or /drive/mobile/folders/{folderId}
      const folderPathMatch = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]{10,128})/);
      if (folderPathMatch && folderPathMatch[1]) {
        return folderPathMatch[1];
      }

      // 2. /open?id={folderId}
      const idParam = u.searchParams.get('id');
      if (idParam && /^[a-zA-Z0-9_-]{10,128}$/.test(idParam)) {
        return idParam;
      }

      // 3. Fallback regex on pathname and query for standard Google Drive IDs (at least 25 chars)
      const genericMatch = str.match(/[-\w]{25,128}/);
      if (genericMatch && genericMatch[0]) {
        return genericMatch[0];
      }
    } catch (_) {
      return null;
    }
  }

  return null;
}

/**
 * Full parser and validator with structured error reporting.
 * @param {string} input 
 * @returns {{ valid: boolean, folderId?: string, error?: string }}
 */
function parseDriveFolderReference(input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    return { valid: false, error: 'Link atau ID Google Drive tidak boleh kosong.' };
  }

  const trimmed = input.trim();
  if (hasControlChars(trimmed)) {
    return { valid: false, error: 'Link Google Drive mengandung karakter terlarang.' };
  }

  if (trimmed.startsWith('http://')) {
    return { valid: false, error: 'Link Google Drive harus menggunakan protokol HTTPS aman.' };
  }

  if (trimmed.startsWith('file:') || trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) {
    return { valid: false, error: 'Protokol URL tidak diizinkan.' };
  }

  const folderId = extractFolderId(trimmed);
  if (!folderId) {
    return { valid: false, error: 'Format link atau ID Google Drive tidak valid.' };
  }

  return { valid: true, folderId };
}

module.exports = {
  isAllowedDriveHost,
  extractFolderId,
  parseDriveFolderReference
};

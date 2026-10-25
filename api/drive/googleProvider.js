/**
 * PHOTO SELECTION PHASE 6 — GENUINE GOOGLE DRIVE API V3 PROVIDER
 * 
 * Implements genuine Google Drive API v3 access using Google Cloud Service Account
 * with RS256 JWT authorization, zero third-party external dependencies,
 * strict format validation, RAW separation, and comprehensive error handling.
 */

const crypto = require('crypto');
const path = require('path');
const {
  ERROR_CODES,
  SUPPORTED_IMAGE_MIMES,
  SUPPORTED_RAW_EXTENSIONS,
  SUPPORTED_RAW_MIMES,
  VERCEL_MAX_RESPONSE_BYTES
} = require('./types');

class GoogleDriveProvider {
  constructor(options = {}) {
    this.name = 'google';
    let clientEmail = options.clientEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
    let privateKey = options.privateKey || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';

    // Unified GOOGLE_SERVICE_ACCOUNT_KEY JSON contract (Google Cloud Console JSON key)
    const rawKey = options.serviceAccountKey || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
    if (rawKey && (!clientEmail || !privateKey)) {
      try {
        const parsed = JSON.parse(rawKey);
        if (parsed.client_email) clientEmail = parsed.client_email;
        if (parsed.private_key) privateKey = parsed.private_key;
      } catch (_) {
        // Raw key string or non-JSON
      }
    }

    this.clientEmail = clientEmail;
    this.privateKey = privateKey;
    this.apiKey = options.apiKey || process.env.GOOGLE_DRIVE_API_KEY || '';
    this.tokenCache = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Checks whether required Google Drive credentials are configured.
   * In production private Drive mode, a Service Account (clientEmail + privateKey) is strictly required.
   */
  hasCredentials() {
    if (process.env.NODE_ENV === 'production') {
      return Boolean(this.clientEmail && this.privateKey);
    }
    return Boolean((this.clientEmail && this.privateKey) || this.apiKey);
  }

  /**
   * Generates a signed OAuth2 JWT and exchanges it for a short-lived Google Access Token.
   * Uses built-in crypto (RS256) without external npm libraries.
   */
  async getAccessToken() {
    if (!this.clientEmail || !this.privateKey) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    // Reuse cached token if valid for at least 5 more minutes
    if (this.tokenCache && this.tokenExpiresAt > now + 300) {
      return this.tokenCache;
    }

    try {
      const header = {
        alg: 'RS256',
        typ: 'JWT'
      };

      const payload = {
        iss: this.clientEmail,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };

      const base64UrlEncode = (obj) => {
        return Buffer.from(JSON.stringify(obj))
          .toString('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      };

      const encodedHeader = base64UrlEncode(header);
      const encodedPayload = base64UrlEncode(payload);
      const signInput = `${encodedHeader}.${encodedPayload}`;

      const normalizedKey = this.privateKey.replace(/\\n/g, '\n');
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signInput);
      const signature = signer.sign(normalizedKey, 'base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      const jwtAssertion = `${signInput}.${signature}`;

      // Exchange JWT assertion for Google OAuth token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwtAssertion
        })
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error('Google OAuth token exchange failed:', tokenRes.status, errBody);
        return null;
      }

      const tokenData = await tokenRes.json();
      this.tokenCache = tokenData.access_token;
      this.tokenExpiresAt = now + (tokenData.expires_in || 3600);
      return this.tokenCache;
    } catch (err) {
      console.error('Error generating Google OAuth JWT:', err.message);
      return null;
    }
  }

  /**
   * Lists actual files in a Google Drive folder via Google Drive API v3.
   */
  async getFolderContent({ folderId, pageToken = null, pageSize = 100, projectToken = null } = {}) {
    if (!folderId) {
      return {
        success: false,
        code: ERROR_CODES.INVALID_DRIVE_URL,
        message: 'ID Folder Google Drive wajib disertakan.'
      };
    }

    if (!this.hasCredentials()) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_AUTH_CONFIG_MISSING,
        message: 'Kredensial Google Drive Service Account belum dikonfigurasi di server. Hubungi administrator.',
        isConfigBlocked: true
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const headers = {};
      const urlParams = new URLSearchParams();

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      } else if (this.apiKey) {
        urlParams.set('key', this.apiKey);
      } else {
        return {
          success: false,
          code: ERROR_CODES.DRIVE_AUTH_CONFIG_MISSING,
          message: 'Gagal memperoleh otentikasi Google Drive API.',
          isConfigBlocked: true
        };
      }

      urlParams.set('q', `'${folderId}' in parents and trashed = false`);
      urlParams.set('fields', 'nextPageToken, files(id, name, mimeType, size, modifiedTime, imageMediaMetadata, webContentLink, thumbnailLink)');
      urlParams.set('pageSize', String(Math.min(pageSize, 100)));
      urlParams.set('orderBy', 'name');
      if (pageToken) {
        urlParams.set('pageToken', pageToken);
      }

      const apiUrl = `https://www.googleapis.com/drive/v3/files?${urlParams.toString()}`;
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        const status = response.status;
        const errJson = await response.json().catch(() => ({}));
        const errMsg = (errJson.error && errJson.error.message) || response.statusText;

        if (status === 404) {
          return {
            success: false,
            code: ERROR_CODES.FOLDER_NOT_FOUND,
            message: `Folder Google Drive (${folderId}) tidak ditemukan di server Google.`
          };
        }

        if (status === 403) {
          return {
            success: false,
            code: ERROR_CODES.FOLDER_ACCESS_DENIED,
            message: `Akses ditolak ke folder Google Drive (${folderId}). Pastikan folder telah dibagikan kepada Service Account.`
          };
        }

        if (status === 429) {
          return {
            success: false,
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Batas kuota panggilan Google Drive API terlampaui. Silakan coba sesaat lagi.'
          };
        }

        return {
          success: false,
          code: ERROR_CODES.DRIVE_NETWORK_ERROR,
          message: `Google Drive API error (${status}): ${errMsg}`
        };
      }

      const data = await response.json();
      const rawFilesList = data.files || [];

      const images = [];
      const rawFiles = [];
      const unsupportedFiles = [];
      const folders = [];

      for (const file of rawFilesList) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          if (!file.name.startsWith('Selected Photos - ') && file.name !== 'MP3') {
            folders.push({ id: file.id, name: file.name });
          }
          continue;
        }

        const ext = path.extname(file.name).toLowerCase();
        const isStandardImage = SUPPORTED_IMAGE_MIMES.includes(file.mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        const isRawImage = SUPPORTED_RAW_EXTENSIONS.includes(ext) || SUPPORTED_RAW_MIMES.includes(file.mimeType);
        const byteSize = parseInt(file.size, 10) || 0;

        if (isStandardImage) {
          images.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType || 'image/jpeg',
            size: byteSize,
            url: `/api/bridge?action=getPreviewImage&fileId=${file.id}&token=${encodeURIComponent(projectToken || '')}`,
            originalUrl: `/api/bridge?action=downloadOriginalFile&fileId=${file.id}&token=${encodeURIComponent(projectToken || '')}`,
            isMockFixture: false,
            isRaw: false,
            metadata: file.imageMediaMetadata || null
          });
        } else if (isRawImage) {
          rawFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType || 'application/octet-stream',
            size: byteSize,
            url: `/api/bridge?action=getPreviewImage&fileId=${file.id}&token=${encodeURIComponent(projectToken || '')}`,
            originalUrl: `/api/bridge?action=downloadOriginalFile&fileId=${file.id}&token=${encodeURIComponent(projectToken || '')}`,
            isMockFixture: false,
            isRaw: true,
            downloadOnly: true,
            metadata: file.imageMediaMetadata || null
          });
        } else {
          unsupportedFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: byteSize
          });
        }
      }

      return {
        success: true,
        data: {
          images,
          folders,
          rawFiles,
          unsupportedFiles,
          isMockDrive: false,
          isEmpty: images.length === 0 && rawFiles.length === 0 && folders.length === 0,
          nextPageToken: data.nextPageToken || null,
          total: images.length + rawFiles.length
        }
      };
    } catch (netErr) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_NETWORK_ERROR,
        message: `Koneksi ke Google Drive gagal: ${netErr.message}`
      };
    }
  }

  /**
   * Fetches metadata for a single file in Google Drive.
   */
  async getFileMetadata(fileId) {
    if (!fileId) return null;
    if (!this.hasCredentials()) return null;

    try {
      const accessToken = await this.getAccessToken();
      const headers = {};
      const urlParams = new URLSearchParams();

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      } else if (this.apiKey) {
        urlParams.set('key', this.apiKey);
      } else {
        return null;
      }

      urlParams.set('fields', 'id, name, mimeType, size, md5Checksum, imageMediaMetadata, parents, trashed');
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?${urlParams.toString()}`;
      const res = await fetch(apiUrl, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  /**
   * Fetches original binary stream/buffer for an authorized file.
   */
  async fetchOriginalStream(fileId, options = {}) {
    if (!fileId) {
      return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'ID Berkas wajib disertakan.' };
    }

    if (!this.hasCredentials()) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_AUTH_CONFIG_MISSING,
        message: 'Kredensial Google Drive Service Account belum dikonfigurasi di server.'
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { success: false, code: ERROR_CODES.DRIVE_AUTH_CONFIG_MISSING, message: 'Gagal otentikasi Service Account.' };
      }

      const apiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const fetchHeaders = {
        'Authorization': `Bearer ${accessToken}`
      };

      if (options.range) {
        fetchHeaders['Range'] = options.range;
      }

      const res = await fetch(apiUrl, { headers: fetchHeaders });
      if (!res.ok) {
        return {
          success: false,
          code: res.status === 404 ? ERROR_CODES.FILE_NOT_FOUND : ERROR_CODES.FOLDER_ACCESS_DENIED,
          message: `Gagal mengunduh berkas dari Google Drive (HTTP ${res.status}).`
        };
      }

      const contentLength = res.headers.get('content-length');
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      const contentRange = res.headers.get('content-range');

      const headers = {
        'Content-Type': contentType,
        'Content-Length': contentLength,
        'Accept-Ranges': 'bytes'
      };
      if (contentRange) {
        headers['Content-Range'] = contentRange;
      }

      return {
        success: true,
        status: res.status,
        headers,
        body: res.body // Readable stream
      };
    } catch (err) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_NETWORK_ERROR,
        message: `Gagal mengunduh berkas: ${err.message}`
      };
    }
  }

  /**
   * Fetches size-bounded, browser-displayable thumbnail stream from Google Drive.
   * Prevents transferring massive 25MB camera originals for gallery thumbnails.
   */
  async fetchThumbnailStream(fileId, options = {}) {
    if (!fileId) {
      return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'ID Berkas wajib disertakan.' };
    }
    if (!this.hasCredentials()) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_AUTH_CONFIG_MISSING,
        message: 'Kredensial Service Account belum dikonfigurasi di server.'
      };
    }

    try {
      const meta = await this.getFileMetadata(fileId);
      if (!meta) {
        return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'Berkas tidak ditemukan.' };
      }
      if (meta.trashed) {
        return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'Berkas telah dipindahkan ke sampah.' };
      }

      // Reject RAW formats based on authoritative metadata
      const metaExt = path.extname(meta.name || '').toLowerCase();
      const isRaw = SUPPORTED_RAW_EXTENSIONS.includes(metaExt) || SUPPORTED_RAW_MIMES.includes(meta.mimeType);
      if (isRaw) {
        return {
          success: false,
          code: ERROR_CODES.UNSUPPORTED_FILE_TYPE,
          status: 415,
          message: 'Berkas RAW tidak dapat ditampilkan sebagai preview gambar langsung.'
        };
      }

      const accessToken = await this.getAccessToken();
      const targetSize = options.size || 1200;

      // Use Google's thumbnail link if available
      if (meta.thumbnailLink) {
        const thumbUrl = meta.thumbnailLink.replace(/=s\d+$/, `=s${targetSize}`);
        const thumbHeaders = {};
        if (accessToken) {
          thumbHeaders['Authorization'] = `Bearer ${accessToken}`;
        }
        const thumbRes = await fetch(thumbUrl, { headers: thumbHeaders });
        if (thumbRes.ok) {
          return {
            success: true,
            status: 200,
            headers: {
              'Content-Type': thumbRes.headers.get('content-type') || 'image/jpeg',
              'Content-Length': thumbRes.headers.get('content-length'),
              'Cache-Control': 'private, max-age=86400',
              'X-Content-Type-Options': 'nosniff'
            },
            body: thumbRes.body
          };
        }
      }

      // Fallback: fetch original stream if thumbnailLink is not generated by Google
      return await this.fetchOriginalStream(fileId, options);
    } catch (err) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_NETWORK_ERROR,
        message: `Gagal memuat thumbnail: ${err.message}`
      };
    }
  }

  /**
   * Verifies that a Google Drive folder belongs to or is shared by the specific photographer.
   * Prevents cross-photographer folder enumeration during project creation.
   */
  async verifyFolderOwnership(folderId, userEmail) {
    if (!folderId) return { verified: false, reason: 'MISSING_FOLDER_ID' };
    if (!this.hasCredentials()) return { verified: false, reason: 'MISSING_CREDENTIALS' };
    if (!userEmail) return { verified: false, reason: 'MISSING_USER_EMAIL' };

    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return { verified: false, reason: 'AUTH_FAILED' };

      const urlParams = new URLSearchParams({
        fields: 'id, name, owners(emailAddress), permissions(emailAddress, role)'
      });
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?${urlParams.toString()}`;
      const res = await fetch(apiUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!res.ok) {
        return { verified: false, reason: res.status === 404 ? 'FOLDER_NOT_FOUND' : 'ACCESS_DENIED' };
      }

      const folderData = await res.json();
      const targetEmail = String(userEmail).toLowerCase().trim();

      // Check owners
      const owners = folderData.owners || [];
      const isOwner = owners.some(o => o.emailAddress && o.emailAddress.toLowerCase().trim() === targetEmail);
      if (isOwner) return { verified: true, folderName: folderData.name };

      // Check permissions (organizer, writer)
      const perms = folderData.permissions || [];
      const hasPermission = perms.some(p =>
        p.emailAddress &&
        p.emailAddress.toLowerCase().trim() === targetEmail &&
        (p.role === 'owner' || p.role === 'organizer' || p.role === 'writer')
      );
      if (hasPermission) return { verified: true, folderName: folderData.name };

      return { verified: false, reason: 'NOT_FOLDER_OWNER', folderName: folderData.name };
    } catch (err) {
      return { verified: false, reason: 'NETWORK_ERROR', message: err.message };
    }
  }
}

module.exports = GoogleDriveProvider;

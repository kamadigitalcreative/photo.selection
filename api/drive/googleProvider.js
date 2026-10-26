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
const urlParser = require('./urlParser');

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
    this.fetchFn = options.fetch || null;
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

        const gridPreviewUrl = `/api/bridge?action=getPreviewImage&fileId=${file.id}&size=800&token=${encodeURIComponent(projectToken || '')}`;
        const highResPreviewUrl = `/api/bridge?action=getPreviewImage&fileId=${file.id}&size=2048&token=${encodeURIComponent(projectToken || '')}`;
        const originalDlUrl = `/api/bridge?action=downloadOriginalFile&fileId=${file.id}&token=${encodeURIComponent(projectToken || '')}`;

        if (isStandardImage) {
          images.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType || 'image/jpeg',
            size: byteSize,
            url: gridPreviewUrl,
            previewUrl: gridPreviewUrl,
            highResUrl: highResPreviewUrl,
            originalUrl: originalDlUrl,
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
            url: gridPreviewUrl,
            previewUrl: gridPreviewUrl,
            highResUrl: highResPreviewUrl,
            originalUrl: originalDlUrl,
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
    if (!this.metadataCache) {
      this.metadataCache = new Map();
    }
    const cached = this.metadataCache.get(fileId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
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

      urlParams.set('fields', 'id, name, mimeType, size, md5Checksum, imageMediaMetadata, parents, trashed, thumbnailLink');
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?${urlParams.toString()}`;
      const res = await fetch(apiUrl, { headers });
      if (!res.ok) return null;
      const data = await res.json();
      this.metadataCache.set(fileId, { data, expiresAt: Date.now() + 300000 });
      return data;
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

      // ISSUE 2: Validate upstream HTTP status against Range request
      const isRangeRequested = Boolean(options.range);
      if (isRangeRequested && res.status !== 206) {
        return {
          success: false,
          code: 'UNEXPECTED_FULL_RESPONSE',
          status: 502,
          message: 'Upstream Google Drive mengabaikan header Range dan mengirimkan respons penuh.'
        };
      }

      const contentLength = res.headers.get('content-length');
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      const contentRange = res.headers.get('content-range');

      if (isRangeRequested && !contentRange) {
        return {
          success: false,
          code: 'INVALID_CONTENT_RANGE',
          status: 502,
          message: 'Header Content-Range tidak ditemukan pada respons HTTP 206 dari Google Drive.'
        };
      }

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
   * ISSUE 1: Validates Google thumbnailLink, enforces image allowlist & size ceiling, never falls back to original.
   */
  async fetchThumbnailStream(fileId, options = {}) {
    if (!fileId) {
      return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'ID Berkas wajib disertakan.' };
    }
    if (!this.hasCredentials() && !options.skipCredentialsCheck) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_AUTH_CONFIG_MISSING,
        message: 'Kredensial Service Account belum dikonfigurasi di server.'
      };
    }

    try {
      const meta = options.metadata ? options.metadata : await this.getFileMetadata(fileId);
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

      // ISSUE 1: Authoritative thumbnailLink required — never fallback to unbounded 25MB original
      if (!meta.thumbnailLink) {
        return {
          success: false,
          code: 'THUMBNAIL_NOT_AVAILABLE',
          status: 404,
          message: 'Thumbnail preview tidak tersedia untuk berkas ini dari Google Drive.'
        };
      }

      // ISSUE 1: Validate thumbnail URL format and trusted Google HTTPS origin
      let parsedThumbUrl;
      try {
        parsedThumbUrl = new URL(meta.thumbnailLink);
      } catch (_) {
        return {
          success: false,
          code: 'INVALID_THUMBNAIL_URL',
          status: 502,
          message: 'URL thumbnail Google Drive tidak valid.'
        };
      }
      if (parsedThumbUrl.protocol !== 'https:') {
        return {
          success: false,
          code: 'UNTRUSTED_THUMBNAIL_URL',
          status: 502,
          message: 'Protokol thumbnail tidak aman.'
        };
      }
      const isTrustedHost = parsedThumbUrl.hostname.endsWith('.googleusercontent.com') ||
        parsedThumbUrl.hostname === 'drive.google.com' ||
        parsedThumbUrl.hostname.endsWith('.google.com');
      if (!isTrustedHost) {
        return {
          success: false,
          code: 'UNTRUSTED_THUMBNAIL_URL',
          status: 502,
          message: 'Hostname thumbnail Google Drive tidak terpercaya.'
        };
      }

      const fetchImpl = options.fetch || this.fetchFn || globalThis.fetch;
      const accessToken = options.skipCredentialsCheck ? null : await this.getAccessToken();
      const targetSize = options.size || 1200;

      // Safe size parameter modification
      let thumbUrlStr = meta.thumbnailLink;
      if (/=s\d+$/.test(thumbUrlStr)) {
        thumbUrlStr = thumbUrlStr.replace(/=s\d+$/, `=s${targetSize}`);
      } else if (!thumbUrlStr.includes('=s')) {
        thumbUrlStr = `${thumbUrlStr}=s${targetSize}`;
      }

      const thumbHeaders = {};
      if (accessToken) {
        thumbHeaders['Authorization'] = `Bearer ${accessToken}`;
      }

      // Manual redirect validation to prevent contacting untrusted redirect targets
      let currentUrl = thumbUrlStr;
      let hops = 0;
      const MAX_HOPS = 3;
      let thumbRes = null;

      while (hops <= MAX_HOPS) {
        thumbRes = await fetchImpl(currentUrl, { headers: thumbHeaders, redirect: 'manual' });

        // Handle HTTP 3xx redirect status codes manually
        if (thumbRes.status >= 300 && thumbRes.status < 400) {
          const loc = thumbRes.headers.get('location');
          if (!loc) {
            return {
              success: false,
              code: 'UNTRUSTED_THUMBNAIL_URL',
              status: 502,
              message: 'Respons pengalihan thumbnail tidak memiliki header Location.'
            };
          }

          let redirectUrl;
          try {
            redirectUrl = new URL(loc, currentUrl);
          } catch (_) {
            return {
              success: false,
              code: 'UNTRUSTED_THUMBNAIL_URL',
              status: 502,
              message: 'URL pengalihan thumbnail tidak valid.'
            };
          }

          if (redirectUrl.protocol !== 'https:') {
            return {
              success: false,
              code: 'UNTRUSTED_THUMBNAIL_URL',
              status: 502,
              message: 'Protokol thumbnail redirect tidak aman.'
            };
          }

          const isRedirectTrusted = redirectUrl.hostname.endsWith('.googleusercontent.com') ||
            redirectUrl.hostname === 'drive.google.com' ||
            redirectUrl.hostname.endsWith('.google.com');

          if (!isRedirectTrusted) {
            return {
              success: false,
              code: 'UNTRUSTED_THUMBNAIL_URL',
              status: 502,
              message: 'Hostname pengalihan thumbnail tidak terpercaya.'
            };
          }

          currentUrl = redirectUrl.toString();
          hops++;
          if (hops > MAX_HOPS) {
            return {
              success: false,
              code: 'THUMBNAIL_FETCH_FAILED',
              status: 502,
              message: 'Terlalu banyak pengalihan thumbnail (redirect loop).'
            };
          }
          continue;
        }

        break;
      }

      if (!thumbRes.ok) {
        return {
          success: false,
          code: 'THUMBNAIL_FETCH_FAILED',
          status: thumbRes.status,
          message: `Gagal memuat thumbnail dari Google Drive (HTTP ${thumbRes.status}).`
        };
      }

      // ISSUE 1: Enforce Content-Type image allowlist
      const contentType = (thumbRes.headers.get('content-type') || '').toLowerCase();
      const ALLOWED_THUMB_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const matchedMime = ALLOWED_THUMB_MIMES.find(m => contentType.startsWith(m));
      if (!matchedMime) {
        return {
          success: false,
          code: 'UNSUPPORTED_THUMBNAIL_TYPE',
          status: 502,
          message: 'Format thumbnail dari Google Drive bukan gambar yang didukung.'
        };
      }

      // Strict total byte ceiling (4 MiB)
      const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024;
      const cl = parseInt(thumbRes.headers.get('content-length'), 10);
      if (cl && cl > MAX_THUMBNAIL_BYTES) {
        return {
          success: false,
          code: 'THUMBNAIL_OVERSIZED',
          status: 502,
          message: 'Ukuran thumbnail (Content-Length) melebihi batas 4MB.'
        };
      }

      // Read body stream with byte counter to prevent unannounced or false-length oversized payloads
      const chunks = [];
      let totalBytes = 0;

      if (thumbRes.body) {
        if (typeof thumbRes.body.getReader === 'function') {
          const reader = thumbRes.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              totalBytes += value.length;
              if (totalBytes > MAX_THUMBNAIL_BYTES) {
                try { await reader.cancel(); } catch (_) {}
                return {
                  success: false,
                  code: 'THUMBNAIL_OVERSIZED',
                  status: 502,
                  message: 'Ukuran aktual body thumbnail melebihi batas 4MB.'
                };
              }
              chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
            }
          }
        } else if (typeof thumbRes.body[Symbol.asyncIterator] === 'function') {
          for await (const chunk of thumbRes.body) {
            totalBytes += chunk.length;
            if (totalBytes > MAX_THUMBNAIL_BYTES) {
              if (typeof thumbRes.body.destroy === 'function') {
                thumbRes.body.destroy();
              }
              return {
                success: false,
                code: 'THUMBNAIL_OVERSIZED',
                status: 502,
                message: 'Ukuran aktual body thumbnail melebihi batas 4MB.'
              };
            }
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
        } else if (typeof thumbRes.arrayBuffer === 'function') {
          const ab = await thumbRes.arrayBuffer();
          const buf = Buffer.from(ab);
          if (buf.length > MAX_THUMBNAIL_BYTES) {
            return {
              success: false,
              code: 'THUMBNAIL_OVERSIZED',
              status: 502,
              message: 'Ukuran aktual thumbnail melebihi batas 4MB.'
            };
          }
          chunks.push(buf);
          totalBytes = buf.length;
        }
      }

      const finalBuffer = Buffer.concat(chunks);

      return {
        success: true,
        status: 200,
        headers: {
          'Content-Type': matchedMime,
          'Content-Length': String(finalBuffer.length),
          'Cache-Control': 'private, max-age=86400',
          'X-Content-Type-Options': 'nosniff'
        },
        body: finalBuffer
      };
    } catch (err) {
      return {
        success: false,
        status: 502,
        code: ERROR_CODES.DRIVE_NETWORK_ERROR,
        message: `Gagal memuat thumbnail: ${err.message}`
      };
    }
  }

  /**
   * ISSUE 3: Verifies that a requested subfolder is a legitimate descendant of the project root folder.
   * Traverses parents upwards up to maxDepth (10) while guarding against loops and unauthorized siblings.
   */
  async verifyFolderHierarchy({ folderId, rootFolderId, maxDepth = 10 } = {}) {
    if (!folderId || !rootFolderId) {
      return { allowed: false, reason: 'MISSING_PARAMETERS' };
    }
    const cleanFolderId = urlParser.extractFolderId(folderId) || String(folderId).trim();
    const cleanRootId = urlParser.extractFolderId(rootFolderId) || String(rootFolderId).trim();
    if (cleanFolderId === cleanRootId) {
      return { allowed: true, depth: 0 };
    }
    if (!this.hasCredentials()) {
      return { allowed: false, reason: 'MISSING_CREDENTIALS' };
    }

    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return { allowed: false, reason: 'AUTH_FAILED' };

      let currentId = cleanFolderId;
      let depth = 0;
      const visited = new Set([currentId]);

      while (depth < maxDepth) {
        depth++;
        const urlParams = new URLSearchParams({
          fields: 'id, name, parents, trashed'
        });
        const apiUrl = `https://www.googleapis.com/drive/v3/files/${currentId}?${urlParams.toString()}`;
        const res = await fetch(apiUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!res.ok) {
          return { allowed: false, reason: res.status === 404 ? 'FOLDER_NOT_FOUND' : 'ACCESS_DENIED' };
        }

        const data = await res.json();
        if (data.trashed) {
          return { allowed: false, reason: 'FOLDER_TRASHED' };
        }

        const parents = data.parents || [];
        if (parents.length === 0) {
          return { allowed: false, reason: 'NOT_A_SUBFOLDER' };
        }

        if (parents.includes(cleanRootId)) {
          return { allowed: true, depth, folderName: data.name };
        }

        const nextParent = parents[0];
        if (visited.has(nextParent)) {
          return { allowed: false, reason: 'HIERARCHY_CYCLE_DETECTED' };
        }
        visited.add(nextParent);
        currentId = nextParent;
      }

      return { allowed: false, reason: 'MAX_DEPTH_EXCEEDED' };
    } catch (err) {
      return { allowed: false, reason: 'NETWORK_ERROR', message: err.message };
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

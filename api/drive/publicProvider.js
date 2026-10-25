/**
 * PHOTO SELECTION PHASE 6 — PUBLIC GOOGLE DRIVE LINK PROVIDER
 * 
 * Provides robust integration for photographers who deliberately configure
 * Google Drive folders with "Anyone with the link" -> "Viewer".
 * 
 * Features:
 * - Zero Google Cloud Console / Service Account credential requirements.
 * - Robust scraping and parsing of public Google Drive shared folders.
 * - Subfolder discovery and navigation with ancestry validation.
 * - Size-bounded thumbnail delivery via Google CDN (lh3.googleusercontent.com).
 * - Direct original streaming with Range header support and virus-scan wall handling.
 * - Honest reporting when Google blocks unauthenticated downloads of large files.
 * - Strict project and client PIN session isolation enforced server-side.
 */

const net = require('net');
const path = require('path');
const { Readable } = require('stream');
const {
  ERROR_CODES,
  SUPPORTED_IMAGE_MIMES,
  SUPPORTED_RAW_EXTENSIONS,
  SUPPORTED_RAW_MIMES,
  VERCEL_MAX_RESPONSE_BYTES
} = require('./types');
const { extractFolderId, isAllowedDriveHost } = require('./urlParser');

/**
 * Decodes standard HTML entities commonly found in Google Drive HTML titles.
 */
function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

/**
 * Safely cancels or destroys a response body stream to avoid socket leakage.
 */
async function safelyDiscardBody(body) {
  if (!body) return;
  try {
    if (typeof body.cancel === 'function') {
      await body.cancel();
    } else if (typeof body.destroy === 'function') {
      body.destroy();
    }
  } catch (_) {
    // Ignore discard errors
  }
}

/**
 * Strict validator for Google Drive and Google CDN download targets.
 * Enforces HTTPS-only, rejects private IPs, localhost, malformed URLs, and untrusted hosts.
 */
function isAllowedGoogleDownloadUrl(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_) {
    return false;
  }

  // Strictly HTTPS only — HTTP downgrade is rejected
  if (parsed.protocol !== 'https:') {
    return false;
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    return false;
  }

  // Reject explicit non-standard ports
  if (parsed.port && parsed.port !== '443') {
    return false;
  }

  const host = parsed.hostname.toLowerCase();

  // Reject IP addresses (IPv4 or IPv6) and local addresses
  if (net.isIP(host) !== 0 || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }

  // Private/loopback address patterns
  if (/^(?:127\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) {
    return false;
  }

  // Approved Google download host patterns
  const isGoogleDriveHost = host === 'drive.google.com' || host === 'docs.google.com';
  const isGoogleCdnHost = /^[a-z0-9.-]+\.googleusercontent\.com$/i.test(host) && !host.includes('..');
  const isUserContentHost = /^[a-z0-9.-]+\.usercontent\.google\.com$/i.test(host) && !host.includes('..');

  return isGoogleDriveHost || isGoogleCdnHost || isUserContentHost;
}

class PublicDriveProvider {
  constructor(options = {}) {
    this.name = 'public_link';
    this.fetchFn = options.fetch || null;
    this.isStreamingProvider = true;

    // Cache of file metadata: fileId -> { id, name, mimeType, size, parents, thumbnailLink, isRaw, downloadOnly }
    this.fileCache = new Map();

    // Cache of folder hierarchy: childFolderId -> parentFolderId
    this.folderHierarchy = new Map();

    // Cache of folder contents: folderId -> Set of fileIds
    this.folderFileSet = new Map();
  }

  getFetch() {
    return this.fetchFn || globalThis.fetch;
  }

  /**
   * Retrieves and parses files and subfolders from a public Google Drive folder.
   */
  async getFolderContent({ folderId, pageToken = null, pageSize = 100, projectToken = null } = {}) {
    if (!folderId) {
      return {
        success: false,
        code: ERROR_CODES.INVALID_DRIVE_URL,
        message: 'ID Folder Google Drive wajib disertakan.'
      };
    }

    const cleanFolderId = extractFolderId(folderId) || String(folderId).trim();
    if (!/^[a-zA-Z0-9_-]{5,128}$/.test(cleanFolderId)) {
      return {
        success: false,
        code: ERROR_CODES.INVALID_DRIVE_URL,
        message: 'Format ID Folder Google Drive tidak valid.'
      };
    }

    const targetUrl = `https://drive.google.com/embeddedfolderview?id=${cleanFolderId}#list`;
    const fetchImpl = this.getFetch();

    try {
      const response = await fetchImpl(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if (response.status === 404) {
        return {
          success: false,
          code: ERROR_CODES.FOLDER_NOT_FOUND,
          message: `Folder Google Drive (${cleanFolderId}) tidak ditemukan di server Google.`
        };
      }

      // Check if Google redirected to sign-in page
      const respUrl = response.url || '';
      if (respUrl.includes('accounts.google.com') || response.status === 401 || response.status === 403) {
        return {
          success: false,
          code: ERROR_CODES.FOLDER_ACCESS_DENIED,
          message: 'Akses ditolak: Folder Google Drive ini belum diatur ke "Siapa saja yang memiliki link: Pelihat" (Anyone with the link can view).'
        };
      }

      const html = await response.text();

      // Check if sign-in page is returned inside HTML content
      if (html.includes('accounts.google.com/signin') || html.includes('Sign in to continue to Google Drive')) {
        return {
          success: false,
          code: ERROR_CODES.FOLDER_ACCESS_DENIED,
          message: 'Akses ditolak: Folder Google Drive ini bersifat privat. Pastikan telah diatur ke "Siapa saja yang memiliki link: Pelihat".'
        };
      }

      const images = [];
      const folders = [];
      const rawFiles = [];
      const unsupportedFiles = [];
      const seenIds = new Set();
      const folderFiles = new Set();

      // Primary Pattern: Parse standard Google Drive embeddedfolderview flip-entry DOM
      const entryRegex = /<div[^>]+id="entry-([^"]+)"[^>]*>([\s\S]*?)<div[^>]+class="[^"]*flip-entry-title[^"]*"[^>]*>([^<]+)<\/div>/gi;
      let match;

      while ((match = entryRegex.exec(html)) !== null) {
        const id = match[1].trim();
        const blockHtml = match[2];
        const rawTitle = match[3].trim();
        const title = decodeHtmlEntities(rawTitle);

        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const ext = path.extname(title).toLowerCase();
        const hasKnownFileExt = ['.jpg', '.jpeg', '.png', '.webp', ...SUPPORTED_RAW_EXTENSIONS, '.pdf', '.mp4', '.zip', '.mp3', '.mov'].includes(ext);

        // Check if item is a subfolder
        const isFolder = !hasKnownFileExt && (
          blockHtml.includes('/drive/folders/') ||
          blockHtml.includes('flip-entry-folder') ||
          blockHtml.includes('application/vnd.google-apps.folder') ||
          blockHtml.includes('drive/thumbnail/folder')
        );

        if (isFolder) {
          // Skip internal/system folders
          if (!title.startsWith('Selected Photos - ') && title !== 'MP3') {
            folders.push({ id, name: title });
            this.folderHierarchy.set(id, cleanFolderId);
          }
          continue;
        }

        folderFiles.add(id);

        const isStandardImage = SUPPORTED_IMAGE_MIMES.includes(ext) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        const isRawImage = SUPPORTED_RAW_EXTENSIONS.includes(ext);

        const metaItem = {
          id,
          name: title,
          mimeType: isStandardImage ? (ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg')) : (isRawImage ? 'image/x-raw' : 'application/octet-stream'),
          parents: [cleanFolderId],
          trashed: false,
          isRaw: isRawImage,
          downloadOnly: isRawImage,
          size: 0,
          thumbnailLink: `https://lh3.googleusercontent.com/d/${id}=s1200`
        };

        this.fileCache.set(id, metaItem);

        if (isStandardImage) {
          images.push({
            id,
            name: title,
            mimeType: metaItem.mimeType,
            size: 0,
            url: `/api/bridge?action=getPreviewImage&fileId=${id}&token=${encodeURIComponent(projectToken || '')}`,
            originalUrl: `/api/bridge?action=downloadOriginalFile&fileId=${id}&token=${encodeURIComponent(projectToken || '')}`,
            isMockFixture: false,
            isRaw: false
          });
        } else if (isRawImage) {
          rawFiles.push({
            id,
            name: title,
            mimeType: metaItem.mimeType,
            size: 0,
            url: `/api/bridge?action=getPreviewImage&fileId=${id}&token=${encodeURIComponent(projectToken || '')}`,
            originalUrl: `/api/bridge?action=downloadOriginalFile&fileId=${id}&token=${encodeURIComponent(projectToken || '')}`,
            isMockFixture: false,
            isRaw: true,
            downloadOnly: true
          });
        } else {
          unsupportedFiles.push({
            id,
            name: title,
            mimeType: 'application/octet-stream',
            size: 0
          });
        }
      }

      // Secondary Fallback: If 0 items were found via flip-entry, check for data-id or JSON data in HTML
      if (images.length === 0 && rawFiles.length === 0 && folders.length === 0) {
        const altRegex = /\["([a-zA-Z0-9_-]{20,})","([^"]+\.(?:jpg|jpeg|png|webp|cr2|cr3|nef|arw|dng|raf))"/gi;
        let altMatch;
        while ((altMatch = altRegex.exec(html)) !== null) {
          const id = altMatch[1];
          const name = decodeHtmlEntities(altMatch[2]);
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);

          const ext = path.extname(name).toLowerCase();
          const isStandardImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
          const isRawImage = SUPPORTED_RAW_EXTENSIONS.includes(ext);

          folderFiles.add(id);

          const metaItem = {
            id,
            name,
            mimeType: isStandardImage ? (ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg')) : (isRawImage ? 'image/x-raw' : 'application/octet-stream'),
            parents: [cleanFolderId],
            trashed: false,
            isRaw: isRawImage,
            downloadOnly: isRawImage,
            size: 0,
            thumbnailLink: `https://lh3.googleusercontent.com/d/${id}=s1200`
          };
          this.fileCache.set(id, metaItem);

          if (isStandardImage) {
            images.push({
              id,
              name,
              mimeType: metaItem.mimeType,
              size: 0,
              url: `/api/bridge?action=getPreviewImage&fileId=${id}&token=${encodeURIComponent(projectToken || '')}`,
              originalUrl: `/api/bridge?action=downloadOriginalFile&fileId=${id}&token=${encodeURIComponent(projectToken || '')}`,
              isMockFixture: false,
              isRaw: false
            });
          } else if (isRawImage) {
            rawFiles.push({
              id,
              name,
              mimeType: metaItem.mimeType,
              size: 0,
              url: `/api/bridge?action=getPreviewImage&fileId=${id}&token=${encodeURIComponent(projectToken || '')}`,
              originalUrl: `/api/bridge?action=downloadOriginalFile&fileId=${id}&token=${encodeURIComponent(projectToken || '')}`,
              isMockFixture: false,
              isRaw: true,
              downloadOnly: true
            });
          }
        }
      }

      this.folderFileSet.set(cleanFolderId, folderFiles);

      return {
        success: true,
        data: {
          images,
          folders,
          rawFiles,
          unsupportedFiles,
          isMockDrive: false,
          isEmpty: images.length === 0 && rawFiles.length === 0 && folders.length === 0,
          nextPageToken: null,
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
   * Retrieves file metadata. Returns cached record or null if not yet indexed.
   * Never invents fake authoritative metadata for unknown file IDs.
   */
  async getFileMetadata(fileId) {
    if (!fileId) return null;
    const cleanId = String(fileId).trim();
    if (this.fileCache.has(cleanId)) {
      return this.fileCache.get(cleanId);
    }
    return null;
  }

  /**
   * Discovers and verifies that a fileId belongs to rootFolderId or its subfolders
   * even on a cold serverless instance with an empty in-memory cache.
   * Performs bounded BFS search (depth <= 3, max folders <= 20) with cycle detection.
   */
  async resolveProjectFile(fileId, rootFolderId) {
    if (!fileId || !rootFolderId) return null;
    const cleanFileId = String(fileId).trim();
    const cleanRoot = String(rootFolderId).trim();

    // If already indexed and parent hierarchy verifies to cleanRoot
    // If already indexed and parent hierarchy verifies to cleanRoot
    if (this.fileCache.has(cleanFileId)) {
      const meta = this.fileCache.get(cleanFileId);
      const parentId = meta.parents && meta.parents[0];
      if (parentId) {
        const isAncestor = await this.verifyFolderHierarchy({
          folderId: parentId,
          rootFolderId: cleanRoot
        });
        if (isAncestor.allowed) {
          return meta;
        }
      }
    }

    // Bounded search starting from cleanRoot
    const queue = [{ folderId: cleanRoot, depth: 0 }];
    const visited = new Set([cleanRoot]);
    const MAX_DEPTH = 3;
    const MAX_FOLDERS = 20;

    while (queue.length > 0) {
      const { folderId, depth } = queue.shift();
      const content = await this.getFolderContent({ folderId });
      if (!content.success || !content.data) continue;

      // Verify if file was actually discovered in this crawled folder
      const allFilesInFolder = [...(content.data.images || []), ...(content.data.rawFiles || [])];
      if (allFilesInFolder.some(i => i.id === cleanFileId)) {
        return this.fileCache.get(cleanFileId);
      }

      if (depth < MAX_DEPTH && visited.size < MAX_FOLDERS) {
        for (const sub of (content.data.folders || [])) {
          if (!visited.has(sub.id) && visited.size < MAX_FOLDERS) {
            visited.add(sub.id);
            this.folderHierarchy.set(sub.id, folderId);
            queue.push({ folderId: sub.id, depth: depth + 1 });
          }
        }
      }
    }

    return null;
  }

  /**
   * Checks whether a fileId belongs to the project's folder.
   */
  async isProjectFile(fileId, rootFolderId) {
    const meta = await this.resolveProjectFile(fileId, rootFolderId);
    return Boolean(meta);
  }

  /**
   * Streams a size-bounded, private-scoped thumbnail from Google CDN (lh3.googleusercontent.com).
   * Enforces actual streamed body byte limit of 4 MiB before returning HTTP 200.
   */
  async fetchThumbnailStream(fileId, options = {}) {
    if (!fileId) {
      return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'ID Berkas wajib disertakan.' };
    }

    const cleanId = String(fileId).trim();
    if (!/^[a-zA-Z0-9_-]{5,128}$/.test(cleanId)) {
      return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'ID Berkas tidak valid.' };
    }

    // Check cached metadata to reject RAW files from preview
    const meta = this.fileCache.get(cleanId);
    if (meta) {
      const ext = path.extname(meta.name || '').toLowerCase();
      if (meta.isRaw || SUPPORTED_RAW_EXTENSIONS.includes(ext)) {
        return {
          success: false,
          code: ERROR_CODES.UNSUPPORTED_FILE_TYPE,
          status: 415,
          message: 'Berkas RAW tidak dapat ditampilkan sebagai preview gambar langsung.'
        };
      }
    }

    const targetSize = options.size || 1200;
    const thumbUrl = `https://lh3.googleusercontent.com/d/${cleanId}=s${targetSize}`;

    if (!isAllowedGoogleDownloadUrl(thumbUrl)) {
      return {
        success: false,
        code: 'UNTRUSTED_THUMBNAIL_URL',
        status: 502,
        message: 'URL thumbnail Google Drive tidak aman atau tidak terpercaya.'
      };
    }

    const fetchImpl = this.getFetch();

    try {
      const res = await fetchImpl(thumbUrl, {
        headers: {
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });

      if (!res.ok) {
        await safelyDiscardBody(res.body);
        return {
          success: false,
          code: 'THUMBNAIL_FETCH_FAILED',
          status: res.status,
          message: `Gagal memuat thumbnail dari Google Drive (HTTP ${res.status}).`
        };
      }

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const matchedMime = ALLOWED_MIMES.find(m => contentType.startsWith(m));
      if (!matchedMime) {
        await safelyDiscardBody(res.body);
        return {
          success: false,
          code: 'UNSUPPORTED_THUMBNAIL_TYPE',
          status: 502,
          message: 'Format thumbnail dari Google Drive bukan gambar yang didukung.'
        };
      }

      // Check header Content-Length first if present
      const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024;
      const cl = parseInt(res.headers.get('content-length'), 10);
      if (cl && cl > MAX_THUMBNAIL_BYTES) {
        await safelyDiscardBody(res.body);
        return {
          success: false,
          code: 'THUMBNAIL_OVERSIZED',
          status: 502,
          message: 'Ukuran thumbnail melebihi batas 4MB.'
        };
      }

      // Enforce actual streamed byte limit of 4 MiB across all response bodies
      const chunks = [];
      let totalBytes = 0;

      if (res.body) {
        if (typeof res.body.getReader === 'function') {
          const reader = res.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                totalBytes += value.length;
                if (totalBytes > MAX_THUMBNAIL_BYTES) {
                  await reader.cancel();
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
          } catch (streamErr) {
            return {
              success: false,
              code: ERROR_CODES.DRIVE_NETWORK_ERROR,
              status: 502,
              message: `Aliran data thumbnail terputus sebelum selesai: ${streamErr.message}`
            };
          }
        } else if (typeof res.body[Symbol.asyncIterator] === 'function') {
          try {
            for await (const chunk of res.body) {
              totalBytes += chunk.length;
              if (totalBytes > MAX_THUMBNAIL_BYTES) {
                if (typeof res.body.destroy === 'function') {
                  res.body.destroy();
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
          } catch (streamErr) {
            return {
              success: false,
              code: ERROR_CODES.DRIVE_NETWORK_ERROR,
              status: 502,
              message: `Aliran data thumbnail terputus sebelum selesai: ${streamErr.message}`
            };
          }
        } else if (Buffer.isBuffer(res.body)) {
          totalBytes = res.body.length;
          if (totalBytes > MAX_THUMBNAIL_BYTES) {
            return {
              success: false,
              code: 'THUMBNAIL_OVERSIZED',
              status: 502,
              message: 'Ukuran aktual body thumbnail melebihi batas 4MB.'
            };
          }
          chunks.push(res.body);
        }
      }

      const verifiedBuffer = Buffer.concat(chunks);

      return {
        success: true,
        status: 200,
        headers: {
          'Content-Type': matchedMime,
          'Content-Length': String(verifiedBuffer.length)
        },
        body: Readable.from([verifiedBuffer])
      };
    } catch (err) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_NETWORK_ERROR,
        status: 502,
        message: `Gagal menghubungi Google CDN: ${err.message}`
      };
    }
  }

  /**
   * Fetches authentic original file stream via Google Drive public download endpoint.
   * Follows Google CDN redirects with strict destination validation, hop limits,
   * loop detection, and safe stream discard on intermediate hops.
   */
  async fetchOriginalStream(fileId, options = {}) {
    if (!fileId) {
      return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'ID Berkas wajib disertakan.' };
    }

    const cleanId = String(fileId).trim();
    if (!/^[a-zA-Z0-9_-]{5,128}$/.test(cleanId)) {
      return { success: false, code: ERROR_CODES.FILE_NOT_FOUND, message: 'ID Berkas tidak valid.' };
    }

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${cleanId}`;
    const fetchHeaders = {};
    if (options.range) {
      fetchHeaders['Range'] = options.range;
    }

    const fetchImpl = this.getFetch();

    // Helper: Safely follow and validate redirects for a given starting URL
    const executeValidatedFetch = async (startUrl) => {
      let currentUrl = startUrl;
      let hops = 0;
      const MAX_HOPS = 4;
      const visitedUrls = new Set();
      let res = null;

      while (hops <= MAX_HOPS) {
        if (!isAllowedGoogleDownloadUrl(currentUrl)) {
          return {
            error: {
              success: false,
              code: 'UNTRUSTED_DOWNLOAD_REDIRECT',
              status: 502,
              message: 'Target redirect Google Drive tidak aman atau tidak terpercaya.'
            }
          };
        }

        if (visitedUrls.has(currentUrl)) {
          return {
            error: {
              success: false,
              code: 'REDIRECT_LOOP',
              status: 502,
              message: 'Terlalu banyak pengalihan (redirect loop terdeteksi).'
            }
          };
        }
        visitedUrls.add(currentUrl);

        res = await fetchImpl(currentUrl, {
          headers: fetchHeaders,
          redirect: 'manual'
        });

        // Handle 301/302/303/307/308 Google CDN redirects
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) {
            await safelyDiscardBody(res.body);
            return {
              error: {
                success: false,
                code: 'MISSING_REDIRECT_LOCATION',
                status: 502,
                message: 'Respons redirect Google Drive tidak memiliki header Location.'
              }
            };
          }

          let nextUrl;
          try {
            nextUrl = new URL(loc, currentUrl).toString();
          } catch (_) {
            await safelyDiscardBody(res.body);
            return {
              error: {
                success: false,
                code: 'UNTRUSTED_DOWNLOAD_REDIRECT',
                status: 502,
                message: 'URL redirect Google Drive malformed.'
              }
            };
          }

          if (!isAllowedGoogleDownloadUrl(nextUrl)) {
            await safelyDiscardBody(res.body);
            return {
              error: {
                success: false,
                code: 'UNTRUSTED_DOWNLOAD_REDIRECT',
                status: 502,
                message: 'Target redirect Google Drive mengarah ke host tidak terpercaya.'
              }
            };
          }

          // Safely discard intermediate body
          await safelyDiscardBody(res.body);
          currentUrl = nextUrl;
          hops++;
          if (hops > MAX_HOPS) {
            return {
              error: {
                success: false,
                code: 'TOO_MANY_REDIRECTS',
                status: 502,
                message: 'Terlalu banyak pengalihan unduhan (max hops exceeded).'
              }
            };
          }
          continue;
        }

        break;
      }

      return { res };
    };

    try {
      const initialFetchResult = await executeValidatedFetch(downloadUrl);
      if (initialFetchResult.error) {
        return initialFetchResult.error;
      }
      let res = initialFetchResult.res;

      if (!res.ok) {
        await safelyDiscardBody(res.body);
        return {
          success: false,
          code: res.status === 404 ? ERROR_CODES.FILE_NOT_FOUND : ERROR_CODES.FOLDER_ACCESS_DENIED,
          status: res.status,
          message: `Gagal mengunduh berkas dari Google Drive (HTTP ${res.status}).`
        };
      }

      let contentType = (res.headers.get('content-type') || '').toLowerCase();

      // Check if Google returned an HTML page instead of a binary stream (e.g. virus scan warning)
      if (contentType.includes('text/html')) {
        const html = await res.text();

        // Attempt to extract confirmation token: confirm=xxxx
        const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/i) ||
          html.match(/name="confirm"\s+value="([^"]+)"/i) ||
          html.match(/href="[^"]*[?&]confirm=([^"&]+)/i);

        if (confirmMatch && confirmMatch[1]) {
          const confirmToken = confirmMatch[1];
          const confirmedUrl = `https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${cleanId}`;

          // Validate confirmation retry redirects manually with the exact same strict policy
          const retryFetchResult = await executeValidatedFetch(confirmedUrl);
          if (!retryFetchResult.error && retryFetchResult.res && retryFetchResult.res.ok) {
            const retryContentType = (retryFetchResult.res.headers.get('content-type') || '').toLowerCase();
            if (!retryContentType.includes('text/html')) {
              res = retryFetchResult.res;
              contentType = retryContentType;
            } else {
              await safelyDiscardBody(retryFetchResult.res.body);
            }
          }
        }
      }

      // If the response is still HTML, Google is enforcing a download wall or rate limit
      if (contentType.includes('text/html')) {
        return {
          success: false,
          code: 'PUBLIC_DOWNLOAD_LIMITATION',
          status: 502,
          message: 'Google Drive membatasi pengunduhan langsung berkas ini tanpa otentikasi akun (Batas kuota publik / virus scan wall).'
        };
      }

      // Enforce Range validation if partial content requested
      const isRangeRequested = Boolean(options.range);
      if (isRangeRequested && res.status !== 206) {
        await safelyDiscardBody(res.body);
        return {
          success: false,
          code: 'UNEXPECTED_FULL_RESPONSE',
          status: 502,
          message: 'Upstream Google Drive mengabaikan header Range dan mengirimkan respons penuh.'
        };
      }

      const contentLength = res.headers.get('content-length');
      const contentRange = res.headers.get('content-range');

      if (isRangeRequested && !contentRange) {
        await safelyDiscardBody(res.body);
        return {
          success: false,
          code: 'INVALID_CONTENT_RANGE',
          status: 502,
          message: 'Header Content-Range tidak ditemukan pada respons partial upstream.'
        };
      }

      return {
        success: true,
        status: res.status,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Content-Length': contentLength,
          'Content-Range': contentRange,
          'Accept-Ranges': 'bytes'
        },
        body: res.body
      };
    } catch (err) {
      return {
        success: false,
        code: ERROR_CODES.DRIVE_NETWORK_ERROR,
        status: 502,
        message: `Gagal mengunduh berkas: ${err.message}`
      };
    }
  }

  /**
   * Verifies that target folder is equal to or an authorized descendant of the root folder.
   * Supports cold starts with bounded downward discovery (maxDepth, max 20 folders, cycle detection).
   */
  async verifyFolderHierarchy({ folderId, rootFolderId, maxDepth = 4 } = {}) {
    if (!folderId || !rootFolderId) {
      return { allowed: false, reason: 'MISSING_FOLDER_ID' };
    }
    const cleanChild = String(folderId).trim();
    const cleanRoot = String(rootFolderId).trim();

    if (cleanChild === cleanRoot) {
      return { allowed: true };
    }

    // Traverse cached hierarchy upward with cycle detection
    let current = cleanChild;
    let depth = 0;
    const upVisited = new Set([cleanChild]);
    while (current && depth < 10) {
      const parent = this.folderHierarchy.get(current);
      if (parent === cleanRoot) {
        return { allowed: true };
      }
      if (!parent || upVisited.has(parent)) break;
      upVisited.add(parent);
      current = parent;
      depth++;
    }

    // Downward bounded BFS discovery from root folder
    const queue = [{ id: cleanRoot, depth: 0 }];
    const downVisited = new Set([cleanRoot]);
    const MAX_FOLDERS = 20;

    while (queue.length > 0) {
      const { id: curId, depth: curDepth } = queue.shift();
      const content = await this.getFolderContent({ folderId: curId });
      if (!content.success || !content.data) continue;

      const subfolders = content.data.folders || [];
      if (subfolders.some(f => f.id === cleanChild)) {
        this.folderHierarchy.set(cleanChild, curId);
        return { allowed: true };
      }

      if (curDepth < maxDepth && downVisited.size < MAX_FOLDERS) {
        for (const sub of subfolders) {
          if (!downVisited.has(sub.id) && downVisited.size < MAX_FOLDERS) {
            downVisited.add(sub.id);
            this.folderHierarchy.set(sub.id, curId);
            queue.push({ id: sub.id, depth: curDepth + 1 });
          }
        }
      }
    }

    return { allowed: false, reason: 'NOT_A_SUBFOLDER' };
  }

  /**
   * Public link ownership verification: always true for public folders.
   */
  async verifyFolderOwnership(folderId, username) {
    return { verified: true };
  }
}

module.exports = PublicDriveProvider;


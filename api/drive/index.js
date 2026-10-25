/**
 * PHOTO SELECTION PHASE 6 — UNIFIED DRIVE SUBSYSTEM
 * 
 * Provides centralized provider factory, URL parsing, media delivery,
 * and security policy enforcement.
 */

const {
  SUPPORTED_IMAGE_MIMES,
  SUPPORTED_RAW_EXTENSIONS,
  SUPPORTED_RAW_MIMES,
  ERROR_CODES,
  VERCEL_MAX_RESPONSE_BYTES
} = require('./types');

const {
  isAllowedDriveHost,
  extractFolderId,
  parseDriveFolderReference
} = require('./urlParser');

const MockDriveProvider = require('./mockProvider');
const GoogleDriveProvider = require('./googleProvider');
const DownloadService = require('./downloadService');

// Singleton provider instances
let defaultMockProvider = null;
let defaultGoogleProvider = null;

/**
 * Returns the active Drive provider according to server environment configuration.
 * @param {'mock'|'google'} [overrideType] 
 * @returns {MockDriveProvider|GoogleDriveProvider}
 */
function getDriveProvider(overrideType) {
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Explicit override provided
  if (overrideType !== undefined && overrideType !== null && overrideType !== '') {
    const cleanOverride = String(overrideType).toLowerCase().trim();
    if (cleanOverride === 'google') {
      if (!defaultGoogleProvider) defaultGoogleProvider = new GoogleDriveProvider();
      return defaultGoogleProvider;
    }
    if (cleanOverride === 'mock') {
      if (isProd) {
        return createUnconfiguredProvider('MOCK_FORBIDDEN_IN_PRODUCTION');
      }
      if (!defaultMockProvider) defaultMockProvider = new MockDriveProvider();
      return defaultMockProvider;
    }
    return createUnconfiguredProvider(`INVALID_OVERRIDE:${overrideType}`);
  }

  // 2. Read from environment
  const envType = (process.env.DRIVE_PROVIDER || '').toLowerCase().trim();

  if (envType === 'google') {
    if (!defaultGoogleProvider) defaultGoogleProvider = new GoogleDriveProvider();
    return defaultGoogleProvider;
  }

  if (envType === 'mock' || process.env.USE_MOCK_DRIVE === 'true') {
    if (isProd) {
      return createUnconfiguredProvider('MOCK_FORBIDDEN_IN_PRODUCTION');
    }
    if (!defaultMockProvider) defaultMockProvider = new MockDriveProvider();
    return defaultMockProvider;
  }

  // 3. Preserve local test and mock server execution strictly when NOT in production
  const isLocalMockEnv = !isProd && Boolean(
    process.env.NODE_ENV === 'test' ||
    process.env.UAT_PORT === '4173' ||
    (typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv.some(a => a.includes('phase55') || a.includes('test')))
  );

  if (isLocalMockEnv) {
    if (!defaultMockProvider) defaultMockProvider = new MockDriveProvider();
    return defaultMockProvider;
  }

  // 4. Missing configuration in production fails closed
  return createUnconfiguredProvider('MISSING_PRODUCTION_CONFIG');
}

function createUnconfiguredProvider(reason = 'MISSING_OR_INVALID') {
  return {
    name: 'unconfigured',
    reason,
    getFolderContent: async () => ({
      success: false,
      code: ERROR_CODES.DRIVE_CONFIG_ERROR,
      reason,
      message: `Konfigurasi DRIVE_PROVIDER tidak valid atau belum diatur di server (${reason}).`
    }),
    getFileMetadata: async () => null,
    fetchOriginalStream: async () => ({
      success: false,
      code: ERROR_CODES.DRIVE_CONFIG_ERROR,
      reason,
      message: `Konfigurasi DRIVE_PROVIDER tidak valid atau belum diatur di server (${reason}).`
    }),
    getFileBuffer: async () => ({
      success: false,
      code: ERROR_CODES.DRIVE_CONFIG_ERROR,
      reason,
      message: `Konfigurasi DRIVE_PROVIDER tidak valid atau belum diatur di server (${reason}).`
    })
  };
}

module.exports = {
  getDriveProvider,
  MockDriveProvider,
  GoogleDriveProvider,
  DownloadService,
  urlParser: {
    isAllowedDriveHost,
    extractFolderId,
    parseDriveFolderReference
  },
  types: {
    SUPPORTED_IMAGE_MIMES,
    SUPPORTED_RAW_EXTENSIONS,
    SUPPORTED_RAW_MIMES,
    ERROR_CODES,
    VERCEL_MAX_RESPONSE_BYTES
  }
};

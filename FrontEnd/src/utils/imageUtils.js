// Utility functions to build image URLs for the catalog.
// Images are stored on Cloudinary and the base folder is kept in an
// environment variable so the actual host is not checked into source
// control.
//
// We provide a safe fallback to the original `/vista/` path so the UI
// continues to work even if the env var is missing or mis‑configured.

const RAW_PREFIX = process.env.REACT_APP_CLOUDINARY_FOLDER;
// ensure we always end with a trailing slash when using the env var
const PREFIX = RAW_PREFIX && RAW_PREFIX.trim()
  ? RAW_PREFIX.trim().replace(/\/?$/, "/")
  : "/vista/";

function buildUrl(codigo) {
  if (!codigo) return "";
  return `${PREFIX}${encodeURIComponent(codigo)}.jpg`;
}

/**
 * Return the full image URL for a given product code.
 * @param {string} codigo
 * @returns {string}
 */
export function getImageUrl(codigo) {
  return buildUrl(codigo);
}

/**
 * Alias for getImageUrl – kept for semantic clarity in places where a
 * thumbnail is requested.
 */
export function getThumbnailUrl(codigo) {
  return buildUrl(codigo);
}

/**
 * Alias for getImageUrl – used when rendering the larger detail image.
 */
export function getDetailUrl(codigo) {
  return buildUrl(codigo);
}

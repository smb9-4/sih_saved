/**
 * uuid.js
 * RFC4122 compliant UUID v4 generator with Web Crypto API and pure fallback.
 * Universal across browser, Node.js, Jest, and Capacitor.
 */

export function v4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const uuidv4 = v4;
export default v4;

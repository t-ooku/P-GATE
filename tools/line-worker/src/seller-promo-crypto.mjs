// 2026-10-03 HOSHILU Seller「AI販促担当」: 店の接続秘密（WordPress のアプリケーションパスワード）を
// AES-256-GCM で暗号化する。鍵は Worker Secret `SELLER_PROMO_KEK`（32 byte。base64 か 64 桁 hex）。
// 平文はログ・レスポンスに出さない。AAD に seller_key と種類を入れ、別の店の行へ写しても復号できないようにする。
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value) {
  return Uint8Array.from(atob(String(value || '')), (c) => c.charCodeAt(0));
}

export function promoKekBytes(env = {}) {
  const raw = String(env.SELLER_PROMO_KEK || '').trim();
  let bytes = null;
  if (/^[0-9a-fA-F]{64}$/u.test(raw)) bytes = Uint8Array.from(raw.match(/../gu), (h) => parseInt(h, 16));
  else if (/^[A-Za-z0-9+/]{43}=?$/u.test(raw)) {
    try { bytes = base64ToBytes(raw.length === 43 ? `${raw}=` : raw); } catch { bytes = null; }
  }
  return bytes && bytes.length === 32 ? bytes : null;
}
export function promoKekConfigured(env = {}) {
  return Boolean(promoKekBytes(env));
}

async function importKey(env) {
  const bytes = promoKekBytes(env);
  if (!bytes) throw new Error('SELLER_PROMO_KEK_NOT_CONFIGURED');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptPromoSecret(env, plaintext, aad) {
  const key = await importKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(String(aad)) }, key, encoder.encode(String(plaintext)));
  return { secret_enc: bytesToBase64(new Uint8Array(sealed)), secret_iv: bytesToBase64(iv) };
}

export async function decryptPromoSecret(env, { secret_enc, secret_iv }, aad) {
  const key = await importKey(env);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(secret_iv), additionalData: encoder.encode(String(aad)) },
      key, base64ToBytes(secret_enc));
    return decoder.decode(plain);
  } catch {
    throw new Error('SELLER_PROMO_SECRET_UNREADABLE');
  }
}

export const connectionAad = (sellerKey, kind) => `seller-promo-connection\n${sellerKey}\n${kind}`;

import { createLoginGuard } from './auth-login-guard.mjs';

const guard = createLoginGuard({
  scope: 'seller-login', guardTable: 'seller_login_guard', auditTable: 'seller_auth_audit'
});
export const sellerLoginFingerprint = guard.fingerprint;
export const sellerLoginLocked = guard.locked;
export const recordSellerLoginFailure = guard.failure;
export const recordSellerLoginLocked = guard.lockedAudit;
export const recordSellerLoginSuccess = guard.success;
export const recordSellerLogout = guard.logout;
export const purgeSellerAuthRecords = guard.purge;

import { createLoginGuard } from './auth-login-guard.mjs';

const guard = createLoginGuard({
  scope: 'admin-login', guardTable: 'admin_login_guard', auditTable: 'admin_auth_audit'
});
export const adminLoginFingerprint = guard.fingerprint;
export const adminLoginLocked = guard.locked;
export const recordAdminLoginFailure = guard.failure;
export const recordAdminLoginLocked = guard.lockedAudit;
export const recordAdminLoginSuccess = guard.success;
export const recordAdminLogout = guard.logout;
export const purgeAdminAuthRecords = guard.purge;

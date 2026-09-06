/**
 * HOSHILU authorization policy.
 *
 * Authentication identifies a principal. This module authorizes the action.
 * UI visibility must never be used as the only access control.
 */

export const PRINCIPAL_ROLES = Object.freeze([
  "guest",
  "member",
  "seller",
  "operator",
]);

const PUBLIC_ACTIONS = new Set([
  "home:view",
  "search:execute",
  "result:view",
  "product:outbound",
  "legal:view",
  "member:login",
  "seller:login",
]);

const MEMBER_ACTIONS = new Set([
  ...PUBLIC_ACTIONS,
  "member:profile:view",
  "member:profile:update",
  "wish:list",
  "wish:create",
  "wish:view",
  "wish:update",
  "wish:delete",
  "watch:update",
  "member:logout",
]);

const SELLER_ACTIONS = new Set([
  ...PUBLIC_ACTIONS,
  "seller:dashboard:view",
  "seller:profile:view",
  "seller:profile:update",
  "seller:catalog:view",
  "seller:catalog:sync",
  "seller:demand:view",
  "seller:offer:update",
  "seller:logout",
]);

const OPERATOR_ACTIONS = new Set([
  ...MEMBER_ACTIONS,
  ...SELLER_ACTIONS,
  "operator:dashboard:view",
  "operator:tenant:create",
  "operator:tenant:update",
  "operator:tenant:suspend",
  "operator:catalog:reconcile",
  "operator:audit:view",
  "operator:evaluation:run",
]);

const ACTIONS_BY_ROLE = Object.freeze({
  guest: PUBLIC_ACTIONS,
  member: MEMBER_ACTIONS,
  seller: SELLER_ACTIONS,
  operator: OPERATOR_ACTIONS,
});

function normalizeRole(role) {
  const value = String(role || "guest").trim().toLowerCase();
  return PRINCIPAL_ROLES.includes(value) ? value : "guest";
}

function normalizedTenant(value) {
  return String(value || "").trim().toLowerCase();
}

export function principalFromSession(session) {
  if (!session?.subject) {
    return Object.freeze({
      subject: "",
      role: "guest",
      tenant: "",
      authenticated: false,
    });
  }
  const role = normalizeRole(session.role);
  return Object.freeze({
    subject: String(session.subject),
    role,
    tenant: role === "seller" ? normalizedTenant(session.tenant) : "",
    authenticated: true,
  });
}

function resourceOwner(resource) {
  return String(resource?.owner_id || resource?.member_id || "");
}

function decision(allowed, code, principal) {
  return Object.freeze({
    allowed,
    code,
    role: principal.role,
  });
}

export function authorizeAction({
  principal,
  action,
  resource,
  targetTenant,
}) {
  const actor = principal || principalFromSession(null);
  const normalizedAction = String(action || "");
  const allowedActions = ACTIONS_BY_ROLE[normalizeRole(actor.role)] || PUBLIC_ACTIONS;

  if (!allowedActions.has(normalizedAction)) {
    return decision(false, actor.authenticated ? "ROLE_FORBIDDEN" : "LOGIN_REQUIRED", actor);
  }

  if (normalizedAction.startsWith("wish:")) {
    if (actor.role !== "member" && actor.role !== "operator") {
      return decision(false, "MEMBER_LOGIN_REQUIRED", actor);
    }
    const owner = resourceOwner(resource);
    if (owner && actor.role !== "operator" && owner !== actor.subject) {
      return decision(false, "RESOURCE_OWNER_MISMATCH", actor);
    }
  }

  if (
    normalizedAction.startsWith("seller:") &&
    actor.role !== "seller" &&
    actor.role !== "operator"
  ) {
    return decision(false, "SELLER_LOGIN_REQUIRED", actor);
  }

  if (actor.role === "seller") {
    const requestedTenant = normalizedTenant(
      targetTenant || resource?.tenant || resource?.tenant_id,
    );
    if (!actor.tenant) return decision(false, "SELLER_TENANT_MISSING", actor);
    if (requestedTenant && requestedTenant !== actor.tenant) {
      return decision(false, "TENANT_BOUNDARY_VIOLATION", actor);
    }
  }

  if (normalizedAction.startsWith("operator:") && actor.role !== "operator") {
    return decision(false, "OPERATOR_REQUIRED", actor);
  }

  return decision(true, "ALLOW", actor);
}

export function requireAuthorization(input) {
  const result = authorizeAction(input);
  if (!result.allowed) {
    const error = new Error(result.code);
    error.code = result.code;
    error.status =
      result.code.includes("LOGIN_REQUIRED") || result.code === "LOGIN_REQUIRED"
        ? 401
        : 403;
    throw error;
  }
  return result;
}

export function navigationForPrincipal(principal) {
  const actor = principal || principalFromSession(null);
  const common = ["home", "hoshilu", "hoshittoku", "insight"];
  if (actor.role === "guest") return [...common, "member_login", "seller_login"];
  if (actor.role === "member") return [...common, "my_wishes", "member_logout", "seller_login"];
  if (actor.role === "seller") return [...common, "seller_dashboard", "seller_logout"];
  if (actor.role === "operator") {
    return [...common, "my_wishes", "seller_dashboard", "operator_dashboard", "logout"];
  }
  return common;
}

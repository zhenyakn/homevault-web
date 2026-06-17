export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
// No active tenant could be resolved for the user (should not happen for a
// logged-in user — a personal tenant is auto-provisioned).
export const NO_TENANT_ERR_MSG = "No active workspace (10003)";
// User is a member of the active tenant but lacks the owner/admin role needed
// to manage it.
export const NOT_TENANT_ADMIN_ERR_MSG =
  "You do not have required permission for this workspace (10004)";

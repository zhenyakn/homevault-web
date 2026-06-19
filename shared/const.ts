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
// Generic credential failure — deliberately the same for "no such email" and
// "wrong password" so the endpoint can't be used to enumerate accounts.
export const INVALID_CREDENTIALS_ERR_MSG = "Invalid email or password (10005)";
// Registration with an email that already has an account.
export const EMAIL_TAKEN_ERR_MSG =
  "An account with this email already exists (10006)";
// Login refused because the account's email isn't verified and the grace
// period (if any) has lapsed. The client matches this to offer a resend link.
export const EMAIL_NOT_VERIFIED_ERR_MSG =
  "Please verify your email address before signing in (10007)";
// A viewer-role member attempted a mutation. Viewers have read-only access.
export const VIEWER_READONLY_ERR_MSG =
  "Your role is view-only in this workspace (10008)";
// A mutation was attempted in a suspended workspace. Reads still work so data
// remains visible/exportable; changes are blocked until it's reactivated.
export const WORKSPACE_SUSPENDED_ERR_MSG =
  "This workspace is suspended and is read-only (10009)";

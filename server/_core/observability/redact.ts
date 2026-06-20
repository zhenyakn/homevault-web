/**
 * Redaction policy — baseline secret/credential scrubbing applied to every log
 * line via pino's `redact` option. This is the security floor (a leaked token
 * or session cookie in a log file is an incident), not the full PII-allowlist
 * policy. Paths use pino/fast-redact syntax; `*` matches one level.
 */

export const REDACT_PATHS = [
  // HTTP credential headers (req.headers.* shapes from express/pino-http).
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "*.headers.authorization",
  "*.headers.cookie",
  "headers.authorization",
  "headers.cookie",
  // Common secret-bearing field names, at the top level and one level deep.
  "password",
  "passwordHash",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "apiKey",
  "secret",
  "clientSecret",
  "authorization",
  "cookie",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.sessionToken",
  "*.apiKey",
  "*.secret",
  "*.clientSecret",
];

export const REDACT_CENSOR = "[redacted]";

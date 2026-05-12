/**
 * RFC 8187 / RFC 6266 — `filename*=UTF-8''<pct-encoded>` header value encoder.
 *
 * Used by Content-Disposition headers on proxied file downloads. Encodes any
 * non-token character (per RFC 5987 § 3.2.1 attr-char) as %HH, which is the
 * spec-compliant way to ship UTF-8 filenames including spaces, Hebrew letters,
 * emoji, etc.
 *
 * Critically, this also makes the response immune to header injection: CR (0x0D)
 * and LF (0x0A) are pct-encoded so a malicious upload name like "x\r\nSet-Cookie:..."
 * cannot break out of the header line.
 */

// attr-char per RFC 5987 — same as token char minus a few additions.
// Allowed unescaped: ALPHA / DIGIT / "!" / "#" / "$" / "&" / "+" / "-" / "." /
//                    "^" / "_" / "`" / "|" / "~"
const ATTR_CHAR_RE = /[A-Za-z0-9!#$&+\-.^_`|~]/;

export function rfc8187Encode(name: string): string {
  let out = "";
  // Iterate over the UTF-8 byte representation so multi-byte chars get
  // pct-encoded per spec ("UTF-8''").
  const bytes = Buffer.from(name, "utf8");
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const c = String.fromCharCode(b);
    if (ATTR_CHAR_RE.test(c)) {
      out += c;
    } else {
      out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/**
 * Build a full `Content-Disposition` header value. `disposition` defaults to
 * "attachment" because that's the safe default for arbitrary user uploads
 * (browser saves to disk instead of attempting to render). Pass "inline" only
 * for content you trust is not active (server-rendered PDFs, etc).
 *
 * Includes both `filename=` (ASCII fallback for ancient agents) and `filename*=`
 * (RFC 8187 UTF-8). The ASCII fallback strips non-ASCII and any control / quote
 * characters so it cannot itself smuggle CR/LF or break out of the quoted form.
 */
export function buildContentDisposition(
  name: string,
  disposition: "attachment" | "inline" = "attachment",
): string {
  const asciiFallback = name
    .replace(/[\x00-\x1f\x7f"\\]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .slice(0, 200) || "file";
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${rfc8187Encode(name)}`;
}

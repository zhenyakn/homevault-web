const STORAGE_KEY = "hv_active_tenant_id";
const PROPERTY_KEY = "hv_active_property_id";

/** The active workspace id chosen in this browser, or null to use the default. */
export function getStoredTenantId(): number | null {
  const v = localStorage.getItem(STORAGE_KEY);
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Switch the active workspace (tenant). The selected property belongs to the
 * previous tenant, so we clear it — the server then resolves the new tenant's
 * first property — and reload to reset all tenant-scoped client state cleanly.
 * The `x-tenant-id` header is read fresh from localStorage on every request.
 */
export function switchTenant(id: number): void {
  if (id === getStoredTenantId()) return;
  localStorage.setItem(STORAGE_KEY, String(id));
  localStorage.removeItem(PROPERTY_KEY);
  window.location.hash = "#/";
  window.location.reload();
}

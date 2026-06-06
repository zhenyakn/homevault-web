/** Local date (YYYY-MM-DD) for a timezone. Shared by the sweep and the bot. */
export function todayInTz(tz?: string | null): string {
  try {
    // en-CA renders as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

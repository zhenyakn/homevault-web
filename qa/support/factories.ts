/**
 * Test-data factories: a unique-id generator plus valid default form payloads
 * for each screen's create dialog. Specs spread these and override only the
 * field under test, so a form gaining a field doesn't break unrelated tests.
 *
 * `name`/`title`/`lender` fields are filled in by the caller using the
 * per-test sandbox prefix (see qa/fixtures.ts) so every record is uniquely
 * named and self-cleaning teardown can find it.
 */

let counter = 0;

/** Short, collision-resistant id for unique names and sandbox prefixes. */
export function shortId(): string {
  counter += 1;
  return `${Date.now().toString(36).slice(-4)}${counter}${Math.random()
    .toString(36)
    .slice(2, 5)}`;
}

/** Today as YYYY-MM-DD (the format every date field expects). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const factories = {
  expense: (name: string) => ({
    name,
    amount: "123.45",
    category: "Utilities" as const,
    notes: "created by automated QA",
  }),
  loan: (lender: string) => ({
    lender,
    amount: "50000",
    type: "Personal" as const,
    interestRate: "3.5",
  }),
  repair: (title: string) => ({
    title,
    priority: "High" as const,
  }),
  upgrade: (title: string) => ({
    title,
    budget: "12000",
    description: "QA upgrade project",
  }),
  inventory: (name: string) => ({
    name,
    category: "Appliance" as const,
    quantity: "2",
    brand: "QA Brand",
  }),
  wishlist: (name: string) => ({
    name,
    estimatedCost: "999",
    priority: "High" as const,
  }),
  purchaseCost: (name: string) => ({
    name,
    amount: "4200",
    category: "Legal" as const,
    date: today(),
  }),
  calendarEvent: (title: string) => ({
    title,
    date: today(),
    type: "Other" as const,
  }),
};

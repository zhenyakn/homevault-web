import { eq, inArray } from "drizzle-orm";
import {
  properties,
  expenses,
  repairs,
  repairQuotes,
  repairQuotePayments,
  upgrades,
  upgradeOptions,
  upgradeOptionPayments,
  upgradeItems,
  loans,
  loanRepayments,
  wishlistItems,
  purchaseCosts,
  calendarEvents,
  inventoryItems,
  apartmentSearches,
  apartmentCandidates,
  files,
  notificationLog,
  tenantMembers,
  tenantInvites,
  tenantSubscriptions,
  tenants,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { getMembersOfTenant } from "./tenants";

/**
 * Collect every row belonging to a tenant into a single JSON-serialisable
 * object (the GDPR "right to data portability" export). Includes the deep child
 * records (repair quotes/payments, upgrade options/payments/items, loan
 * repayments) reached via their tenant-scoped parents, plus the membership
 * roster. File rows are metadata only — the binary objects live in the storage
 * backend and aren't inlined here.
 */
export async function exportTenantData(tenantId: number) {
  const db = await getDb();
  const byTenant = <T extends { tenantId: unknown }>(t: any) =>
    db.select().from(t).where(eq(t.tenantId, tenantId));

  const [
    tenant,
    props,
    exp,
    reps,
    ups,
    lns,
    wish,
    pcs,
    cal,
    inv,
    searches,
    candidates,
    fileRows,
    notifs,
    members,
  ] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.id, tenantId)),
    byTenant(properties),
    byTenant(expenses),
    byTenant(repairs),
    byTenant(upgrades),
    byTenant(loans),
    byTenant(wishlistItems),
    byTenant(purchaseCosts),
    byTenant(calendarEvents),
    byTenant(inventoryItems),
    byTenant(apartmentSearches),
    byTenant(apartmentCandidates),
    byTenant(files),
    byTenant(notificationLog),
    getMembersOfTenant(tenantId),
  ]);

  // Deep children, fetched via their parents' ids.
  const repairIds = reps.map(r => r.id);
  const upgradeIds = ups.map(u => u.id);
  const loanIds = lns.map(l => l.id);

  const quotes = repairIds.length
    ? await db
        .select()
        .from(repairQuotes)
        .where(inArray(repairQuotes.repairId, repairIds))
    : [];
  const quoteIds = quotes.map(q => q.id);
  const [quotePayments, options, optItems, repayments] = await Promise.all([
    quoteIds.length
      ? db
          .select()
          .from(repairQuotePayments)
          .where(inArray(repairQuotePayments.quoteId, quoteIds))
      : Promise.resolve([]),
    upgradeIds.length
      ? db
          .select()
          .from(upgradeOptions)
          .where(inArray(upgradeOptions.upgradeId, upgradeIds))
      : Promise.resolve([]),
    upgradeIds.length
      ? db
          .select()
          .from(upgradeItems)
          .where(inArray(upgradeItems.upgradeId, upgradeIds))
      : Promise.resolve([]),
    loanIds.length
      ? db
          .select()
          .from(loanRepayments)
          .where(inArray(loanRepayments.loanId, loanIds))
      : Promise.resolve([]),
  ]);
  const optionIds = options.map(o => o.id);
  const optionPayments = optionIds.length
    ? await db
        .select()
        .from(upgradeOptionPayments)
        .where(inArray(upgradeOptionPayments.optionId, optionIds))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    tenant: tenant[0] ?? null,
    members,
    properties: props,
    expenses: exp,
    repairs: reps,
    repairQuotes: quotes,
    repairQuotePayments: quotePayments,
    upgrades: ups,
    upgradeOptions: options,
    upgradeOptionPayments: optionPayments,
    upgradeItems: optItems,
    loans: lns,
    loanRepayments: repayments,
    wishlistItems: wish,
    purchaseCosts: pcs,
    calendarEvents: cal,
    inventoryItems: inv,
    apartmentSearches: searches,
    apartmentCandidates: candidates,
    files: fileRows,
    notificationLog: notifs,
  };
}

/**
 * Hard-delete a tenant and everything scoped to it (GDPR "right to erasure").
 * Runs in a transaction, deleting children before parents so it works whether
 * or not the live DB enforces the schema's FKs. Users themselves are NOT
 * deleted — a user may belong to other tenants — only their membership here.
 * Caller (adminRouter) is responsible for authorization + audit logging.
 */
export async function deleteTenantCascade(tenantId: number): Promise<void> {
  const db = await getDb();
  await db.transaction(async tx => {
    const ids = async (table: any, col: any, where: any): Promise<any[]> => {
      const rows = await tx.select({ id: col }).from(table).where(where);
      return rows.map((r: any) => r.id);
    };

    const repairIds = await ids(repairs, repairs.id, eq(repairs.tenantId, tenantId));
    const upgradeIds = await ids(upgrades, upgrades.id, eq(upgrades.tenantId, tenantId));
    const loanIds = await ids(loans, loans.id, eq(loans.tenantId, tenantId));

    // Repair quote payments → quotes → repairs.
    if (repairIds.length) {
      const quoteIds = await ids(
        repairQuotes,
        repairQuotes.id,
        inArray(repairQuotes.repairId, repairIds)
      );
      if (quoteIds.length) {
        await tx
          .delete(repairQuotePayments)
          .where(inArray(repairQuotePayments.quoteId, quoteIds));
      }
      await tx
        .delete(repairQuotes)
        .where(inArray(repairQuotes.repairId, repairIds));
    }

    // Upgrade option payments → options; upgrade items; (then upgrades).
    if (upgradeIds.length) {
      const optionIds = await ids(
        upgradeOptions,
        upgradeOptions.id,
        inArray(upgradeOptions.upgradeId, upgradeIds)
      );
      if (optionIds.length) {
        await tx
          .delete(upgradeOptionPayments)
          .where(inArray(upgradeOptionPayments.optionId, optionIds));
      }
      await tx
        .delete(upgradeOptions)
        .where(inArray(upgradeOptions.upgradeId, upgradeIds));
      await tx
        .delete(upgradeItems)
        .where(inArray(upgradeItems.upgradeId, upgradeIds));
    }

    // Loan repayments → loans.
    if (loanIds.length) {
      await tx
        .delete(loanRepayments)
        .where(inArray(loanRepayments.loanId, loanIds));
    }

    // Tenant-scoped tables (all carry tenantId).
    const tenantScoped = [
      apartmentCandidates,
      apartmentSearches,
      expenses,
      repairs,
      upgrades,
      loans,
      wishlistItems,
      purchaseCosts,
      calendarEvents,
      inventoryItems,
      files,
      notificationLog,
      properties,
      tenantSubscriptions,
      tenantInvites,
      tenantMembers,
    ];
    for (const table of tenantScoped) {
      await tx.delete(table).where(eq((table as any).tenantId, tenantId));
    }

    await tx.delete(tenants).where(eq(tenants.id, tenantId));
  });
}

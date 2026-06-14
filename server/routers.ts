import { nanoid } from "nanoid";
import { z } from "zod";
import type { inferRouterOutputs, inferRouterInputs } from "@trpc/server";
import { createInsertSchema } from "drizzle-zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { clearNoAuthUserCache } from "./_core/context";
import { systemRouter } from "./_core/systemRouter";
import { notificationRouter } from "./notificationRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import * as db from "./db";
import { parseJsonArray } from "./db/client";
import {
  syncAttachmentRemovals,
  deleteAttachmentList,
  deleteAllFilesForProperty,
  listFilesForOwner,
  deleteFileForOwner,
  reapOrphanedFiles,
  buildProxyUrl,
} from "./files";
import { logger } from "./_core/logger";
import { searchRouter } from "./searchRouter";
import {
  expenses,
  repairs,
  upgrades,
  loans,
  wishlistItems,
  purchaseCosts,
  inventoryItems,
  properties,
  apartmentSearches,
  apartmentCandidates,
} from "../drizzle/schema";

// Fields always assigned by the server — never accepted from the client
const SERVER_FIELDS = {
  id: true,
  ownerId: true,
  propertyId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const attachmentSchema = z.array(z.string()).optional();

// Guard a loan link on an expense: a non-null loanId must reference a loan the
// caller owns within the active property.
async function assertLoanLinkOwned(
  loanId: string | null | undefined,
  ctx: { user: { id: number }; propertyId: number }
) {
  if (!loanId) return;
  const loan = await db.getLoanById(loanId);
  if (
    !loan ||
    loan.ownerId !== ctx.user.id ||
    loan.propertyId !== ctx.propertyId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot link expense to this loan",
    });
  }
}

const calendarCatMap: Record<string, string> = {
  Expense: "Payment",
  Repair: "Maintenance",
  Upgrade: "Renovation",
  Loan: "Loan",
  Other: "Other",
};

const expenseSchema = createInsertSchema(expenses, {
  name: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  attachments: attachmentSchema,
}).omit({ ...SERVER_FIELDS, isPaid: true, paidDate: true, nextDueDate: true });

const repairSchema = createInsertSchema(repairs, {
  title: z.string().min(1),
  attachments: attachmentSchema,
}).omit({ ...SERVER_FIELDS, completedDate: true });

const upgradeSchema = createInsertSchema(upgrades, {
  title: z.string().min(1),
  estimatedCost: z.number().int().min(0).optional(),
  actualCost: z.number().int().optional(),
  attachments: attachmentSchema,
}).omit(SERVER_FIELDS);

const loanSchema = createInsertSchema(loans, {
  // name and currentBalance are NOT NULL in DB but the server defaults them
  name: z.string().optional(),
  currentBalance: z.number().int().optional(),
  originalAmount: z.number().int().positive(),
  // Both dates are optional. The client sends "" when a date input is left
  // blank, so coerce empty strings to undefined before the regex runs —
  // otherwise an omitted (optional) Due date fails the YYYY-MM-DD check.
  startDate: z.preprocess(
    v => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
      .optional()
  ),
  endDate: z.preprocess(
    v => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
      .optional()
  ),
  // interestRate is a decimal column. The client sends "" when the optional
  // field is left blank — coerce that to undefined (NULL) so the insert
  // doesn't fail with an "incorrect decimal value" error. A provided value
  // must be a plain number ("5", "3.25"); reject e.g. "5%" up front with a
  // clear message rather than a cryptic DB failure.
  interestRate: z.preprocess(
    v => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^\d+(\.\d+)?$/, "Interest rate must be a number")
      .optional()
  ),
  attachments: attachmentSchema,
}).omit({ ...SERVER_FIELDS });

const inventoryItemSchema = createInsertSchema(inventoryItems, {
  name: z.string().min(1),
  quantity: z.number().int().min(0),
  minQuantity: z.number().int().min(0).optional(),
}).omit(SERVER_FIELDS);

const wishlistSchema = createInsertSchema(wishlistItems, {
  name: z.string().min(1),
  estimatedPrice: z.number().int().min(0).optional(),
  attachments: attachmentSchema,
}).omit(SERVER_FIELDS);

const purchaseCostSchema = createInsertSchema(purchaseCosts, {
  name: z.string().min(1),
  amount: z.number().int().positive(),
  // date is nullable in the DB but required by the client
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  attachments: attachmentSchema,
}).omit(SERVER_FIELDS);

// Apartment-search (hunting mode). User-scoped: omit the server-assigned id,
// userId and timestamps — and for candidates the parent searchId, the
// conversion link, and lat/lng (no map picker in v1; columns reserved).
const apartmentSearchSchema = createInsertSchema(apartmentSearches, {
  name: z.string().min(1),
  searchType: z.enum(["rent", "buy"]),
  targetBudget: z.number().int().min(0).optional(),
}).omit({ id: true, userId: true, createdAt: true, updatedAt: true });

const apartmentCandidateSchema = createInsertSchema(apartmentCandidates, {
  title: z.string().min(1),
  price: z.number().int().min(0).optional(),
  deposit: z.number().int().min(0).optional(),
  squareMeters: z.number().int().min(0).optional(),
  rooms: z.number().int().min(0).optional(),
  floors: z.number().int().min(0).optional(),
  gardenSize: z.number().int().min(0).optional(),
  parkingSpots: z.number().int().min(0).optional(),
  yearBuilt: z.number().int().optional(),
  // Numeric score, 1–10.
  rating: z.number().int().min(1).max(10).optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
  attachments: attachmentSchema,
}).omit({
  id: true,
  userId: true,
  searchId: true,
  convertedPropertyId: true,
  latitude: true,
  longitude: true,
  createdAt: true,
  updatedAt: true,
});

const candidateStageEnum = z.enum([
  "saved",
  "viewing_scheduled",
  "viewed",
  "applied",
  "accepted",
  "rejected",
]);

const propertySchema = createInsertSchema(properties, {
  reminderDaysBefore: z.number().int().min(1).max(30).optional(),
  mapsProvider: z.enum(["google", "osm"]).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, userId: true });

const propertyModeEnum = z.enum(["owned_rented", "owned_personal", "rented"]);
const wizardDate = z.preprocess(
  v => (v === "" ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional()
);

// Payload for the multi-step Add-Property wizard. Beyond the property fields it
// can carry optional linked records to create transactionally with the new
// property: a mortgage loan and itemised purchase costs (purchased modes), and a
// recurring rent expense (tenant mode only — a landlord's rent is informational).
export const wizardSchema = z.object({
  mode: propertyModeEnum,
  // shared basics
  houseName: z.string().min(1),
  houseNickname: z.string().optional(),
  propertyType: z.string().optional(),
  address: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  squareMeters: z.number().int().positive().optional(),
  rooms: z.number().int().positive().optional(),
  yearBuilt: z.number().int().optional(),
  floor: z.number().int().optional(),
  floors: z.number().int().positive().optional(),
  gardenSize: z.number().int().min(0).optional(),
  parkingSpots: z.number().int().min(0).optional(),
  hasStorage: z.boolean().optional(),
  hasElevator: z.boolean().optional(),
  // purchased modes
  purchasePrice: z.number().int().positive().optional(),
  purchaseDate: wizardDate,
  // rental terms (tenant lease, or landlord's rented-out terms)
  monthlyRent: z.number().int().positive().optional(),
  leaseStart: wizardDate,
  leaseEnd: wizardDate,
  deposit: z.number().int().min(0).optional(),
  landlord: z.string().optional(),
  // optional linked records
  loan: z
    .object({
      name: z.string().optional(),
      lender: z.string().optional(),
      originalAmount: z.number().int().positive(),
      currentBalance: z.number().int().optional(),
      interestRate: z.number().optional(),
      monthlyPayment: z.number().int().optional(),
      startDate: wizardDate,
      endDate: wizardDate,
    })
    .optional(),
  purchaseCosts: z
    .array(
      z.object({
        name: z.string().min(1),
        amount: z.number().int().positive(),
        category: z.string().optional(),
        date: wizardDate,
      })
    )
    .optional(),
  // tenant mode only: recurring rent expense to mirror into Expenses
  rentExpense: z
    .object({
      amount: z.number().int().positive(),
      recurringInterval: z
        .enum(["monthly", "quarterly", "yearly"])
        .default("monthly"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    })
    .optional(),
});

// ─── Ownership guard helpers ───────────────────────────────────────────────────
// Used only for child entities (repairQuotes, upgradeOptions/Items) that have no
// direct ownerId column — ownership is checked through the parent record.

async function assertRepairOwner(id: string, userId: number) {
  const record = await db.getRepairById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not authorised to modify this repair",
    });
  }
  return record;
}

async function assertUpgradeOwner(id: string, userId: number) {
  const record = await db.getUpgradeById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not authorised to modify this upgrade",
    });
  }
  return record;
}

// Apartment-search rows carry a direct userId (no propertyId scoping), so these
// guards compare ownership against the authenticated user.
async function assertSearchOwned(id: string, userId: number) {
  const record = await db.getSearchById(id);
  if (!record || record.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Search not found",
    });
  }
  return record;
}

async function assertCandidateOwned(id: string, userId: number) {
  const record = await db.getCandidateById(id);
  if (!record || record.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Candidate not found",
    });
  }
  return record;
}

// ─── Attachment lifecycle helpers ─────────────────────────────────────────────
// Each of the 6 entity tables that have an `attachments` JSON column funnels
// updates/deletes through these helpers so unreferenced files are reaped from
// the storage backend (Google Drive / S3). Backend failures are logged but
// never abort the user-facing operation.

type WithAttachments = { ownerId: number; attachments?: string[] | null };

async function diffAttachmentsOnUpdate<T extends WithAttachments>(
  loadOld: () => Promise<T | null | undefined>,
  newData: { attachments?: string[] | null },
  userId: number
) {
  // Skip the diff entirely if the update doesn't touch attachments.
  if (!("attachments" in newData)) return;
  let oldRecord: T | null | undefined;
  try {
    oldRecord = await loadOld();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "[attachments] load-old failed"
    );
    return;
  }
  if (!oldRecord || oldRecord.ownerId !== userId) return;
  const oldList = parseJsonArray(oldRecord.attachments) as string[];
  try {
    await syncAttachmentRemovals({
      oldList,
      newList: newData.attachments ?? [],
      ownerUserId: userId,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[attachments] sync failed");
  }
}

async function deleteAttachmentsOnRecordDelete<T extends WithAttachments>(
  loadRecord: () => Promise<T | null | undefined>,
  userId: number
) {
  let record: T | null | undefined;
  try {
    record = await loadRecord();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "[attachments] load-on-delete failed"
    );
    return;
  }
  if (!record || record.ownerId !== userId) return;
  const list = parseJsonArray(record.attachments) as string[];
  try {
    await deleteAttachmentList(list, userId);
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      "[attachments] delete-on-record-delete failed"
    );
  }
}

export const appRouter = router({
  system: systemRouter,
  search: searchRouter,
  notification: notificationRouter,
  auth: router({
    // In NO_AUTH mode (HA addon) ctx.user may be null on the very first
    // request if ingress strips/delays the session cookie. Fall back to
    // upsert + return the admin user directly so auth.me never returns
    // null when NO_AUTH is active, regardless of cookie state.
    me: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user) return ctx.user;

      if (ENV.noAuth) {
        const openId = ENV.ownerOpenId || "owner";
        await db.upsertUser({
          openId,
          name: "HomeVault Admin",
          email: "admin@local",
          role: "admin",
          lastSignedIn: new Date(),
        });
        return await db.getUserByOpenId(openId);
      }

      return null;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  profiles: router({
    list: protectedProcedure.query(async () => {
      return await db.getAllUsers();
    }),
    current: protectedProcedure.query(({ ctx }) => {
      return ctx.user;
    }),
    updateMe: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await db.upsertUser({ openId: ctx.user.openId, name: input.name });
        return { success: true };
      }),
    // Persist the chosen UI language so server-sent notifications (reminders,
    // test sends) are delivered in the same language across devices.
    setLanguage: protectedProcedure
      .input(z.object({ language: z.enum(["en", "he", "ru"]) }))
      .mutation(async ({ ctx, input }) => {
        await db.setUserLanguage(ctx.user.id, input.language);
        // Under NO_AUTH the user (incl. language) is cached per process; drop it
        // so the new language takes effect on the next request, not after a restart.
        clearNoAuthUserCache();
        return { success: true };
      }),
  }),

  onboarding: router({
    // Moved out of dashboard.stats query — side-effects belong in mutations.
    ensureProperty: protectedProcedure.mutation(async ({ ctx }) => {
      const props = await db.getPropertiesByUser(ctx.user.id);
      if (props.length === 0) {
        const result = await db.createProperty(ctx.user.id, {
          houseName: "My Home",
        });
        return { created: true, propertyId: (result as any).insertId ?? 1 };
      }
      return { created: false, propertyId: props[0].id };
    }),
  }),

  data: router({
    exportAll: protectedProcedure.query(async ({ ctx }) => {
      const pid = ctx.propertyId;
      const uid = ctx.user.id;
      const [
        expensesData,
        repairsData,
        upgradesData,
        loansData,
        wishlist,
        purchaseCostsData,
        events,
        property,
      ] = await Promise.all([
        db.getExpenses(uid, pid),
        db.getRepairs(uid, pid),
        db.getUpgrades(uid, pid),
        db.getLoans(uid, pid),
        db.getWishlistItems(uid, pid),
        db.getPurchaseCosts(uid, pid),
        db.getCalendarEvents(pid),
        db.getProperty(pid),
      ]);
      return {
        expenses: expensesData,
        repairs: repairsData,
        upgrades: upgradesData,
        loans: loansData,
        wishlist,
        purchaseCosts: purchaseCostsData,
        calendarEvents: events,
        property,
        exportedAt: new Date().toISOString(),
      };
    }),
    seedMock: protectedProcedure.mutation(async ({ ctx }) => {
      const propertyId = await db.seedMockProperty(ctx.user.id);
      return { propertyId };
    }),
    deleteAll: protectedProcedure
      .input(z.object({ confirmationPhrase: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const property = await db.getProperty(ctx.propertyId);
        const expected = property?.houseName ?? "My Home";
        if (input.confirmationPhrase !== expected) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Type "${expected}" to confirm deletion`,
          });
        }
        await db.deleteAllUserData(ctx.user.id);
        return { success: true };
      }),
  }),

  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return await db.getDashboardStats(ctx.user.id, ctx.propertyId);
    }),
    attention: protectedProcedure.query(async ({ ctx }) => {
      return await db.getAttentionItems(ctx.user.id, ctx.propertyId);
    }),
    recentActivity: protectedProcedure.query(async ({ ctx }) => {
      return await db.getRecentActivity(ctx.propertyId);
    }),
    portfolio: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPortfolioSummary(ctx.user.id);
    }),
  }),

  documents: router({
    // Home-file completeness derived from attachments across the app's entity
    // tables (see server/db/documents.ts). No dedicated documents table yet.
    summary: protectedProcedure.query(async ({ ctx }) => {
      return await db.getDocumentsSummary(ctx.user.id, ctx.propertyId);
    }),
  }),

  expenses: router({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return await db.getExpenses(
          ctx.user.id,
          ctx.propertyId,
          input?.limit,
          input?.offset
        );
      }),
    create: protectedProcedure
      .input(expenseSchema)
      .mutation(async ({ ctx, input }) => {
        await assertLoanLinkOwned(input.loanId, ctx);
        const created = await db.createExpense({
          id: nanoid(),
          ...input,
          ownerId: ctx.user.id,
          propertyId: ctx.propertyId,
        });
        await db.reconcileExpenseRepayment(created.id);
        return created;
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: expenseSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        if ("loanId" in input.data)
          await assertLoanLinkOwned(input.data.loanId, ctx);
        await diffAttachmentsOnUpdate(
          () => db.getExpenseById(input.id),
          input.data,
          ctx.user.id
        );
        const result = await db.updateExpense(
          input.id,
          ctx.user.id,
          input.data
        );
        await db.reconcileExpenseRepayment(input.id);
        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAttachmentsOnRecordDelete(
          () => db.getExpenseById(input.id),
          ctx.user.id
        );
        const result = await db.deleteExpense(input.id, ctx.user.id);
        // After the row is gone, reconcile removes any linked repayment and
        // restores the loan balance.
        await db.reconcileExpenseRepayment(input.id);
        return result;
      }),
    markAsPaid: protectedProcedure
      .input(z.object({ id: z.string(), paidDate: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.updateExpense(input.id, ctx.user.id, {
          isPaid: true,
          paidDate: input.paidDate,
        } as any);
        await db.reconcileExpenseRepayment(input.id);
        return result;
      }),
  }),

  repairs: router({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return (
          (await db.getRepairs(
            ctx.user.id,
            ctx.propertyId,
            input?.limit,
            input?.offset
          )) ?? []
        );
      }),
    create: protectedProcedure
      .input(repairSchema)
      .mutation(async ({ ctx, input }) => {
        return await db.createRepair({
          id: nanoid(),
          ...input,
          ownerId: ctx.user.id,
          propertyId: ctx.propertyId,
        });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: repairSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await diffAttachmentsOnUpdate(
          () => db.getRepairById(input.id),
          input.data,
          ctx.user.id
        );
        return await db.updateRepair(input.id, ctx.user.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAttachmentsOnRecordDelete(
          () => db.getRepairById(input.id),
          ctx.user.id
        );
        return await db.deleteRepair(input.id, ctx.user.id);
      }),
  }),

  repairQuotes: router({
    list: protectedProcedure
      .input(z.object({ repairId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertRepairOwner(input.repairId, ctx.user.id);
        return (await db.getRepairQuotes(input.repairId)) ?? [];
      }),
    countByRepair: protectedProcedure
      .input(z.object({ repairIds: z.array(z.string()) }))
      .query(async ({ ctx, input }) => {
        const owned = await db.filterOwnedRepairIds(
          input.repairIds,
          ctx.user.id
        );
        return await db.getRepairQuoteCounts(owned);
      }),
    create: protectedProcedure
      .input(
        z.object({
          repairId: z.string(),
          contractor: z.string().min(1),
          amount: z.number().int().min(0).optional(),
          date: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertRepairOwner(input.repairId, ctx.user.id);
        return await db.createRepairQuote({
          id: nanoid(),
          repairId: input.repairId,
          contractor: input.contractor,
          amount: input.amount ?? 0,
          date: input.date,
          notes: input.notes,
        });
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            contractor: z.string().optional(),
            amount: z.number().int().optional(),
            date: z.string().optional(),
            notes: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Verify ownership through the parent repair
        const quote = await db.getRepairQuoteById(input.id);
        if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
        await assertRepairOwner(quote.repairId, ctx.user.id);
        return await db.updateRepairQuote(input.id, input.data);
      }),
    select: protectedProcedure
      .input(z.object({ repairId: z.string(), quoteId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertRepairOwner(input.repairId, ctx.user.id);
        await db.selectRepairQuote(input.repairId, input.quoteId);
        return { success: true };
      }),
    logPayment: protectedProcedure
      .input(
        z.object({
          quoteId: z.string(),
          amount: z.number().int().positive(),
          date: z.string(),
          notes: z.string().optional(),
          receipt: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getRepairQuoteById(input.quoteId);
        if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
        await assertRepairOwner(quote.repairId, ctx.user.id);
        const payment = await db.createRepairQuotePayment({
          id: nanoid(),
          quoteId: input.quoteId,
          amount: input.amount,
          date: input.date,
          notes: input.notes,
          receipt: input.receipt,
        });
        if (quote.selected) {
          const allPayments = await db.getRepairQuotePayments(input.quoteId);
          const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
          await db.updateRepair(quote.repairId, ctx.user.id, {
            cost: totalPaid,
          });
        }
        return payment;
      }),
    deletePayment: protectedProcedure
      .input(
        z.object({
          paymentId: z.string(),
          quoteId: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getRepairQuoteById(input.quoteId);
        if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
        await assertRepairOwner(quote.repairId, ctx.user.id);
        await db.deleteRepairQuotePayment(input.paymentId, input.quoteId);
        if (quote.selected) {
          const allPayments = await db.getRepairQuotePayments(input.quoteId);
          const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
          await db.updateRepair(quote.repairId, ctx.user.id, {
            cost: totalPaid,
          });
        }
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getRepairQuoteById(input.id);
        if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
        await assertRepairOwner(quote.repairId, ctx.user.id);
        return await db.deleteRepairQuote(input.id);
      }),
  }),

  upgradeOptions: router({
    list: protectedProcedure
      .input(z.object({ upgradeId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertUpgradeOwner(input.upgradeId, ctx.user.id);
        return (await db.getUpgradeOptions(input.upgradeId)) ?? [];
      }),
    create: protectedProcedure
      .input(
        z.object({
          upgradeId: z.string(),
          title: z.string().min(1),
          estimatedCost: z.number().int().min(0).optional(),
          description: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertUpgradeOwner(input.upgradeId, ctx.user.id);
        return await db.createUpgradeOption({
          id: nanoid(),
          upgradeId: input.upgradeId,
          title: input.title,
          estimatedCost: input.estimatedCost,
          description: input.description ?? input.notes,
        });
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            title: z.string().optional(),
            estimatedCost: z.number().int().optional(),
            description: z.string().optional(),
            notes: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const option = await db.getUpgradeOptionById(input.id);
        if (!option) throw new TRPCError({ code: "NOT_FOUND" });
        await assertUpgradeOwner(option.upgradeId, ctx.user.id);
        const { notes, ...rest } = input.data;
        return await db.updateUpgradeOption(input.id, {
          ...rest,
          description: rest.description ?? notes,
        });
      }),
    select: protectedProcedure
      .input(z.object({ upgradeId: z.string(), optionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertUpgradeOwner(input.upgradeId, ctx.user.id);
        await db.selectUpgradeOption(input.upgradeId, input.optionId);
        return { success: true };
      }),
    logPayment: protectedProcedure
      .input(
        z.object({
          optionId: z.string(),
          amount: z.number().int().positive(),
          date: z.string(),
          notes: z.string().optional(),
          receipt: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const option = await db.getUpgradeOptionById(input.optionId);
        if (!option) throw new TRPCError({ code: "NOT_FOUND" });
        await assertUpgradeOwner(option.upgradeId, ctx.user.id);
        const payment = await db.createUpgradeOptionPayment({
          id: nanoid(),
          optionId: input.optionId,
          amount: input.amount,
          date: input.date,
          notes: input.notes,
          receipt: input.receipt,
        });
        if (option.selected) {
          const allPayments = await db.getUpgradeOptionPayments(input.optionId);
          const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
          await db.updateUpgrade(option.upgradeId, ctx.user.id, {
            actualCost: totalPaid,
          });
        }
        return payment;
      }),
    deletePayment: protectedProcedure
      .input(
        z.object({
          paymentId: z.string(),
          optionId: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const option = await db.getUpgradeOptionById(input.optionId);
        if (!option) throw new TRPCError({ code: "NOT_FOUND" });
        await assertUpgradeOwner(option.upgradeId, ctx.user.id);
        await db.deleteUpgradeOptionPayment(input.paymentId, input.optionId);
        if (option.selected) {
          const allPayments = await db.getUpgradeOptionPayments(input.optionId);
          const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
          await db.updateUpgrade(option.upgradeId, ctx.user.id, {
            actualCost: totalPaid,
          });
        }
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const option = await db.getUpgradeOptionById(input.id);
        if (!option) throw new TRPCError({ code: "NOT_FOUND" });
        await assertUpgradeOwner(option.upgradeId, ctx.user.id);
        return await db.deleteUpgradeOption(input.id);
      }),
  }),

  upgradeItems: router({
    list: protectedProcedure
      .input(z.object({ upgradeId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertUpgradeOwner(input.upgradeId, ctx.user.id);
        return (await db.getUpgradeItems(input.upgradeId)) ?? [];
      }),
    countByUpgrade: protectedProcedure
      .input(z.object({ upgradeIds: z.array(z.string()) }))
      .query(async ({ ctx, input }) => {
        const owned = await db.filterOwnedUpgradeIds(
          input.upgradeIds,
          ctx.user.id
        );
        return await db.getUpgradeItemCounts(owned);
      }),
    create: protectedProcedure
      .input(
        z.object({
          upgradeId: z.string(),
          name: z.string().min(1),
          store: z.string().optional(),
          estimatedCost: z.number().int().optional(),
          actualCost: z.number().int().optional(),
          purchased: z.boolean().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertUpgradeOwner(input.upgradeId, ctx.user.id);
        return await db.createUpgradeItem({
          id: nanoid(),
          ...input,
          purchased: input.purchased ?? false,
        });
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            name: z.string().optional(),
            store: z.string().optional(),
            estimatedCost: z.number().int().optional(),
            actualCost: z.number().int().optional(),
            purchased: z.boolean().optional(),
            notes: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const item = await db.getUpgradeItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        await assertUpgradeOwner(item.upgradeId, ctx.user.id);
        return await db.updateUpgradeItem(input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const item = await db.getUpgradeItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        await assertUpgradeOwner(item.upgradeId, ctx.user.id);
        return await db.deleteUpgradeItem(input.id);
      }),
  }),

  upgrades: router({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return (
          (await db.getUpgrades(
            ctx.user.id,
            ctx.propertyId,
            input?.limit,
            input?.offset
          )) ?? []
        );
      }),
    create: protectedProcedure
      .input(upgradeSchema)
      .mutation(async ({ ctx, input }) => {
        return await db.createUpgrade({
          id: nanoid(),
          ...input,
          ownerId: ctx.user.id,
          propertyId: ctx.propertyId,
        });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: upgradeSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await diffAttachmentsOnUpdate(
          () => db.getUpgradeById(input.id),
          input.data,
          ctx.user.id
        );
        return await db.updateUpgrade(input.id, ctx.user.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAttachmentsOnRecordDelete(
          () => db.getUpgradeById(input.id),
          ctx.user.id
        );
        return await db.deleteUpgrade(input.id, ctx.user.id);
      }),
  }),

  loans: router({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return await db.getLoans(
          ctx.user.id,
          ctx.propertyId,
          input?.limit,
          input?.offset
        );
      }),
    create: protectedProcedure
      .input(loanSchema)
      .mutation(async ({ ctx, input }) => {
        return await db.createLoan({
          id: nanoid(),
          ...input,
          name: input.name ?? input.lender ?? "Loan",
          currentBalance: input.currentBalance ?? input.originalAmount,
          ownerId: ctx.user.id,
          propertyId: ctx.propertyId,
        });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: loanSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await diffAttachmentsOnUpdate(
          () => db.getLoanById(input.id),
          input.data,
          ctx.user.id
        );
        return await db.updateLoan(input.id, ctx.user.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAttachmentsOnRecordDelete(
          () => db.getLoanById(input.id),
          ctx.user.id
        );
        return await db.deleteLoan(input.id, ctx.user.id);
      }),
    addRepayment: protectedProcedure
      .input(
        z.object({
          loanId: z.string(),
          amount: z.number().int().positive(),
          date: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const targetLoan = await db.getLoanById(input.loanId);
        if (!targetLoan || targetLoan.ownerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not authorised to modify this loan",
          });
        }
        const repayment = await db.createLoanRepayment({
          id: nanoid(),
          loanId: input.loanId,
          amount: input.amount,
          date: input.date,
        });
        // Decrement the authoritative balance (preserves any paydown seeded
        // before in-app tracking; clamped to [0, originalAmount]).
        await db.applyRepaymentToBalance(input.loanId, input.amount);
        return repayment;
      }),
  }),

  wishlist: router({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return await db.getWishlistItems(
          ctx.user.id,
          ctx.propertyId,
          input?.limit,
          input?.offset
        );
      }),
    create: protectedProcedure
      .input(wishlistSchema)
      .mutation(async ({ ctx, input }) => {
        return await db.createWishlistItem({
          id: nanoid(),
          ...input,
          ownerId: ctx.user.id,
          propertyId: ctx.propertyId,
        });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: wishlistSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await diffAttachmentsOnUpdate(
          () => db.getWishlistItemById(input.id),
          input.data,
          ctx.user.id
        );
        return await db.updateWishlistItem(input.id, ctx.user.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAttachmentsOnRecordDelete(
          () => db.getWishlistItemById(input.id),
          ctx.user.id
        );
        return await db.deleteWishlistItem(input.id, ctx.user.id);
      }),
  }),

  purchaseCosts: router({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return await db.getPurchaseCosts(
          ctx.user.id,
          ctx.propertyId,
          input?.limit,
          input?.offset
        );
      }),
    create: protectedProcedure
      .input(purchaseCostSchema)
      .mutation(async ({ ctx, input }) => {
        return await db.createPurchaseCost({
          id: nanoid(),
          ...input,
          ownerId: ctx.user.id,
          propertyId: ctx.propertyId,
        });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: purchaseCostSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await diffAttachmentsOnUpdate(
          () => db.getPurchaseCostById(input.id),
          input.data,
          ctx.user.id
        );
        return await db.updatePurchaseCost(input.id, ctx.user.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAttachmentsOnRecordDelete(
          () => db.getPurchaseCostById(input.id),
          ctx.user.id
        );
        return await db.deletePurchaseCost(input.id, ctx.user.id);
      }),
  }),

  calendar: router({
    list: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        return await db.getCalendarEvents(
          ctx.propertyId,
          input.startDate,
          input.endDate
        );
      }),
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          date: z.string(),
          time: z.string().optional(),
          eventType: z.enum(["Expense", "Repair", "Upgrade", "Loan", "Other"]),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { eventType, time, ...rest } = input as any;
        return await db.createCalendarEvent({
          id: nanoid(),
          ...rest,
          category: calendarCatMap[eventType] ?? "Other",
          ownerId: ctx.user.id,
          propertyId: ctx.propertyId,
        });
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          title: z.string().min(1),
          date: z.string(),
          time: z.string().optional(),
          eventType: z.enum(["Expense", "Repair", "Upgrade", "Loan", "Other"]),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, eventType, time, ...rest } = input as any;
        return await db.updateCalendarEvent(id, ctx.user.id, {
          ...rest,
          category: calendarCatMap[eventType] ?? "Other",
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return await db.deleteCalendarEvent(input.id, ctx.user.id);
      }),
  }),

  property: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPropertiesByUser(ctx.user.id);
    }),
    get: protectedProcedure.query(async ({ ctx }) => {
      return await db.getProperty(ctx.propertyId);
    }),
    create: protectedProcedure
      .input(z.object({ houseName: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        return await db.createProperty(ctx.user.id, input);
      }),
    // Create a property and its optional linked records (mortgage, purchase
    // costs, recurring rent) in one transaction. Child rows are attached to the
    // freshly-inserted property id — NOT ctx.propertyId, which still points at
    // the previously-active property until the client switches.
    createWithWizard: protectedProcedure
      .input(wizardSchema)
      .mutation(async ({ ctx, input }) => {
        return await db.createPropertyWithWizard(ctx.user.id, input);
      }),
    update: protectedProcedure
      // Optional propertyId lets the Portfolio editor save a property other than
      // the active one (e.g. the master/detail panel). Falls back to the
      // header-scoped active property when omitted. Ownership is verified.
      .input(propertySchema.extend({ propertyId: z.number().int().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { propertyId, ...data } = input;
        const target = propertyId ?? ctx.propertyId;
        if (propertyId && propertyId !== ctx.propertyId) {
          const owns = await db.checkPropertyOwnership(ctx.user.id, propertyId);
          if (!owns) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Property not found",
            });
          }
        }
        return await db.updateProperty(target, data);
      }),
    delete: protectedProcedure
      .input(z.object({ propertyId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const props = await db.getPropertiesByUser(ctx.user.id);
        if (props.length <= 1)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete your only property",
          });
        if (!props.find(p => p.id === input.propertyId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Property not found",
          });
        }
        // Reap all files attached to anything under this property — both
        // modern rows (filtered by `files.propertyId`) and legacy attachments
        // (parsed out of the entity tables) — before the property row goes.
        try {
          const summary = await deleteAllFilesForProperty(
            input.propertyId,
            ctx.user.id
          );
          logger.info(
            { propertyId: input.propertyId, summary },
            "[property.delete] reaped files"
          );
        } catch (err) {
          logger.error(
            { propertyId: input.propertyId, err: (err as Error).message },
            "[property.delete] file reap failed"
          );
        }
        return await db.deleteProperty(input.propertyId);
      }),
  }),

  files: router({
    list: protectedProcedure
      .input(
        z
          .object({
            propertyId: z.number().int().optional(),
            limit: z.number().int().min(1).max(500).optional(),
            offset: z.number().int().min(0).optional(),
            includeDeleted: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const result = await listFilesForOwner({
          ownerUserId: ctx.user.id,
          propertyId: input?.propertyId,
          limit: input?.limit,
          offset: input?.offset,
          includeDeleted: input?.includeDeleted,
        });
        return {
          totalCount: result.totalCount,
          totalBytes: result.totalBytes,
          items: result.items.map(r => ({
            id: r.id,
            originalName: r.originalName,
            mimeType: r.mimeType,
            size: r.size,
            propertyId: r.propertyId,
            backend: r.backend,
            createdAt: r.createdAt,
            deletedAt: r.deletedAt,
            // Pre-built proxy URL so the UI can render Download links without
            // re-implementing the URL scheme.
            downloadUrl: buildProxyUrl(r.id, r.originalName),
          })),
        };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const result = await deleteFileForOwner(input.id, ctx.user.id);
        if (!result.deleted)
          throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
        return { deleted: true, backendError: result.backendError ?? null };
      }),
    reapOrphans: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin role required",
        });
      }
      return await reapOrphanedFiles(ctx.user.id);
    }),
  }),

  inventory: router({
    list: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(500).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        return await db.getInventoryItems(
          ctx.user.id,
          ctx.propertyId,
          input?.limit,
          input?.offset
        );
      }),
    create: protectedProcedure
      .input(inventoryItemSchema)
      .mutation(async ({ ctx, input }) => {
        return await db.createInventoryItem({
          id: nanoid(),
          ...input,
          ownerId: ctx.user.id,
          propertyId: ctx.propertyId,
        });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: inventoryItemSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        return await db.updateInventoryItem(input.id, ctx.user.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return await db.deleteInventoryItem(input.id, ctx.user.id);
      }),
  }),

  // Apartment Search ("hunting" mode). User-scoped — these procedures
  // deliberately ignore ctx.propertyId: a candidate isn't an owned property.
  apartmentSearch: router({
    // Accepts (and ignores) an optional input object so generic tooling that
    // posts an empty payload to `.list` works uniformly across entities.
    list: protectedProcedure
      .input(z.object({}).optional())
      .query(async ({ ctx }) => {
        return await db.getSearches(ctx.user.id);
      }),
    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        return await assertSearchOwned(input.id, ctx.user.id);
      }),
    create: protectedProcedure
      .input(apartmentSearchSchema)
      .mutation(async ({ ctx, input }) => {
        return await db.createSearch({
          id: nanoid(),
          ...input,
          userId: ctx.user.id,
        });
      }),
    update: protectedProcedure
      .input(
        z.object({ id: z.string(), data: apartmentSearchSchema.partial() })
      )
      .mutation(async ({ ctx, input }) => {
        await assertSearchOwned(input.id, ctx.user.id);
        return await db.updateSearch(input.id, ctx.user.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertSearchOwned(input.id, ctx.user.id);
        return await db.deleteSearch(input.id, ctx.user.id);
      }),
    counts: protectedProcedure
      .input(z.object({ searchIds: z.array(z.string()) }))
      .query(async ({ ctx, input }) => {
        // Restrict to the caller's own searches before counting.
        const owned = (await db.getSearches(ctx.user.id))
          .filter(s => input.searchIds.includes(s.id))
          .map(s => s.id);
        return await db.getCandidateCounts(owned);
      }),

    candidates: router({
      list: protectedProcedure
        .input(z.object({ searchId: z.string() }))
        .query(async ({ ctx, input }) => {
          await assertSearchOwned(input.searchId, ctx.user.id);
          return await db.getCandidates(input.searchId);
        }),
      get: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
          return await assertCandidateOwned(input.id, ctx.user.id);
        }),
      create: protectedProcedure
        .input(apartmentCandidateSchema.extend({ searchId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const { searchId, ...data } = input;
          await assertSearchOwned(searchId, ctx.user.id);
          return await db.createCandidate({
            id: nanoid(),
            searchId,
            userId: ctx.user.id,
            ...data,
          });
        }),
      update: protectedProcedure
        .input(
          z.object({ id: z.string(), data: apartmentCandidateSchema.partial() })
        )
        .mutation(async ({ ctx, input }) => {
          const existing = await assertCandidateOwned(input.id, ctx.user.id);
          // Candidates key on userId (not ownerId), so reap removed
          // attachments directly rather than via the ownerId-based helper.
          if ("attachments" in input.data) {
            try {
              await syncAttachmentRemovals({
                oldList: parseJsonArray(existing.attachments) as string[],
                newList: input.data.attachments ?? [],
                ownerUserId: ctx.user.id,
              });
            } catch (err) {
              logger.error(
                { err: (err as Error).message },
                "[apartmentCandidate] attachment sync failed"
              );
            }
          }
          return await db.updateCandidate(input.id, ctx.user.id, input.data);
        }),
      setStage: protectedProcedure
        .input(z.object({ id: z.string(), stage: candidateStageEnum }))
        .mutation(async ({ ctx, input }) => {
          await assertCandidateOwned(input.id, ctx.user.id);
          return await db.updateCandidate(input.id, ctx.user.id, {
            stage: input.stage,
          });
        }),
      toggleFavorite: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const candidate = await assertCandidateOwned(input.id, ctx.user.id);
          return await db.updateCandidate(input.id, ctx.user.id, {
            isFavorite: !candidate.isFavorite,
          });
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const existing = await assertCandidateOwned(input.id, ctx.user.id);
          try {
            await deleteAttachmentList(
              parseJsonArray(existing.attachments) as string[],
              ctx.user.id
            );
          } catch (err) {
            logger.error(
              { err: (err as Error).message },
              "[apartmentCandidate] attachment delete failed"
            );
          }
          return await db.deleteCandidate(input.id, ctx.user.id);
        }),
      // Pick the winner: spin up a real tracked property from this candidate.
      convertToProperty: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
          await assertCandidateOwned(input.id, ctx.user.id);
          return await db.convertCandidateToProperty(ctx.user.id, input.id);
        }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

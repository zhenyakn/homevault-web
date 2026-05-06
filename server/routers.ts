import { nanoid } from "nanoid";
import { z } from "zod";
import type { inferRouterOutputs, inferRouterInputs } from "@trpc/server";
import { createInsertSchema } from "drizzle-zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import * as db from "./db";
import { searchRouter } from "./searchRouter";
import {
  expenses, repairs, upgrades, loans,
  wishlistItems, purchaseCosts, inventoryItems, properties,
} from "../drizzle/schema";

// Fields always assigned by the server — never accepted from the client
const SERVER_FIELDS = { id: true, ownerId: true, propertyId: true, createdAt: true, updatedAt: true } as const;

const attachmentSchema = z.array(z.string()).optional();

const calendarCatMap: Record<string, string> = {
  Expense: "Payment", Repair: "Maintenance", Upgrade: "Renovation",
  Loan: "Payment", Other: "Other",
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
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  attachments: attachmentSchema,
}).omit({ ...SERVER_FIELDS, repayments: true });

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

const propertySchema = createInsertSchema(properties, {
  reminderDaysBefore: z.number().int().min(1).max(30).optional(),
  mapsProvider: z.enum(["google", "osm"]).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, userId: true });

// ─── Ownership guard helpers ───────────────────────────────────────────────────
// These throw FORBIDDEN before any DB write if the caller doesn't own the record.

async function assertExpenseOwner(id: string, userId: number) {
  const record = await db.getExpenseById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised to modify this expense" });
  }
  return record;
}

async function assertRepairOwner(id: string, userId: number) {
  const record = await db.getRepairById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised to modify this repair" });
  }
  return record;
}

async function assertUpgradeOwner(id: string, userId: number) {
  const record = await db.getUpgradeById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised to modify this upgrade" });
  }
  return record;
}

async function assertLoanOwner(id: string, userId: number) {
  const record = await db.getLoanById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised to modify this loan" });
  }
  return record;
}

async function assertInventoryOwner(id: string, userId: number) {
  const record = await db.getInventoryItemById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised to modify this inventory item" });
  }
  return record;
}

async function assertWishlistOwner(id: string, userId: number) {
  const record = await db.getWishlistItemById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised to modify this wishlist item" });
  }
  return record;
}

async function assertPurchaseCostOwner(id: string, userId: number) {
  const record = await db.getPurchaseCostById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised to modify this purchase cost" });
  }
  return record;
}

export const appRouter = router({
  system: systemRouter,
  search: searchRouter,
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
  }),

  onboarding: router({
    // Moved out of dashboard.stats query — side-effects belong in mutations.
    ensureProperty: protectedProcedure.mutation(async ({ ctx }) => {
      const props = await db.getPropertiesByUser(ctx.user.id);
      if (props.length === 0) {
        const result = await db.createProperty(ctx.user.id, { houseName: "My Home" });
        return { created: true, propertyId: (result as any).insertId ?? 1 };
      }
      return { created: false, propertyId: props[0].id };
    }),
  }),

  data: router({
    exportAll: protectedProcedure.query(async ({ ctx }) => {
      const pid = ctx.propertyId;
      const uid = ctx.user.id;
      const [expensesData, repairsData, upgradesData, loansData, wishlist, purchaseCostsData, events, property] =
        await Promise.all([
          db.getExpenses(uid, pid),
          db.getRepairs(uid, pid),
          db.getUpgrades(uid, pid),
          db.getLoans(uid, pid),
          db.getWishlistItems(uid, pid),
          db.getPurchaseCosts(uid, pid),
          db.getCalendarEvents(pid),
          db.getProperty(pid),
        ]);
      return { expenses: expensesData, repairs: repairsData, upgrades: upgradesData, loans: loansData, wishlist, purchaseCosts: purchaseCostsData, calendarEvents: events, property, exportedAt: new Date().toISOString() };
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
    recentActivity: protectedProcedure.query(async ({ ctx }) => {
      return await db.getRecentActivity(ctx.propertyId);
    }),
    portfolio: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPortfolioSummary(ctx.user.id);
    }),
  }),

  expenses: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getExpenses(ctx.user.id, ctx.propertyId);
    }),
    create: protectedProcedure.input(expenseSchema).mutation(async ({ ctx, input }) => {
      return await db.createExpense({
        id: nanoid(), ...input,
        ownerId: ctx.user.id, propertyId: ctx.propertyId,
      });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: expenseSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await assertExpenseOwner(input.id, ctx.user.id);
        return await db.updateExpense(input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertExpenseOwner(input.id, ctx.user.id);
        return await db.deleteExpense(input.id);
      }),
    markAsPaid: protectedProcedure
      .input(z.object({ id: z.string(), paidDate: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertExpenseOwner(input.id, ctx.user.id);
        return await db.updateExpense(input.id, { isPaid: true, paidDate: input.paidDate } as any);
      }),
  }),

  repairs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return (await db.getRepairs(ctx.user.id, ctx.propertyId)) ?? [];
    }),
    create: protectedProcedure.input(repairSchema).mutation(async ({ ctx, input }) => {
      return await db.createRepair({
        id: nanoid(), ...input,
        ownerId: ctx.user.id, propertyId: ctx.propertyId,
      });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: repairSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await assertRepairOwner(input.id, ctx.user.id);
        return await db.updateRepair(input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertRepairOwner(input.id, ctx.user.id);
        return await db.deleteRepair(input.id);
      }),
  }),

  repairQuotes: router({
    list: protectedProcedure.input(z.object({ repairId: z.string() })).query(async ({ input }) => {
      return (await db.getRepairQuotes(input.repairId)) ?? [];
    }),
    countByRepair: protectedProcedure.input(z.object({ repairIds: z.array(z.string()) })).query(async ({ input }) => {
      return await db.getRepairQuoteCounts(input.repairIds);
    }),
    create: protectedProcedure.input(z.object({
      repairId: z.string(),
      contractorName: z.string().min(1),
      contractorPhone: z.string().optional(),
      quotedPrice: z.number().int().optional(),
      timeline: z.string().optional(),
      guarantee: z.string().optional(),
      scope: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertRepairOwner(input.repairId, ctx.user.id);
      return await db.createRepairQuote({
        id: nanoid(), payments: [],
        repairId: input.repairId,
        contractor: input.contractorName,
        amount: input.quotedPrice ?? 0,
        notes: input.notes,
      });
    }),
    update: protectedProcedure.input(z.object({ id: z.string(), data: z.object({
      contractorName: z.string().optional(),
      contractorPhone: z.string().optional(),
      quotedPrice: z.number().int().optional(),
      timeline: z.string().optional(),
      guarantee: z.string().optional(),
      scope: z.string().optional(),
      notes: z.string().optional(),
    }) })).mutation(async ({ input }) => {
      const { contractorName, quotedPrice, contractorPhone, timeline, guarantee, scope, ...rest } = input.data;
      const mapped: any = { ...rest };
      if (contractorName !== undefined) mapped.contractor = contractorName;
      if (quotedPrice !== undefined) mapped.amount = quotedPrice;
      return await db.updateRepairQuote(input.id, mapped);
    }),
    select: protectedProcedure.input(z.object({ repairId: z.string(), quoteId: z.string() })).mutation(async ({ ctx, input }) => {
      await assertRepairOwner(input.repairId, ctx.user.id);
      await db.selectRepairQuote(input.repairId, input.quoteId);
      return { success: true };
    }),
    logPayment: protectedProcedure.input(z.object({
      quoteId: z.string(),
      amount: z.number().int().positive(),
      date: z.string(),
      notes: z.string().optional(),
      receipt: z.string().optional(),
    })).mutation(async ({ input }) => {
      await db.logRepairQuotePayment(input.quoteId, { date: input.date, amount: input.amount, notes: input.notes, receipt: input.receipt });
      return { success: true };
    }),
    deletePayment: protectedProcedure.input(z.object({
      quoteId: z.string(),
      paymentIndex: z.number().int().min(0),
    })).mutation(async ({ input }) => {
      await db.deleteRepairQuotePayment(input.quoteId, input.paymentIndex);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      return await db.deleteRepairQuote(input.id);
    }),
  }),

  upgradeOptions: router({
    list: protectedProcedure.input(z.object({ upgradeId: z.string() })).query(async ({ input }) => {
      return (await db.getUpgradeOptions(input.upgradeId)) ?? [];
    }),
    create: protectedProcedure.input(z.object({
      upgradeId: z.string(),
      name: z.string().min(1),
      vendorPhone: z.string().optional(),
      totalPrice: z.number().int().optional(),
      timeline: z.string().optional(),
      warranty: z.string().optional(),
      scope: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertUpgradeOwner(input.upgradeId, ctx.user.id);
      return await db.createUpgradeOption({
        id: nanoid(), payments: [],
        upgradeId: input.upgradeId,
        title: input.name,
        estimatedCost: input.totalPrice,
        description: input.scope ?? input.notes,
      });
    }),
    update: protectedProcedure.input(z.object({ id: z.string(), data: z.object({
      name: z.string().optional(),
      vendorPhone: z.string().optional(),
      totalPrice: z.number().int().optional(),
      timeline: z.string().optional(),
      warranty: z.string().optional(),
      scope: z.string().optional(),
      notes: z.string().optional(),
    }) })).mutation(async ({ input }) => {
      const { name, totalPrice, vendorPhone, timeline, warranty, scope, ...rest } = input.data;
      const mapped: any = { ...rest };
      if (name !== undefined) mapped.title = name;
      if (totalPrice !== undefined) mapped.estimatedCost = totalPrice;
      if (scope !== undefined) mapped.description = scope;
      return await db.updateUpgradeOption(input.id, mapped);
    }),
    select: protectedProcedure.input(z.object({ upgradeId: z.string(), optionId: z.string() })).mutation(async ({ ctx, input }) => {
      await assertUpgradeOwner(input.upgradeId, ctx.user.id);
      await db.selectUpgradeOption(input.upgradeId, input.optionId);
      return { success: true };
    }),
    logPayment: protectedProcedure.input(z.object({
      optionId: z.string(),
      amount: z.number().int().positive(),
      date: z.string(),
      notes: z.string().optional(),
      receipt: z.string().optional(),
    })).mutation(async ({ input }) => {
      await db.logUpgradeOptionPayment(input.optionId, { date: input.date, amount: input.amount, notes: input.notes, receipt: input.receipt });
      return { success: true };
    }),
    deletePayment: protectedProcedure.input(z.object({
      optionId: z.string(),
      paymentIndex: z.number().int().min(0),
    })).mutation(async ({ input }) => {
      await db.deleteUpgradeOptionPayment(input.optionId, input.paymentIndex);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      return await db.deleteUpgradeOption(input.id);
    }),
  }),

  upgradeItems: router({
    list: protectedProcedure.input(z.object({ upgradeId: z.string() })).query(async ({ input }) => {
      return (await db.getUpgradeItems(input.upgradeId)) ?? [];
    }),
    countByUpgrade: protectedProcedure.input(z.object({ upgradeIds: z.array(z.string()) })).query(async ({ input }) => {
      return await db.getUpgradeItemCounts(input.upgradeIds);
    }),
    create: protectedProcedure.input(z.object({
      upgradeId: z.string(),
      name: z.string().min(1),
      store: z.string().optional(),
      estimatedCost: z.number().int().optional(),
      actualCost: z.number().int().optional(),
      purchased: z.boolean().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      return await db.createUpgradeItem({ id: nanoid(), ...input, purchased: input.purchased ?? false });
    }),
    update: protectedProcedure.input(z.object({ id: z.string(), data: z.object({
      name: z.string().optional(),
      store: z.string().optional(),
      estimatedCost: z.number().int().optional(),
      actualCost: z.number().int().optional(),
      purchased: z.boolean().optional(),
      notes: z.string().optional(),
    }) })).mutation(async ({ input }) => {
      return await db.updateUpgradeItem(input.id, input.data);
    }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      return await db.deleteUpgradeItem(input.id);
    }),
  }),

  upgrades: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return (await db.getUpgrades(ctx.user.id, ctx.propertyId)) ?? [];
    }),
    create: protectedProcedure.input(upgradeSchema).mutation(async ({ ctx, input }) => {
      return await db.createUpgrade({
        id: nanoid(), ...input,
        ownerId: ctx.user.id, propertyId: ctx.propertyId,
      });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: upgradeSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await assertUpgradeOwner(input.id, ctx.user.id);
        return await db.updateUpgrade(input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertUpgradeOwner(input.id, ctx.user.id);
        return await db.deleteUpgrade(input.id);
      }),
  }),

  loans: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getLoans(ctx.user.id, ctx.propertyId);
    }),
    create: protectedProcedure.input(loanSchema).mutation(async ({ ctx, input }) => {
      return await db.createLoan({
        id: nanoid(), ...input,
        name: input.name ?? input.lender ?? "Loan",
        currentBalance: input.currentBalance ?? input.originalAmount,
        repayments: [],
        ownerId: ctx.user.id, propertyId: ctx.propertyId,
      });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: loanSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await assertLoanOwner(input.id, ctx.user.id);
        return await db.updateLoan(input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertLoanOwner(input.id, ctx.user.id);
        return await db.deleteLoan(input.id);
      }),
    addRepayment: protectedProcedure
      .input(z.object({ loanId: z.string(), amount: z.number().int().positive(), date: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Fetch the loan directly by id rather than pulling the full list.
        const targetLoan = await assertLoanOwner(input.loanId, ctx.user.id);
        const updatedRepayments = [
          ...((targetLoan as any).repayments || []),
          { date: input.date, amount: input.amount, ownerId: ctx.user.id },
        ];
        return await db.updateLoan(input.loanId, { repayments: updatedRepayments });
      }),
  }),

  wishlist: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getWishlistItems(ctx.user.id, ctx.propertyId);
    }),
    create: protectedProcedure.input(wishlistSchema).mutation(async ({ ctx, input }) => {
      return await db.createWishlistItem({
        id: nanoid(), ...input,
        ownerId: ctx.user.id, propertyId: ctx.propertyId,
      });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: wishlistSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await assertWishlistOwner(input.id, ctx.user.id);
        return await db.updateWishlistItem(input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertWishlistOwner(input.id, ctx.user.id);
        return await db.deleteWishlistItem(input.id);
      }),
  }),

  purchaseCosts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPurchaseCosts(ctx.user.id, ctx.propertyId);
    }),
    create: protectedProcedure.input(purchaseCostSchema).mutation(async ({ ctx, input }) => {
      return await db.createPurchaseCost({
        id: nanoid(), ...input,
        ownerId: ctx.user.id, propertyId: ctx.propertyId,
      });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: purchaseCostSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await assertPurchaseCostOwner(input.id, ctx.user.id);
        return await db.updatePurchaseCost(input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertPurchaseCostOwner(input.id, ctx.user.id);
        return await db.deletePurchaseCost(input.id);
      }),
  }),

  calendar: router({
    list: protectedProcedure
      .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        return await db.getCalendarEvents(ctx.propertyId, input.startDate, input.endDate);
      }),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        date: z.string(),
        time: z.string().optional(),
        eventType: z.enum(["Expense", "Repair", "Upgrade", "Loan", "Other"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { eventType, time, ...rest } = input as any;
        return await db.createCalendarEvent({
          id: nanoid(), ...rest,
          category: calendarCatMap[eventType] ?? "Other",
          ownerId: ctx.user.id, propertyId: ctx.propertyId,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await db.deleteCalendarEvent(input.id);
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
    update: protectedProcedure.input(propertySchema).mutation(async ({ ctx, input }) => {
      return await db.updateProperty(ctx.propertyId, input);
    }),
    delete: protectedProcedure
      .input(z.object({ propertyId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        if (input.propertyId === 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete the primary property" });
        const props = await db.getPropertiesByUser(ctx.user.id);
        if (!props.find(p => p.id === input.propertyId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Property not found" });
        }
        return await db.deleteProperty(input.propertyId);
      }),
  }),

  inventory: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getInventoryItems(ctx.user.id, ctx.propertyId);
    }),
    create: protectedProcedure.input(inventoryItemSchema).mutation(async ({ ctx, input }) => {
      return await db.createInventoryItem({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: inventoryItemSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        await assertInventoryOwner(input.id, ctx.user.id);
        return await db.updateInventoryItem(input.id, input.data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertInventoryOwner(input.id, ctx.user.id);
        return await db.deleteInventoryItem(input.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

import { nanoid } from "nanoid";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import * as db from "./db";
import { searchRouter } from "./searchRouter";

const attachmentSchema = z.array(z.string()).optional();

const expenseSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  category: z.enum(["Mortgage", "Utility", "Insurance", "Tax", "Maintenance", "Other"]),
  isRecurring: z.boolean().optional(),
  recurringFrequency: z.enum(["Monthly", "Quarterly", "Annual"]).optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const repairSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  status: z.enum(["Pending", "In Progress", "Resolved"]),
  phase: z.enum(["Assessment", "Quoting", "Scheduled", "In Progress", "Resolved"]).optional(),
  dateLogged: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  contractor: z.string().optional(),
  contractorPhone: z.string().optional(),
  estimatedCost: z.number().int().optional(),
  actualCost: z.number().int().optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const upgradeSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["Planned", "In Progress", "Done"]),
  phase: z.enum(["Planning", "Sourcing", "Building", "Done"]).optional(),
  budget: z.number().int().positive(),
  spent: z.number().int().optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const loanSchema = z.object({
  lender: z.string().min(1),
  totalAmount: z.number().int().positive(),
  loanType: z.enum(["Family", "Bank", "Friend", "Other"]),
  interestRate: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const wishlistSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  estimatedCost: z.number().int().positive(),
  priority: z.enum(["Low", "Medium", "High"]),
  attachments: attachmentSchema,
});

const purchaseCostSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  category: z.string().optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const propertySchema = z.object({
  houseName: z.string().optional(),
  houseNickname: z.string().optional(),
  propertyType: z.string().optional(),
  address: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().int().optional(),
  squareMeters: z.number().int().optional(),
  rooms: z.number().optional(),
  yearBuilt: z.number().int().optional(),
  floor: z.number().int().optional(),
  parkingSpots: z.number().int().optional(),
  hasStorage: z.boolean().optional(),
  currency: z.string().optional(),
  currencyCode: z.string().optional(),
  timezone: z.string().optional(),
  startOfWeek: z.string().optional(),
  reminderDaysBefore: z.number().int().min(1).max(30).optional(),
  calendarSyncEnabled: z.boolean().optional(),
  mapsProvider: z.enum(["google", "osm"]).optional(),
  remindExpenses: z.boolean().optional(),
  remindLoans: z.boolean().optional(),
  remindRepairs: z.boolean().optional(),
  remindCalendar: z.boolean().optional(),
});

const inventorySchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  category: z.enum(["Appliance", "Furniture", "Electronics", "Consumable", "Tool", "Valuable", "Other"]).optional(),
  room: z.string().optional(),
  quantity: z.number().int().min(0).optional(),
  minQuantity: z.number().int().min(0).optional(),
  unit: z.string().optional(),
  purchasePrice: z.number().int().positive().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  brand: z.string().optional(),
  store: z.string().optional(),
  warrantyExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  condition: z.enum(["New", "Good", "Fair", "Poor"]).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  photoUrl: z.string().optional(),
  serialNumber: z.string().optional(),
});

// ─── Ownership guard helpers ───────────────────────────────────────────────────

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

async function assertInventoryOwner(id: string, userId: number) {
  const record = await db.getInventoryItemById(id);
  if (!record || record.ownerId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised to modify this inventory item" });
  }
  return record;
}

export const appRouter = router({
  system: systemRouter,
  search: searchRouter,
  auth: router({
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
      const [expensesData, repairsData, upgradesData, loansData, wishlist, purchaseCostsData, events, property, inventoryData] =
        await Promise.all([
          db.getExpenses(uid, pid),
          db.getRepairs(uid, pid),
          db.getUpgrades(uid, pid),
          db.getLoans(uid, pid),
          db.getWishlistItems(uid, pid),
          db.getPurchaseCosts(uid, pid),
          db.getCalendarEvents(pid),
          db.getProperty(pid),
          db.getInventoryItems(uid, pid),
        ]);
      return { expenses: expensesData, repairs: repairsData, upgrades: upgradesData, loans: loansData, wishlist, purchaseCosts: purchaseCostsData, calendarEvents: events, property, inventory: inventoryData, exportedAt: new Date().toISOString() };
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
      return await db.createExpense({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
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
        return await db.updateExpense(input.id, { isPaid: true, paidDate: input.paidDate });
      }),
  }),

  repairs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return (await db.getRepairs(ctx.user.id, ctx.propertyId)) ?? [];
    }),
    create: protectedProcedure.input(repairSchema).mutation(async ({ ctx, input }) => {
      return await db.createRepair({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
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
      return await db.createRepairQuote({ id: nanoid(), payments: [], ...input });
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
      return await db.updateRepairQuote(input.id, input.data);
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
      return await db.createUpgradeOption({ id: nanoid(), payments: [], ...input });
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
      return await db.updateUpgradeOption(input.id, input.data);
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
      vendorName: z.string().optional(),
      estimatedCost: z.number().int().optional(),
      actualCost: z.number().int().optional(),
      status: z.enum(["Need to find", "Researching", "Quoted", "Ordered", "Delivered", "Installed"]).optional(),
      eta: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      return await db.createUpgradeItem({ id: nanoid(), ownerId: ctx.user.id, propertyId: ctx.propertyId, ...input });
    }),
    update: protectedProcedure.input(z.object({ id: z.string(), data: z.object({
      name: z.string().optional(),
      vendorName: z.string().optional(),
      estimatedCost: z.number().int().optional(),
      actualCost: z.number().int().optional(),
      status: z.enum(["Need to find", "Researching", "Quoted", "Ordered", "Delivered", "Installed"]).optional(),
      eta: z.string().optional(),
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
      return await db.createUpgrade({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
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
      return await db.createLoan({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
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
      return await db.createWishlistItem({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
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
      return await db.createPurchaseCost({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
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
        return await db.createCalendarEvent({ id: nanoid(), ...input, createdById: ctx.user.id, propertyId: ctx.propertyId });
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
    create: protectedProcedure.input(inventorySchema).mutation(async ({ ctx, input }) => {
      return await db.createInventoryItem({
        id: nanoid(),
        ...input,
        quantity: input.quantity ?? 1,
        ownerId: ctx.user.id,
        propertyId: ctx.propertyId,
      });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: inventorySchema.partial() }))
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

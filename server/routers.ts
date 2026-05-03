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
  name: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  category: z.enum(["Maintenance", "Utilities", "Insurance", "Tax", "Management", "Renovation", "Other"]).optional(),
  isRecurring: z.boolean().optional(),
  recurringInterval: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const repairSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["open", "in_progress", "waiting_for_parts", "waiting_for_contractor", "completed", "cancelled"]).optional(),
  category: z.enum(["Plumbing", "Electrical", "HVAC", "Structural", "Appliance", "Cosmetic", "Other"]).optional(),
  reportedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contractor: z.string().optional(),
  cost: z.number().int().optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const upgradeSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["idea", "planning", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  phase: z.string().optional(),
  category: z.enum(["Kitchen", "Bathroom", "Bedroom", "Living Room", "Outdoor", "Structural", "Technology", "Other"]).optional(),
  estimatedCost: z.number().int().optional(),
  actualCost: z.number().int().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contractor: z.string().optional(),
  roiEstimate: z.number().int().optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const loanSchema = z.object({
  name: z.string().min(1),
  lender: z.string().optional(),
  originalAmount: z.number().int().positive(),
  currentBalance: z.number().int().min(0),
  interestRate: z.string().optional(),
  monthlyPayment: z.number().int().optional(),
  loanType: z.enum(["mortgage", "heloc", "personal", "construction", "other"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nextPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const wishlistSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["Furniture", "Appliance", "Electronics", "Decor", "Renovation", "Other"]).optional(),
  estimatedPrice: z.number().int().positive().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["wanted", "saved", "purchased"]).optional(),
  url: z.string().optional(),
  notes: z.string().optional(),
  attachments: attachmentSchema,
});

const purchaseCostSchema = z.object({
  name: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.enum(["Tax", "Legal", "Inspection", "Agency", "Renovation", "Moving", "Other"]).optional(),
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
      contractor: z.string().min(1),
      amount: z.number().int().optional(),
      notes: z.string().optional(),
      date: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertRepairOwner(input.repairId, ctx.user.id);
      return await db.createRepairQuote({ id: nanoid(), ...input });
    }),
    update: protectedProcedure.input(z.object({ id: z.string(), data: z.object({
      contractor: z.string().optional(),
      amount: z.number().int().optional(),
      notes: z.string().optional(),
      date: z.string().optional(),
    }) })).mutation(async ({ input }) => {
      return await db.updateRepairQuote(input.id, input.data);
    }),
    select: protectedProcedure.input(z.object({ repairId: z.string(), quoteId: z.string() })).mutation(async ({ ctx, input }) => {
      await assertRepairOwner(input.repairId, ctx.user.id);
      await db.selectRepairQuote(input.repairId, input.quoteId);
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
      title: z.string().min(1),
      description: z.string().optional(),
      estimatedCost: z.number().int().optional(),
      pros: z.array(z.string()).optional(),
      cons: z.array(z.string()).optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertUpgradeOwner(input.upgradeId, ctx.user.id);
      return await db.createUpgradeOption({ id: nanoid(), ...input });
    }),
    update: protectedProcedure.input(z.object({ id: z.string(), data: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      estimatedCost: z.number().int().optional(),
      pros: z.array(z.string()).optional(),
      cons: z.array(z.string()).optional(),
    }) })).mutation(async ({ input }) => {
      return await db.updateUpgradeOption(input.id, input.data);
    }),
    select: protectedProcedure.input(z.object({ upgradeId: z.string(), optionId: z.string() })).mutation(async ({ ctx, input }) => {
      await assertUpgradeOwner(input.upgradeId, ctx.user.id);
      await db.selectUpgradeOption(input.upgradeId, input.optionId);
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
      quantity: z.number().int().optional(),
      unit: z.string().optional(),
      estimatedCost: z.number().int().optional(),
      actualCost: z.number().int().optional(),
      store: z.string().optional(),
      purchased: z.boolean().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      return await db.createUpgradeItem({ id: nanoid(), ...input });
    }),
    update: protectedProcedure.input(z.object({ id: z.string(), data: z.object({
      name: z.string().optional(),
      quantity: z.number().int().optional(),
      unit: z.string().optional(),
      estimatedCost: z.number().int().optional(),
      actualCost: z.number().int().optional(),
      store: z.string().optional(),
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
        description: z.string().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        category: z.enum(["Maintenance", "Payment", "Inspection", "Renovation", "Legal", "Other"]).optional(),
        isRecurring: z.boolean().optional(),
        recurringInterval: z.enum(["monthly", "quarterly", "yearly"]).optional(),
        reminderDaysBefore: z.number().int().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createCalendarEvent({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        date: z.string().optional(),
        endDate: z.string().optional(),
        category: z.enum(["Maintenance", "Payment", "Inspection", "Renovation", "Legal", "Other"]).optional(),
        isRecurring: z.boolean().optional(),
        recurringInterval: z.enum(["monthly", "quarterly", "yearly"]).optional(),
        reminderDaysBefore: z.number().int().optional(),
        notes: z.string().optional(),
      }) }))
      .mutation(async ({ input }) => {
        return await db.updateCalendarEvent(input.id, input.data);
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

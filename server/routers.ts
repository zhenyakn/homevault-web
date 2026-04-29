import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

const attachmentSchema = z.array(z.string()).optional();

const expenseSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string(),
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
  dateLogged: z.string(),
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
  startDate: z.string(),
  dueDate: z.string().optional(),
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
  date: z.string(),
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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
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
          throw new Error(`Type "${expected}" to confirm deletion`);
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
      .mutation(async ({ input }) => {
        return await db.updateExpense(input.id, input.data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      return await db.deleteExpense(input.id);
    }),
    markAsPaid: protectedProcedure
      .input(z.object({ id: z.string(), paidDate: z.string() }))
      .mutation(async ({ input }) => {
        return await db.updateExpense(input.id, { isPaid: true, paidDate: input.paidDate });
      }),
  }),

  repairs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getRepairs(ctx.user.id, ctx.propertyId);
    }),
    create: protectedProcedure.input(repairSchema).mutation(async ({ ctx, input }) => {
      return await db.createRepair({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: repairSchema.partial() }))
      .mutation(async ({ input }) => {
        return await db.updateRepair(input.id, input.data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      return await db.deleteRepair(input.id);
    }),
  }),

  upgrades: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUpgrades(ctx.user.id, ctx.propertyId);
    }),
    create: protectedProcedure.input(upgradeSchema).mutation(async ({ ctx, input }) => {
      return await db.createUpgrade({ id: nanoid(), ...input, ownerId: ctx.user.id, propertyId: ctx.propertyId });
    }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: upgradeSchema.partial() }))
      .mutation(async ({ input }) => {
        return await db.updateUpgrade(input.id, input.data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        return await db.updateLoan(input.id, input.data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
      return await db.deleteLoan(input.id);
    }),
    addRepayment: protectedProcedure
      .input(z.object({ loanId: z.string(), amount: z.number().int().positive(), date: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const allLoans = await db.getLoans(ctx.user.id, ctx.propertyId);
        const targetLoan = allLoans.find((l) => l.id === input.loanId);
        if (!targetLoan) throw new Error("Loan not found");
        const updatedRepayments = [
          ...(targetLoan.repayments || []),
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
      .mutation(async ({ input }) => {
        return await db.updateWishlistItem(input.id, input.data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        return await db.updatePurchaseCost(input.id, input.data);
      }),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
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
        if (input.propertyId === 1) throw new Error("Cannot delete the primary property");
        const props = await db.getPropertiesByUser(ctx.user.id);
        if (!props.find(p => p.id === input.propertyId)) throw new Error("Property not found");
        return await db.deleteProperty(input.propertyId);
      }),
  }),
});

export type AppRouter = typeof appRouter;

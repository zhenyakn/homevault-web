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
});

const loanSchema = z.object({
  lender: z.string().min(1),
  totalAmount: z.number().int().positive(),
  loanType: z.enum(["Family", "Bank", "Friend", "Other"]),
  interestRate: z.string().optional(),
  startDate: z.string(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

const wishlistSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  estimatedCost: z.number().int().positive(),
  priority: z.enum(["Low", "Medium", "High"]),
});

const purchaseCostSchema = z.object({
  label: z.string().min(1),
  amount: z.number().int().positive(),
  date: z.string(),
  category: z.string().optional(),
  notes: z.string().optional(),
});

const propertySchema = z.object({
  houseName: z.string().optional(),
  houseNickname: z.string().optional(),
  address: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().int().optional(),
  squareMeters: z.number().int().optional(),
  rooms: z.number().int().optional(),
  yearBuilt: z.number().int().optional(),
  floor: z.number().int().optional(),
  parkingSpots: z.number().int().optional(),
  hasStorage: z.boolean().optional(),
  currency: z.string().optional(),
  currencyCode: z.string().optional(),
  timezone: z.string().optional(),
  startOfWeek: z.string().optional(),
  reminderDaysBefore: z.number().int().optional(),
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
  }),

  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return await db.getDashboardStats(ctx.user.id);
    }),
    recentActivity: protectedProcedure.query(async () => {
      return await db.getRecentActivity();
    }),
  }),

  expenses: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getExpenses(ctx.user.id);
    }),
    create: protectedProcedure.input(expenseSchema).mutation(async ({ ctx, input }) => {
      return await db.createExpense({
        id: nanoid(),
        ...input,
        ownerId: ctx.user.id,
      });
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
        return await db.updateExpense(input.id, {
          isPaid: true,
          paidDate: input.paidDate,
        });
      }),
  }),

  repairs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getRepairs(ctx.user.id);
    }),
    create: protectedProcedure.input(repairSchema).mutation(async ({ ctx, input }) => {
      return await db.createRepair({
        id: nanoid(),
        ...input,
        ownerId: ctx.user.id,
      });
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
      return await db.getUpgrades(ctx.user.id);
    }),
    create: protectedProcedure.input(upgradeSchema).mutation(async ({ ctx, input }) => {
      return await db.createUpgrade({
        id: nanoid(),
        ...input,
        ownerId: ctx.user.id,
      });
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
      return await db.getLoans(ctx.user.id);
    }),
    create: protectedProcedure.input(loanSchema).mutation(async ({ ctx, input }) => {
      return await db.createLoan({
        id: nanoid(),
        ...input,
        ownerId: ctx.user.id,
      });
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
      .input(
        z.object({
          loanId: z.string(),
          amount: z.number().int().positive(),
          date: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const loans = await db.getLoans(ctx.user.id);
        const targetLoan = loans.find((l) => l.id === input.loanId);
        if (!targetLoan) throw new Error("Loan not found");

        const updatedRepayments = [
          ...(targetLoan.repayments || []),
          { date: input.date, amount: input.amount, ownerId: ctx.user.id },
        ];

        return await db.updateLoan(input.loanId, {
          repayments: updatedRepayments,
        });
      }),
  }),

  wishlist: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getWishlistItems(ctx.user.id);
    }),
    create: protectedProcedure.input(wishlistSchema).mutation(async ({ ctx, input }) => {
      return await db.createWishlistItem({
        id: nanoid(),
        ...input,
        ownerId: ctx.user.id,
      });
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
      return await db.getPurchaseCosts(ctx.user.id);
    }),
    create: protectedProcedure.input(purchaseCostSchema).mutation(async ({ ctx, input }) => {
      return await db.createPurchaseCost({
        id: nanoid(),
        ...input,
        ownerId: ctx.user.id,
      });
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
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        return await db.getCalendarEvents(input.startDate, input.endDate);
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
        return await db.createCalendarEvent({
          id: nanoid(),
          ...input,
          createdById: ctx.user.id,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await db.deleteCalendarEvent(input.id);
      }),
  }),

  property: router({
    get: protectedProcedure.query(async () => {
      return await db.getProperty();
    }),
    update: protectedProcedure.input(propertySchema).mutation(async ({ input }) => {
      return await db.updateProperty(input);
    }),
  }),
});

export type AppRouter = typeof appRouter;

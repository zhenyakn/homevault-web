import { relations } from "drizzle-orm";
import {
  users,
  expenses,
  repairs,
  upgrades,
  loans,
  wishlistItems,
  purchaseCosts,
  calendarEvents,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  expenses:      many(expenses),
  repairs:       many(repairs),
  upgrades:      many(upgrades),
  loans:         many(loans),
  wishlistItems: many(wishlistItems),
  purchaseCosts: many(purchaseCosts),
  calendarEvents: many(calendarEvents, { relationName: "createdBy" }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  owner: one(users, { fields: [expenses.ownerId], references: [users.id] }),
}));

export const repairsRelations = relations(repairs, ({ one }) => ({
  owner: one(users, { fields: [repairs.ownerId], references: [users.id] }),
}));

export const upgradesRelations = relations(upgrades, ({ one }) => ({
  owner: one(users, { fields: [upgrades.ownerId], references: [users.id] }),
}));

export const loansRelations = relations(loans, ({ one }) => ({
  owner: one(users, { fields: [loans.ownerId], references: [users.id] }),
}));

export const wishlistRelations = relations(wishlistItems, ({ one }) => ({
  owner: one(users, { fields: [wishlistItems.ownerId], references: [users.id] }),
}));

export const purchaseCostsRelations = relations(purchaseCosts, ({ one }) => ({
  owner: one(users, { fields: [purchaseCosts.ownerId], references: [users.id] }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  createdBy: one(users, {
    fields: [calendarEvents.createdById],
    references: [users.id],
    relationName: "createdBy",
  }),
}));

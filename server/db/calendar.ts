import { eq, gte, lte, and } from "drizzle-orm";
import { calendarEvents, type CalendarEvent } from "../../drizzle/schema";
import { getDb } from "./client";

export async function getCalendarEvents(
  propertyId: number,
  startDate?: string,
  endDate?: string
) {
  const db = await getDb();
  return await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.propertyId, propertyId),
        startDate ? gte(calendarEvents.date, startDate) : undefined,
        endDate ? lte(calendarEvents.date, endDate) : undefined
      )
    )
    .orderBy(calendarEvents.date);
}

export async function createCalendarEvent(
  data: typeof calendarEvents.$inferInsert
) {
  const db = await getDb();
  await db.insert(calendarEvents).values(data);
  return data;
}

export async function updateCalendarEvent(
  id: string,
  tenantId: number,
  data: Partial<CalendarEvent>
) {
  const db = await getDb();
  await db
    .update(calendarEvents)
    .set(data)
    .where(
      and(eq(calendarEvents.id, id), eq(calendarEvents.tenantId, tenantId))
    );
  return data;
}

export async function deleteCalendarEvent(id: string, tenantId: number) {
  const db = await getDb();
  await db
    .delete(calendarEvents)
    .where(
      and(eq(calendarEvents.id, id), eq(calendarEvents.tenantId, tenantId))
    );
  return true;
}

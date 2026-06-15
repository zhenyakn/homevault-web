import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlignLeft,
  CalendarDays,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import {
  HVCard,
  MetricCard,
  StatusPill,
  UpcomingEventItem,
  HVPageHeader,
  type StatusTone,
} from "@/components/homevault";

type EventType = "Expense" | "Repair" | "Upgrade" | "Loan" | "Other";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  category: string | null;
  notes?: string | null;
  [key: string]: any;
}

// Calm dot colours drawn from the HomeVault palette.
const EVENT_DOT: Record<string, string> = {
  Payment: "bg-hv-green",
  Loan: "bg-hv-blue",
  Maintenance: "bg-hv-red",
  Renovation: "bg-hv-accent",
  Other: "bg-hv-muted-soft",
};

const EVENT_PILL_TONE: Record<string, StatusTone> = {
  Payment: "success",
  Loan: "info",
  Maintenance: "danger",
  Renovation: "gold",
  Other: "neutral",
};

const EVENT_TYPES: EventType[] = [
  "Expense",
  "Repair",
  "Upgrade",
  "Loan",
  "Other",
];

const CATEGORY_TO_EVENT_TYPE: Record<string, EventType> = {
  Payment: "Expense",
  Loan: "Loan",
  Maintenance: "Repair",
  Renovation: "Upgrade",
  Inspection: "Other",
  Legal: "Other",
  Other: "Other",
};

export default function HVCalendar() {
  const { t, i18n } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDayDialogOpen, setIsDayDialogOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [eventType, setEventType] = useState<EventType>("Other");
  const [notes, setNotes] = useState("");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startDate = new Date(year, month, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

  const {
    data: events = [],
    isLoading,
    refetch,
  } = trpc.calendar.list.useQuery({ startDate, endDate });

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: () => {
      toast.success(t("calendar.eventCreated"));
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: error => toast.error(`${error.message}`),
  });

  const updateMutation = trpc.calendar.update.useMutation({
    onSuccess: () => {
      toast.success(t("calendar.eventUpdated"));
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: error => toast.error(`${error.message}`),
  });

  const deleteMutation = trpc.calendar.delete.useMutation({
    onSuccess: () => {
      toast.success(t("calendar.eventDeleted"));
      refetch();
    },
    onError: error => toast.error(`${error.message}`),
  });

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDate("");
    setTime("");
    setEventType("Other");
    setNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        title,
        date,
        time,
        eventType,
        notes,
      });
    } else {
      createMutation.mutate({ title, date, time, eventType, notes });
    }
  };

  const handleAddForDay = () => {
    resetForm();
    if (selectedDate) setDate(selectedDate);
    setIsDayDialogOpen(false);
    setIsDialogOpen(true);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingId(event.id);
    setTitle(event.title);
    setDate(event.date);
    setTime("");
    setEventType(CATEGORY_TO_EVENT_TYPE[event.category ?? "Other"] ?? "Other");
    setNotes(event.notes ?? "");
    setIsDayDialogOpen(false);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(t("calendar.deleteConfirm"))) deleteMutation.mutate({ id });
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const dayNames = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2025, 0, 5 + i);
    return new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(
      d
    );
  });

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(event => {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    });
    return map;
  }, [events]);

  const handleDayClick = (day: number) => {
    const clickedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(clickedDate);
    setIsDayDialogOpen(true);
  };

  const selectedDateEvents = selectedDate
    ? eventsByDate[selectedDate] || []
    : [];

  const upcomingEvents = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const next30 = new Date();
    next30.setDate(next30.getDate() + 30);
    const next30Str = next30.toISOString().split("T")[0];
    return events
      .filter(e => e.date >= today && e.date <= next30Str)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Header */}
      <HVPageHeader
        title={t("calendar.title")}
        subtitle={t("homevault.calendarSubtitle")}
        hideQuickAdd
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={resetForm}
                className="h-11 rounded-full px-[18px]"
              >
                <Plus className="me-1.5 h-4 w-4" /> {t("calendar.addEvent")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId
                    ? t("calendar.editEvent")
                    : t("calendar.addNewEvent")}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">{t("calendar.eventTitle")}</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">{t("common.date")}</Label>
                    <Input
                      id="date"
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">{t("calendar.timeOptional")}</Label>
                    <Input
                      id="time"
                      type="time"
                      value={time}
                      onChange={e => setTime(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventType">{t("calendar.eventType")}</Label>
                  <Select
                    value={eventType}
                    onValueChange={val => setEventType(val as EventType)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          t("common.select") + " " + t("calendar.eventType")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map(et => (
                        <SelectItem key={et} value={et}>
                          {t(`calendar.eventTypes.${et}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">{t("common.notes")}</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  )}
                  {editingId ? t("common.update") : t("calendar.saveEvent")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:gap-3">
        <MetricCard label={t("calendar.thisMonth")} value={events.length} />
        <MetricCard
          label={t("calendar.upcoming30")}
          value={upcomingEvents.length}
          tone="blue"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Month grid */}
        <div className="lg:col-span-2">
          <HVCard flush>
            <div className="flex items-center justify-between px-3 pt-3 md:px-5 md:pt-4">
              <p className="text-[15px] font-bold tracking-tight text-hv-ink">
                {currentDate.toLocaleString(i18n.language, { month: "long" })}{" "}
                {year}
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={prevMonth}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={nextMonth}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="p-2 md:p-3">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-hv-muted-soft" />
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1 text-center">
                  {dayNames.map(day => (
                    <div
                      key={day}
                      className="py-2 text-[11px] font-semibold uppercase tracking-wide text-hv-muted-soft"
                    >
                      {day}
                    </div>
                  ))}
                  {blanks.map(blank => (
                    <div key={`blank-${blank}`} className="p-2" />
                  ))}
                  {days.map(day => {
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayEvents = eventsByDate[dateStr] || [];
                    const isToday =
                      new Date().toISOString().split("T")[0] === dateStr;
                    return (
                      <button
                        key={day}
                        onClick={() => handleDayClick(day)}
                        className={cn(
                          "flex min-h-[60px] flex-col rounded-[var(--hv-radius-sm)] border p-1.5 text-start transition-colors hover:bg-hv-surface-muted md:min-h-[72px] md:p-2",
                          isToday
                            ? "border-hv-primary bg-hv-primary-soft"
                            : "border-hv-border"
                        )}
                      >
                        <span
                          className={cn(
                            "text-[12px] font-semibold",
                            isToday ? "text-hv-primary" : "text-hv-ink"
                          )}
                        >
                          {day}
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {dayEvents.slice(0, 4).map(event => (
                            <span
                              key={event.id}
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                EVENT_DOT[event.category ?? "Other"] ??
                                  EVENT_DOT.Other
                              )}
                              title={event.title}
                            />
                          ))}
                          {dayEvents.length > 4 && (
                            <span className="text-[9px] text-hv-muted-soft">
                              +{dayEvents.length - 4}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </HVCard>
        </div>

        {/* Upcoming */}
        <div>
          <HVCard eyebrow={t("calendar.upcomingEvents")}>
            {upcomingEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-5 text-center md:py-8">
                <CalendarDays className="h-6 w-6 text-hv-muted-soft" />
                <p className="text-[12.5px] text-hv-muted">
                  {t("calendar.noUpcoming")}
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {upcomingEvents.map(event => (
                  <UpcomingEventItem
                    key={event.id}
                    date={event.date}
                    title={event.title}
                    subtitle={t(
                      `calendar.eventTypes.${event.category ?? "Other"}`,
                      {
                        defaultValue: event.category ?? "Other",
                      }
                    )}
                    onClick={() => handleEditEvent(event)}
                  />
                ))}
              </div>
            )}
          </HVCard>
        </div>
      </div>

      {/* Day dialog */}
      <Dialog open={isDayDialogOpen} onOpenChange={setIsDayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("calendar.eventsFor", {
                date: selectedDate ? formatDate(selectedDate) : "",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            {selectedDateEvents.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground">
                {t("calendar.noEventsDate")}
              </p>
            ) : (
              selectedDateEvents.map(event => (
                <div key={event.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <h4 className="font-semibold">{event.title}</h4>
                    <StatusPill
                      tone={
                        EVENT_PILL_TONE[event.category ?? "Other"] ?? "neutral"
                      }
                    >
                      {t(`calendar.eventTypes.${event.category ?? "Other"}`, {
                        defaultValue: event.category ?? "Other",
                      })}
                    </StatusPill>
                  </div>
                  {event.notes && (
                    <div className="mt-2 flex items-start text-sm">
                      <AlignLeft className="me-1 mt-0.5 h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {event.notes}
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditEvent(event)}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(event.id)}
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                </div>
              ))
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleAddForDay}
            >
              <Plus className="me-2 h-4 w-4" />
              {t("calendar.addEventForDay")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

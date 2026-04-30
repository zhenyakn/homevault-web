import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronLeft, ChevronRight, Plus, Clock, AlignLeft } from "lucide-react";
import { toast } from "sonner";

type EventType = "Expense" | "Repair" | "Upgrade" | "Loan" | "Other";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  eventType: EventType;
  notes?: string | null;
  [key: string]: any;
}

const EVENT_COLORS: Record<EventType, string> = {
  Expense: "bg-green-500",
  Repair: "bg-red-500",
  Upgrade: "bg-blue-500",
  Loan: "bg-purple-500",
  Other: "bg-gray-500",
};

const EVENT_BADGE_COLORS: Record<EventType, string> = {
  Expense: "bg-green-100 text-green-800 hover:bg-green-200",
  Repair: "bg-red-100 text-red-800 hover:bg-red-200",
  Upgrade: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  Loan: "bg-purple-100 text-purple-800 hover:bg-purple-200",
  Other: "bg-gray-100 text-gray-800 hover:bg-gray-200",
};

const EVENT_TYPES: EventType[] = ["Expense", "Repair", "Upgrade", "Loan", "Other"];

export default function Calendar() {
  const { t, i18n } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDayDialogOpen, setIsDayDialogOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [eventType, setEventType] = useState<EventType>("Other");
  const [notes, setNotes] = useState("");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startDate = new Date(year, month, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

  const { data: events = [], isLoading, refetch } = trpc.calendar.list.useQuery({ startDate, endDate });

  const createMutation = trpc.calendar.create.useMutation({
    onSuccess: () => {
      toast.success(t("calendar.eventCreated"));
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(`${error.message}`);
    },
  });

  const deleteMutation = trpc.calendar.delete.useMutation({
    onSuccess: () => {
      toast.success(t("calendar.eventDeleted"));
      refetch();
    },
    onError: (error) => {
      toast.error(`${error.message}`);
    },
  });

  const resetForm = () => {
    setTitle("");
    setDate("");
    setTime("");
    setEventType("Other");
    setNotes("");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ title, date, time, eventType, notes });
  };

  const handleDelete = (id: string) => {
    if (confirm(t("calendar.deleteConfirm"))) {
      deleteMutation.mutate({ id });
    }
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  // Locale-aware short day names: anchor on a known Sunday (Jan 5 2025)
  const dayNames = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2025, 0, 5 + i);
    return new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(d);
  });

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((event) => {
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

  const selectedDateEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  const upcomingEvents = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const next30Days = new Date();
    next30Days.setDate(next30Days.getDate() + 30);
    const next30DaysStr = next30Days.toISOString().split("T")[0];
    return events
      .filter((e) => e.date >= today && e.date <= next30DaysStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">{t("calendar.title")}</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="me-2 h-4 w-4" /> {t("calendar.addEvent")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("calendar.addNewEvent")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t("calendar.eventTitle")}</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">{t("common.date")}</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">{t("calendar.timeOptional")}</Label>
                  <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventType">{t("calendar.eventType")}</Label>
                <Select value={eventType} onValueChange={(val) => setEventType(val as EventType)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("common.select") + " " + t("calendar.eventType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>{t(`calendar.eventTypes.${et}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t("common.notes")}</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("calendar.saveEvent")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">{t("calendar.thisMonth")}</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{events.length}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">{t("calendar.upcoming30")}</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{upcomingEvents.length}</p>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-medium">
            {currentDate.toLocaleString(i18n.language, { month: "long" })} {year}
          </p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={prevMonth}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={nextMonth}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="p-3">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 text-center">
              {dayNames.map((day) => (
                <div key={day} className="font-semibold text-sm py-2">
                  {day}
                </div>
              ))}
              {blanks.map((blank) => (
                <div key={`blank-${blank}`} className="p-2 border border-transparent" />
              ))}
              {days.map((day) => {
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEvents = eventsByDate[dateStr] || [];
                const isToday = new Date().toISOString().split("T")[0] === dateStr;
                return (
                  <div
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={`min-h-[80px] p-2 border rounded-md cursor-pointer hover:bg-accent transition-colors ${
                      isToday ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className={`text-sm font-medium ${isToday ? "text-primary" : ""}`}>{day}</div>
                    <div className="mt-1 flex flex-wrap gap-1 justify-center">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className={`w-2 h-2 rounded-full ${EVENT_COLORS[event.eventType]}`}
                          title={event.title}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-3">{t("calendar.upcomingEvents")}</p>
        <div>
          {upcomingEvents.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">{t("calendar.noUpcoming")}</div>
          ) : (
            <div className="space-y-4">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-start gap-4">
                    <div className={`w-3 h-3 mt-1.5 rounded-full ${EVENT_COLORS[event.eventType]}`} />
                    <div>
                      <h4 className="font-semibold">{event.title}</h4>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{formatDate(event.date)}</span>
                        {event.time && (
                          <>
                            <span>•</span>
                            <span>{event.time}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge className={EVENT_BADGE_COLORS[event.eventType]} variant="outline">
                    {t(`calendar.eventTypes.${event.eventType}`)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDayDialogOpen} onOpenChange={setIsDayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("calendar.eventsFor", { date: selectedDate ? formatDate(selectedDate) : "" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedDateEvents.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">{t("calendar.noEventsDate")}</p>
            ) : (
              selectedDateEvents.map((event) => (
                <div key={event.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between items-start">
                    <h4 className="font-semibold">{event.title}</h4>
                    <Badge className={EVENT_BADGE_COLORS[event.eventType]} variant="outline">
                      {t(`calendar.eventTypes.${event.eventType}`)}
                    </Badge>
                  </div>
                  {event.time && (
                    <div className="text-sm text-muted-foreground flex items-center">
                      <Clock className="me-1 h-3 w-3" /> {event.time}
                    </div>
                  )}
                  {event.notes && (
                    <div className="text-sm flex items-start mt-2">
                      <AlignLeft className="me-1 h-3 w-3 mt-0.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{event.notes}</span>
                    </div>
                  )}
                  <div className="flex justify-end mt-2">
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(event.id)}>
                      {t("common.delete")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type HabitFrequency = "daily" | "weekly" | "monthly" | "none";

export type HabitProgressRecord = {
  id: string;
  habit_id: string | null;
  completed: boolean;
  location_type: "slot" | "unscheduled";
  week_start_date: string | null;
  day_index: number | null;
  block_habit_credits: Array<{ habit_id: string }>;
  block_activity_logs: Array<{ habit_id: string; completed_at: string }>;
};

type ProgressHabit = {
  id: string;
  frequency: HabitFrequency;
  parentHabitId?: string;
  doneCount: number;
};

export const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const habitPeriod = (frequency: HabitFrequency, reference: Date) => {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  if (frequency === "weekly") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (frequency === "monthly") start.setDate(1);
  const end = new Date(start);
  if (frequency === "monthly") end.setMonth(end.getMonth() + 1);
  else end.setDate(end.getDate() + (frequency === "weekly" ? 7 : 1));
  return { start: localDateKey(start), end: localDateKey(end) };
};

const completionDate = (record: HabitProgressRecord): string | null => {
  if (record.location_type === "slot" && record.week_start_date &&
      record.day_index !== null && record.day_index >= 0 && record.day_index <= 6) {
    const date = new Date(record.week_start_date + "T12:00:00");
    if (!Number.isNaN(date.getTime())) {
      date.setDate(date.getDate() + record.day_index);
      return localDateKey(date);
    }
  }
  // Unscheduled completions need a dated event, not an undated lifetime total.
  const timestamps = record.block_activity_logs
    .map((log) => new Date(log.completed_at).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? localDateKey(new Date(Math.min(...timestamps))) : null;
};

export const countHabitProgress = (
  habits: ProgressHabit[],
  records: HabitProgressRecord[],
  reference: Date
): Map<string, number> => {
  const byId = new Map(habits.map((habit) => [habit.id, habit]));
  const periods = new Map(habits.map((habit) => [habit.id, habitPeriod(habit.frequency, reference)]));
  const counted = new Map(habits.map((habit) => [habit.id, new Set<string>()]));
  for (const record of records) {
    if (!record.completed) continue;
    const date = completionDate(record);
    if (!date) continue;
    const credited = new Set<string>();
    for (const id of [record.habit_id, ...record.block_habit_credits.map((credit) => credit.habit_id)]) {
      let currentId = id;
      while (currentId && !credited.has(currentId)) {
        credited.add(currentId);
        currentId = byId.get(currentId)?.parentHabitId ?? null;
      }
    }
    for (const id of credited) {
      const period = periods.get(id);
      if (period && date >= period.start && date < period.end) counted.get(id)?.add(record.id);
    }
  }
  return new Map(habits.map((habit) => [
    habit.id,
    habit.frequency === "none" ? habit.doneCount : counted.get(habit.id)!.size,
  ]));
};

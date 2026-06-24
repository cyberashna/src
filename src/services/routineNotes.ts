export type RoutineItem = {
  id: string;
  label: string;
};

export type RoutineCategory =
  | "morning"
  | "evening"
  | "workout"
  | "reset"
  | "beauty"
  | "meals"
  | "errands"
  | "custom";

export type RoutineTab = {
  id: string;
  name: string;
  category: RoutineCategory;
  notes: string;
  items: RoutineItem[];
  completedByDate: Record<string, string[]>;
  linkedWorkoutRoutineId?: string | null;
};

export const routineCategoryOptions: Array<{ value: RoutineCategory; label: string }> = [
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "workout", label: "Workout" },
  { value: "reset", label: "Reset" },
  { value: "beauty", label: "Beauty" },
  { value: "meals", label: "Meals" },
  { value: "errands", label: "Errands" },
  { value: "custom", label: "Custom" },
];

export const createRoutineId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const inferRoutineCategory = (name = ""): RoutineCategory => {
  const normalized = name.toLowerCase();
  if (normalized.includes("morning")) return "morning";
  if (normalized.includes("evening") || normalized.includes("night")) return "evening";
  if (normalized.includes("workout") || normalized.includes("exercise") || normalized.includes("training")) return "workout";
  if (normalized.includes("reset") || normalized.includes("clean")) return "reset";
  if (normalized.includes("beauty") || normalized.includes("skin")) return "beauty";
  if (normalized.includes("meal") || normalized.includes("food")) return "meals";
  if (normalized.includes("errand")) return "errands";
  return "custom";
};

export const normalizeRoutine = (routine: Partial<RoutineTab>): RoutineTab => ({
  id: routine.id ?? createRoutineId("routine"),
  name: routine.name ?? "Routine",
  category: routine.category ?? inferRoutineCategory(routine.name),
  notes: routine.notes ?? "",
  items: Array.isArray(routine.items)
    ? routine.items.map((item) => ({
        id: item.id ?? createRoutineId("routine-item"),
        label: item.label ?? "",
      }))
    : [],
  completedByDate: routine.completedByDate ?? {},
  linkedWorkoutRoutineId: routine.linkedWorkoutRoutineId ?? null,
});

export const defaultRoutines = (): RoutineTab[] => [
  {
    id: createRoutineId("routine"),
    name: "Morning",
    category: "morning",
    notes: "Keep this visible while setting up the day.",
    items: [
      { id: createRoutineId("routine-item"), label: "Water" },
      { id: createRoutineId("routine-item"), label: "Skincare" },
      { id: createRoutineId("routine-item"), label: "Stretch or mobility" },
      { id: createRoutineId("routine-item"), label: "Review calendar" },
      { id: createRoutineId("routine-item"), label: "Breakfast" },
    ],
    completedByDate: {},
  },
  {
    id: createRoutineId("routine"),
    name: "Evening",
    category: "evening",
    notes: "Use this as a shutdown checklist before tomorrow.",
    items: [
      { id: createRoutineId("routine-item"), label: "Kitchen reset" },
      { id: createRoutineId("routine-item"), label: "Prep clothes" },
      { id: createRoutineId("routine-item"), label: "Skincare" },
      { id: createRoutineId("routine-item"), label: "Plan tomorrow" },
      { id: createRoutineId("routine-item"), label: "Read" },
    ],
    completedByDate: {},
  },
];

export const createRoutineStorageKey = (userId: string) => `routine-notes:${userId}`;

export const loadRoutineNotes = (userId: string) => {
  const storageKey = createRoutineStorageKey(userId);
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return defaultRoutines();
    const parsed = JSON.parse(saved) as Partial<RoutineTab>[];
    return Array.isArray(parsed) ? parsed.map(normalizeRoutine) : defaultRoutines();
  } catch {
    return defaultRoutines();
  }
};

export const saveRoutineNotes = (userId: string, routines: RoutineTab[]) => {
  window.localStorage.setItem(createRoutineStorageKey(userId), JSON.stringify(routines));
};

export const addRoutineItem = (userId: string, routineId: string, label: string) => {
  const routines = loadRoutineNotes(userId);
  const trimmed = label.trim();
  if (!trimmed) return routines;

  const next = routines.map((routine) =>
    routine.id === routineId
      ? {
          ...routine,
          items: [...routine.items, { id: createRoutineId("routine-item"), label: trimmed }],
        }
      : routine
  );

  saveRoutineNotes(userId, next);
  return next;
};

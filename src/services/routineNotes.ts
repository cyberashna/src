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

export const createRoutineId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const inferRoutineCategory = (text = ""): RoutineCategory => {
  const normalized = text.toLowerCase();
  if (/\b(morning|am)\b/.test(normalized)) return "morning";
  if (/\b(evening|night|pm|shutdown)\b/.test(normalized)) return "evening";
  if (
    /\b(workout|exercise|training|strength|lift|lifting|upper|lower|full body|mobility|core|cardio|glute|leg day|push|pull|squat|hinge)\b/.test(
      normalized
    )
  ) {
    return "workout";
  }
  if (/\b(reset|clean|tidy|organize|kitchen)\b/.test(normalized)) return "reset";
  if (/\b(beauty|skin|skincare|hair|makeup)\b/.test(normalized)) return "beauty";
  if (/\b(meal|food|breakfast|lunch|dinner|prep|cook|groceries)\b/.test(normalized)) return "meals";
  if (/\b(errand|appointment|pickup|drop off|return)\b/.test(normalized)) return "errands";
  return "custom";
};

export const inferRoutineCategoryFromRoutine = (routine: Partial<RoutineTab>): RoutineCategory => {
  if (routine.linkedWorkoutRoutineId) return "workout";

  const nameCategory = inferRoutineCategory(routine.name);
  if (nameCategory !== "custom") return nameCategory;

  const contentText = [
    routine.notes,
    ...(Array.isArray(routine.items) ? routine.items.map((item) => item.label) : []),
  ].join(" ");
  return inferRoutineCategory(contentText);
};

export const normalizeRoutine = (routine: Partial<RoutineTab>): RoutineTab => {
  const normalizedItems = Array.isArray(routine.items)
    ? routine.items.map((item) => ({
        id: item.id ?? createRoutineId("routine-item"),
        label: item.label ?? "",
      }))
    : [];

  const normalizedRoutine: RoutineTab = {
    id: routine.id ?? createRoutineId("routine"),
    name: routine.name ?? "Routine",
    category: "custom",
    notes: routine.notes ?? "",
    items: normalizedItems,
    completedByDate: routine.completedByDate ?? {},
    linkedWorkoutRoutineId: routine.linkedWorkoutRoutineId ?? null,
  };

  return {
    ...normalizedRoutine,
    category: inferRoutineCategoryFromRoutine(normalizedRoutine),
  };
};

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

export type RoutineItem = {
  id: string;
  label: string;
};

export type RoutineTab = {
  id: string;
  name: string;
  notes: string;
  items: RoutineItem[];
  completedByDate: Record<string, string[]>;
};

export const createRoutineId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const defaultRoutines = (): RoutineTab[] => [
  {
    id: createRoutineId("routine"),
    name: "Morning",
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
    return saved ? (JSON.parse(saved) as RoutineTab[]) : defaultRoutines();
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

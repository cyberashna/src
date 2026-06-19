import type {
  ExerciseLibraryItem,
  WorkoutBlockExercise,
  WorkoutExerciseHistoryEntry,
} from "../App";

export const categoryLabels: Record<ExerciseLibraryItem["category"], string> = {
  strength: "Strength",
  mobility: "Mobility",
  core: "Core",
  cardio: "Cardio",
  recovery: "Recovery",
};

export const bodyAreaLabels: Record<NonNullable<ExerciseLibraryItem["bodyArea"]>, string> = {
  upper: "Upper",
  lower: "Lower",
  core: "Core",
  full: "Full body",
};

export const patternLabels: Record<NonNullable<ExerciseLibraryItem["pattern"]>, string> = {
  push: "Push",
  pull: "Pull",
  squat: "Squat",
  hinge: "Hinge",
  carry: "Carry",
  rotation: "Rotation",
  brace: "Brace",
  stretch: "Stretch",
  cardio: "Cardio",
};

export const createWorkoutExerciseRow = (
  exercise: ExerciseLibraryItem,
  overrides: Partial<WorkoutBlockExercise> = {}
): WorkoutBlockExercise => ({
  id: `block-exercise-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  exerciseId: exercise.id,
  sets: exercise.defaultSets ?? null,
  reps: exercise.defaultReps ?? null,
  weight: null,
  unit: "lbs",
  duration: exercise.defaultDuration ?? null,
  notes: "",
  ...overrides,
});

export const getExerciseTags = (exercise: ExerciseLibraryItem): string[] => [
  categoryLabels[exercise.category],
  ...(exercise.bodyArea ? [bodyAreaLabels[exercise.bodyArea]] : []),
  ...(exercise.pattern ? [patternLabels[exercise.pattern]] : []),
];

export const getLatestExerciseHistory = (
  history: WorkoutExerciseHistoryEntry[] = []
): WorkoutExerciseHistoryEntry | null =>
  [...history].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  )[0] ?? null;

export const formatLastExerciseDone = (entry?: WorkoutExerciseHistoryEntry | null): string => {
  if (!entry) return "Not logged yet";

  const now = new Date();
  const then = new Date(entry.completedAt);
  const diffDays = Math.floor((now.getTime() - then.getTime()) / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 14) return `${diffDays} days ago`;
  const weeks = Math.floor(diffDays / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
};

export const formatExerciseResult = (
  entry?: Pick<WorkoutExerciseHistoryEntry, "sets" | "reps" | "weight" | "unit" | "duration"> | null
): string => {
  if (!entry) return "";

  const strengthParts = [
    entry.sets ? `${entry.sets} set${entry.sets === 1 ? "" : "s"}` : null,
    entry.reps ? `${entry.reps} reps` : null,
    entry.weight ? `${entry.weight} ${entry.unit ?? "lbs"}` : null,
  ].filter(Boolean);

  if (strengthParts.length > 0) return strengthParts.join(" x ");
  if (entry.duration) return `${entry.duration} min`;
  return "";
};

export const getProgressiveOverloadNudge = (
  exercise: ExerciseLibraryItem,
  history: WorkoutExerciseHistoryEntry[] = []
): string => {
  const latest = getLatestExerciseHistory(history);

  if (!latest) {
    if (exercise.defaultDuration) return `Start around ${exercise.defaultDuration} min.`;
    if (exercise.defaultSets || exercise.defaultReps) {
      return `Start around ${exercise.defaultSets ?? 3} x ${exercise.defaultReps ?? 8}.`;
    }
    return "Start easy and log what felt repeatable.";
  }

  if (latest.weight && latest.reps && latest.sets) {
    return `Last ${latest.weight} ${latest.unit ?? "lbs"} for ${latest.sets} x ${latest.reps}. Try ${latest.weight} ${latest.unit ?? "lbs"} for ${latest.sets} x ${latest.reps + 1}, or add a small amount of weight.`;
  }

  if (latest.reps && latest.sets) {
    return `Last ${latest.sets} x ${latest.reps}. Try ${latest.sets} x ${latest.reps + 1}.`;
  }

  if (latest.duration) {
    return `Last ${latest.duration} min. Try ${latest.duration + 2} min or a cleaner round.`;
  }

  return "Repeat the last effort with slightly better control.";
};

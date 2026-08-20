import { useMemo, useState } from "react";
import type {
  ExerciseCategory,
  ExerciseLibraryItem,
  WorkoutExerciseHistoryEntry,
  WorkoutRoutine,
  WorkoutRoutineEnergy,
  WorkoutRoutineEquipment,
  WorkoutRoutineFocus,
  WorkoutRoutineHistoryEntry,
  WorkoutRoutineTime,
} from "../App";
import {
  bodyAreaLabels,
  categoryLabels,
  formatExerciseResult,
  formatLastExerciseDone,
  getExerciseTags,
  getLatestExerciseHistory,
  getProgressiveOverloadNudge,
  patternLabels,
} from "../services/workoutLibrary";

type FocusFilter = "all" | "strength" | "upper" | "lower" | "core" | "mobility" | "cardio";
type RoutineFocusFilter = "all" | WorkoutRoutineFocus;
type RoutineEnergyFilter = "all" | WorkoutRoutineEnergy;
type RoutineTimeFilter = "all" | WorkoutRoutineTime;
type RoutineEquipmentFilter = "all" | WorkoutRoutineEquipment;

type RoutineIntentionSummary = {
  routineId: string;
  desiredCount: number;
  preferredDayIndexes: number[];
  placements: Array<{ id: string }>;
};

type Props = {
  exerciseLibrary: ExerciseLibraryItem[];
  exerciseHistory: Record<string, WorkoutExerciseHistoryEntry[]>;
  workoutRoutines: WorkoutRoutine[];
  workoutRoutineHistory?: WorkoutRoutineHistoryEntry[];
  routineIntentions?: RoutineIntentionSummary[];
  days?: string[];
  onClose: () => void;
  onCreateWorkout: (label: string, exerciseIds: string[]) => void;
  onCreateWorkoutFromRoutine: (routineId: string) => void;
  onSaveRoutine: (
    name: string,
    exerciseIds: string[],
    metadata?: Partial<Pick<WorkoutRoutine, "focus" | "energy" | "timeBudget" | "equipment">>
  ) => void;
  onDeleteRoutine: (routineId: string) => void;
  onAddExercise: (exercise: Pick<ExerciseLibraryItem, "name" | "category" | "bodyArea" | "pattern">) => void;
  onPlanRoutineIntention?: (routineId: string, desiredCount: number, preferredDayIndexes: number[]) => void;
  onClearRoutineIntention?: (routineId: string) => void;
};

const focusLabels: Record<FocusFilter, string> = {
  all: "All",
  strength: "Strength",
  upper: "Upper",
  lower: "Lower",
  core: "Core",
  mobility: "Mobility",
  cardio: "Cardio",
};

const routineFocusLabels: Record<RoutineFocusFilter, string> = {
  all: "All focus",
  full: "Full body",
  upper: "Upper",
  lower: "Lower",
  core: "Core",
  mobility: "Mobility",
  cardio: "Cardio",
};

const routineEnergyLabels: Record<RoutineEnergyFilter, string> = {
  all: "All energy",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const routineTimeLabels: Record<RoutineTimeFilter, string> = {
  all: "Any time",
  short: "Short",
  medium: "Medium",
  long: "Long",
};

const routineEquipmentLabels: Record<RoutineEquipmentFilter, string> = {
  all: "All equipment",
  any: "Any",
  none: "No equipment",
  dumbbells: "Dumbbells",
  gym: "Gym",
};

const defaultWorkoutLabel: Record<FocusFilter, string> = {
  all: "Strength training",
  strength: "Strength training",
  upper: "Upper body",
  lower: "Lower body",
  core: "Core",
  mobility: "Mobility",
  cardio: "Cardio",
};

const matchesFocus = (exercise: ExerciseLibraryItem, focus: FocusFilter) => {
  if (focus === "all") return true;
  if (focus === "strength") return exercise.category === "strength" || exercise.category === "core";
  if (focus === "upper") return exercise.bodyArea === "upper" || ["push", "pull"].includes(exercise.pattern ?? "");
  if (focus === "lower") return exercise.bodyArea === "lower" || ["squat", "hinge"].includes(exercise.pattern ?? "");
  if (focus === "core") return exercise.category === "core" || exercise.bodyArea === "core" || ["brace", "rotation", "carry"].includes(exercise.pattern ?? "");
  if (focus === "mobility") return exercise.category === "mobility" || exercise.pattern === "stretch";
  return exercise.category === "cardio" || exercise.pattern === "cardio";
};

const formatRoutineHistoryDate = (value?: string) => {
  if (!value) return "Not completed yet";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return "recently";
  }
};

const categoryOptions: ExerciseCategory[] = ["strength", "core", "mobility", "cardio", "recovery"];

export default function WorkoutLibraryPanel({
  exerciseLibrary,
  exerciseHistory,
  workoutRoutines,
  workoutRoutineHistory = [],
  routineIntentions = [],
  days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  onClose,
  onCreateWorkout,
  onCreateWorkoutFromRoutine,
  onSaveRoutine,
  onDeleteRoutine,
  onAddExercise,
  onPlanRoutineIntention,
  onClearRoutineIntention,
}: Props) {
  const [focus, setFocus] = useState<FocusFilter>("strength");
  const [routineFocusFilter, setRoutineFocusFilter] = useState<RoutineFocusFilter>("all");
  const [routineEnergyFilter, setRoutineEnergyFilter] = useState<RoutineEnergyFilter>("all");
  const [routineTimeFilter, setRoutineTimeFilter] = useState<RoutineTimeFilter>("all");
  const [routineEquipmentFilter, setRoutineEquipmentFilter] = useState<RoutineEquipmentFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [routineName, setRoutineName] = useState("");
  const [draftEquipment, setDraftEquipment] = useState<WorkoutRoutineEquipment>("any");
  const [activeExerciseChip, setActiveExerciseChip] = useState<{ routineId: string; exerciseId: string } | null>(null);
  const [planningRoutineId, setPlanningRoutineId] = useState<string | null>(null);
  const [routineIntentionCount, setRoutineIntentionCount] = useState(2);
  const [routineIntentionDayIndexes, setRoutineIntentionDayIndexes] = useState<number[]>([]);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newCategory, setNewCategory] = useState<ExerciseCategory>("strength");
  const [newBodyArea, setNewBodyArea] = useState<ExerciseLibraryItem["bodyArea"] | "">("");
  const [newPattern, setNewPattern] = useState<ExerciseLibraryItem["pattern"] | "">("");

  const getRoutineExercises = (routine: WorkoutRoutine) =>
    routine.exercises
      .map((row) => exerciseLibrary.find((exercise) => exercise.id === row.exerciseId))
      .filter((exercise): exercise is ExerciseLibraryItem => !!exercise);

  const estimateRoutineMinutes = (routine: WorkoutRoutine) =>
    routine.exercises.reduce((total, row) => {
      const exercise = exerciseLibrary.find((item) => item.id === row.exerciseId);
      if ((row.duration ?? exercise?.defaultDuration ?? 0) > 0) {
        return total + Math.max(3, row.duration ?? exercise?.defaultDuration ?? 0);
      }
      if ((row.sets ?? exercise?.defaultSets ?? 0) > 0) {
        return total + Math.max(5, (row.sets ?? exercise?.defaultSets ?? 0) * 3);
      }
      return total + 6;
    }, 0);

  const getRoutineProfile = (routine: WorkoutRoutine) => {
    const routineExercises = getRoutineExercises(routine);
    const countBy = (predicate: (exercise: ExerciseLibraryItem) => boolean) =>
      routineExercises.filter(predicate).length;
    const lowerCount = countBy(
      (exercise) => exercise.bodyArea === "lower" || ["squat", "hinge"].includes(exercise.pattern ?? "")
    );
    const upperCount = countBy(
      (exercise) => exercise.bodyArea === "upper" || ["push", "pull"].includes(exercise.pattern ?? "")
    );
    const coreCount = countBy(
      (exercise) =>
        exercise.category === "core" ||
        exercise.bodyArea === "core" ||
        ["brace", "rotation", "carry"].includes(exercise.pattern ?? "")
    );
    const mobilityCount = countBy((exercise) => exercise.category === "mobility" || exercise.pattern === "stretch");
    const cardioCount = countBy((exercise) => exercise.category === "cardio" || exercise.pattern === "cardio");
    const strengthCount = countBy((exercise) => exercise.category === "strength" || exercise.category === "core");
    const estimatedMinutes = estimateRoutineMinutes(routine);
    const focusValue: WorkoutRoutineFocus =
      routine.focus ??
      (mobilityCount > 0 && strengthCount === 0
        ? "mobility"
        : cardioCount > 0 && strengthCount === 0
          ? "cardio"
          : coreCount >= Math.max(lowerCount, upperCount) && coreCount > 0
            ? "core"
            : lowerCount > upperCount
              ? "lower"
              : upperCount > lowerCount
                ? "upper"
                : "full");
    const timeBudget: WorkoutRoutineTime =
      routine.timeBudget ?? (estimatedMinutes <= 20 ? "short" : estimatedMinutes <= 45 ? "medium" : "long");
    const energy: WorkoutRoutineEnergy =
      routine.energy ??
      (strengthCount >= 4 || estimatedMinutes > 45 ? "high" : strengthCount <= 1 && estimatedMinutes <= 20 ? "low" : "medium");

    return {
      focus: focusValue,
      energy,
      timeBudget,
      equipment: routine.equipment ?? "any",
      estimatedMinutes,
    };
  };

  const getRoutineHistoryMeta = (routine: WorkoutRoutine) => {
    const entries = workoutRoutineHistory
      .filter((entry) => entry.routineId === routine.id)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const latestExerciseEntries = routine.exercises
      .map((row) => getLatestExerciseHistory(exerciseHistory[row.exerciseId]))
      .filter((entry): entry is WorkoutExerciseHistoryEntry => !!entry)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const lastRoutineEntry = entries[0];
    const lastExerciseEntry = latestExerciseEntries[0];

    return {
      lastCompleted: lastRoutineEntry
        ? formatRoutineHistoryDate(lastRoutineEntry.completedAt)
        : lastExerciseEntry
          ? formatLastExerciseDone(lastExerciseEntry)
          : "Not logged yet",
      bestEffort: lastRoutineEntry?.bestEffort ?? "",
      lastNotes: lastRoutineEntry?.notes.split("\n").find(Boolean) ?? "",
      lastExercises: lastRoutineEntry?.exerciseNames.slice(0, 4) ?? [],
    };
  };

  const filteredWorkoutRoutines = useMemo(
    () =>
      workoutRoutines.filter((routine) => {
        const profile = getRoutineProfile(routine);
        const focusMatches = routineFocusFilter === "all" || profile.focus === routineFocusFilter;
        const energyMatches = routineEnergyFilter === "all" || profile.energy === routineEnergyFilter;
        const timeMatches = routineTimeFilter === "all" || profile.timeBudget === routineTimeFilter;
        const equipmentMatches =
          routineEquipmentFilter === "all" ||
          profile.equipment === "any" ||
          profile.equipment === routineEquipmentFilter;

        return focusMatches && energyMatches && timeMatches && equipmentMatches;
      }),
    [exerciseLibrary, routineEnergyFilter, routineEquipmentFilter, routineFocusFilter, routineTimeFilter, workoutRoutines]
  );

  const visibleExercises = useMemo(
    () =>
      exerciseLibrary
        .filter((exercise) => matchesFocus(exercise, focus))
        .sort((a, b) => {
          const lastA = getLatestExerciseHistory(exerciseHistory[a.id]);
          const lastB = getLatestExerciseHistory(exerciseHistory[b.id]);
          const timeA = lastA ? new Date(lastA.completedAt).getTime() : 0;
          const timeB = lastB ? new Date(lastB.completedAt).getTime() : 0;
          return timeA - timeB || a.name.localeCompare(b.name);
        }),
    [exerciseHistory, exerciseLibrary, focus]
  );

  const selectedExercises = selectedIds
    .map((id) => exerciseLibrary.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is ExerciseLibraryItem => !!exercise);

  const loadRoutineDraft = (routine: WorkoutRoutine) => {
    const routineExerciseIds = routine.exercises
      .map((row) => row.exerciseId)
      .filter((exerciseId) => exerciseLibrary.some((exercise) => exercise.id === exerciseId));
    setSelectedIds(routineExerciseIds);
    setRoutineName(routine.name);
    setDraftEquipment(routine.equipment ?? "any");
  };

  const getRoutineMeta = (routine: WorkoutRoutine) => {
    const routineExercises = getRoutineExercises(routine);
    const profile = getRoutineProfile(routine);
    const tags = Array.from(new Set(routineExercises.flatMap(getExerciseTags))).slice(0, 4);
    const historyMeta = getRoutineHistoryMeta(routine);

    return {
      exercises: routineExercises,
      names: routineExercises.map((exercise) => exercise.name).slice(0, 4),
      tags,
      profile,
      historyMeta,
    };
  };

  const toggleExercise = (exerciseId: string) => {
    setSelectedIds((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId]
    );
  };

  const toggleRoutineDay = (dayIndex: number) => {
    setRoutineIntentionDayIndexes((current) =>
      current.includes(dayIndex)
        ? current.filter((item) => item !== dayIndex)
        : [...current, dayIndex]
    );
  };

  const createWorkout = () => {
    onCreateWorkout(defaultWorkoutLabel[focus], selectedIds);
    setSelectedIds([]);
  };

  const saveRoutine = () => {
    const name = routineName.trim() || defaultWorkoutLabel[focus];
    onSaveRoutine(name, selectedIds, { equipment: draftEquipment });
    setRoutineName("");
  };

  const addExercise = () => {
    const trimmed = newExerciseName.trim();
    if (!trimmed) return;
    onAddExercise({
      name: trimmed,
      category: newCategory,
      bodyArea: newBodyArea || undefined,
      pattern: newPattern || undefined,
    });
    setNewExerciseName("");
  };

  const selectedDayLabel =
    routineIntentionDayIndexes.length === 0
      ? "Any open days"
      : routineIntentionDayIndexes.map((dayIndex) => days[dayIndex]).join(", ");

  return (
    <div className="workout-library-panel">
      <div className="workout-library-header">
        <div>
          <div className="workout-library-kicker">Workout library</div>
          <div className="workout-library-title">Build or start a workout routine</div>
        </div>
        <button type="button" className="workout-library-close" onClick={onClose} aria-label="Close workout library">
          x
        </button>
      </div>

      <div className="workout-focus-tabs">
        {(Object.keys(focusLabels) as FocusFilter[]).map((item) => (
          <button
            key={item}
            type="button"
            className={focus === item ? "active" : ""}
            onClick={() => setFocus(item)}
          >
            {focusLabels[item]}
          </button>
        ))}
      </div>

      <div className="workout-library-layout">
        <div className="workout-library-main">
          <div className="workout-library-toolbar">
            <span>{visibleExercises.length} exercise options</span>
            <button type="button" onClick={() => onCreateWorkout(defaultWorkoutLabel[focus], [])}>
              Start blank
            </button>
          </div>

          <div className="workout-library-grid">
            {visibleExercises.map((exercise) => {
              const latest = getLatestExerciseHistory(exerciseHistory[exercise.id]);
              const result = formatExerciseResult(latest);
              const selected = selectedIds.includes(exercise.id);
              return (
                <button
                  key={exercise.id}
                  type="button"
                  className={`workout-library-card ${selected ? "selected" : ""}`}
                  onClick={() => toggleExercise(exercise.id)}
                >
                  <span className={`workout-library-card-category workout-exercise-${exercise.category}`}>
                    {categoryLabels[exercise.category]}
                  </span>
                  <strong>{exercise.name}</strong>
                  <span>{getExerciseTags(exercise).join(" / ")}</span>
                  <em>
                    Last: {formatLastExerciseDone(latest)}
                    {result ? `, ${result}` : ""}
                  </em>
                  <small>{getProgressiveOverloadNudge(exercise, exerciseHistory[exercise.id])}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="workout-library-side">
          <section>
            <div className="workout-library-section-title">Saved routines</div>
            {workoutRoutines.length > 0 && (
              <div className="workout-routine-filters">
                <select value={routineFocusFilter} onChange={(event) => setRoutineFocusFilter(event.target.value as RoutineFocusFilter)}>
                  {(Object.keys(routineFocusLabels) as RoutineFocusFilter[]).map((item) => (
                    <option key={item} value={item}>
                      {routineFocusLabels[item]}
                    </option>
                  ))}
                </select>
                <select value={routineEnergyFilter} onChange={(event) => setRoutineEnergyFilter(event.target.value as RoutineEnergyFilter)}>
                  {(Object.keys(routineEnergyLabels) as RoutineEnergyFilter[]).map((item) => (
                    <option key={item} value={item}>
                      {routineEnergyLabels[item]}
                    </option>
                  ))}
                </select>
                <select value={routineTimeFilter} onChange={(event) => setRoutineTimeFilter(event.target.value as RoutineTimeFilter)}>
                  {(Object.keys(routineTimeLabels) as RoutineTimeFilter[]).map((item) => (
                    <option key={item} value={item}>
                      {routineTimeLabels[item]}
                    </option>
                  ))}
                </select>
                <select
                  value={routineEquipmentFilter}
                  onChange={(event) => setRoutineEquipmentFilter(event.target.value as RoutineEquipmentFilter)}
                >
                  {(Object.keys(routineEquipmentLabels) as RoutineEquipmentFilter[]).map((item) => (
                    <option key={item} value={item}>
                      {routineEquipmentLabels[item]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {workoutRoutines.length === 0 ? (
              <div className="workout-library-empty">Save a few exercise sets and they will appear here.</div>
            ) : filteredWorkoutRoutines.length === 0 ? (
              <div className="workout-library-empty">No routines match those filters.</div>
            ) : (
              <div className="workout-routine-list">
                {filteredWorkoutRoutines.map((routine) => {
                  const routineMeta = getRoutineMeta(routine);
                  const activeIntention = routineIntentions.find((item) => item.routineId === routine.id);
                  const activeExercise = activeExerciseChip?.routineId === routine.id
                    ? routineMeta.exercises.find((exercise) => exercise.id === activeExerciseChip.exerciseId)
                    : null;
                  const activeExerciseLatest = activeExercise
                    ? getLatestExerciseHistory(exerciseHistory[activeExercise.id])
                    : null;
                  return (
                    <div key={routine.id} className="workout-routine-card">
                      <div className="workout-routine-card-top">
                        <strong>{routine.name}</strong>
                        <span>{routine.exercises.length} exercise{routine.exercises.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="workout-routine-meta-line">
                        <em>Last: {routineMeta.historyMeta.lastCompleted}</em>
                        <em>
                          {routineTimeLabels[routineMeta.profile.timeBudget]} / {routineEnergyLabels[routineMeta.profile.energy]} / {routineEquipmentLabels[routineMeta.profile.equipment]}
                        </em>
                      </div>
                      {routineMeta.historyMeta.bestEffort && (
                        <small>Best recent: {routineMeta.historyMeta.bestEffort}</small>
                      )}
                      {routineMeta.historyMeta.lastNotes && (
                        <small>Last note: {routineMeta.historyMeta.lastNotes}</small>
                      )}
                      {routineMeta.tags.length > 0 && (
                        <div className="workout-routine-tags">
                          {routineMeta.tags.map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      )}
                      {routineMeta.exercises.length > 0 && (
                        <div className="workout-routine-exercise-chips">
                          {routineMeta.exercises.slice(0, 6).map((exercise) => (
                            <button
                              key={exercise.id}
                              type="button"
                              className={activeExerciseChip?.routineId === routine.id && activeExerciseChip.exerciseId === exercise.id ? "active" : ""}
                              onClick={() =>
                                setActiveExerciseChip((current) =>
                                  current?.routineId === routine.id && current.exerciseId === exercise.id
                                    ? null
                                    : { routineId: routine.id, exerciseId: exercise.id }
                                )
                              }
                            >
                              {exercise.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {activeExercise && (
                        <div className="workout-routine-chip-detail">
                          <strong>{activeExercise.name}</strong>
                          <span>
                            {getExerciseTags(activeExercise).join(" / ")} / Last {formatLastExerciseDone(activeExerciseLatest)}
                          </span>
                          <em>{getProgressiveOverloadNudge(activeExercise, exerciseHistory[activeExercise.id])}</em>
                        </div>
                      )}
                      {activeIntention && (
                        <div className="routine-intention-status">
                          <span>
                            {activeIntention.desiredCount}x this week, {activeIntention.placements.length} dotted
                          </span>
                          {onClearRoutineIntention && (
                            <button type="button" onClick={() => onClearRoutineIntention(routine.id)}>
                              Clear
                            </button>
                          )}
                        </div>
                      )}
                      {planningRoutineId === routine.id && (
                        <div className="routine-intention-panel">
                          <div className="routine-intention-copy">
                            <strong>Routine intention</strong>
                            <span>Place dotted options this week without making them real yet.</span>
                          </div>
                          <div className="routine-intention-chips">
                            {[1, 2, 3, 4].map((count) => (
                              <button
                                key={count}
                                type="button"
                                className={routineIntentionCount === count ? "active" : ""}
                                onClick={() => setRoutineIntentionCount(count)}
                              >
                                {count}x
                              </button>
                            ))}
                          </div>
                          <div className="routine-intention-controls">
                            <label>
                              Times
                              <input
                                type="number"
                                min={1}
                                max={14}
                                value={routineIntentionCount}
                                onChange={(event) => setRoutineIntentionCount(parseInt(event.target.value, 10) || 1)}
                              />
                            </label>
                            <details className="routine-intention-days">
                              <summary>{selectedDayLabel}</summary>
                              <div className="routine-intention-day-menu">
                                {days.map((day, dayIndex) => (
                                  <button
                                    key={day}
                                    type="button"
                                    className={routineIntentionDayIndexes.includes(dayIndex) ? "active" : ""}
                                    onClick={() => toggleRoutineDay(dayIndex)}
                                  >
                                    {day}
                                  </button>
                                ))}
                              </div>
                            </details>
                            <button
                              type="button"
                              onClick={() => {
                                onPlanRoutineIntention?.(routine.id, routineIntentionCount, routineIntentionDayIndexes);
                                setPlanningRoutineId(null);
                              }}
                              disabled={!onPlanRoutineIntention}
                            >
                              Place dotted
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="workout-routine-actions">
                        <button type="button" onClick={() => onCreateWorkoutFromRoutine(routine.id)}>
                          Start block
                        </button>
                        <button type="button" onClick={() => setPlanningRoutineId(planningRoutineId === routine.id ? null : routine.id)}>
                          Intention
                        </button>
                        <button type="button" onClick={() => loadRoutineDraft(routine)}>
                          Use as draft
                        </button>
                        <button type="button" onClick={() => onDeleteRoutine(routine.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="workout-library-section-title">Routine draft</div>
            <div className="workout-session-card">
              <span>{focusLabels[focus]}</span>
              <strong>
                {selectedExercises.length === 0
                  ? "Build a routine from options"
                  : `${selectedExercises.length} exercise${selectedExercises.length === 1 ? "" : "s"} selected`}
              </strong>
              <em>
                {selectedExercises.length === 0
                  ? "Choose exercises, use a saved routine as a draft, or start blank."
                  : "Save this as a reusable routine or start it as a workout block."}
              </em>
              {selectedExercises.length > 0 && (
                <button type="button" onClick={() => setSelectedIds([])}>
                  Clear picks
                </button>
              )}
            </div>
            {selectedExercises.length === 0 ? (
              <div className="workout-library-empty">Pick exercises or start blank.</div>
            ) : (
              <div className="workout-selected-list">
                {selectedExercises.map((exercise) => (
                  <button key={exercise.id} type="button" onClick={() => toggleExercise(exercise.id)}>
                    <span>{exercise.name}</span>
                    <em>{exercise.bodyArea ? bodyAreaLabels[exercise.bodyArea] : "Exercise"}</em>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="workout-library-primary" onClick={createWorkout}>
              Start selected block
            </button>
            <div className="workout-routine-inline-save">
              <input
                type="text"
                value={routineName}
                onChange={(event) => setRoutineName(event.target.value)}
                placeholder="Routine name..."
              />
              <select value={draftEquipment} onChange={(event) => setDraftEquipment(event.target.value as WorkoutRoutineEquipment)}>
                {(Object.keys(routineEquipmentLabels) as RoutineEquipmentFilter[])
                  .filter((item): item is WorkoutRoutineEquipment => item !== "all")
                  .map((item) => (
                    <option key={item} value={item}>
                      {routineEquipmentLabels[item]}
                    </option>
                  ))}
              </select>
              <button type="button" onClick={saveRoutine} disabled={selectedIds.length === 0}>
                Save routine
              </button>
            </div>
          </section>

          <section>
            <div className="workout-library-section-title">Add exercise</div>
            <div className="workout-add-exercise-form">
              <input
                type="text"
                value={newExerciseName}
                onChange={(event) => setNewExerciseName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addExercise();
                }}
                placeholder="Exercise name..."
              />
              <select value={newCategory} onChange={(event) => setNewCategory(event.target.value as ExerciseCategory)}>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ))}
              </select>
              <select value={newBodyArea} onChange={(event) => setNewBodyArea(event.target.value as ExerciseLibraryItem["bodyArea"] | "")}>
                <option value="">Body area</option>
                {(Object.keys(bodyAreaLabels) as NonNullable<ExerciseLibraryItem["bodyArea"]>[]).map((area) => (
                  <option key={area} value={area}>
                    {bodyAreaLabels[area]}
                  </option>
                ))}
              </select>
              <select value={newPattern} onChange={(event) => setNewPattern(event.target.value as ExerciseLibraryItem["pattern"] | "")}>
                <option value="">Pattern</option>
                {(Object.keys(patternLabels) as NonNullable<ExerciseLibraryItem["pattern"]>[]).map((pattern) => (
                  <option key={pattern} value={pattern}>
                    {patternLabels[pattern]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addExercise} disabled={!newExerciseName.trim()}>
                Add exercise
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

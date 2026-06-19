import { useMemo, useState } from "react";
import type {
  ExerciseCategory,
  ExerciseLibraryItem,
  WorkoutExerciseHistoryEntry,
  WorkoutRoutine,
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

type Props = {
  exerciseLibrary: ExerciseLibraryItem[];
  exerciseHistory: Record<string, WorkoutExerciseHistoryEntry[]>;
  workoutRoutines: WorkoutRoutine[];
  onClose: () => void;
  onCreateWorkout: (label: string, exerciseIds: string[]) => void;
  onCreateWorkoutFromRoutine: (routineId: string) => void;
  onSaveRoutine: (name: string, exerciseIds: string[]) => void;
  onDeleteRoutine: (routineId: string) => void;
  onAddExercise: (exercise: Pick<ExerciseLibraryItem, "name" | "category" | "bodyArea" | "pattern">) => void;
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

const categoryOptions: ExerciseCategory[] = ["strength", "core", "mobility", "cardio", "recovery"];

export default function WorkoutLibraryPanel({
  exerciseLibrary,
  exerciseHistory,
  workoutRoutines,
  onClose,
  onCreateWorkout,
  onCreateWorkoutFromRoutine,
  onSaveRoutine,
  onDeleteRoutine,
  onAddExercise,
}: Props) {
  const [focus, setFocus] = useState<FocusFilter>("strength");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [routineName, setRoutineName] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newCategory, setNewCategory] = useState<ExerciseCategory>("strength");
  const [newBodyArea, setNewBodyArea] = useState<ExerciseLibraryItem["bodyArea"] | "">("");
  const [newPattern, setNewPattern] = useState<ExerciseLibraryItem["pattern"] | "">("");

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

  const toggleExercise = (exerciseId: string) => {
    setSelectedIds((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId]
    );
  };

  const createWorkout = () => {
    onCreateWorkout(defaultWorkoutLabel[focus], selectedIds);
    setSelectedIds([]);
  };

  const saveRoutine = () => {
    const name = routineName.trim() || defaultWorkoutLabel[focus];
    onSaveRoutine(name, selectedIds);
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

  return (
    <div className="workout-library-panel">
      <div className="workout-library-header">
        <div>
          <div className="workout-library-kicker">Workout library</div>
          <div className="workout-library-title">Choose exercises for today</div>
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
            <span>{visibleExercises.length} options</span>
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
            <div className="workout-library-section-title">Today</div>
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
              Add to planner
            </button>
            <div className="workout-routine-inline-save">
              <input
                type="text"
                value={routineName}
                onChange={(event) => setRoutineName(event.target.value)}
                placeholder="Routine name..."
              />
              <button type="button" onClick={saveRoutine} disabled={selectedIds.length === 0}>
                Save
              </button>
            </div>
          </section>

          <section>
            <div className="workout-library-section-title">Routines</div>
            {workoutRoutines.length === 0 ? (
              <div className="workout-library-empty">Saved routines will appear here.</div>
            ) : (
              <div className="workout-routine-list">
                {workoutRoutines.map((routine) => (
                  <div key={routine.id} className="workout-routine-card">
                    <strong>{routine.name}</strong>
                    <span>{routine.exercises.length} exercise{routine.exercises.length === 1 ? "" : "s"}</span>
                    <div>
                      <button type="button" onClick={() => onCreateWorkoutFromRoutine(routine.id)}>
                        Start
                      </button>
                      <button type="button" onClick={() => onDeleteRoutine(routine.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

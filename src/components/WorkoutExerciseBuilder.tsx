import React, { useMemo, useState } from "react";
import type {
  ExerciseLibraryItem,
  WorkoutBlockExercise,
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

type WorkoutExerciseBuilderProps = {
  blockId: string;
  blockLabel: string;
  exerciseLibrary: ExerciseLibraryItem[];
  blockExercises: WorkoutBlockExercise[];
  exerciseHistory?: Record<string, WorkoutExerciseHistoryEntry[]>;
  workoutRoutines?: WorkoutRoutine[];
  workoutSubmitted?: boolean;
  onAddExercise: (blockId: string, exerciseName: string) => void;
  onUpdateExercise: (
    blockId: string,
    rowId: string,
    updates: Partial<WorkoutBlockExercise>
  ) => void;
  onDeleteExercise: (blockId: string, rowId: string) => void;
  onLoadRoutine?: (blockId: string, routineId: string) => void;
  onSaveRoutine?: (blockId: string, name: string) => void;
  onSubmitWorkout?: (blockId: string) => void;
};

type WorkoutFocus = "full" | "upper" | "lower" | "core" | "mobility" | "cardio";

type CoverageItem = {
  id: string;
  label: string;
  met: boolean;
};

const focusLabels: Record<WorkoutFocus, string> = {
  full: "Full body",
  upper: "Upper",
  lower: "Lower",
  core: "Core",
  mobility: "Mobility",
  cardio: "Cardio",
};

const getWorkoutFocus = (blockLabel: string): WorkoutFocus => {
  const label = blockLabel.toLowerCase();
  if (label.includes("mobility") || label.includes("stretch")) return "mobility";
  if (label.includes("core") || label.includes("abs")) return "core";
  if (label.includes("upper") || label.includes("push") || label.includes("pull")) return "upper";
  if (label.includes("lower") || label.includes("leg") || label.includes("glute")) return "lower";
  if (label.includes("cardio") || label.includes("walk")) return "cardio";
  return "full";
};

const exerciseScore = (exercise: ExerciseLibraryItem, focus: WorkoutFocus) => {
  if (focus === "full") return 0;
  if (exercise.category === focus) return -3;
  if (exercise.bodyArea === focus) return -2;
  if (exercise.pattern === focus) return -1;
  if (focus === "upper" && ["push", "pull"].includes(exercise.pattern ?? "")) return -1;
  if (focus === "lower" && ["squat", "hinge"].includes(exercise.pattern ?? "")) return -1;
  return 0;
};

const buildCoverageItems = (
  focus: WorkoutFocus,
  exercises: ExerciseLibraryItem[],
  rows: WorkoutBlockExercise[]
): CoverageItem[] => {
  const hasCategory = (category: ExerciseLibraryItem["category"]) =>
    exercises.some((exercise) => exercise.category === category);
  const hasBodyArea = (bodyArea: NonNullable<ExerciseLibraryItem["bodyArea"]>) =>
    exercises.some((exercise) => exercise.bodyArea === bodyArea || exercise.bodyArea === "full");
  const hasPattern = (patterns: NonNullable<ExerciseLibraryItem["pattern"]>[]) =>
    exercises.some((exercise) => exercise.pattern && patterns.includes(exercise.pattern));
  const hasDuration = rows.some((row) => (row.duration ?? 0) > 0);

  const lower = hasBodyArea("lower") || hasPattern(["squat", "hinge"]);
  const upper = hasBodyArea("upper") || hasPattern(["push", "pull"]);
  const push = hasPattern(["push"]);
  const pull = hasPattern(["pull"]);
  const squat = hasPattern(["squat"]);
  const hinge = hasPattern(["hinge"]);
  const core = hasCategory("core") || hasBodyArea("core") || hasPattern(["brace", "rotation", "carry"]);
  const mobility = hasCategory("mobility") || hasPattern(["stretch"]);
  const cardio = hasCategory("cardio") || hasPattern(["cardio"]);

  if (focus === "upper") {
    return [
      { id: "push", label: "Push", met: push },
      { id: "pull", label: "Pull", met: pull },
      { id: "upper", label: "Upper body", met: upper },
    ];
  }

  if (focus === "lower") {
    return [
      { id: "squat", label: "Squat/lunge", met: squat },
      { id: "hinge", label: "Hinge", met: hinge },
      { id: "lower", label: "Lower body", met: lower },
    ];
  }

  if (focus === "core") {
    return [
      { id: "core", label: "Core", met: core },
      { id: "brace", label: "Brace/stability", met: hasPattern(["brace", "carry"]) },
      { id: "rotation", label: "Rotation", met: hasPattern(["rotation"]) },
    ];
  }

  if (focus === "mobility") {
    return [
      { id: "mobility", label: "Mobility", met: mobility },
      { id: "stretch", label: "Stretch/drill", met: hasPattern(["stretch"]) },
      { id: "duration", label: "Duration", met: hasDuration },
    ];
  }

  if (focus === "cardio") {
    return [
      { id: "cardio", label: "Cardio", met: cardio },
      { id: "duration", label: "Duration", met: hasDuration },
    ];
  }

  return [
    { id: "lower", label: "Lower", met: lower },
    { id: "push", label: "Push", met: push },
    { id: "pull", label: "Pull", met: pull },
    { id: "core", label: "Core", met: core },
  ];
};

export const WorkoutExerciseBuilder: React.FC<WorkoutExerciseBuilderProps> = ({
  blockId,
  blockLabel,
  exerciseLibrary,
  blockExercises,
  exerciseHistory = {},
  workoutRoutines = [],
  workoutSubmitted = false,
  onAddExercise,
  onUpdateExercise,
  onDeleteExercise,
  onLoadRoutine,
  onSaveRoutine,
  onSubmitWorkout,
}) => {
  const [exerciseName, setExerciseName] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const workoutFocus = getWorkoutFocus(blockLabel);
  const datalistId = `exercise-library-${blockId}`;
  const exerciseById = new Map(exerciseLibrary.map((exercise) => [exercise.id, exercise]));
  const selectedExerciseIds = new Set(blockExercises.map((row) => row.exerciseId));
  const selectedExercises = blockExercises
    .map((row) => exerciseById.get(row.exerciseId))
    .filter((exercise): exercise is ExerciseLibraryItem => !!exercise);

  const sortedLibrary = useMemo(
    () =>
      [...exerciseLibrary].sort((a, b) => {
        const scoreDiff = exerciseScore(a, workoutFocus) - exerciseScore(b, workoutFocus);
        return scoreDiff !== 0 ? scoreDiff : a.name.localeCompare(b.name);
      }),
    [exerciseLibrary, workoutFocus]
  );
  const visibleExerciseOptions = sortedLibrary.slice(0, 10);

  const coverageItems = useMemo(
    () => buildCoverageItems(workoutFocus, selectedExercises, blockExercises),
    [blockExercises, selectedExercises, workoutFocus]
  );
  const coveredCount = coverageItems.filter((item) => item.met).length;
  const isCoverageComplete = coverageItems.length > 0 && coveredCount === coverageItems.length;

  const addExercise = () => {
    const trimmed = exerciseName.trim();
    if (!trimmed) return;
    onAddExercise(blockId, trimmed);
    setExerciseName("");
  };

  const loadRoutine = () => {
    const routineId = selectedRoutineId || workoutRoutines[0]?.id;
    if (!routineId) return;
    onLoadRoutine?.(blockId, routineId);
  };

  const saveRoutine = () => {
    const trimmed = routineName.trim() || blockLabel.replace(/^Habit:\s*/i, "");
    onSaveRoutine?.(blockId, trimmed);
    setRoutineName("");
  };

  return (
    <div className="workout-exercise-builder">
      <div className={`workout-coverage-panel ${isCoverageComplete ? "complete" : ""}`}>
        <div className="workout-coverage-header">
          <span>{focusLabels[workoutFocus]} coverage</span>
          <span>{coveredCount}/{coverageItems.length}</span>
        </div>
        <div className="workout-coverage-chips">
          {coverageItems.map((item) => (
            <span
              key={item.id}
              className={`workout-coverage-chip ${item.met ? "met" : "missing"}`}
            >
              {item.met ? "✓" : "+"} {item.label}
            </span>
          ))}
        </div>
      </div>

      {(workoutRoutines.length > 0 || blockExercises.length > 0) && (
        <div className="workout-routine-tools">
          {workoutRoutines.length > 0 && (
            <div className="workout-routine-load">
              <select
                value={selectedRoutineId || workoutRoutines[0]?.id || ""}
                onChange={(event) => setSelectedRoutineId(event.target.value)}
              >
                {workoutRoutines.map((routine) => (
                  <option key={routine.id} value={routine.id}>
                    {routine.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={loadRoutine}>
                Load
              </button>
            </div>
          )}
          {blockExercises.length > 0 && (
            <div className="workout-routine-save">
              <input
                type="text"
                value={routineName}
                onChange={(event) => setRoutineName(event.target.value)}
                placeholder="Routine name..."
              />
              <button type="button" onClick={saveRoutine}>
                Save routine
              </button>
            </div>
          )}
        </div>
      )}

      <div className="workout-library-shelf">
        <div className="workout-library-shelf-header">
          <span>Exercise options</span>
          <em>{focusLabels[workoutFocus]}</em>
        </div>
        <div className="workout-library-option-grid">
          {visibleExerciseOptions.map((exercise) => {
            const latest = getLatestExerciseHistory(exerciseHistory[exercise.id]);
            const result = formatExerciseResult(latest);
            const alreadyAdded = selectedExerciseIds.has(exercise.id);
            return (
              <button
                key={exercise.id}
                type="button"
                className={`workout-library-option ${alreadyAdded ? "selected" : ""}`}
                onClick={() => onAddExercise(blockId, exercise.name)}
                title={getProgressiveOverloadNudge(exercise, exerciseHistory[exercise.id])}
              >
                <strong>{exercise.name}</strong>
                <span>{getExerciseTags(exercise).join(" / ")}</span>
                <em>
                  {formatLastExerciseDone(latest)}
                  {result ? `, ${result}` : ""}
                </em>
              </button>
            );
          })}
        </div>
      </div>

      {blockExercises.length > 0 && (
        <div className="workout-exercise-list">
          {blockExercises.map((row) => {
            const exercise = exerciseById.get(row.exerciseId);
            const latest = exercise ? getLatestExerciseHistory(exerciseHistory[exercise.id]) : null;
            return (
              <div key={row.id} className="workout-exercise-row">
                <div className="workout-exercise-main">
                  <select
                    className="workout-exercise-select"
                    value={row.exerciseId}
                    onChange={(event) =>
                      onUpdateExercise(blockId, row.id, { exerciseId: event.target.value })
                    }
                  >
                    {sortedLibrary.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {exercise && (
                    <span className={`workout-exercise-tag workout-exercise-${exercise.category}`}>
                      {categoryLabels[exercise.category]}
                    </span>
                  )}
                  <button
                    type="button"
                    className="workout-exercise-delete"
                    onClick={() => onDeleteExercise(blockId, row.id)}
                    title="Remove exercise"
                  >
                    x
                  </button>
                </div>
                {exercise && (
                  <div className="workout-exercise-context">
                    <span>
                      {[
                        exercise.bodyArea ? bodyAreaLabels[exercise.bodyArea] : null,
                        exercise.pattern ? patternLabels[exercise.pattern] : null,
                        formatLastExerciseDone(latest),
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </span>
                    <em>{getProgressiveOverloadNudge(exercise, exerciseHistory[exercise.id])}</em>
                  </div>
                )}
                <div className="workout-exercise-fields">
                  <input
                    type="number"
                    min="0"
                    value={row.sets ?? ""}
                    onChange={(event) =>
                      onUpdateExercise(blockId, row.id, {
                        sets: event.target.value ? parseInt(event.target.value, 10) : null,
                      })
                    }
                    placeholder="Sets"
                  />
                  <input
                    type="number"
                    min="0"
                    value={row.reps ?? ""}
                    onChange={(event) =>
                      onUpdateExercise(blockId, row.id, {
                        reps: event.target.value ? parseInt(event.target.value, 10) : null,
                      })
                    }
                    placeholder="Reps"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={row.weight ?? ""}
                    onChange={(event) =>
                      onUpdateExercise(blockId, row.id, {
                        weight: event.target.value ? parseFloat(event.target.value) : null,
                      })
                    }
                    placeholder="Weight"
                  />
                  <select
                    value={row.unit ?? "lbs"}
                    onChange={(event) =>
                      onUpdateExercise(blockId, row.id, {
                        unit: event.target.value as WorkoutBlockExercise["unit"],
                      })
                    }
                  >
                    <option value="lbs">lbs</option>
                    <option value="kg">kg</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={row.duration ?? ""}
                    onChange={(event) =>
                      onUpdateExercise(blockId, row.id, {
                        duration: event.target.value ? parseInt(event.target.value, 10) : null,
                      })
                    }
                    placeholder="Min"
                  />
                </div>
                <input
                  className="workout-exercise-note"
                  type="text"
                  value={row.notes ?? ""}
                  onChange={(event) => onUpdateExercise(blockId, row.id, { notes: event.target.value })}
                  placeholder="Exercise note or cue..."
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="workout-exercise-add-row">
        <input
          type="text"
          value={exerciseName}
          list={datalistId}
          onChange={(event) => setExerciseName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addExercise();
            if (event.key === "Escape") setExerciseName("");
          }}
          placeholder="Choose or type an exercise..."
        />
        <datalist id={datalistId}>
          {sortedLibrary.map((exercise) => (
            <option key={exercise.id} value={exercise.name} />
          ))}
        </datalist>
        <button type="button" onClick={addExercise} disabled={!exerciseName.trim()}>
          Add
        </button>
      </div>

      {blockExercises.length > 0 && onSubmitWorkout && (
        <div className="workout-submit-row">
          <button type="button" onClick={() => onSubmitWorkout(blockId)} disabled={workoutSubmitted}>
            {workoutSubmitted ? "Workout logged" : "Log workout"}
          </button>
          <span>Logging updates last-done dates and future nudges.</span>
        </div>
      )}
    </div>
  );
};

export default WorkoutExerciseBuilder;

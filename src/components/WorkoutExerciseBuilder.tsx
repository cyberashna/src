import React, { useMemo, useState } from "react";
import type {
  ExerciseLibraryItem,
  WorkoutBlockExercise,
  WorkoutExerciseHistoryEntry,
  WorkoutRoutine,
  WorkoutRoutineHistoryEntry,
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
  workoutRoutineHistory?: WorkoutRoutineHistoryEntry[];
  linkedWorkoutRoutineId?: string | null;
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
  onSaveRoutineAsNew?: (blockId: string, name: string) => void;
  onUpdateRoutine?: (blockId: string, routineId: string) => void;
  onAttachRoutine?: (
    blockId: string,
    routineId: string,
    options?: { loadExercises?: boolean }
  ) => void;
  onDetachRoutine?: (blockId: string) => void;
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

const formatRoutineHistoryDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return "recently";
  }
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
  workoutRoutineHistory = [],
  linkedWorkoutRoutineId,
  workoutSubmitted = false,
  onAddExercise,
  onUpdateExercise,
  onDeleteExercise,
  onLoadRoutine,
  onSaveRoutine,
  onSaveRoutineAsNew,
  onUpdateRoutine,
  onAttachRoutine,
  onDetachRoutine,
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
  const linkedRoutine = workoutRoutines.find((routine) => routine.id === linkedWorkoutRoutineId) ?? null;
  const linkedRoutineLastHistory = linkedRoutine
    ? workoutRoutineHistory
        .filter((entry) => entry.routineId === linkedRoutine.id)
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
    : null;
  const selectedRoutineForAction = selectedRoutineId || linkedRoutine?.id || workoutRoutines[0]?.id || "";
  const getRoutineMeta = (routine: WorkoutRoutine) => {
    const routineExercises = routine.exercises
      .map((row) => exerciseById.get(row.exerciseId))
      .filter((exercise): exercise is ExerciseLibraryItem => !!exercise);
    const tags = Array.from(new Set(routineExercises.flatMap(getExerciseTags))).slice(0, 4);

    return {
      names: routineExercises.map((exercise) => exercise.name).slice(0, 4),
      tags,
    };
  };

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
    const routineId = selectedRoutineForAction;
    if (!routineId) return;
    onLoadRoutine?.(blockId, routineId);
  };

  const attachRoutine = (loadExercises = false) => {
    if (!selectedRoutineForAction) return;
    onAttachRoutine?.(blockId, selectedRoutineForAction, { loadExercises });
  };

  const saveRoutine = () => {
    const trimmed = routineName.trim() || blockLabel.replace(/^Habit:\s*/i, "");
    onSaveRoutine?.(blockId, trimmed);
    setRoutineName("");
  };

  const updateRoutine = () => {
    if (!linkedRoutine) return;
    onUpdateRoutine?.(blockId, linkedRoutine.id);
  };

  const saveRoutineAsNew = () => {
    const fallback = linkedRoutine
      ? `${linkedRoutine.name} variation`
      : blockLabel.replace(/^Habit:\s*/i, "");
    onSaveRoutineAsNew?.(blockId, routineName.trim() || fallback);
    setRoutineName("");
  };

  return (
    <div className="workout-exercise-builder">
      {workoutRoutines.length > 0 && (
        <div className={`workout-routine-association ${linkedRoutine ? "linked" : ""}`}>
          <div className="workout-routine-association-header">
            <span>Associated routine</span>
            <em>{linkedRoutine ? linkedRoutine.name : "None yet"}</em>
          </div>
          {linkedRoutineLastHistory && (
            <div className="workout-routine-last">
              <span>Last completed {formatRoutineHistoryDate(linkedRoutineLastHistory.completedAt)}</span>
              {linkedRoutineLastHistory.bestEffort && <em>{linkedRoutineLastHistory.bestEffort}</em>}
              {linkedRoutineLastHistory.notes && <small>{linkedRoutineLastHistory.notes}</small>}
            </div>
          )}
          <div className="workout-routine-association-controls">
            <select
              value={selectedRoutineForAction}
              onChange={(event) => setSelectedRoutineId(event.target.value)}
              aria-label="Choose saved workout routine"
            >
              {workoutRoutines.map((routine) => (
                <option key={routine.id} value={routine.id}>
                  {routine.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => attachRoutine(false)} disabled={!onAttachRoutine}>
              Attach
            </button>
            <button type="button" onClick={() => attachRoutine(true)} disabled={!onAttachRoutine}>
              Attach + load
            </button>
            {linkedRoutine && (
              <button
                type="button"
                className="secondary"
                onClick={() => onDetachRoutine?.(blockId)}
                disabled={!onDetachRoutine}
              >
                Detach
              </button>
            )}
          </div>
        </div>
      )}

      {workoutRoutines.length > 0 && (
        <div className="workout-routine-starter">
          <div className="workout-routine-starter-header">
            <span>Start from routine</span>
            <em>{workoutRoutines.length} saved</em>
          </div>
          <div className="workout-routine-choice-grid">
            {workoutRoutines.slice(0, 4).map((routine) => {
              const routineMeta = getRoutineMeta(routine);
              return (
                <button
                  key={routine.id}
                  type="button"
                  className="workout-routine-choice"
                  onClick={() => onLoadRoutine?.(blockId, routine.id)}
                >
                  <strong>{routine.name}</strong>
                  <span>{routine.exercises.length} exercise{routine.exercises.length === 1 ? "" : "s"}</span>
                  {routineMeta.tags.length > 0 && <em>{routineMeta.tags.join(" / ")}</em>}
                  {routineMeta.names.length > 0 && <small>{routineMeta.names.join(", ")}</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
          {blockExercises.length > 0 && !linkedRoutine && (
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

      {blockExercises.length > 0 && linkedRoutine && (
        <div className="workout-routine-saveback">
          <div className="workout-routine-saveback-copy">
            <span>Save today back</span>
            <em>{linkedRoutine.name}</em>
          </div>
          <button type="button" onClick={updateRoutine} disabled={!onUpdateRoutine}>
            Update routine
          </button>
          <div className="workout-routine-saveback-new">
            <input
              type="text"
              value={routineName}
              onChange={(event) => setRoutineName(event.target.value)}
              placeholder={`${linkedRoutine.name} variation`}
            />
            <button type="button" onClick={saveRoutineAsNew} disabled={!onSaveRoutineAsNew}>
              Save as new
            </button>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => onDetachRoutine?.(blockId)}
            disabled={!onDetachRoutine}
          >
            Keep today only
          </button>
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
      {blockExercises.length === 0 && (
        <div className="workout-exercise-empty">No exercises added yet.</div>
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

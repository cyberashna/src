import React, { useMemo, useState } from "react";
import type { ExerciseLibraryItem, WorkoutBlockExercise } from "../App";

type WorkoutExerciseBuilderProps = {
  blockId: string;
  blockLabel: string;
  exerciseLibrary: ExerciseLibraryItem[];
  blockExercises: WorkoutBlockExercise[];
  onAddExercise: (blockId: string, exerciseName: string) => void;
  onUpdateExercise: (
    blockId: string,
    rowId: string,
    updates: Partial<WorkoutBlockExercise>
  ) => void;
  onDeleteExercise: (blockId: string, rowId: string) => void;
};

const categoryLabels: Record<ExerciseLibraryItem["category"], string> = {
  strength: "Strength",
  mobility: "Mobility",
  core: "Core",
  cardio: "Cardio",
  recovery: "Recovery",
};

const getWorkoutFocus = (blockLabel: string) => {
  const label = blockLabel.toLowerCase();
  if (label.includes("mobility") || label.includes("stretch")) return "mobility";
  if (label.includes("core") || label.includes("abs")) return "core";
  if (label.includes("upper") || label.includes("push") || label.includes("pull")) return "upper";
  if (label.includes("lower") || label.includes("leg") || label.includes("glute")) return "lower";
  if (label.includes("cardio") || label.includes("walk")) return "cardio";
  return "full";
};

const exerciseScore = (exercise: ExerciseLibraryItem, focus: string) => {
  if (focus === "full") return 0;
  if (exercise.category === focus) return -3;
  if (exercise.bodyArea === focus) return -2;
  if (exercise.pattern === focus) return -1;
  if (focus === "upper" && ["push", "pull"].includes(exercise.pattern ?? "")) return -1;
  if (focus === "lower" && ["squat", "hinge"].includes(exercise.pattern ?? "")) return -1;
  return 0;
};

export const WorkoutExerciseBuilder: React.FC<WorkoutExerciseBuilderProps> = ({
  blockId,
  blockLabel,
  exerciseLibrary,
  blockExercises,
  onAddExercise,
  onUpdateExercise,
  onDeleteExercise,
}) => {
  const [exerciseName, setExerciseName] = useState("");
  const workoutFocus = getWorkoutFocus(blockLabel);
  const datalistId = `exercise-library-${blockId}`;
  const exerciseById = new Map(exerciseLibrary.map((exercise) => [exercise.id, exercise]));

  const sortedLibrary = useMemo(
    () =>
      [...exerciseLibrary].sort((a, b) => {
        const scoreDiff = exerciseScore(a, workoutFocus) - exerciseScore(b, workoutFocus);
        return scoreDiff !== 0 ? scoreDiff : a.name.localeCompare(b.name);
      }),
    [exerciseLibrary, workoutFocus]
  );

  const addExercise = () => {
    const trimmed = exerciseName.trim();
    if (!trimmed) return;
    onAddExercise(blockId, trimmed);
    setExerciseName("");
  };

  return (
    <div className="workout-exercise-builder">
      {blockExercises.length > 0 && (
        <div className="workout-exercise-list">
          {blockExercises.map((row) => {
            const exercise = exerciseById.get(row.exerciseId);
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
    </div>
  );
};

export default WorkoutExerciseBuilder;

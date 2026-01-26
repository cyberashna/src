import React, { useState, useEffect } from "react";
import type { WorkoutData } from "../App";

type WorkoutInputsProps = {
  workoutData?: WorkoutData;
  onUpdate: (data: WorkoutData) => void;
};

export const WorkoutInputs: React.FC<WorkoutInputsProps> = ({
  workoutData,
  onUpdate,
}) => {
  const [sets, setSets] = useState<string>(
    workoutData?.sets?.toString() ?? ""
  );
  const [reps, setReps] = useState<string>(
    workoutData?.reps?.toString() ?? ""
  );
  const [weight, setWeight] = useState<string>(
    workoutData?.weight?.toString() ?? ""
  );
  const [unit, setUnit] = useState<"lbs" | "kg">(
    workoutData?.unit ?? "lbs"
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const setsNum = sets ? parseInt(sets, 10) : null;
      const repsNum = reps ? parseInt(reps, 10) : null;
      const weightNum = weight ? parseFloat(weight) : null;

      if (
        setsNum !== workoutData?.sets ||
        repsNum !== workoutData?.reps ||
        weightNum !== workoutData?.weight ||
        unit !== workoutData?.unit
      ) {
        onUpdate({
          sets: setsNum,
          reps: repsNum,
          weight: weightNum,
          unit: weightNum !== null ? unit : null,
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [sets, reps, weight, unit]);

  return (
    <div
      className="workout-inputs"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        gap: "4px",
        marginTop: "4px",
        fontSize: "11px",
      }}
    >
      <input
        type="number"
        placeholder="Sets"
        value={sets}
        onChange={(e) => setSets(e.target.value)}
        min="0"
        style={{
          width: "45px",
          padding: "2px 4px",
          fontSize: "11px",
          border: "1px solid #ddd",
          borderRadius: "3px",
        }}
      />
      <input
        type="number"
        placeholder="Reps"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        min="0"
        style={{
          width: "45px",
          padding: "2px 4px",
          fontSize: "11px",
          border: "1px solid #ddd",
          borderRadius: "3px",
        }}
      />
      <input
        type="number"
        placeholder="Weight"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        min="0"
        step="0.5"
        style={{
          width: "50px",
          padding: "2px 4px",
          fontSize: "11px",
          border: "1px solid #ddd",
          borderRadius: "3px",
        }}
      />
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value as "lbs" | "kg")}
        style={{
          width: "45px",
          padding: "2px 2px",
          fontSize: "11px",
          border: "1px solid #ddd",
          borderRadius: "3px",
        }}
      >
        <option value="lbs">lbs</option>
        <option value="kg">kg</option>
      </select>
    </div>
  );
};

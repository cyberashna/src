import React, { useState, useEffect } from "react";
import type { WorkoutData } from "../App";

type WorkoutInputsProps = {
  workoutData?: WorkoutData;
  workoutSubmitted?: boolean;
  onUpdate: (data: WorkoutData) => void;
  onSubmit: () => void;
};

export const WorkoutInputs: React.FC<WorkoutInputsProps> = ({
  workoutData,
  workoutSubmitted = false,
  onUpdate,
  onSubmit,
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
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setSets(workoutData?.sets?.toString() ?? "");
    setReps(workoutData?.reps?.toString() ?? "");
    setWeight(workoutData?.weight?.toString() ?? "");
    setUnit(workoutData?.unit ?? "lbs");
  }, [workoutData]);

  const handleSubmit = () => {
    const setsNum = sets ? parseInt(sets, 10) : null;
    const repsNum = reps ? parseInt(reps, 10) : null;
    const weightNum = weight ? parseFloat(weight) : null;

    onUpdate({
      sets: setsNum,
      reps: repsNum,
      weight: weightNum,
      unit: weightNum !== null ? unit : null,
    });

    onSubmit();
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  if (workoutSubmitted && !isEditing) {
    return (
      <div
        className="workout-submitted"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "4px",
          fontSize: "11px",
          color: "#28a745",
          fontWeight: 500,
        }}
      >
        <span>✓ {workoutData?.sets} sets × {workoutData?.reps} reps @ {workoutData?.weight} {workoutData?.unit}</span>
        <button
          onClick={handleEdit}
          style={{
            padding: "1px 6px",
            fontSize: "10px",
            border: "1px solid #ddd",
            borderRadius: "3px",
            background: "white",
            cursor: "pointer",
            color: "#666",
          }}
        >
          Edit
        </button>
      </div>
    );
  }

  const hasData = sets || reps || weight;

  return (
    <div
      className="workout-inputs"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        flexWrap: "wrap",
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
      <button
        onClick={handleSubmit}
        disabled={!hasData}
        style={{
          padding: "2px 8px",
          fontSize: "11px",
          border: "1px solid #28a745",
          borderRadius: "3px",
          background: hasData ? "#28a745" : "#e0e0e0",
          color: hasData ? "white" : "#999",
          cursor: hasData ? "pointer" : "not-allowed",
          fontWeight: 500,
        }}
      >
        Submit
      </button>
    </div>
  );
};

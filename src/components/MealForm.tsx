import React, { useState } from "react";
import { database, Meal } from "../services/database";

type MealType = "breakfast" | "lunch" | "dinner";

type Props = {
  userId: string;
  themeId: string;
  onSaved: (meal: Meal) => void;
  onCancel: () => void;
};

const MealForm: React.FC<Props> = ({ userId, themeId, onSaved, onCancel }) => {
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [showNutrition, setShowNutrition] = useState(false);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [vitaminsNotes, setVitaminsNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a meal name.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const meal = await database.meals.create(
        userId,
        themeId,
        trimmed,
        mealType,
        calories ? parseInt(calories, 10) : null,
        protein ? parseFloat(protein) : null,
        carbs ? parseFloat(carbs) : null,
        fat ? parseFloat(fat) : null,
        vitaminsNotes.trim() || null
      );
      onSaved(meal);
    } catch {
      setError("Failed to save meal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="add-habit-form">
      <label className="small-label">Meal name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Oatmeal with berries"
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
      />

      <label className="small-label">Meal type</label>
      <select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
        <option value="breakfast">Breakfast</option>
        <option value="lunch">Lunch</option>
        <option value="dinner">Dinner</option>
      </select>

      <div className="nutrition-collapsible">
        <button
          type="button"
          className="nutrition-toggle-btn"
          onClick={() => setShowNutrition((v) => !v)}
        >
          <span style={{ transform: showNutrition ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.2s" }}>▶</span>
          Nutrition (optional)
        </button>

        {showNutrition && (
          <div className="nutrition-fields">
            <div>
              <label className="small-label">Calories</label>
              <input
                type="number"
                min={0}
                placeholder="kcal"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
              />
            </div>
            <div>
              <label className="small-label">Protein (g)</label>
              <input
                type="number"
                min={0}
                step="0.1"
                placeholder="g"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
            </div>
            <div>
              <label className="small-label">Carbs (g)</label>
              <input
                type="number"
                min={0}
                step="0.1"
                placeholder="g"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
              />
            </div>
            <div>
              <label className="small-label">Fat (g)</label>
              <input
                type="number"
                min={0}
                step="0.1"
                placeholder="g"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label className="small-label">Vitamins / Notes</label>
              <textarea
                placeholder="e.g. High in Vitamin C"
                value={vitaminsNotes}
                onChange={(e) => setVitaminsNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{error}</div>}

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save meal"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default MealForm;

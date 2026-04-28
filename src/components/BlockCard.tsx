import React from "react";
import type { Block, WorkoutData } from "../App";
import PriorityBadge from "./PriorityBadge";
import BlockCreditPopover from "./BlockCreditPopover";
import { WorkoutInputs } from "./WorkoutInputs";
import { getSessionDisplayName } from "../services/sessionGrouping";

type HabitNode = { id: string; name: string; subtasks: HabitNode[] };

type Theme = {
  id: string;
  name: string;
  habits: HabitNode[];
  groups: { id: string; name: string }[];
  meals: { id: string; name: string; meal_type: string; calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null; vitamins_notes?: string | null }[];
};

type BlockCardProps = {
  block: Block;
  variant: "slot" | "unscheduled" | "themed";

  // slot-specific
  priorityRank?: 1 | 2 | 3;
  mealPopoverBlockId?: string | null;
  editingBlockId?: string | null;
  editBlockLabel?: string;
  creditPopoverBlockId?: string | null;
  themes?: Theme[];
  hasAdjacentBelow?: boolean;
  onSetMealPopover?: (id: string | null) => void;
  onSetRenamingSession?: (session: Block["sessionGroup"]) => void;
  onSetSessionRenameValue?: (val: string) => void;
  onToggleCompletion?: (blockId: string) => void;
  onSetCreditPopover?: (id: string | null) => void;
  onSaveBlockCredits?: (blockId: string, habitIds: string[]) => void;
  onSetEditingBlock?: (id: string | null) => void;
  onSetEditBlockLabel?: (label: string) => void;
  onSaveBlockEdit?: (blockId: string) => void;
  onDoubleClick?: (blockId: string) => void;

  // shared
  onDragStart: (blockId: string, e?: React.DragEvent) => void;
  onDragEnd: () => void;
  onDelete: (blockId: string) => void;
  isStrengthTraining: (block: Block) => boolean;
  onUpdateWorkout?: (blockId: string, data: WorkoutData) => void;
  onSubmitWorkout?: (blockId: string) => void;

  // themed-specific
  convertingBlockId?: string | null;
  convertFrequency?: "daily" | "weekly" | "monthly" | "none";
  convertTarget?: number;
  convertGroupId?: string;
  themeGroups?: { id: string; name: string }[];
  onSetConvertingBlock?: (id: string | null) => void;
  onSetConvertFrequency?: (freq: "daily" | "weekly" | "monthly" | "none") => void;
  onSetConvertTarget?: (n: number) => void;
  onSetConvertGroupId?: (id: string) => void;
  onConvertToHabit?: (blockId: string, themeId: string) => void;
  onRemoveFromTheme?: (blockId: string) => void;
  themeId?: string;
};

export const BlockCard: React.FC<BlockCardProps> = ({
  block,
  variant,
  priorityRank,
  mealPopoverBlockId,
  editingBlockId,
  editBlockLabel,
  creditPopoverBlockId,
  themes,
  hasAdjacentBelow,
  onSetMealPopover,
  onSetRenamingSession,
  onSetSessionRenameValue,
  onToggleCompletion,
  onSetCreditPopover,
  onSaveBlockCredits,
  onSetEditingBlock,
  onSetEditBlockLabel,
  onSaveBlockEdit,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onDelete,
  isStrengthTraining,
  onUpdateWorkout,
  onSubmitWorkout,
  convertingBlockId,
  convertFrequency,
  convertTarget,
  convertGroupId,
  themeGroups,
  onSetConvertingBlock,
  onSetConvertFrequency,
  onSetConvertTarget,
  onSetConvertGroupId,
  onConvertToHabit,
  onRemoveFromTheme,
  themeId,
}) => {
  const hasSessionGroup = !!block.sessionGroup;
  const sessionColor = block.sessionGroup?.accent_color || "";
  const hasMeal = !!block.mealId && !!block.mealType;

  const blockClass = [
    "block",
    block.isHabitBlock ? "habit-block" : "",
    block.isLinkedGroup ? "linked-group" : "",
    block.completed ? "block-done" : "",
    hasSessionGroup ? `session-group session-${sessionColor}` : "",
    hasMeal ? `meal-block meal-${block.mealType}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const mealData =
    hasMeal && mealPopoverBlockId === block.id && themes
      ? themes.flatMap((t) => t.meals).find((m) => m.id === block.mealId)
      : null;

  return (
    <div className={variant === "themed" ? "themed-block-wrapper" : undefined}>
      <div
        className={blockClass}
        draggable
        onDragStart={(e) => onDragStart(block.id, e)}
        onDragEnd={onDragEnd}
        onDoubleClick={onDoubleClick ? () => onDoubleClick(block.id) : undefined}
        style={{ position: "relative" }}
      >
        {priorityRank && <PriorityBadge rank={priorityRank} />}

        {hasMeal && (
          <div
            className={`meal-badge meal-${block.mealType}`}
            onClick={(e) => {
              e.stopPropagation();
              onSetMealPopover?.(mealPopoverBlockId === block.id ? null : block.id);
            }}
            title="Meal info"
          >
            {block.mealType === "breakfast" ? "B" : block.mealType === "lunch" ? "L" : "D"}
          </div>
        )}

        {mealData && (
          <div className="meal-popover" onClick={(e) => e.stopPropagation()}>
            <div className="meal-popover-title">{mealData.name}</div>
            <div className="meal-popover-row">
              <span className="meal-popover-label">Type</span>
              <span style={{ textTransform: "capitalize" }}>{mealData.meal_type}</span>
            </div>
            {mealData.calories != null && (
              <div className="meal-popover-row">
                <span className="meal-popover-label">Calories</span>
                <span>{mealData.calories} kcal</span>
              </div>
            )}
            {mealData.protein_g != null && (
              <div className="meal-popover-row">
                <span className="meal-popover-label">Protein</span>
                <span>{mealData.protein_g}g</span>
              </div>
            )}
            {mealData.carbs_g != null && (
              <div className="meal-popover-row">
                <span className="meal-popover-label">Carbs</span>
                <span>{mealData.carbs_g}g</span>
              </div>
            )}
            {mealData.fat_g != null && (
              <div className="meal-popover-row">
                <span className="meal-popover-label">Fat</span>
                <span>{mealData.fat_g}g</span>
              </div>
            )}
            {mealData.vitamins_notes && (
              <div className="meal-popover-row" style={{ flexDirection: "column", gap: 2 }}>
                <span className="meal-popover-label">Notes</span>
                <span>{mealData.vitamins_notes}</span>
              </div>
            )}
            <button
              type="button"
              className="secondary small-btn"
              style={{ marginTop: 6, fontSize: 10 }}
              onClick={() => onSetMealPopover?.(null)}
            >
              Close
            </button>
          </div>
        )}

        {hasSessionGroup && block.sessionGroup && variant === "slot" && (
          <div
            className={`session-badge session-${sessionColor}`}
            style={hasMeal ? { left: 28 } : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onSetRenamingSession?.(block.sessionGroup!);
              onSetSessionRenameValue?.(block.sessionGroup!.custom_name || "");
            }}
            title="Click to rename session"
          >
            {getSessionDisplayName(block.sessionGroup)}
          </div>
        )}

        {hasAdjacentBelow && variant === "slot" && (
          <div className={`session-connector session-${sessionColor}`} />
        )}

        <div>
          {variant === "slot" && block.isHabitBlock ? (
            <label
              className="block-label-with-check"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={!!block.completed}
                onChange={() => onToggleCompletion?.(block.id)}
              />
              <span>
                {block.label}
                {block.completed && <span className="block-done-check"> &#10003;</span>}
                {block.hashtag && (
                  <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 10 }}> #{block.hashtag}</span>
                )}
              </span>
              {block.themeId && (
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSetCreditPopover?.(creditPopoverBlockId === block.id ? null : block.id);
                  }}
                  title="Also counts for..."
                  style={{
                    marginLeft: 4,
                    fontSize: 10,
                    background:
                      (block.creditedHabitIds?.length ?? 0) > 0 ? "#2563eb" : "#e5e7eb",
                    color: (block.creditedHabitIds?.length ?? 0) > 0 ? "#fff" : "#555",
                    borderRadius: 999,
                    padding: "1px 5px",
                    cursor: "pointer",
                    fontWeight: 600,
                    transition: "all 0.12s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {(block.creditedHabitIds?.length ?? 0) > 0
                    ? `+${block.creditedHabitIds!.length}`
                    : "+"}
                </span>
              )}
              {creditPopoverBlockId === block.id && themes && (
                <BlockCreditPopover
                  blockId={block.id}
                  primaryHabitId={block.habitId!}
                  themeId={block.themeId}
                  themes={themes}
                  creditedHabitIds={block.creditedHabitIds ?? []}
                  completed={!!block.completed}
                  onSave={onSaveBlockCredits!}
                  onClose={() => onSetCreditPopover?.(null)}
                />
              )}
            </label>
          ) : variant === "slot" && editingBlockId === block.id ? (
            <input
              className="block-edit-input"
              type="text"
              value={editBlockLabel}
              onChange={(e) => onSetEditBlockLabel?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveBlockEdit?.(block.id);
                if (e.key === "Escape") {
                  onSetEditingBlock?.(null);
                  onSetEditBlockLabel?.("");
                }
              }}
              onBlur={() => onSaveBlockEdit?.(block.id)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={
                variant === "slot" && !block.isHabitBlock
                  ? (e) => {
                      e.stopPropagation();
                      onSetEditingBlock?.(block.id);
                      onSetEditBlockLabel?.(block.label);
                    }
                  : undefined
              }
              title={variant === "slot" && !block.isHabitBlock ? "Double-click to edit" : undefined}
              style={variant === "slot" && !block.isHabitBlock ? { cursor: "text" } : undefined}
            >
              {block.label}
              {block.hashtag && (
                <span style={{ marginLeft: variant === "slot" ? 4 : 6, opacity: 0.7, fontSize: variant === "slot" ? 10 : 11 }}>
                  {" "}#{block.hashtag}
                </span>
              )}
            </span>
          )}

          {isStrengthTraining(block) && onUpdateWorkout && onSubmitWorkout && (
            <WorkoutInputs
              workoutData={block.workoutData}
              workoutSubmitted={block.workoutSubmitted}
              onUpdate={(data) => onUpdateWorkout(block.id, data)}
              onSubmit={() => onSubmitWorkout(block.id)}
            />
          )}
        </div>

        {variant === "themed" && !block.isHabitBlock && (
          <button
            type="button"
            className="theme-block-convert-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSetConvertingBlock?.(convertingBlockId === block.id ? null : block.id);
              onSetConvertFrequency?.("weekly");
              onSetConvertTarget?.(3);
              onSetConvertGroupId?.("");
            }}
            title="Convert to habit"
          >
            &#x21bb;
          </button>
        )}

        {variant === "themed" && (
          <button
            type="button"
            className="theme-block-remove-btn"
            onClick={() => onRemoveFromTheme?.(block.id)}
            title="Remove from theme"
          >
            ×
          </button>
        )}

        {variant !== "themed" && (
          <button
            className="block-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(block.id);
            }}
            title="Delete block"
            aria-label="Delete block"
          >
            ×
          </button>
        )}
      </div>

      {variant === "themed" && convertingBlockId === block.id && (
        <div className="convert-to-habit-form">
          <div className="convert-form-title">Convert to Habit</div>
          <div className="convert-form-row">
            <label className="small-label">Frequency</label>
            <select
              value={convertFrequency}
              onChange={(e) =>
                onSetConvertFrequency?.(e.target.value as "daily" | "weekly" | "monthly" | "none")
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="none">No Target</option>
            </select>
          </div>
          {convertFrequency !== "none" && (
            <div className="convert-form-row">
              <label className="small-label">Target</label>
              <input
                type="number"
                min={1}
                max={convertFrequency === "daily" ? 7 : convertFrequency === "weekly" ? 14 : 28}
                value={convertTarget}
                onChange={(e) => onSetConvertTarget?.(parseInt(e.target.value) || 1)}
              />
            </div>
          )}
          {themeGroups && themeGroups.length > 0 && (
            <div className="convert-form-row">
              <label className="small-label">Group</label>
              <select
                value={convertGroupId}
                onChange={(e) => onSetConvertGroupId?.(e.target.value)}
              >
                <option value="">None</option>
                {themeGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="convert-form-actions">
            <button
              className="primary"
              type="button"
              onClick={() => themeId && onConvertToHabit?.(block.id, themeId)}
            >
              Convert
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => onSetConvertingBlock?.(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockCard;

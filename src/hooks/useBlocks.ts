import { useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { database } from "../services/database";
import { supabase } from "../lib/supabase";
import type { Block, WorkoutData } from "../App";
import type { ToastItem } from "../components/Toast";
import { getWeekStartDateString } from "../utils/dateUtils";

type ShowToast = (message: string, type?: ToastItem["type"], action?: ToastItem["action"]) => void;

export function useBlocks(
  user: User | null,
  weekOffset: number,
  allHabits: { id: string; name: string; themeName: string; habitGroupId?: string }[],
  themes: { id: string; groups: { id: string; groupType: string }[] }[],
  showToast: ShowToast,
  refreshSessionGroups: () => Promise<void>
) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editBlockLabel, setEditBlockLabel] = useState("");
  const [convertingBlockId, setConvertingBlockId] = useState<string | null>(null);
  const [convertFrequency, setConvertFrequency] = useState<"daily" | "weekly" | "monthly" | "none">("weekly");
  const [convertTarget, setConvertTarget] = useState(3);
  const [convertGroupId, setConvertGroupId] = useState("");
  const [mealPopoverBlockId, setMealPopoverBlockId] = useState<string | null>(null);
  const [creditPopoverBlockId, setCreditPopoverBlockId] = useState<string | null>(null);

  const isStrengthTrainingBlock = useCallback((block: Block): boolean => {
    if (!block.isHabitBlock || !block.habitId) return false;
    const habit = allHabits.find((h) => h.id === block.habitId);
    if (!habit || !habit.habitGroupId) return false;
    const habitGroup = themes.flatMap((t) => t.groups).find((g) => g.id === habit.habitGroupId);
    return habitGroup?.groupType === "strength_training";
  }, [allHabits, themes]);

  const createBlock = useCallback(async (
    label: string,
    isHabitBlock = false,
    habitId?: string,
    hashtag?: string
  ) => {
    const trimmed = label.trim();
    if (!trimmed) { showToast("Enter a label for the block.", "error"); return; }
    if (!user) return;

    try {
      const blockData = await database.blocks.create(user.id, {
        label: trimmed, is_habit_block: isHabitBlock, habit_id: habitId ?? null,
        location_type: "unscheduled", day_index: null, time_index: null,
        completed: false, hashtag: hashtag?.trim() || null, week_start_date: null,
        linked_block_id: null, is_linked_group: false, workout_submitted: false,
        session_group_id: null, is_daily_template: false, daily_template_id: null,
      });
      const newBlock: Block = {
        id: blockData.id, label: blockData.label, isHabitBlock: blockData.is_habit_block,
        location: { type: "unscheduled" }, habitId: blockData.habit_id ?? undefined,
        completed: blockData.completed, hashtag: blockData.hashtag ?? undefined,
        linkedBlockId: blockData.linked_block_id ?? undefined,
        isLinkedGroup: blockData.is_linked_group, workoutSubmitted: blockData.workout_submitted,
        creditedHabitIds: [],
      };
      setBlocks((prev) => [...prev, newBlock]);
    } catch {
      showToast("Failed to create block", "error");
    }
  }, [user, showToast]);

  const createMealBlock = useCallback(async (meal: { id: string; name: string; theme_id: string; meal_type: "breakfast" | "lunch" | "dinner" }) => {
    if (!user) return;
    try {
      const blockData = await database.blocks.create(user.id, {
        label: meal.name, is_habit_block: false, habit_id: null,
        location_type: "unscheduled", day_index: null, time_index: null,
        completed: false, hashtag: null, week_start_date: null,
        linked_block_id: null, is_linked_group: false, workout_submitted: false,
        session_group_id: null, is_daily_template: false, daily_template_id: null,
        theme_id: meal.theme_id,
      });
      await database.mealBlockLinks.create(user.id, blockData.id, meal.id);
      const newBlock: Block = {
        id: blockData.id, label: blockData.label, isHabitBlock: false,
        location: { type: "unscheduled" }, completed: false, themeId: meal.theme_id,
        mealId: meal.id, mealType: meal.meal_type, creditedHabitIds: [],
      };
      setBlocks((prev) => [...prev, newBlock]);
      showToast("Meal block added", "success");
    } catch {
      showToast("Failed to create meal block", "error");
    }
  }, [user, showToast]);

  const moveBlockToSlot = useCallback(async (blockId: string, dayIndex: number, timeIndex: number) => {
    try {
      const block = blocks.find((b) => b.id === blockId);
      if (block?.linkedBlockId) {
        await database.blocks.update(block.linkedBlockId, { linked_block_id: null, is_linked_group: false });
        const linkedBlock = blocks.find((b) => b.id === block.linkedBlockId);
        if (linkedBlock?.habitId) {
          const habit = allHabits.find((h) => h.id === linkedBlock.habitId);
          if (habit) await database.blocks.update(block.linkedBlockId, { label: `Habit: ${habit.name}` });
        }
      }
      const weekStartDate = getWeekStartDateString(weekOffset);
      const originalHabit = allHabits.find((h) => h.id === block?.habitId);
      await database.blocks.update(blockId, {
        location_type: "slot", day_index: dayIndex, time_index: timeIndex,
        week_start_date: weekStartDate, linked_block_id: null, is_linked_group: false,
        daily_template_id: null, theme_id: null,
      });
      if (originalHabit && block?.isHabitBlock) {
        await database.blocks.update(blockId, { label: `Habit: ${originalHabit.name}` });
      }
      setBlocks((prev) => prev.map((b) => {
        if (b.id === blockId) {
          return { ...b, location: { type: "slot" as const, dayIndex, timeIndex }, linkedBlockId: undefined, isLinkedGroup: false, themeId: undefined, label: originalHabit ? `Habit: ${originalHabit.name}` : b.label };
        }
        if (b.id === block?.linkedBlockId) {
          const habit = allHabits.find((h) => h.id === b.habitId);
          return { ...b, linkedBlockId: undefined, isLinkedGroup: false, label: habit ? `Habit: ${habit.name}` : b.label };
        }
        return b;
      }));
      await refreshSessionGroups();
    } catch {
      // silent — drag errors are non-critical
    }
  }, [blocks, allHabits, weekOffset, refreshSessionGroups]);

  const moveBlockToUnscheduled = useCallback(async (blockId: string) => {
    try {
      const block = blocks.find((b) => b.id === blockId);
      if (block?.linkedBlockId) {
        await database.blocks.update(block.linkedBlockId, { linked_block_id: null, is_linked_group: false });
        const linkedBlock = blocks.find((b) => b.id === block.linkedBlockId);
        if (linkedBlock?.habitId) {
          const habit = allHabits.find((h) => h.id === linkedBlock.habitId);
          if (habit) await database.blocks.update(block.linkedBlockId, { label: `Habit: ${habit.name}` });
        }
      }
      await database.blocks.update(blockId, {
        location_type: "unscheduled", day_index: null, time_index: null,
        week_start_date: null, linked_block_id: null, is_linked_group: false, daily_template_id: null,
      });
      const originalHabit = allHabits.find((h) => h.id === block?.habitId);
      setBlocks((prev) => prev.map((b) => {
        if (b.id === blockId) return { ...b, location: { type: "unscheduled" }, linkedBlockId: undefined, isLinkedGroup: false, label: originalHabit ? `Habit: ${originalHabit.name}` : b.label };
        if (b.id === block?.linkedBlockId) {
          const habit = allHabits.find((h) => h.id === b.habitId);
          return { ...b, linkedBlockId: undefined, isLinkedGroup: false, label: habit ? `Habit: ${habit.name}` : b.label };
        }
        return b;
      }));
      await refreshSessionGroups();
    } catch {
      // silent
    }
  }, [blocks, allHabits, refreshSessionGroups]);

  const deleteBlockWithUndo = useCallback(async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    try {
      if (block.linkedBlockId) {
        await database.blocks.update(block.linkedBlockId, { linked_block_id: null, is_linked_group: false });
        const linkedBlock = blocks.find((b) => b.id === block.linkedBlockId);
        if (linkedBlock?.habitId) {
          const habit = allHabits.find((h) => h.id === linkedBlock.habitId);
          if (habit) await database.blocks.update(block.linkedBlockId, { label: `Habit: ${habit.name}` });
        }
      }
      await database.blocks.delete(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId).map((b) => {
        if (b.id === block.linkedBlockId) {
          const habit = allHabits.find((h) => h.id === b.habitId);
          return { ...b, linkedBlockId: undefined, isLinkedGroup: false, label: habit ? `Habit: ${habit.name}` : b.label };
        }
        return b;
      }));
      await refreshSessionGroups();
      showToast("Block removed", "info", {
        label: "Undo",
        onClick: async () => {
          if (!user) return;
          try {
            const restored = await database.blocks.create(user.id, {
              label: block.label, is_habit_block: block.isHabitBlock, habit_id: block.habitId ?? null,
              location_type: block.location.type === "slot" ? "slot" : "unscheduled",
              day_index: block.location.type === "slot" ? block.location.dayIndex : null,
              time_index: block.location.type === "slot" ? block.location.timeIndex : null,
              completed: block.completed || false, hashtag: block.hashtag ?? null,
              week_start_date: block.location.type === "slot" ? getWeekStartDateString(weekOffset) : null,
              linked_block_id: null, is_linked_group: false, workout_submitted: block.workoutSubmitted || false,
              session_group_id: null, is_daily_template: false, daily_template_id: null,
            });
            const restoredBlock: Block = {
              id: restored.id, label: restored.label, isHabitBlock: restored.is_habit_block,
              location: block.location, habitId: restored.habit_id ?? undefined,
              completed: restored.completed, hashtag: restored.hashtag ?? undefined,
              workoutSubmitted: restored.workout_submitted, creditedHabitIds: [],
            };
            setBlocks((prev) => [...prev, restoredBlock]);
            showToast("Block restored", "success");
          } catch {
            showToast("Failed to restore block", "error");
          }
        },
      });
    } catch {
      // silent
    }
  }, [blocks, allHabits, weekOffset, user, showToast, refreshSessionGroups]);

  const saveBlockEdit = useCallback(async (blockId: string) => {
    const trimmed = editBlockLabel.trim();
    if (!trimmed) { showToast("Block label cannot be empty.", "error"); return; }
    try {
      await database.blocks.update(blockId, { label: trimmed });
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, label: trimmed } : b)));
      setEditingBlockId(null);
      setEditBlockLabel("");
    } catch {
      showToast("Failed to update block", "error");
    }
  }, [editBlockLabel, showToast]);

  const toggleBlockCompletion = useCallback(async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || !block.isHabitBlock || !block.habitId) return;

    const newCompleted = !block.completed;
    const primaryHabitId = block.habitId;
    const crossCreditIds = block.creditedHabitIds ?? [];
    const directHabitIds = Array.from(new Set([primaryHabitId, ...crossCreditIds]));

    const getAncestorIds = (habitId: string): string[] => {
      const ancestors: string[] = [];
      let currentId: string | undefined = habitId;
      const visited = new Set<string>();
      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const h = allHabits.find((h) => h.id === currentId);
        if (!h || !("parentHabitId" in h)) break;
        const parent = (h as { parentHabitId?: string }).parentHabitId;
        if (parent) { ancestors.push(parent); currentId = parent; }
        else break;
      }
      return ancestors;
    };

    const allAffectedIds = Array.from(new Set([...directHabitIds, ...directHabitIds.flatMap(getAncestorIds)]));
    const delta = newCompleted ? 1 : -1;

    try {
      await database.blocks.update(blockId, { completed: newCompleted });
      const now = new Date().toISOString();
      for (const habitId of allAffectedIds) {
        const habit = allHabits.find((h) => h.id === habitId) as ({ doneCount: number } | undefined);
        if (!habit) continue;
        const nextCount = Math.max(0, habit.doneCount + delta);
        if (newCompleted) await database.habits.update(habitId, { done_count: nextCount, last_done_at: now });
        else await database.habits.update(habitId, { done_count: nextCount });
      }

      if (newCompleted && user) {
        const weekStartDate = block.location.type === "slot" ? getWeekStartDateString(weekOffset) : null;
        const dayIndex = block.location.type === "slot" ? block.location.dayIndex : null;
        const timeIndex = block.location.type === "slot" ? block.location.timeIndex : null;
        for (const habitId of directHabitIds) {
          await database.blockActivityLogs.create(user.id, blockId, habitId, weekStartDate, dayIndex, timeIndex);
        }
      } else if (!newCompleted) {
        await database.blockActivityLogs.deleteByBlock(blockId);
      }

      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, completed: newCompleted } : b)));
    } catch {
      // silent
    }
  }, [blocks, allHabits, weekOffset, user]);

  const updateWorkoutData = useCallback(async (blockId: string, workoutData: WorkoutData) => {
    if (!user) return;
    try {
      await database.workoutData.upsert(user.id, blockId, workoutData.sets, workoutData.reps, workoutData.weight, workoutData.unit);
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, workoutData } : b)));
    } catch {
      // silent
    }
  }, [user]);

  const submitWorkout = useCallback(async (blockId: string) => {
    if (!user) return;
    try {
      await database.blocks.update(blockId, { workout_submitted: true });
      const block = blocks.find((b) => b.id === blockId);
      if (block?.habitId && block.workoutData) {
        const today = new Date().toISOString().split("T")[0];
        await database.workoutHistory.create(user.id, block.habitId, blockId, block.workoutData.sets, block.workoutData.reps, block.workoutData.weight, block.workoutData.unit, today);
      }
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, workoutSubmitted: true } : b)));
    } catch {
      // silent
    }
  }, [user, blocks]);

  const assignBlockToTheme = useCallback(async (blockId: string, themeId: string) => {
    try {
      await database.blocks.update(blockId, { theme_id: themeId });
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, themeId } : b)));
    } catch {
      showToast("Failed to assign block to theme", "error");
    }
  }, [showToast]);

  const removeBlockFromTheme = useCallback(async (blockId: string) => {
    try {
      await database.blocks.update(blockId, { theme_id: null });
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, themeId: undefined } : b)));
    } catch {
      showToast("Failed to remove block from theme", "error");
    }
  }, [showToast]);

  const saveBlockCredits = useCallback(async (blockId: string, creditedHabitIds: string[]) => {
    if (!user) return;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    try {
      await database.blockHabitCredits.deleteAllForBlock(blockId);
      for (const habitId of creditedHabitIds) {
        await database.blockHabitCredits.create(user.id, blockId, habitId);
      }
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, creditedHabitIds } : b)));
      if (block.completed && creditedHabitIds.length > 0) {
        showToast("Credits updated. Re-check the block to apply changes.", "info");
      }
    } catch {
      showToast("Failed to save credits", "error");
    }
  }, [user, blocks, showToast]);

  const handleBlockDoubleClickWithUndo = useCallback((blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    if (block.isHabitBlock) deleteBlockWithUndo(blockId);
    else moveBlockToUnscheduled(blockId);
  }, [blocks, deleteBlockWithUndo, moveBlockToUnscheduled]);

  const loadDailyPriorities = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("daily_priorities")
      .select("block_id, priority_rank")
      .eq("user_id", userId)
      .eq("date", new Date().toISOString().split("T")[0]);
    return data ?? [];
  }, []);

  return {
    blocks, setBlocks,
    editingBlockId, setEditingBlockId,
    editBlockLabel, setEditBlockLabel,
    convertingBlockId, setConvertingBlockId,
    convertFrequency, setConvertFrequency,
    convertTarget, setConvertTarget,
    convertGroupId, setConvertGroupId,
    mealPopoverBlockId, setMealPopoverBlockId,
    creditPopoverBlockId, setCreditPopoverBlockId,
    isStrengthTrainingBlock,
    createBlock,
    createMealBlock,
    moveBlockToSlot,
    moveBlockToUnscheduled,
    deleteBlockWithUndo,
    saveBlockEdit,
    toggleBlockCompletion,
    updateWorkoutData,
    submitWorkout,
    assignBlockToTheme,
    removeBlockFromTheme,
    saveBlockCredits,
    handleBlockDoubleClickWithUndo,
    loadDailyPriorities,
  };
}

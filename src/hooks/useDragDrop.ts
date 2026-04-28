import { useState, useCallback } from "react";

export let currentDragBlockId: string | null = null;

export function useDragDrop(
  moveBlockToSlot: (blockId: string, dayIndex: number, timeIndex: number) => Promise<void>,
  createHabitBlockAtSlot: (habitId: string, dayIndex: number, timeIndex: number) => Promise<void>,
  assignBlockToTheme: (blockId: string, themeId: string) => Promise<void>,
  blocks: { id: string; location: { type: string } }[]
) {
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dragHabitId, setDragHabitId] = useState<string | null>(null);
  const [dragOverThemeId, setDragOverThemeId] = useState<string | null>(null);

  const handleDragStart = useCallback((blockId: string, e?: React.DragEvent) => {
    currentDragBlockId = blockId;
    if (e) {
      e.dataTransfer.setData("application/block-id", blockId);
      e.dataTransfer.setData("text/plain", blockId);
      e.dataTransfer.effectAllowed = "move";
    }
    requestAnimationFrame(() => {
      setDragBlockId(blockId);
      setDragHabitId(null);
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    currentDragBlockId = null;
    setDragBlockId(null);
    setDragOverThemeId(null);
  }, []);

  const handleHabitDragStart = useCallback((habitId: string, e?: React.DragEvent) => {
    if (e) {
      e.dataTransfer.setData("application/habit-id", habitId);
      e.dataTransfer.setData("text/plain", habitId);
      e.dataTransfer.effectAllowed = "move";
    }
    requestAnimationFrame(() => {
      setDragHabitId(habitId);
      setDragBlockId(null);
    });
  }, []);

  const handleHabitDragEnd = useCallback(() => {
    setDragHabitId(null);
  }, []);

  const handleThemeDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, themeId: string) => {
    if (!dragBlockId && !currentDragBlockId) return;
    e.preventDefault();
    setDragOverThemeId(themeId);
  }, [dragBlockId]);

  const handleThemeDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragOverThemeId(null);
    }
  }, []);

  const handleThemeDrop = useCallback((e: React.DragEvent<HTMLDivElement>, themeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverThemeId(null);
    const droppedBlockId = currentDragBlockId || dragBlockId;
    if (droppedBlockId) {
      const block = blocks.find((b) => b.id === droppedBlockId);
      if (block && block.location.type === "unscheduled") {
        assignBlockToTheme(droppedBlockId, themeId);
      }
    }
    currentDragBlockId = null;
    setDragBlockId(null);
  }, [dragBlockId, blocks, assignBlockToTheme]);

  const handleSlotDrop = useCallback((
    e: React.DragEvent<HTMLTableCellElement>,
    dayIndex: number,
    timeIndex: number
  ) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    const droppedBlockId = currentDragBlockId || dragBlockId;
    if (droppedBlockId) {
      moveBlockToSlot(droppedBlockId, dayIndex, timeIndex);
    } else if (dragHabitId) {
      createHabitBlockAtSlot(dragHabitId, dayIndex, timeIndex);
    }
  }, [dragBlockId, dragHabitId, moveBlockToSlot, createHabitBlockAtSlot]);

  const handleSlotDragOver = useCallback((e: React.DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  }, []);

  const handleSlotDragLeave = useCallback((e: React.DragEvent<HTMLTableCellElement>) => {
    e.currentTarget.classList.remove("drag-over");
  }, []);

  return {
    dragBlockId,
    dragHabitId,
    dragOverThemeId,
    handleDragStart,
    handleDragEnd,
    handleHabitDragStart,
    handleHabitDragEnd,
    handleThemeDragOver,
    handleThemeDragLeave,
    handleThemeDrop,
    handleSlotDrop,
    handleSlotDragOver,
    handleSlotDragLeave,
  };
}

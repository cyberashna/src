import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type {
  Block,
  ExerciseLibraryItem,
  HabitCardOutlineItem,
  WorkoutBlockExercise,
  WorkoutData,
  WorkoutExerciseHistoryEntry,
  WorkoutRoutine,
  WorkoutRoutineHistoryEntry,
} from "../App";
import type { BlockTask } from "../services/database";
import PriorityBadge from "./PriorityBadge";
import BlockCreditPopover from "./BlockCreditPopover";
import { WorkoutInputs } from "./WorkoutInputs";
import WorkoutExerciseBuilder from "./WorkoutExerciseBuilder";
import { getSessionDisplayName } from "../services/sessionGrouping";

type HabitNode = { id: string; name: string; subtasks: HabitNode[] };

type Theme = {
  id: string;
  name: string;
  habits: HabitNode[];
  groups: { id: string; name: string }[];
  meals: { id: string; name: string; meal_type: string; calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null; vitamins_notes?: string | null }[];
};

type DetailTab = "workout" | "tasks" | "notes";

type MobileBlockDropTarget =
  | { type: "slot"; dayIndex: number; timeIndex: number }
  | { type: "waiting" };

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
  isWorkoutBlock?: (block: Block) => boolean;
  onUpdateWorkout?: (blockId: string, data: WorkoutData) => void;
  onSubmitWorkout?: (blockId: string) => void;
  exerciseLibrary?: ExerciseLibraryItem[];
  blockExercises?: WorkoutBlockExercise[];
  exerciseHistory?: Record<string, WorkoutExerciseHistoryEntry[]>;
  workoutRoutines?: WorkoutRoutine[];
  workoutRoutineHistory?: WorkoutRoutineHistoryEntry[];
  linkedWorkoutRoutineId?: string | null;
  onAddExerciseToBlock?: (blockId: string, exerciseName: string) => void;
  onUpdateBlockExercise?: (
    blockId: string,
    rowId: string,
    updates: Partial<WorkoutBlockExercise>
  ) => void;
  onDeleteBlockExercise?: (blockId: string, rowId: string) => void;
  onLoadWorkoutRoutine?: (blockId: string, routineId: string) => void;
  onSaveWorkoutRoutine?: (blockId: string, name: string) => void;
  onSaveWorkoutRoutineAsNew?: (blockId: string, name: string) => void;
  onUpdateWorkoutRoutineFromBlock?: (blockId: string, routineId: string) => void;
  onAttachWorkoutRoutine?: (
    blockId: string,
    routineId: string,
    options?: { loadExercises?: boolean }
  ) => void;
  onDetachWorkoutRoutine?: (blockId: string) => void;

  // notes + tasks
  onSaveBlockNote?: (blockId: string, content: string) => void;
  onAddBlockTask?: (blockId: string, label: string) => void;
  onToggleBlockTask?: (blockId: string, taskId: string) => void;
  onDeleteBlockTask?: (blockId: string, taskId: string) => void;
  openDetailsOnClick?: boolean;
  mobileMode?: boolean;
  outlineItems?: HabitCardOutlineItem[];
  onToggleOutlineTask?: (nodeId: string) => void;
  onMobileMoveLater?: (blockId: string) => void;
  onMobileMoveTomorrow?: (blockId: string) => void;
  onMobileMoveUnscheduled?: (blockId: string) => void;
  onMobileDrop?: (blockId: string, target: MobileBlockDropTarget) => void | Promise<void>;
  onMobileScheduleToday?: (blockId: string) => void;
  onMobileOpenOutliner?: (blockId: string) => void;
  mobileOutlinerActionLabel?: string;
  kindLabel?: string;
  relationshipChips?: string[];

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
  onAddThemeBlockToToday?: (blockId: string) => void;
  onScheduleThemeBlock?: (blockId: string, dayIndex: number, timeIndex: number) => void;
  scheduleDays?: string[];
  scheduleTimeSlots?: string[];
  defaultScheduleDayIndex?: number;
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
  isWorkoutBlock,
  onUpdateWorkout,
  onSubmitWorkout,
  exerciseLibrary = [],
  blockExercises = [],
  exerciseHistory = {},
  workoutRoutines = [],
  workoutRoutineHistory = [],
  linkedWorkoutRoutineId,
  onAddExerciseToBlock,
  onUpdateBlockExercise,
  onDeleteBlockExercise,
  onLoadWorkoutRoutine,
  onSaveWorkoutRoutine,
  onSaveWorkoutRoutineAsNew,
  onUpdateWorkoutRoutineFromBlock,
  onAttachWorkoutRoutine,
  onDetachWorkoutRoutine,
  onSaveBlockNote,
  onAddBlockTask,
  onToggleBlockTask,
  onDeleteBlockTask,
  openDetailsOnClick,
  mobileMode,
  outlineItems = [],
  onToggleOutlineTask,
  onMobileMoveLater,
  onMobileMoveTomorrow,
  onMobileMoveUnscheduled,
  onMobileDrop,
  onMobileScheduleToday,
  onMobileOpenOutliner,
  mobileOutlinerActionLabel,
  kindLabel,
  relationshipChips = [],
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
  onAddThemeBlockToToday,
  onScheduleThemeBlock,
  scheduleDays = [],
  scheduleTimeSlots = [],
  defaultScheduleDayIndex = 0,
  themeId,
}) => {
  const hasSessionGroup = !!block.sessionGroup;
  const sessionColor = block.sessionGroup?.accent_color || "";
  const hasMeal = !!block.mealId && !!block.mealType;

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("notes");
  const [noteValue, setNoteValue] = useState(block.blockNote ?? "");
  const [newTaskLabel, setNewTaskLabel] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDayIndex, setScheduleDayIndex] = useState(defaultScheduleDayIndex);
  const [scheduleTimeIndex, setScheduleTimeIndex] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const [touchDragPreview, setTouchDragPreview] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const blockElementRef = useRef<HTMLDivElement | null>(null);
  const noteSaveTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const swipeStartRef = useRef<{
    x: number;
    y: number;
    mode: "pending" | "swiping" | "dragging";
  } | null>(null);
  const swipeOffsetRef = useRef(0);
  const dragPreviewMetricsRef = useRef<{
    grabX: number;
    grabY: number;
    width: number;
    height: number;
  } | null>(null);
  const mobileDropElementRef = useRef<HTMLElement | null>(null);
  const suppressClickRef = useRef(false);

  // Keep noteValue in sync if block.blockNote changes externally
  useEffect(() => {
    setNoteValue(block.blockNote ?? "");
  }, [block.blockNote]);

  useEffect(() => {
    setScheduleDayIndex(defaultScheduleDayIndex);
  }, [block.id, defaultScheduleDayIndex]);

  useEffect(() => {
    return () => {
      if (noteSaveTimer.current) {
        clearTimeout(noteSaveTimer.current);
      }
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const blockElement = blockElementRef.current;
    if (!mobileMode || !blockElement) return;

    const preventManagedTouchMove = (event: TouchEvent) => {
      const mode = swipeStartRef.current?.mode;
      if ((mode === "swiping" || mode === "dragging") && event.cancelable) {
        event.preventDefault();
      }
    };

    blockElement.addEventListener("touchmove", preventManagedTouchMove, { passive: false });
    return () => blockElement.removeEventListener("touchmove", preventManagedTouchMove);
  }, [mobileMode]);

  const handleNoteChange = (val: string) => {
    setNoteValue(val);
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = window.setTimeout(() => {
      onSaveBlockNote?.(block.id, val);
    }, 800);
  };

  const handleAddTask = () => {
    if (!newTaskLabel.trim()) return;
    onAddBlockTask?.(block.id, newTaskLabel);
    setNewTaskLabel("");
  };

  const tasks: BlockTask[] = block.blockTasks ?? [];
  const completedTaskCount = tasks.filter((t) => t.completed).length;
  const completedOutlineTaskCount = outlineItems.filter((item) => item.tag === "task" && item.taskDone).length;
  const outlineTaskCount = outlineItems.filter((item) => item.tag === "task").length;
  const hasNoteContent = (block.blockNote ?? "").trim().length > 0;
  const isWorkoutLike = isWorkoutBlock?.(block) ?? isStrengthTraining(block);
  const canBuildWorkout = isWorkoutLike && !!onAddExerciseToBlock && !!onUpdateBlockExercise && !!onDeleteBlockExercise;
  const hasExerciseContent = blockExercises.length > 0;
  const hasDetailContent = tasks.length > 0 || hasNoteContent || hasExerciseContent;
  const canManageTasks = !!onAddBlockTask || tasks.length > 0;
  const canManageNotes = !!onSaveBlockNote;
  const noteDetailLabel = block.isHabitBlock ? "Instance note" : "Note";
  const inferredKindLabel =
    kindLabel ??
    (block.isHabitBlock
      ? "Habit"
      : block.hashtag?.trim().toLowerCase() === "task" || block.label.trim().toLowerCase().startsWith("task:")
        ? "Task"
        : block.hashtag?.trim().toLowerCase() === "note" || block.label.trim().toLowerCase().startsWith("note:")
          ? "Note"
          : "Block");
  const kindClass = inferredKindLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const getDefaultDetailTab = (): DetailTab => {
    if (canBuildWorkout) return "workout";
    if (canManageTasks) return "tasks";
    return "notes";
  };
  const openBlockDetails = (tab?: DetailTab) => {
    setActiveDetailTab(tab ?? getDefaultDetailTab());
    setDetailOpen(true);
  };

  useEffect(() => {
    if (canBuildWorkout && !hasExerciseContent) {
      openBlockDetails("workout");
    }
  }, [canBuildWorkout, hasExerciseContent]);

  useEffect(() => {
    if (!detailOpen) return;
    if (activeDetailTab === "workout" && !canBuildWorkout) {
      setActiveDetailTab(getDefaultDetailTab());
    }
    if (activeDetailTab === "tasks" && !canManageTasks) {
      setActiveDetailTab(getDefaultDetailTab());
    }
    if (activeDetailTab === "notes" && !canManageNotes) {
      setActiveDetailTab(getDefaultDetailTab());
    }
  }, [detailOpen, activeDetailTab, canBuildWorkout, canManageTasks, canManageNotes]);

  const detailTabs: Array<{ id: DetailTab; label: string; meta?: string }> = [
    ...(canBuildWorkout ? [{ id: "workout" as DetailTab, label: "Workout", meta: hasExerciseContent ? `${blockExercises.length}` : undefined }] : []),
    ...(canManageTasks ? [{ id: "tasks" as DetailTab, label: "Tasks", meta: tasks.length > 0 ? `${completedTaskCount}/${tasks.length}` : undefined }] : []),
    ...(canManageNotes ? [{ id: "notes" as DetailTab, label: "Notes", meta: hasNoteContent ? "1" : undefined }] : []),
  ];

  const hoverInfo = [
    block.label,
    block.hashtag ? `#${block.hashtag}` : null,
    block.completed ? "Completed" : null,
    tasks.length > 0 ? `${completedTaskCount}/${tasks.length} tasks done` : null,
    outlineItems.length > 0 ? `${outlineItems.length} outline item${outlineItems.length === 1 ? "" : "s"}` : null,
    hasNoteContent ? block.blockNote : null,
  ]
    .filter(Boolean)
    .join("\n");

  const blockClass = [
    "block",
    mobileMode ? "block-mobile-safe" : "",
    kindClass ? `block-kind-${kindClass}` : "",
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

  const handleBlockClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!openDetailsOnClick || detailTabs.length === 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,label,a")) return;
    openBlockDetails();
  };

  const canSwipeRight =
    !!mobileMode &&
    ((variant === "slot" && !!onToggleCompletion) ||
      (variant === "unscheduled" && !!onMobileScheduleToday));
  const canSwipeLeft =
    !!mobileMode &&
    ((variant === "slot" && !!onMobileMoveLater) ||
      (variant === "unscheduled" && !!onMobileOpenOutliner));
  const canUseSwipeActions = canSwipeRight || canSwipeLeft;
  const canLongPressDrag = !!mobileMode && variant === "slot" && !!onMobileDrop;
  const rightSwipeLabel =
    variant === "slot" ? (block.completed ? "Undo" : "Done") : "Today";
  const leftSwipeLabel =
    variant === "slot" ? "Later" : mobileOutlinerActionLabel ?? "Outline";
  const swipeState =
    swipeOffset > 12 ? "positive" : swipeOffset < -12 ? "organize" : "idle";

  const isInteractiveSwipeTarget = (target: EventTarget) =>
    target instanceof HTMLElement &&
    !!target.closest("button,input,select,textarea,a,.block-detail-modal");

  const resetSwipe = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    mobileDropElementRef.current = null;
    dragPreviewMetricsRef.current = null;
    swipeOffsetRef.current = 0;
    setSwipeOffset(0);
    setIsSwiping(false);
    setIsTouchDragging(false);
    setTouchDragPreview(null);
    swipeStartRef.current = null;
    if (suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 350);
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!canUseSwipeActions || isInteractiveSwipeTarget(event.target)) return;
    const touch = event.touches[0];
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      mode: "pending",
    };

    if (canLongPressDrag) {
      longPressTimer.current = window.setTimeout(() => {
        const gesture = swipeStartRef.current;
        if (!gesture || gesture.mode !== "pending") return;
        const blockElement = blockElementRef.current;
        if (!blockElement) return;
        const rect = blockElement.getBoundingClientRect();
        gesture.mode = "dragging";
        dragPreviewMetricsRef.current = {
          grabX: gesture.x - rect.left,
          grabY: gesture.y - rect.top,
          width: rect.width,
          height: rect.height,
        };
        suppressClickRef.current = true;
        setIsTouchDragging(true);
        setTouchDragPreview({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
        navigator.vibrate?.(12);
      }, 320);
    }
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (start.mode === "dragging") {
      event.preventDefault();
      suppressClickRef.current = true;
      const previewMetrics = dragPreviewMetricsRef.current;
      if (previewMetrics) {
        setTouchDragPreview({
          left: touch.clientX - previewMetrics.grabX,
          top: touch.clientY - previewMetrics.grabY,
          width: previewMetrics.width,
          height: previewMetrics.height,
        });
      }

      const scrollContainer = blockElementRef.current?.closest<HTMLElement>(".mobile-use-view");
      if (scrollContainer) {
        const bounds = scrollContainer.getBoundingClientRect();
        const edgeSize = 72;
        if (touch.clientY < bounds.top + edgeSize) {
          scrollContainer.scrollBy({ top: -14 });
        } else if (touch.clientY > bounds.bottom - edgeSize) {
          scrollContainer.scrollBy({ top: 14 });
        }
      }

      const elementAtTouch = document.elementFromPoint(touch.clientX, touch.clientY);
      const dropElement = elementAtTouch?.closest<HTMLElement>(
        "[data-mobile-drop-day-index][data-mobile-drop-time-index], [data-mobile-drop-waiting]"
      ) ?? null;

      mobileDropElementRef.current = dropElement;
      return;
    }

    if (start.mode === "pending") {
      if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) {
        resetSwipe();
        return;
      }
      if (Math.abs(deltaX) < 14 || Math.abs(deltaX) < Math.abs(deltaY) + 6) return;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      start.mode = "swiping";
      setIsSwiping(true);
    }

    event.preventDefault();
    suppressClickRef.current = true;
    const clampedOffset = Math.max(-96, Math.min(96, deltaX));
    swipeOffsetRef.current = clampedOffset;
    setSwipeOffset(clampedOffset);
  };

  const handleTouchEnd = () => {
    const gestureMode = swipeStartRef.current?.mode;
    const dropElement = mobileDropElementRef.current;

    if (gestureMode === "dragging" && dropElement && onMobileDrop) {
      const dayIndex = Number(dropElement.dataset.mobileDropDayIndex);
      const timeIndex = Number(dropElement.dataset.mobileDropTimeIndex);
      const target: MobileBlockDropTarget | null = dropElement.hasAttribute("data-mobile-drop-waiting")
        ? { type: "waiting" }
        : Number.isInteger(dayIndex) && Number.isInteger(timeIndex)
          ? { type: "slot", dayIndex, timeIndex }
          : null;

      if (target) {
        void Promise.resolve(onMobileDrop(block.id, target)).finally(resetSwipe);
        return;
      }
    }

    const threshold = 70;
    const finalOffset = swipeOffsetRef.current;
    if (gestureMode === "swiping" && finalOffset > threshold && canSwipeRight) {
      suppressClickRef.current = true;
      if (variant === "slot") onToggleCompletion?.(block.id);
      else onMobileScheduleToday?.(block.id);
    } else if (gestureMode === "swiping" && finalOffset < -threshold && canSwipeLeft) {
      suppressClickRef.current = true;
      if (variant === "slot") onMobileMoveLater?.(block.id);
      else onMobileOpenOutliner?.(block.id);
    }
    resetSwipe();
  };

  const handleMobileDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      window.setTimeout(() => setConfirmingDelete(false), 2400);
      return;
    }
    setDetailOpen(false);
    setConfirmingDelete(false);
    onDelete(block.id);
  };

  const wrapperClass = [
    variant === "themed" ? "themed-block-wrapper" : "",
    canUseSwipeActions ? "mobile-swipe-card-wrap" : "",
    isSwiping ? "is-swiping" : "",
    isTouchDragging ? "is-touch-dragging" : "",
    swipeState !== "idle" ? `mobile-swipe-${swipeState}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
    <div className={wrapperClass || undefined}>
      {canUseSwipeActions && (
        <div className="mobile-swipe-action-bg" aria-hidden="true">
          <span className="mobile-swipe-action mobile-swipe-action--right">{rightSwipeLabel}</span>
          <span className="mobile-swipe-action mobile-swipe-action--left">{leftSwipeLabel}</span>
        </div>
      )}
      <div
        ref={blockElementRef}
        id={`block-${block.id}`}
        className={blockClass}
        draggable={!mobileMode}
        onDragStart={mobileMode ? undefined : (e) => onDragStart(block.id, e)}
        onDragEnd={mobileMode ? undefined : onDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetSwipe}
        onContextMenu={mobileMode ? (event) => event.preventDefault() : undefined}
        onClick={handleBlockClick}
        onDoubleClick={onDoubleClick && !mobileMode ? () => onDoubleClick(block.id) : undefined}
        title={hoverInfo}
        data-tooltip={hoverInfo}
        style={{
          position: "relative",
          transform: canUseSwipeActions
              ? `translateX(${swipeOffset}px)`
              : undefined,
          transition: isSwiping ? "none" : undefined,
        }}
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

        <div className="block-main-line">
          {inferredKindLabel && (
            <span className={`block-kind-chip block-kind-chip--${kindClass}`}>
              {inferredKindLabel}
            </span>
          )}
          {variant === "slot" && onToggleCompletion ? (
            <label
              className="block-label-with-check"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={!!block.completed}
                onTouchStart={(event) => event.stopPropagation()}
                onChange={() => onToggleCompletion(block.id)}
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

          {isStrengthTraining(block) && !canBuildWorkout && onUpdateWorkout && onSubmitWorkout && (
            <WorkoutInputs
              workoutData={block.workoutData}
              workoutSubmitted={block.workoutSubmitted}
              onUpdate={(data) => onUpdateWorkout(block.id, data)}
              onSubmit={() => onSubmitWorkout(block.id)}
            />
          )}
        </div>

        {outlineItems.length > 0 && (
          <div className="block-outline-preview" onClick={(e) => e.stopPropagation()}>
            <div className="block-outline-preview-header">
              <span>Outline</span>
              {outlineTaskCount > 0 && <em>{completedOutlineTaskCount}/{outlineTaskCount}</em>}
            </div>
            <div className="block-outline-preview-list">
              {outlineItems.map((item) =>
                item.tag === "task" ? (
                  <button
                    key={item.id}
                    type="button"
                    className={`block-outline-preview-item block-outline-preview-item--task ${item.taskDone ? "is-done" : ""}`}
                    onClick={() => onToggleOutlineTask?.(item.id)}
                  >
                    <span>{item.taskDone ? "✓" : ""}</span>
                    <strong>{item.text}</strong>
                  </button>
                ) : (
                  <div
                    key={item.id}
                    className={`block-outline-preview-item block-outline-preview-item--habit ${item.onBoard ? "is-on-board" : ""}`}
                  >
                    <span>H</span>
                    <strong>{item.text}</strong>
                    {item.onBoard && <em>On board</em>}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Tasks progress indicator (collapsed) */}
        {tasks.length > 0 && !detailOpen && (
          <div
            className="block-tasks-pill"
            onClick={(e) => { e.stopPropagation(); openBlockDetails("tasks"); }}
            title="View tasks"
          >
            <span className="block-tasks-pill-check">&#10003;</span>
            {completedTaskCount}/{tasks.length}
          </div>
        )}

        {canBuildWorkout && !detailOpen && (
          <div
            className={`block-exercises-pill ${hasExerciseContent ? "has-exercises" : ""}`}
            onClick={(e) => { e.stopPropagation(); openBlockDetails("workout"); }}
            title={hasExerciseContent ? "View exercises" : "Build workout"}
          >
            {hasExerciseContent ? `${blockExercises.length} ex` : "Build workout"}
          </div>
        )}

        {mobileMode && variant === "slot" && canUseSwipeActions && (
          <div className="mobile-gesture-hint" aria-hidden="true">
            <span>Later</span>
            <em />
            <span>{block.completed ? "Undo" : "Done"}</span>
          </div>
        )}

        {mobileMode && variant === "unscheduled" && canUseSwipeActions && (
          <div className="mobile-gesture-hint" aria-hidden="true">
            <span>Outline</span>
            <em />
            <span>Today</span>
          </div>
        )}

        {/* Notes/Tasks toggle button */}
        {(onSaveBlockNote || onAddBlockTask) && (
          <button
            className={`block-detail-toggle ${detailOpen ? "active" : ""} ${hasDetailContent ? "has-content" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (detailOpen) setDetailOpen(false);
              else openBlockDetails();
            }}
            title={detailOpen ? "Close details" : "Block details"}
          >
            &#9776;
          </button>
        )}

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
            type="button"
            className={`block-delete-btn ${mobileMode && variant === "slot" ? "block-remove-board-btn" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(block.id);
            }}
            title={mobileMode && variant === "slot" ? "Remove from board" : "Delete block"}
            aria-label={mobileMode && variant === "slot" ? "Remove from board" : "Delete block"}
          >
            ×
          </button>
        )}
      </div>

      {variant === "themed" && (
        <div className="theme-block-actions">
          <button
            type="button"
            onClick={() => onAddThemeBlockToToday?.(block.id)}
            disabled={!onAddThemeBlockToToday}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setScheduleOpen((value) => !value)}
            disabled={!onScheduleThemeBlock || scheduleDays.length === 0 || scheduleTimeSlots.length === 0}
          >
            Schedule
          </button>
          <button
            type="button"
            onClick={() => onRemoveFromTheme?.(block.id)}
            disabled={!onRemoveFromTheme}
          >
            Waiting
          </button>
        </div>
      )}

      {variant === "themed" && scheduleOpen && (
        <div className="theme-block-schedule-row">
          <select
            value={scheduleDayIndex}
            onChange={(event) => setScheduleDayIndex(Number(event.target.value))}
            aria-label="Schedule day"
          >
            {scheduleDays.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
          <select
            value={scheduleTimeIndex}
            onChange={(event) => setScheduleTimeIndex(Number(event.target.value))}
            aria-label="Schedule time"
          >
            {scheduleTimeSlots.map((slot, index) => (
              <option key={`${slot}-${index}`} value={index}>
                {slot}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              onScheduleThemeBlock?.(block.id, scheduleDayIndex, scheduleTimeIndex);
              setScheduleOpen(false);
            }}
          >
            Add
          </button>
        </div>
      )}

      {detailOpen && createPortal(
        <div className="block-detail-backdrop" onClick={() => setDetailOpen(false)}>
          <div className="block-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="block-detail-modal-header">
              <div>
                <div className="block-detail-modal-kicker">Block details</div>
                <div className="block-detail-modal-title">{block.label}</div>
              </div>
              <button
                type="button"
                className="block-detail-modal-close"
                onClick={() => setDetailOpen(false)}
                aria-label="Close block details"
              >
                x
              </button>
            </div>

            <div className="block-detail-tabs">
              {detailTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`block-detail-tab ${activeDetailTab === tab.id ? "active" : ""}`}
                  onClick={() => setActiveDetailTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  {tab.meta && <em>{tab.meta}</em>}
                </button>
              ))}
            </div>

            {relationshipChips.length > 0 && (
              <div className="block-relationship-strip">
                <span>Linked to</span>
                <div>
                  {relationshipChips.map((chip) => (
                    <em key={chip}>{chip}</em>
                  ))}
                </div>
              </div>
            )}

            {mobileMode && variant === "unscheduled" && (onMobileScheduleToday || onMobileOpenOutliner) && (
              <div className="block-detail-mobile-actions">
                {onMobileScheduleToday && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      onMobileScheduleToday(block.id);
                      setDetailOpen(false);
                    }}
                  >
                    Today
                  </button>
                )}
                {onMobileOpenOutliner && (
                  <button
                    type="button"
                    onClick={() => {
                      onMobileOpenOutliner(block.id);
                      setDetailOpen(false);
                    }}
                  >
                    {mobileOutlinerActionLabel ?? "Add to Outline"}
                  </button>
                )}
              </div>
            )}

            {mobileMode && variant === "slot" && (onToggleCompletion || onMobileMoveLater || onMobileMoveTomorrow || onMobileMoveUnscheduled) && (
              <div className="block-detail-mobile-actions block-detail-mobile-actions--planned">
                {onToggleCompletion && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      onToggleCompletion(block.id);
                      setDetailOpen(false);
                    }}
                  >
                    {block.completed ? "Undo" : "Done"}
                  </button>
                )}
                {onMobileMoveLater && (
                  <button
                    type="button"
                    onClick={() => {
                      onMobileMoveLater(block.id);
                      setDetailOpen(false);
                    }}
                  >
                    Later
                  </button>
                )}
                {onMobileMoveTomorrow && (
                  <button
                    type="button"
                    onClick={() => {
                      onMobileMoveTomorrow(block.id);
                      setDetailOpen(false);
                    }}
                  >
                    Tomorrow
                  </button>
                )}
                {onMobileMoveUnscheduled && (
                  <button
                    type="button"
                    onClick={() => {
                      onMobileMoveUnscheduled(block.id);
                      setDetailOpen(false);
                    }}
                  >
                    Waiting
                  </button>
                )}
              </div>
            )}

            <div className="block-detail-modal-body">
              {activeDetailTab === "workout" && canBuildWorkout && (
                <div className="block-detail-section">
                  <div className="block-detail-section-label">Workout exercises</div>
                  <WorkoutExerciseBuilder
                    blockId={block.id}
                    blockLabel={block.label}
                    exerciseLibrary={exerciseLibrary}
                    blockExercises={blockExercises}
                    exerciseHistory={exerciseHistory}
                    workoutRoutines={workoutRoutines}
                    workoutRoutineHistory={workoutRoutineHistory}
                    linkedWorkoutRoutineId={linkedWorkoutRoutineId}
                    workoutSubmitted={block.workoutSubmitted}
                    onAddExercise={onAddExerciseToBlock}
                    onUpdateExercise={onUpdateBlockExercise}
                    onDeleteExercise={onDeleteBlockExercise}
                    onLoadRoutine={onLoadWorkoutRoutine}
                    onSaveRoutine={onSaveWorkoutRoutine}
                    onSaveRoutineAsNew={onSaveWorkoutRoutineAsNew}
                    onUpdateRoutine={onUpdateWorkoutRoutineFromBlock}
                    onAttachRoutine={onAttachWorkoutRoutine}
                    onDetachRoutine={onDetachWorkoutRoutine}
                    onSubmitWorkout={onSubmitWorkout}
                  />
                </div>
              )}

              {activeDetailTab === "tasks" && canManageTasks && (
                <div className="block-detail-section">
                  <div className="block-detail-section-label">Tasks</div>
                  {tasks.length > 0 && (
                    <ul className="block-task-list">
                      {tasks.map((task) => (
                        <li key={task.id} className={`block-task-item ${task.completed ? "block-task-done" : ""}`}>
                          <label className="block-task-label">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={() => onToggleBlockTask?.(block.id, task.id)}
                            />
                            <span>{task.label}</span>
                          </label>
                          <button
                            className="block-task-delete"
                            onClick={() => onDeleteBlockTask?.(block.id, task.id)}
                            title="Remove task"
                          >
                            x
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {tasks.length === 0 && (
                    <div className="block-detail-empty">No tasks yet.</div>
                  )}
                  {onAddBlockTask && (
                    <div className="block-task-add-row">
                      <input
                        type="text"
                        className="block-task-input"
                        placeholder="Add a task..."
                        value={newTaskLabel}
                        onChange={(e) => setNewTaskLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddTask();
                          if (e.key === "Escape") setNewTaskLabel("");
                        }}
                      />
                      <button
                        className="block-task-add-btn"
                        onClick={handleAddTask}
                        disabled={!newTaskLabel.trim()}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeDetailTab === "notes" && canManageNotes && (
                <div className="block-detail-section">
                  <div className="block-detail-section-label">{noteDetailLabel}</div>
                  {!noteValue.trim() && (
                    <div className="block-detail-empty">
                      {block.isHabitBlock ? "No instance note yet." : "No notes yet."}
                    </div>
                  )}
                  <textarea
                    className="block-note-textarea block-note-textarea-large"
                    value={noteValue}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    placeholder={block.isHabitBlock ? "Add a note for this instance..." : "Add a note..."}
                    rows={5}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {block.isHabitBlock && (
                    <div className="block-note-hint">Appears under habit notes as a dated instance.</div>
                  )}
                </div>
              )}

              {mobileMode && variant !== "themed" && (
                <div className="block-detail-danger-zone">
                  <button
                    type="button"
                    className={`block-detail-delete-btn ${confirmingDelete ? "confirming" : ""}`}
                    onClick={handleMobileDelete}
                  >
                    {confirmingDelete ? "Tap again to delete" : "Delete block"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

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
    {isTouchDragging && touchDragPreview && createPortal(
      <div
        className={`${blockClass} mobile-drag-preview`}
        aria-hidden="true"
        style={{
          left: touchDragPreview.left,
          top: touchDragPreview.top,
          width: touchDragPreview.width,
          minHeight: touchDragPreview.height,
        }}
      >
        <div className="block-main-line">
          {inferredKindLabel && (
            <span className={`block-kind-chip block-kind-chip--${kindClass}`}>
              {inferredKindLabel}
            </span>
          )}
          <strong>{block.label}</strong>
        </div>
      </div>,
      document.body
    )}
    </>
  );
};

export default BlockCard;

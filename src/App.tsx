import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import { AddPlannerDialog, AddToRoutineDialog, PlanItemDialog, PlannerNavigation, PlannerNoteDialog, PlannerConnectionStatus, TodayHome, type NewPlannerItem, type PlanView, type PlanChoice, type PlanMode } from "./components/PlannerShell";
import { WeeklyStack, type StackDay } from "./components/WeeklyStack";
import { WeeklySoftPlan } from "./components/WeeklySoftPlan";
import { getSoftPlansForWeek, isRepeatingPlanNode, defaultWeeklyTarget, weeklyPlanId, recurringPlanProgress, type SoftPlanDestination } from "./services/softPlanning";
import { persistSoftPlan } from "./services/softPlanPersistence";
import { GridOutlineDialog } from "./components/GridOutlineDialog";
import { TileTimersProvider } from "./components/TileTimers";
import { cancelTileTimer } from "./services/tileTimers";
import { tileTimerAlarm } from "./native/tileTimerAlarm";
import { findGridOutlineEntry, gridOutlineDestinations, placeGridOutlineEntry, placeOccurrenceNote, type GridOutlineChoice } from "./services/gridOutline";
import { planningDate } from "./services/planningDate";

export let currentDragBlockId: string | null = null;
import "./App.css";
import "./PlannerShell.css";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import { AuthScreen } from "./components/AuthScreen";
import { CalendarSettings } from "./components/CalendarSettings";
import { ThemeGoals } from "./components/ThemeGoals";
import { ThemeNotes } from "./components/ThemeNotes";
import { ToastContainer, createToastId } from "./components/Toast";
import type { ToastItem } from "./components/Toast";
import { ConfirmDialog } from "./components/ConfirmDialog";

import { database, SessionGroup, Habit as DBHabit, Block as DBBlock, Meal, BlockTask } from "./services/database";
import { countHabitProgress, localDateKey, type HabitProgressRecord } from "./services/habitProgress";
import MealForm from "./components/MealForm";
import { updateSessionGroups } from "./services/sessionGrouping";
import type { User } from "@supabase/supabase-js";
import PriorityPickerPanel from "./components/PriorityPickerPanel";
import QuickStartTemplateModal from "./components/QuickStartTemplateModal";
import QuickHabitForm from "./components/QuickHabitForm";
import GhostBlock from "./components/GhostBlock";
import { generateGhostBlocks, dismissPattern, acceptGhostBlock, type GhostBlock as GhostBlockType } from "./services/patternAnalysis";
import { generateStandingBlocksForWeek, getActiveStandingBlocks } from "./services/standingBlocks";
import DailyEssentials from "./components/DailyEssentials";
import DailyFocus from "./components/DailyFocus";
import MoodTracker from "./components/MoodTracker";
import EventSuggestions from "./components/EventSuggestions";
import type { Suggestion } from "./components/EventSuggestions";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import RoutineNotesPopup from "./components/RoutineNotesPopup";
import { RoutineWidget } from "./components/RoutineWidget";
import { persistGridCapture, type GridCaptureDraft } from './services/gridCapture';
import { gridHabitCreditChoices } from './services/gridOutline';
import AmbientMode from "./components/AmbientMode";
import type { AmbientSettings, AmbientTask } from "./components/AmbientMode";
import { createRoutineId, createRoutineStorageKey, routineNotesChanged, inferRoutineCategory, loadRoutineNotes, saveRoutineNotes, addOutlineItemToRoutine, resolveRoutineOutlineLabels, type RoutineTab } from "./services/routineNotes";
import PlanningOutlinerPanel from "./components/PlanningOutlinerPanel";
import { ReadingLinkCard } from './components/ReadingLink';
import { normalizeReadingLink, publicWebUrl, type ReadingLink } from './services/readingLinks';
import { blockTypePatch, outlineTypeBlockIds, prepareOutlineTypeChange, describeOutlinePlanning, outlinePlanningKey, withoutOutlinePlanning, type OutlineCardType } from './services/cardTypes';
import { outlineHabitPlacements, outlineBranchItems, moveOutlineSelection, normalizeOutlinePlans, isThemeRow as isThemeOutlineNode } from "./services/outlineModel";
import WorkoutLibraryPanel from "./components/WorkoutLibraryPanel";
import BlockCard from "./components/BlockCard";
import SmartWeeklySetupModal from "./components/SmartWeeklySetupModal";
import type { SmartWeekSuggestion } from "./components/SmartWeeklySetupModal";
import {
  addQuickCaptureToPlanningOutliner,
  createOutlineNode,
  clearOutlinerReminder,
  dismissOutlinerReminder,
  getDueOutlinerReminder,
  loadPlanningOutliner,
  savePlanningOutliner,
  snoozeOutlinerReminder,
  syncThemesToPlanningOutliner,
  updateOutlineNode,
  type OutlineFrequency,
  type OutlineLink,
  type OutlineNode,
  type OutlinerReminder,
  type SyncHabitToOutlinerInput,
} from "./services/planningOutliner";
import { loadThemeNotesPrefs, saveThemeGeneralNote } from "./services/themeNotes";
import { createWorkoutExerciseRow, formatExerciseResult } from "./services/workoutLibrary";
import { getWeekStartDateString, getCurrentWeekRange, getTodayDayIndex } from "./utils/dateUtils";
import { getNativePlannerLaunchTarget, updateNativePlannerWidget } from "./native/plannerWidget";
import workoutExerciseData from "./data/workout_exercise_data.json";

type HabitGroup = {
  id: string;
  name: string;
  groupType: "strength_training" | "custom";
  linkBehavior: "adjacent_merge" | "none";
};

type Habit = {
  id: string;
  name: string;
  targetPerWeek: number;
  doneCount: number;
  lastDoneAt?: string;
  frequency: "daily" | "weekly" | "monthly" | "none";
  habitGroupId?: string;
  parentHabitId?: string;
  subtasks: Habit[];
};

type HabitWithTheme = Habit & { themeName: string; themeId: string };
type ThemeType = "habit" | "meals" | "household";

type Theme = {
  id: string;
  name: string;
  themeType: ThemeType;
  habits: Habit[];
  groups: HabitGroup[];
  meals: Meal[];
};

type ThemeOutlineItem = {
  id: string;
  text: string;
  tag: OutlineNode["tag"];
  depth: number;
  linkedLabel?: string;
};

type ThemeOutlineMeta = {
  nodeId: string;
  path: string[];
  habitOrder: string[];
  outlineItems: ThemeOutlineItem[];
  nestedThemes: Array<{ id: string; name: string; nodeId: string }>;
};

type BlockLocation =
  | { type: "unscheduled" }
  | { type: "slot"; dayIndex: number; timeIndex: number };

export type WorkoutData = {
  sets: number | null;
  reps: number | null;
  weight: number | null;
  unit: "lbs" | "kg" | null;
};

export type ExerciseCategory = "strength" | "mobility" | "core" | "cardio" | "recovery";

export type ExerciseLibraryItem = {
  id: string;
  name: string;
  category: ExerciseCategory;
  bodyArea?: "upper" | "lower" | "core" | "full";
  pattern?: "push" | "pull" | "squat" | "hinge" | "carry" | "rotation" | "brace" | "stretch" | "cardio";
  defaultSets?: number | null;
  defaultReps?: number | null;
  defaultDuration?: number | null;
  equipment?: string | null;
  status?: string | null;
  notes?: string | null;
  aliases?: string[];
};

export type WorkoutBlockExercise = {
  id: string;
  exerciseId: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  unit: "lbs" | "kg" | null;
  duration: number | null;
  notes: string;
};

export type WorkoutRoutineExercise = Omit<WorkoutBlockExercise, "id">;
export type WorkoutRoutineFocus = "full" | "upper" | "lower" | "core" | "mobility" | "cardio";
export type WorkoutRoutineEnergy = "low" | "medium" | "high";
export type WorkoutRoutineTime = "short" | "medium" | "long";
export type WorkoutRoutineEquipment = "any" | "none" | "dumbbells" | "gym";

export type WorkoutRoutine = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  exercises: WorkoutRoutineExercise[];
  focus?: WorkoutRoutineFocus;
  energy?: WorkoutRoutineEnergy;
  timeBudget?: WorkoutRoutineTime;
  equipment?: WorkoutRoutineEquipment;
};

export type WorkoutExerciseHistoryEntry = {
  id: string;
  exerciseId: string;
  blockId: string;
  blockLabel: string;
  completedAt: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  unit: "lbs" | "kg" | null;
  duration: number | null;
  notes: string;
};

export type WorkoutRoutineHistoryEntry = {
  id: string;
  routineId: string;
  routineName: string;
  blockId: string;
  completedAt: string;
  exerciseNames: string[];
  notes: string;
  bestEffort: string;
};

export type Block = {
  id: string;
  label: string;
  isHabitBlock: boolean;
  location: BlockLocation;
  habitId?: string;
  completed?: boolean;
  hashtag?: string;
  linkedBlockId?: string;
  isLinkedGroup?: boolean;
  workoutData?: WorkoutData;
  workoutSubmitted?: boolean;
  sessionGroupId?: string;
  sessionGroup?: SessionGroup;
  themeId?: string;
  creditedHabitIds?: string[];
  mealId?: string;
  mealType?: "breakfast" | "lunch" | "dinner";
  blockNote?: string;
  blockNoteUpdatedAt?: string;
  blockTasks?: BlockTask[];
};

export type HabitCardOutlineItem = {
  id: string;
  text: string;
  tag: "task" | "habit";
  taskDone: boolean;
  linkedHabitId?: string;
  onBoard?: boolean;
};

type WeeklyHabitIntentionPlacement = {
  id: string;
  dayIndex: number;
  timeIndex: number;
};

type WeeklyHabitIntention = {
  id: string;
  habitId: string;
  habitName: string;
  themeId: string;
  themeName: string;
  weekStartDate: string;
  desiredCount: number;
  preferredDayIndexes: number[];
  placements: WeeklyHabitIntentionPlacement[];
};

type WeeklyRoutineIntention = {
  id: string;
  routineId: string;
  routineName: string;
  weekStartDate: string;
  desiredCount: number;
  preferredDayIndexes: number[];
  placements: WeeklyHabitIntentionPlacement[];
};

type SoftPlanPlacement =
  | {
      kind: "habit";
      intention: WeeklyHabitIntention;
      placement: WeeklyHabitIntentionPlacement;
      title: string;
      detail: string;
    }
  | {
      kind: "routine";
      intention: WeeklyRoutineIntention;
      placement: WeeklyHabitIntentionPlacement;
      title: string;
      detail: string;
    };

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const normalizePlanningName = (s: string) => s.trim().toLowerCase();

const createClientId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type ImportedWorkoutExercise = {
  name: string;
  category?: ExerciseCategory;
  bodyArea?: ExerciseLibraryItem["bodyArea"];
  pattern?: ExerciseLibraryItem["pattern"];
  defaultSets?: number | string | null;
  defaultReps?: number | string | null;
  defaultDuration?: number | string | null;
  equipment?: string | null;
  status?: string | null;
  notes?: string | null;
  aliases?: string[];
};

type ImportedWorkoutRoutine = {
  name: string;
  status?: string | null;
  focus?: WorkoutRoutineFocus;
  energy?: WorkoutRoutineEnergy;
  timeBudget?: WorkoutRoutineTime;
  equipment?: WorkoutRoutineEquipment | string | null;
  exercises?: Array<{
    name: string;
    sets?: number | string | null;
    reps?: number | string | null;
    duration?: number | string | null;
    notes?: string | null;
  }>;
  notes?: string | null;
};

type ImportedWorkoutData = {
  generatedAt?: string;
  exercises?: ImportedWorkoutExercise[];
  routines?: ImportedWorkoutRoutine[];
};

const importedWorkoutData = workoutExerciseData as ImportedWorkoutData;

const slugifyId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseWorkoutNumber = (value: number | string | null | undefined): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const isUsableImportedStatus = (status?: string | null) =>
  !/\b(excluded|superseded)\b/i.test(status ?? "");

const isValidExerciseCategory = (value: unknown): value is ExerciseCategory =>
  value === "strength" || value === "mobility" || value === "core" || value === "cardio" || value === "recovery";

const isValidBodyArea = (value: unknown): value is ExerciseLibraryItem["bodyArea"] =>
  value === "upper" || value === "lower" || value === "core" || value === "full";

const isValidPattern = (value: unknown): value is ExerciseLibraryItem["pattern"] =>
  value === "push" ||
  value === "pull" ||
  value === "squat" ||
  value === "hinge" ||
  value === "carry" ||
  value === "rotation" ||
  value === "brace" ||
  value === "stretch" ||
  value === "cardio";

const isValidRoutineFocus = (value: unknown): value is WorkoutRoutineFocus =>
  value === "full" || value === "upper" || value === "lower" || value === "core" || value === "mobility" || value === "cardio";

const isValidRoutineEnergy = (value: unknown): value is WorkoutRoutineEnergy =>
  value === "low" || value === "medium" || value === "high";

const isValidRoutineTime = (value: unknown): value is WorkoutRoutineTime =>
  value === "short" || value === "medium" || value === "long";

const normalizeRoutineEquipment = (value: unknown): WorkoutRoutineEquipment =>
  value === "none" || value === "dumbbells" || value === "gym" ? value : "any";

const defaultExerciseLibrary: ExerciseLibraryItem[] = [
  { id: "exercise-bodyweight-squat", name: "Bodyweight squat", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-rdl", name: "Romanian deadlift", category: "strength", bodyArea: "lower", pattern: "hinge", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-goblet-squat", name: "Goblet squat", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-split-squat", name: "Split squat", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-reverse-lunge", name: "Reverse lunge", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-forward-lunge", name: "Forward lunge", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-lateral-lunge", name: "Lateral lunge", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-step-up", name: "Step-up", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-wall-sit", name: "Wall sit", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultDuration: 1 },
  { id: "exercise-glute-bridge", name: "Glute bridge", category: "strength", bodyArea: "lower", pattern: "hinge", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-single-leg-glute-bridge", name: "Single-leg glute bridge", category: "strength", bodyArea: "lower", pattern: "hinge", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-hip-thrust", name: "Hip thrust", category: "strength", bodyArea: "lower", pattern: "hinge", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-good-morning", name: "Good morning", category: "strength", bodyArea: "lower", pattern: "hinge", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-kettlebell-swing", name: "Kettlebell swing", category: "strength", bodyArea: "lower", pattern: "hinge", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-hamstring-curl", name: "Hamstring curl", category: "strength", bodyArea: "lower", pattern: "hinge", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-calf-raise", name: "Calf raise", category: "strength", bodyArea: "lower", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-tibialis-raise", name: "Tibialis raise", category: "strength", bodyArea: "lower", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-clamshell", name: "Clamshell", category: "strength", bodyArea: "lower", pattern: "rotation", defaultSets: 2, defaultReps: 12 },
  { id: "exercise-band-lateral-walk", name: "Band lateral walk", category: "strength", bodyArea: "lower", pattern: "carry", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-leg-press", name: "Leg press", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-leg-extension", name: "Leg extension", category: "strength", bodyArea: "lower", pattern: "squat", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-chest-press", name: "Chest press", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-bench-press", name: "Bench press", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-incline-press", name: "Incline press", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-shoulder-press", name: "Shoulder press", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-push-up", name: "Push-up", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-wall-push-up", name: "Wall push-up", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-incline-push-up", name: "Incline push-up", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-dip", name: "Dip", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-triceps-extension", name: "Triceps extension", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-lateral-raise", name: "Lateral raise", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-front-raise", name: "Front raise", category: "strength", bodyArea: "upper", pattern: "push", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-row", name: "Row", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-one-arm-row", name: "One-arm dumbbell row", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-seated-cable-row", name: "Seated cable row", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-lat-pulldown", name: "Lat pulldown", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-pull-up", name: "Pull-up", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 6 },
  { id: "exercise-assisted-pull-up", name: "Assisted pull-up", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 8 },
  { id: "exercise-face-pull", name: "Face pull", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-reverse-fly", name: "Reverse fly", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-biceps-curl", name: "Biceps curl", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-hammer-curl", name: "Hammer curl", category: "strength", bodyArea: "upper", pattern: "pull", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-farmer-carry", name: "Farmer carry", category: "strength", bodyArea: "full", pattern: "carry", defaultSets: 3, defaultDuration: 1 },
  { id: "exercise-suitcase-carry", name: "Suitcase carry", category: "strength", bodyArea: "full", pattern: "carry", defaultSets: 3, defaultDuration: 1 },
  { id: "exercise-bear-crawl", name: "Bear crawl", category: "strength", bodyArea: "full", pattern: "carry", defaultSets: 3, defaultDuration: 1 },
  { id: "exercise-turkish-get-up", name: "Turkish get-up", category: "strength", bodyArea: "full", pattern: "rotation", defaultSets: 2, defaultReps: 3 },
  { id: "exercise-dead-bug", name: "Dead bug", category: "core", bodyArea: "core", pattern: "brace", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-plank", name: "Plank", category: "core", bodyArea: "core", pattern: "brace", defaultSets: 3, defaultDuration: 1 },
  { id: "exercise-side-plank", name: "Side plank", category: "core", bodyArea: "core", pattern: "brace", defaultSets: 2, defaultDuration: 1 },
  { id: "exercise-pallof-press", name: "Pallof press", category: "core", bodyArea: "core", pattern: "rotation", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-bird-dog", name: "Bird dog", category: "core", bodyArea: "core", pattern: "brace", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-hollow-hold", name: "Hollow hold", category: "core", bodyArea: "core", pattern: "brace", defaultSets: 3, defaultDuration: 1 },
  { id: "exercise-mountain-climber", name: "Mountain climber", category: "core", bodyArea: "core", pattern: "brace", defaultSets: 3, defaultDuration: 1 },
  { id: "exercise-russian-twist", name: "Russian twist", category: "core", bodyArea: "core", pattern: "rotation", defaultSets: 3, defaultReps: 12 },
  { id: "exercise-wood-chop", name: "Wood chop", category: "core", bodyArea: "core", pattern: "rotation", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-marching-bridge", name: "Marching bridge", category: "core", bodyArea: "core", pattern: "brace", defaultSets: 3, defaultReps: 10 },
  { id: "exercise-cat-cow", name: "Cat-cow", category: "mobility", bodyArea: "full", pattern: "stretch", defaultReps: 10 },
  { id: "exercise-childs-pose", name: "Child's pose", category: "mobility", bodyArea: "full", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-wall-angels", name: "Wall angels", category: "mobility", bodyArea: "upper", pattern: "stretch", defaultSets: 2, defaultReps: 10 },
  { id: "exercise-chin-tuck", name: "Chin tuck", category: "mobility", bodyArea: "upper", pattern: "stretch", defaultSets: 2, defaultReps: 10 },
  { id: "exercise-scapular-wall-slide", name: "Scapular wall slide", category: "mobility", bodyArea: "upper", pattern: "stretch", defaultSets: 2, defaultReps: 10 },
  { id: "exercise-band-pull-apart", name: "Band pull-apart", category: "mobility", bodyArea: "upper", pattern: "pull", defaultSets: 2, defaultReps: 12 },
  { id: "exercise-doorway-pec-stretch", name: "Doorway pec stretch", category: "mobility", bodyArea: "upper", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-lat-stretch", name: "Lat stretch", category: "mobility", bodyArea: "upper", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-wrist-flexor-stretch", name: "Wrist flexor stretch", category: "mobility", bodyArea: "upper", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-wrist-extensor-stretch", name: "Wrist extensor stretch", category: "mobility", bodyArea: "upper", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-neck-cars", name: "Neck CARs", category: "mobility", bodyArea: "upper", pattern: "rotation", defaultReps: 5 },
  { id: "exercise-hip-flexor-stretch", name: "Hip flexor stretch", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-hamstring-stretch", name: "Hamstring stretch", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-quad-stretch", name: "Quad stretch", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-figure-four-stretch", name: "Figure-four stretch", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-piriformis-stretch", name: "Piriformis stretch", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-couch-stretch", name: "Couch stretch", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-adductor-rockback", name: "Adductor rockback", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultReps: 10 },
  { id: "exercise-worlds-greatest-stretch", name: "World's greatest stretch", category: "mobility", bodyArea: "full", pattern: "stretch", defaultReps: 5 },
  { id: "exercise-thoracic-rotation", name: "Thoracic rotation", category: "mobility", bodyArea: "upper", pattern: "stretch", defaultReps: 10 },
  { id: "exercise-open-book-stretch", name: "Open book stretch", category: "mobility", bodyArea: "upper", pattern: "rotation", defaultReps: 8 },
  { id: "exercise-thread-the-needle", name: "Thread the needle", category: "mobility", bodyArea: "upper", pattern: "rotation", defaultReps: 8 },
  { id: "exercise-ankle-rocks", name: "Ankle rocks", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultReps: 15 },
  { id: "exercise-calf-stretch", name: "Calf stretch", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultDuration: 2 },
  { id: "exercise-knee-to-wall-ankle-mobility", name: "Knee-to-wall ankle mobility", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultReps: 10 },
  { id: "exercise-90-90", name: "90/90 hip switch", category: "mobility", bodyArea: "lower", pattern: "stretch", defaultReps: 8 },
  { id: "exercise-hip-cars", name: "Hip CARs", category: "mobility", bodyArea: "lower", pattern: "rotation", defaultReps: 5 },
  { id: "exercise-shoulder-cars", name: "Shoulder CARs", category: "mobility", bodyArea: "upper", pattern: "rotation", defaultReps: 5 },
  { id: "exercise-sun-salutation", name: "Sun salutation", category: "mobility", bodyArea: "full", pattern: "stretch", defaultDuration: 5 },
  { id: "exercise-walk", name: "Walk", category: "cardio", bodyArea: "full", pattern: "cardio", defaultDuration: 20 },
  { id: "exercise-bike", name: "Bike", category: "cardio", bodyArea: "full", pattern: "cardio", defaultDuration: 20 },
  { id: "exercise-elliptical", name: "Elliptical", category: "cardio", bodyArea: "full", pattern: "cardio", defaultDuration: 20 },
  { id: "exercise-rower", name: "Rower", category: "cardio", bodyArea: "full", pattern: "cardio", defaultDuration: 15 },
  { id: "exercise-jump-rope", name: "Jump rope", category: "cardio", bodyArea: "full", pattern: "cardio", defaultDuration: 10 },
  { id: "exercise-stair-climb", name: "Stair climb", category: "cardio", bodyArea: "full", pattern: "cardio", defaultDuration: 15 },
  { id: "exercise-dance-cardio", name: "Dance cardio", category: "cardio", bodyArea: "full", pattern: "cardio", defaultDuration: 20 },
  { id: "exercise-foam-roll", name: "Foam rolling", category: "recovery", bodyArea: "full", defaultDuration: 10 },
  { id: "exercise-breathing-reset", name: "Breathing reset", category: "recovery", bodyArea: "full", pattern: "brace", defaultDuration: 5 },
  { id: "exercise-legs-up-wall", name: "Legs up the wall", category: "recovery", bodyArea: "full", pattern: "stretch", defaultDuration: 5 },
  { id: "exercise-box-breathing", name: "Box breathing", category: "recovery", bodyArea: "full", pattern: "brace", defaultDuration: 5 },
];

const importedExerciseLibrary: ExerciseLibraryItem[] = (importedWorkoutData.exercises ?? [])
  .filter((exercise) => exercise.name?.trim() && isUsableImportedStatus(exercise.status))
  .map((exercise) => ({
    id: `exercise-imported-${slugifyId(exercise.name)}`,
    name: exercise.name.trim(),
    category: isValidExerciseCategory(exercise.category) ? exercise.category : "strength",
    bodyArea: isValidBodyArea(exercise.bodyArea) ? exercise.bodyArea : undefined,
    pattern: isValidPattern(exercise.pattern) ? exercise.pattern : undefined,
    defaultSets: parseWorkoutNumber(exercise.defaultSets),
    defaultReps: parseWorkoutNumber(exercise.defaultReps),
    defaultDuration: parseWorkoutNumber(exercise.defaultDuration),
    equipment: exercise.equipment ?? null,
    status: exercise.status ?? null,
    notes: exercise.notes ?? null,
    aliases: exercise.aliases ?? [],
  }));

const mergeExerciseLibraries = (...libraries: ExerciseLibraryItem[][]): ExerciseLibraryItem[] => {
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  return libraries.flat().filter((exercise) => {
    const nameKey = normalizePlanningName(exercise.name);
    if (!nameKey || seenNames.has(nameKey) || seenIds.has(exercise.id)) return false;
    seenNames.add(nameKey);
    seenIds.add(exercise.id);
    return true;
  });
};

const starterExerciseLibrary = mergeExerciseLibraries(defaultExerciseLibrary, importedExerciseLibrary);

const findStarterExerciseByName = (name: string) => {
  const normalizedName = normalizePlanningName(name);
  return starterExerciseLibrary.find((exercise) => {
    if (normalizePlanningName(exercise.name) === normalizedName) return true;
    return (exercise.aliases ?? []).some((alias) => normalizePlanningName(alias) === normalizedName);
  });
};

const importedWorkoutRoutines: WorkoutRoutine[] = (importedWorkoutData.routines ?? [])
  .filter((routine) => routine.name?.trim() && isUsableImportedStatus(routine.status))
  .map((routine) => {
    const createdAt = importedWorkoutData.generatedAt
      ? new Date(`${importedWorkoutData.generatedAt}T00:00:00`).toISOString()
      : new Date(0).toISOString();
    const exercises = (routine.exercises ?? [])
      .map((row): WorkoutRoutineExercise | null => {
        const exercise = findStarterExerciseByName(row.name);
        if (!exercise) return null;
        return {
          exerciseId: exercise.id,
          sets: parseWorkoutNumber(row.sets),
          reps: parseWorkoutNumber(row.reps),
          weight: null,
          unit: "lbs" as const,
          duration: parseWorkoutNumber(row.duration),
          notes: row.notes ?? "",
        };
      })
      .filter((row): row is WorkoutRoutineExercise => !!row);

    return {
      id: `workout-routine-imported-${slugifyId(routine.name)}`,
      name: routine.name.trim(),
      createdAt,
      updatedAt: createdAt,
      exercises,
      focus: isValidRoutineFocus(routine.focus) ? routine.focus : "full",
      energy: isValidRoutineEnergy(routine.energy) ? routine.energy : "medium",
      timeBudget: isValidRoutineTime(routine.timeBudget) ? routine.timeBudget : "short",
      equipment: normalizeRoutineEquipment(routine.equipment),
    };
  })
  .filter((routine) => routine.exercises.length > 0);

const mergeWorkoutRoutines = (...routineLists: WorkoutRoutine[][]): WorkoutRoutine[] => {
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  return routineLists.flat().filter((routine) => {
    const nameKey = normalizePlanningName(routine.name);
    if (!nameKey || seenNames.has(nameKey) || seenIds.has(routine.id)) return false;
    seenNames.add(nameKey);
    seenIds.add(routine.id);
    return true;
  });
};

const householdChoreTemplate: Array<{
  area: string;
  chores: Array<{ name: string; target: number; frequency: Habit["frequency"] }>;
}> = [
  {
    area: "Kitchen",
    chores: [
      { name: "Reset counters", target: 4, frequency: "weekly" },
      { name: "Dishes sweep", target: 5, frequency: "weekly" },
      { name: "Fridge check", target: 1, frequency: "weekly" },
    ],
  },
  {
    area: "Bathroom",
    chores: [
      { name: "Wipe sink and mirror", target: 2, frequency: "weekly" },
      { name: "Clean toilet", target: 1, frequency: "weekly" },
      { name: "Shower/tub touch-up", target: 1, frequency: "weekly" },
    ],
  },
  {
    area: "Floors",
    chores: [
      { name: "Vacuum main paths", target: 2, frequency: "weekly" },
      { name: "Mop or spot-clean", target: 1, frequency: "weekly" },
    ],
  },
  {
    area: "Laundry",
    chores: [
      { name: "Start laundry", target: 2, frequency: "weekly" },
      { name: "Put laundry away", target: 2, frequency: "weekly" },
    ],
  },
  {
    area: "Deep care",
    chores: [
      { name: "Dust surfaces", target: 1, frequency: "weekly" },
      { name: "Trash and recycling reset", target: 1, frequency: "weekly" },
      { name: "One monthly deep clean", target: 1, frequency: "monthly" },
    ],
  },
];

const formatTimeSince = (timestamp: string): string => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return then.toLocaleDateString();
};

const formatReminderInterval = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (minutes < 10080) {
    const days = Math.round(minutes / 1440);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const weeks = Math.round(minutes / 10080);
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
};


const hourlySlots = [
  "6:00 AM",
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
  "9:00 PM",
  "10:00 PM",
];

// Canonical hourly index for each bucket slot when saving a block.
// Early morning=6AM(0), Morning=9AM(3), Afternoon=3PM(9), Evening=6PM(12), Night=9PM(15)
const BUCKET_TO_HOURLY: Record<number, number> = { 0: 0, 1: 3, 2: 9, 3: 12, 4: 15 };

// Maps an hourly index back to a bucket index for display in bucket view.
// Anchors: Early morning=6AM(0), Morning=9AM(3), Afternoon=3PM(9), Evening=6PM(12), Night=9PM(15)
// Ranges:  0–2→Early morning, 3–8→Morning, 9–11→Afternoon, 12–14→Evening, 15–16→Night
const getBucketForHourlyIndex = (hourlyIndex: number): number => {
  if (hourlyIndex <= 2) return 0;
  if (hourlyIndex <= 8) return 1;
  if (hourlyIndex <= 11) return 2;
  if (hourlyIndex <= 14) return 3;
  return 4;
};

type ViewMode = "hourly" | "buckets";
type DesktopPlannerSurface = "stack" | "week";
type MobileHomeView = "today" | "stack" | "planner" | "themes";
type OverlayPanel = "routines" | "workout" | "outliner";
type SlotCaptureMode = "task" | "note";
type MobileCaptureMode = "block" | "note" | "task";
type MobileCaptureDestination = "waiting" | "today" | "theme-note" | "habit-note";

type PendingQuickCapture = {
  id: string;
  label: string;
  mode: MobileCaptureMode;
  destination: MobileCaptureDestination;
  captureLabel: string;
  hashtag?: string;
  themeId?: string;
  habitId?: string;
  dayIndex?: number;
  timeIndex?: number;
  createdAt: string;
};

const UNSORTED_HABIT_THEME_NAME = "Not sorted";
const OUTLINER_TOP_LEVEL_PARENT = "__top-level__";
const OUTLINER_NEW_PARENT = "__new-parent__";

const defaultAmbientSettings: AmbientSettings = {
  layout: "focus",
  routineId: "auto",
  showClock: true,
  showRoutine: true,
  showNextBlock: true,
  showNextTask: true,
  showQuickNote: true,
  showWaiting: false,
  keepAwake: false,
};

const createAmbientSettingsKey = (userId: string) => `ambient-settings:${userId}`;
const createWeeklyIntentionsKey = (userId: string, weekStartDate: string) =>
  `weekly-habit-intentions:${userId}:${weekStartDate}`;
const createWeeklyRoutineIntentionsKey = (userId: string, weekStartDate: string) =>
  `weekly-routine-intentions:${userId}:${weekStartDate}`;
const createPendingQuickCapturesKey = (userId: string) => `pending-quick-captures:${userId}`;

const loadAmbientSettings = (userId: string): AmbientSettings => {
  try {
    const saved = window.localStorage.getItem(createAmbientSettingsKey(userId));
    if (!saved) return defaultAmbientSettings;
    return { ...defaultAmbientSettings, ...(JSON.parse(saved) as Partial<AmbientSettings>) };
  } catch {
    return defaultAmbientSettings;
  }
};

const loadWeeklyHabitIntentions = (userId: string, weekStartDate: string): WeeklyHabitIntention[] => {
  try {
    const saved = window.localStorage.getItem(createWeeklyIntentionsKey(userId, weekStartDate));
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Partial<WeeklyHabitIntention>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((intention) => ({
        id: intention.id ?? createClientId("weekly-intention"),
        habitId: intention.habitId ?? "",
        habitName: intention.habitName ?? "Habit",
        themeId: intention.themeId ?? "",
        themeName: intention.themeName ?? "Theme",
        weekStartDate: intention.weekStartDate ?? weekStartDate,
        desiredCount: Math.max(1, intention.desiredCount ?? 1),
        preferredDayIndexes: Array.isArray(intention.preferredDayIndexes)
          ? intention.preferredDayIndexes.filter(
              (dayIndex): dayIndex is number =>
                typeof dayIndex === "number" && dayIndex >= 0 && dayIndex < days.length
            )
          : [],
        placements: Array.isArray(intention.placements)
          ? intention.placements
              .filter(
                (placement): placement is WeeklyHabitIntentionPlacement =>
                  typeof placement?.dayIndex === "number" && typeof placement?.timeIndex === "number"
              )
              .map((placement) => ({
                id: placement.id ?? createClientId("intention-slot"),
                dayIndex: placement.dayIndex,
                timeIndex: placement.timeIndex,
              }))
          : [],
      }))
      .filter((intention) => intention.habitId && intention.placements.length > 0);
  } catch {
    return [];
  }
};

const loadWeeklyRoutineIntentions = (userId: string, weekStartDate: string): WeeklyRoutineIntention[] => {
  try {
    const saved = window.localStorage.getItem(createWeeklyRoutineIntentionsKey(userId, weekStartDate));
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Partial<WeeklyRoutineIntention>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((intention) => ({
        id: intention.id ?? createClientId("weekly-routine-intention"),
        routineId: intention.routineId ?? "",
        routineName: intention.routineName ?? "Routine",
        weekStartDate: intention.weekStartDate ?? weekStartDate,
        desiredCount: Math.max(1, intention.desiredCount ?? 1),
        preferredDayIndexes: Array.isArray(intention.preferredDayIndexes)
          ? intention.preferredDayIndexes.filter(
              (dayIndex): dayIndex is number =>
                typeof dayIndex === "number" && dayIndex >= 0 && dayIndex < days.length
            )
          : [],
        placements: Array.isArray(intention.placements)
          ? intention.placements
              .filter(
                (placement): placement is WeeklyHabitIntentionPlacement =>
                  typeof placement?.dayIndex === "number" && typeof placement?.timeIndex === "number"
              )
              .map((placement) => ({
                id: placement.id ?? createClientId("routine-intention-slot"),
                dayIndex: placement.dayIndex,
                timeIndex: placement.timeIndex,
              }))
          : [],
      }))
      .filter((intention) => intention.routineId && intention.placements.length > 0);
  } catch {
    return [];
  }
};

const loadPendingQuickCaptures = (userId: string): PendingQuickCapture[] => {
  try {
    const saved = window.localStorage.getItem(createPendingQuickCapturesKey(userId));
    if (!saved) return [];
    const parsed = JSON.parse(saved) as Partial<PendingQuickCapture>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: item.id ?? createClientId("pending-capture"),
        label: item.label ?? "",
        mode: item.mode === "task" || item.mode === "note" || item.mode === "block" ? item.mode : "note",
        destination:
          item.destination === "today" ||
          item.destination === "theme-note" ||
          item.destination === "habit-note" ||
          item.destination === "waiting"
            ? item.destination
            : "waiting",
        captureLabel: item.captureLabel ?? item.label ?? "",
        hashtag: item.hashtag,
        themeId: item.themeId,
        habitId: item.habitId,
        dayIndex: typeof item.dayIndex === "number" ? item.dayIndex : undefined,
        timeIndex: typeof item.timeIndex === "number" ? item.timeIndex : undefined,
        createdAt: item.createdAt ?? new Date().toISOString(),
      }))
      .filter((item) => item.label.trim());
  } catch {
    return [];
  }
};

const MissingSupabaseConfigScreen = () => (
  <div className="setup-screen">
    <div className="setup-card">
      <span className="setup-kicker">Setup needed</span>
      <h1>The app needs your Supabase keys before it can load.</h1>
      <p>
        Add a file named <code>.env</code> in the app folder with your project URL and anon key,
        then restart the local server.
      </p>
      <pre>{`VITE_SUPABASE_URL=your Supabase project URL
VITE_SUPABASE_ANON_KEY=your anon public key`}</pre>
      <p className="setup-note">
        You can find both in Supabase under Project Settings, then API.
      </p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [calendarDate, setCalendarDate] = useState(() => localDateKey(new Date()));
  const [habitProgressRecords, setHabitProgressRecords] = useState<HabitProgressRecord[]>([]);
  const habitProgressRequest = useRef(0);
  const pendingHabitCompletions = useRef(new Set<string>());
  const pendingBlockCompletions = useRef(new Set<string>());
  const completionAction = useRef<(id: string, desired?: boolean, undo?: boolean) => Promise<void>>(async () => {});

  const [leftColWidth, setLeftColWidth] = useState<number>(320);
  const [themeDetailsId, setThemeDetailsId] = useState<string | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(true);
  const outlineMutationQueue = useRef<Promise<void>>(Promise.resolve());
  const [outlineSaveStatus, setOutlineSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const [expandedCols, setExpandedCols] = useState<Set<number>>(new Set());
  const [dayColWidths, setDayColWidths] = useState<Record<number, number>>({});
  const dayResizeState = useRef<{ dayIndex: number; startX: number; startWidth: number } | null>(null);

  const toggleColExpanded = useCallback((dayIndex: number) => {
    setExpandedCols(prev => {
      const next = new Set(prev);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return next;
    });
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = leftColWidth;
    e.preventDefault();
  }, [leftColWidth]);

  const handleDayResizeMouseDown = useCallback((dayIndex: number, currentWidth: number, e: React.MouseEvent) => {
    dayResizeState.current = {
      dayIndex,
      startX: e.clientX,
      startWidth: currentWidth,
    };
    e.preventDefault();
    e.stopPropagation();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = e.clientX - resizeStartX.current;
      setLeftColWidth(Math.max(240, Math.min(600, resizeStartWidth.current + delta)));
    };
    const onMouseUp = () => { isResizing.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const resizeState = dayResizeState.current;
      if (!resizeState) return;

      const delta = e.clientX - resizeState.startX;
      const nextWidth = Math.max(46, Math.min(360, resizeState.startWidth + delta));
      setDayColWidths((prev) => ({
        ...prev,
        [resizeState.dayIndex]: nextWidth,
      }));
    };
    const onMouseUp = () => {
      dayResizeState.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const [themes, setThemes] = useState<Theme[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>(starterExerciseLibrary);
  const [blockExercises, setBlockExercises] = useState<Record<string, WorkoutBlockExercise[]>>({});
  const [workoutBlockRoutineLinks, setWorkoutBlockRoutineLinks] = useState<Record<string, string>>({});
  const [exerciseHistory, setExerciseHistory] = useState<Record<string, WorkoutExerciseHistoryEntry[]>>({});
  const [workoutRoutines, setWorkoutRoutines] = useState<WorkoutRoutine[]>([]);
  const [workoutRoutineHistory, setWorkoutRoutineHistory] = useState<WorkoutRoutineHistoryEntry[]>([]);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dragHabitId, setDragHabitId] = useState<string | null>(null);
  const [dragOverThemeId, setDragOverThemeId] = useState<string | null>(null);

  const [desktopPlannerSurface, setDesktopPlannerSurface] = useState<DesktopPlannerSurface>("stack");
  const [viewMode, setViewMode] = useState<ViewMode>("hourly");
  const [bucketSlots, setBucketSlots] = useState<string[]>([
    "Early morning",
    "Morning",
    "Afternoon",
    "Evening",
    "Night",
  ]);
  const [showBucketConfig, setShowBucketConfig] = useState(false);

  const [addingThemeId, setAddingThemeId] = useState<string | null>(null);
  const [newThemeHabitName, setNewThemeHabitName] = useState("");
  const [newThemeHabitTarget, setNewThemeHabitTarget] = useState<number>(2);
  const [newThemeHabitFrequency, setNewThemeHabitFrequency] = useState<"daily" | "weekly" | "monthly" | "none">("weekly");
  const [newThemeHabitGroupId, setNewThemeHabitGroupId] = useState<string>("");
  const [expandedHabits, setExpandedHabits] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [collapsedSubtasks, setCollapsedSubtasks] = useState<Set<string>>(new Set());

  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editHabitName, setEditHabitName] = useState("");
  const [editHabitTarget, setEditHabitTarget] = useState<number>(2);
  const [editHabitFrequency, setEditHabitFrequency] = useState<"daily" | "weekly" | "monthly" | "none">("weekly");
  const [editHabitGroupId, setEditHabitGroupId] = useState<string>("");
  const [reshapingHabitId, setReshapingHabitId] = useState<string | null>(null);
  const [reshapingThemeId, setReshapingThemeId] = useState<string | null>(null);
  const [shapeTargetThemeId, setShapeTargetThemeId] = useState("");

  const [managingGroupsForTheme, setManagingGroupsForTheme] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState<"strength_training" | "custom">("custom");

  const [addingSubtaskForHabitId, setAddingSubtaskForHabitId] = useState<string | null>(null);
  const [newSubtaskName, setNewSubtaskName] = useState("");
  const [newSubtaskFrequency, setNewSubtaskFrequency] = useState<"daily" | "weekly" | "monthly" | "none">("weekly");
  const [newSubtaskTarget, setNewSubtaskTarget] = useState<number>(2);

  const [linkConfirmation, setLinkConfirmation] = useState<{
    blockId1: string;
    blockId2: string;
  } | null>(null);

  const [renamingSession, setRenamingSession] = useState<SessionGroup | null>(null);
  const [sessionRenameValue, setSessionRenameValue] = useState("");

  const [newThemeName, setNewThemeName] = useState("");
  const [newThemeType, setNewThemeType] = useState<ThemeType>("habit");
  const [addingMealForThemeId, setAddingMealForThemeId] = useState<string | null>(null);
  const [mealPopoverBlockId, setMealPopoverBlockId] = useState<string | null>(null);

  const [blockLabel, setBlockLabel] = useState("");
  const [blockHashtag, setBlockHashtag] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [notesThemeId, setNotesThemeId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [renamingThemeId, setRenamingThemeId] = useState<string | null>(null);
  const [renameThemeValue, setRenameThemeValue] = useState("");

  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editBlockLabel, setEditBlockLabel] = useState("");

  const [convertingBlockId, setConvertingBlockId] = useState<string | null>(null);
  const [convertFrequency, setConvertFrequency] = useState<"daily" | "weekly" | "monthly" | "none">("weekly");
  const [convertTarget, setConvertTarget] = useState(3);
  const [convertGroupId, setConvertGroupId] = useState("");

  const [ghostBlocks, setGhostBlocks] = useState<GhostBlockType[]>([]);
  const [showGhostBlocks, setShowGhostBlocks] = useState(true);
  const [weeklyIntentions, setWeeklyIntentions] = useState<WeeklyHabitIntention[]>([]);
  const [weeklyRoutineIntentions, setWeeklyRoutineIntentions] = useState<WeeklyRoutineIntention[]>([]);
  const [planningIntentionHabitId, setPlanningIntentionHabitId] = useState<string | null>(null);
  const [planningIntentionCount, setPlanningIntentionCount] = useState(3);
  const [planningIntentionDayIndexes, setPlanningIntentionDayIndexes] = useState<number[]>([]);
  const [showQuickStartModal, setShowQuickStartModal] = useState(false);
  const [dailyPriorities, setDailyPriorities] = useState<Array<{ block_id: string | null; priority_rank: number }>>([]);
  const [creditPopoverBlockId, setCreditPopoverBlockId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showRoutineNotes, setShowRoutineNotes] = useState(false);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>();
  const [planView, setPlanView] = useState<PlanView>("stack");
  const [showAddPlanner, setShowAddPlanner] = useState(false);
  const [captureThemeId, setCaptureThemeId] = useState("");
  const [captureKind, setCaptureKind] = useState<"task" | "note" | "habit">("task");
  const pendingCapture = useRef<{ key: string; node: OutlineNode } | null>(null);
  const [routineCaptureNode, setRoutineCaptureNode] = useState<OutlineNode | null>(null);
  const [gridItemSelection, setGridItemSelection] = useState<{ blockId: string; existing?: { id: string; inTrash: boolean } } | null>(null);
  const gridHabitDrafts = useRef(new Map<string, { habitId: string; themeId: string; linkedExisting?: boolean }>());
  const [planSelection, setPlanSelection] = useState<{ id?: string; date: string; blockId?: string; softPlanId?: string; time?: number; mode?: PlanMode; targetCount?: number; requestId?: string } | null>(null);
  const recurringDraftIds = useRef(new Map<string, string>());
  const softPlanSaving = useRef(false);
  const softPlanBlockIds = useRef(new Map<string, string>());
  const [todayNoteId, setTodayNoteId] = useState<string | null>(null);
  const [showWorkoutLibrary, setShowWorkoutLibrary] = useState(false);
  const [showPlanningOutliner, setShowPlanningOutliner] = useState(false);
  const [showSoftPlanPanel, setShowSoftPlanPanel] = useState(false);
  const [showAmbientMode, setShowAmbientMode] = useState(false);
  const [ambientSettings, setAmbientSettings] = useState<AmbientSettings>(defaultAmbientSettings);
  const [ambientQuickNote, setAmbientQuickNote] = useState("");
  const [ambientWakeLockActive, setAmbientWakeLockActive] = useState(false);
  const [ambientWakeLockError, setAmbientWakeLockError] = useState("");
  const ambientWakeLockRef = useRef<{ release: () => Promise<void>; addEventListener: (type: "release", listener: () => void) => void } | null>(null);
  const launchParamsHandledRef = useRef(false);
  const keepMobileDayOnWeekChangeRef = useRef(false);
  const mobileQuickCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const syncingPendingCapturesRef = useRef(false);
  const [showPlanningMenu, setShowPlanningMenu] = useState(false);
  const [showQuickHabit, setShowQuickHabit] = useState(false);
  const [outlinerReminder, setOutlinerReminder] = useState<OutlinerReminder | null>(null);
  const [showSmartWeeklySetup, setShowSmartWeeklySetup] = useState(false);
  const [smartWeeklyLoading, setSmartWeeklyLoading] = useState(false);
  const [smartWeeklyApplying, setSmartWeeklyApplying] = useState(false);
  const [smartWeeklySuggestions, setSmartWeeklySuggestions] = useState<SmartWeekSuggestion[]>([]);
  const [mobileDayIndex, setMobileDayIndex] = useState(0);
  const [mobileHomeView, setMobileHomeView] = useState<MobileHomeView>("themes");
  const outlineScrollPosition = useRef({ root: 0, window: 0 });
  const [mobileCaptureMode, setMobileCaptureMode] = useState<MobileCaptureMode>("block");
  const [mobileCaptureDestination, setMobileCaptureDestination] = useState<MobileCaptureDestination>("waiting");
  const [mobileCaptureThemeId, setMobileCaptureThemeId] = useState("");
  const [mobileCaptureHabitId, setMobileCaptureHabitId] = useState("");
  const [slotCaptureTarget, setSlotCaptureTarget] = useState<{
    dayIndex: number;
    timeIndex: number;
    mode: SlotCaptureMode;
  } | null>(null);
  const [slotCaptureText, setSlotCaptureText] = useState("");
  const [slotCaptureHabitId, setSlotCaptureHabitId] = useState('');
  const [slotCaptureBusy, setSlotCaptureBusy] = useState(false);
  const [slotCaptureError, setSlotCaptureError] = useState('');
  const slotCaptureSaving = useRef(false);
  const slotCaptureDraft = useRef<GridCaptureDraft | null>(null);
  const [mobileQuickCapturePrimed, setMobileQuickCapturePrimed] = useState(false);
  const [mobileQuickCaptureOpen, setMobileQuickCaptureOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [pendingQuickCaptures, setPendingQuickCaptures] = useState<PendingQuickCapture[]>([]);
  const [mobileHabitPickerSlot, setMobileHabitPickerSlot] = useState<{
    dayIndex: number;
    timeIndex: number;
  } | null>(null);
  const [mobileHabitPickerQuery, setMobileHabitPickerQuery] = useState("");
  const [outlinerNodes, setOutlinerNodes] = useState<OutlineNode[]>([]);
  const latestOutlineNodes = useRef(outlinerNodes);
  latestOutlineNodes.current = outlinerNodes;
  const [outlinerRefreshKey, setOutlinerRefreshKey] = useState(0);
  const [outlinerFocusNodeId, setOutlinerFocusNodeId] = useState<string | null>(null);
  const [outlinerFocusRequestKey, setOutlinerFocusRequestKey] = useState(0);
  const [waitingOutlinerParentBlockId, setWaitingOutlinerParentBlockId] = useState<string | null>(null);
  const [waitingOutlinerParentNodeId, setWaitingOutlinerParentNodeId] = useState(OUTLINER_TOP_LEVEL_PARENT);
  const [waitingOutlinerNewParentName, setWaitingOutlinerNewParentName] = useState("");
  const [storedRoutineTabs, setRoutineTabs] = useState<RoutineTab[]>([]);
  const routineTabs = useMemo(() => resolveRoutineOutlineLabels(storedRoutineTabs, outlinerNodes), [storedRoutineTabs, outlinerNodes]);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const showToast = useCallback((message: string, type: ToastItem["type"] = "info", action?: ToastItem["action"]) => {
    const id = createToastId();
    setToasts((prev) => [...prev, { id, message, type, action }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshHabitProgress = useCallback(async () => {
    const request = ++habitProgressRequest.current;
    if (!user) {
      setHabitProgressRecords([]);
      return;
    }
    try {
      const records = await database.blocks.getHabitProgress(user.id);
      if (request === habitProgressRequest.current) setHabitProgressRecords(records);
    } catch (error) {
      console.error("Error loading habit progress:", error);
      if (request === habitProgressRequest.current) showToast("Could not refresh habit progress. Please reload to try again.", "error");
    }
  }, [user, showToast]);

  useEffect(() => {
    const checkDate = () => setCalendarDate(localDateKey(new Date()));
    const timer = window.setInterval(checkDate, 30000);
    window.addEventListener("focus", checkDate);
    document.addEventListener("visibilitychange", checkDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkDate);
      document.removeEventListener("visibilitychange", checkDate);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      ++habitProgressRequest.current;
      setHabitProgressRecords([]);
    }
  }, [user]);

  const persistWeeklyIntentions = (nextIntentions: WeeklyHabitIntention[]) => {
    setWeeklyIntentions(nextIntentions);
    if (!user) return;
    const weekStartDate = getWeekStartDateString(weekOffset);
    window.localStorage.setItem(
      createWeeklyIntentionsKey(user.id, weekStartDate),
      JSON.stringify(nextIntentions)
    );
  };

  const persistWeeklyRoutineIntentions = (nextIntentions: WeeklyRoutineIntention[]) => {
    setWeeklyRoutineIntentions(nextIntentions);
    if (!user) return;
    const weekStartDate = getWeekStartDateString(weekOffset);
    window.localStorage.setItem(
      createWeeklyRoutineIntentionsKey(user.id, weekStartDate),
      JSON.stringify(nextIntentions)
    );
  };

  const savePendingQuickCaptures = (nextCaptures: PendingQuickCapture[]) => {
    setPendingQuickCaptures(nextCaptures);
    if (!user) return;
    window.localStorage.setItem(
      createPendingQuickCapturesKey(user.id),
      JSON.stringify(nextCaptures)
    );
  };

  const triggerMobileTap = () => {
    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }
  };

  const refreshRoutineTabs = useCallback(() => {
    if (!user) {
      setRoutineTabs([]);
      return [] as RoutineTab[];
    }

    const loaded = loadRoutineNotes(user.id);
    // Persist generated IDs before linking default checklists into Outline.
    saveRoutineNotes(user.id, loaded);
    setRoutineTabs(loaded);
    return loaded;
  }, [user]);

  const updateAmbientSettings = useCallback(
    (updates: Partial<AmbientSettings>) => {
      setAmbientSettings((current) => {
        const next = { ...current, ...updates };
        if (user) {
          window.localStorage.setItem(createAmbientSettingsKey(user.id), JSON.stringify(next));
        }
        return next;
      });
    },
    [user]
  );

  const openOverlayPanel = useCallback((panel: OverlayPanel) => {
    setShowRoutineNotes(panel === "routines");
    setShowWorkoutLibrary(panel === "workout");
    setShowPlanningOutliner(panel === "outliner");
    if (panel === "outliner") {
      setThemeDetailsId(null);
      setMobileHomeView("themes");
      window.setTimeout(() => document.getElementById("planning-outline")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  }, []);

  const toggleOverlayPanel = useCallback(
    (panel: OverlayPanel) => {
      if (panel === "outliner") {
        openOverlayPanel(panel);
        return;
      }
      const isOpen =
        (panel === "routines" && showRoutineNotes) ||
        (panel === "workout" && showWorkoutLibrary);

      if (isOpen) {
        setShowRoutineNotes(false);
        setShowWorkoutLibrary(false);
        setShowPlanningOutliner(false);
        return;
      }

      openOverlayPanel(panel);
    },
    [openOverlayPanel, showPlanningOutliner, showRoutineNotes, showWorkoutLibrary]
  );

  const closeOverlayPanels = useCallback(() => {
    setShowRoutineNotes(false);
    setShowWorkoutLibrary(false);
    setShowPlanningOutliner(false);
  }, []);

  const openAmbientMode = useCallback(() => {
    refreshRoutineTabs();
    closeOverlayPanels();
    setShowPlanningMenu(false);
    setShowAmbientMode(true);
  }, [closeOverlayPanels, refreshRoutineTabs]);

  const closeAmbientMode = useCallback(() => {
    setShowAmbientMode(false);
  }, []);

  const resetMobileTabViewport = useCallback((button?: HTMLButtonElement) => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement ||
      activeElement instanceof HTMLButtonElement
    ) {
      activeElement.blur();
    }
    button?.blur();
    setMobileQuickCapturePrimed(false);
    window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      [
        document.documentElement,
        document.body,
        document.querySelector(".app"),
        document.querySelector(".right-column"),
        document.querySelector(".mobile-use-view"),
      ].forEach((element) => {
        if (element instanceof HTMLElement) {
          element.scrollLeft = 0;
        }
      });
    }, 0);
  }, []);

  const handleMobileHomeNav = (view: MobileHomeView, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resetMobileTabViewport(event.currentTarget);
    setMobileHomeView(view);
    if (view === "today") {
      setMobileDayIndex(todayDayIndex >= 0 ? todayDayIndex : 0);
    }
    setMobileMoreOpen(false);
    closeOverlayPanels();
  };

  const handleMobileOverlayNav = (panel: OverlayPanel, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resetMobileTabViewport(event.currentTarget);
    setMobileMoreOpen(false);
    toggleOverlayPanel(panel);
  };

  const handleMobileAmbientNav = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resetMobileTabViewport(event.currentTarget);
    setMobileMoreOpen(false);
    openAmbientMode();
  };

  const checkOutlinerReminders = useCallback(() => {
    if (!user) return;
    getDueOutlinerReminder(user.id).then((reminder) => {
      setOutlinerReminder((current) => current ?? reminder);
    }).catch((error) => console.error("Error loading outline reminders:", error));
  }, [user]);

  const showConfirm = useCallback((message: string, onConfirm: () => void, options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean }) => {
    setConfirmDialog({ message, onConfirm, confirmLabel: options?.confirmLabel, cancelLabel: options?.cancelLabel, destructive: options?.destructive });
  }, []);

  useEffect(() => {
    if (!user) {
      setRoutineTabs([]);
      setAmbientSettings(defaultAmbientSettings);
      setShowAmbientMode(false);
      setOutlinerNodes([]);
      setWeeklyIntentions([]);
      setWeeklyRoutineIntentions([]);
      setPendingQuickCaptures([]);
      return;
    }

    refreshRoutineTabs();
    setAmbientSettings(loadAmbientSettings(user.id));
    setPendingQuickCaptures(loadPendingQuickCaptures(user.id));
  }, [user, refreshRoutineTabs]);

  useEffect(() => {
    if (!user) return;
    const update = (event: Event) => {
      if (event instanceof StorageEvent ? event.key === createRoutineStorageKey(user.id) || event.key === null : (event as CustomEvent).detail === user.id) {
        setRoutineTabs(loadRoutineNotes(user.id));
      }
    };
    window.addEventListener('storage', update);
    window.addEventListener(routineNotesChanged, update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener(routineNotesChanged, update); };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setWeeklyIntentions([]);
      setWeeklyRoutineIntentions([]);
      return;
    }

    const weekStartDate = getWeekStartDateString(weekOffset);
    setWeeklyIntentions(loadWeeklyHabitIntentions(user.id, weekStartDate));
    setWeeklyRoutineIntentions(loadWeeklyRoutineIntentions(user.id, weekStartDate));
    setPlanningIntentionHabitId(null);
  }, [user, weekOffset, calendarDate]);

  useEffect(() => {
    if (!themes.length) {
      setMobileCaptureThemeId("");
      setMobileCaptureHabitId("");
      return;
    }

    setMobileCaptureThemeId((current) =>
      current && themes.some((theme) => theme.id === current) ? current : themes[0].id
    );

    setMobileCaptureHabitId((current) => {
      const habitIds = themes.flatMap((theme) =>
        flattenHabits(theme.habits, theme.name, theme.id).map((habit) => habit.id)
      );
      return current && habitIds.includes(current) ? current : habitIds[0] ?? "";
    });
  }, [themes]);

  useEffect(() => {
    if (!user || dataLoading) return;
    let cancelled = false;
    setOutlineLoading(true);

    const mapHabitForOutliner = (habit: Habit, theme: Theme): SyncHabitToOutlinerInput => ({
      habitId: habit.id,
      habitName: habit.name,
      themeId: theme.id,
      themeName: theme.name,
      frequency: habit.frequency,
      target: habit.targetPerWeek,
      subtasks: habit.subtasks.map((subtask) => mapHabitForOutliner(subtask, theme)),
    });

    outlineMutationQueue.current.catch(() => {}).then(() => syncThemesToPlanningOutliner(
      user.id,
      themes.map((theme) => ({
        themeId: theme.id,
        themeName: theme.name,
        habits: theme.habits.map((habit) => mapHabitForOutliner(habit, theme)),
        blocks: blocks
          .filter((block) => block.location.type === "unscheduled" && block.themeId === theme.id && !block.habitId)
          .map((block) => ({
            blockId: block.id,
            label: cleanBlockLabel(block),
            tag: getBlockKindLabel(block) === "Task" ? "task" : "note",
            draftNote: getBlockKindLabel(block) === "Note" ? cleanBlockLabel(block) : block.blockNote ?? "",
          })),
      }))
    ))
      .then(async (result) => {
        if (!cancelled) {
          const routineIds = new Set<string>();
          const collect = (nodes: OutlineNode[]) => nodes.forEach(node => { if (node.linked?.routineId) routineIds.add(node.linked.routineId); collect(node.children); });
          collect(result.nodes);
          const missingRoutines = loadRoutineNotes(user.id).filter(routine => !routineIds.has(routine.id));
          if (missingRoutines.length) {
            result.nodes = [...result.nodes, ...missingRoutines.map(routine => ({ ...createOutlineNode(routine.name), linked: { routineId: routine.id, label: routine.name } }))];
            await savePlanningOutliner(user.id, result.nodes);
          }
          if (cancelled) return;
          setOutlinerNodes(result.nodes);
          setOutlineLoading(false);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Error loading outline:", error);
        showToast("Could not load Outline. Please reload to try again.", "error");
      });
    return () => { cancelled = true; };
  }, [user, dataLoading, outlinerRefreshKey]);

  useEffect(() => {
    if (!user || launchParamsHandledRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const capture = params.get("capture");
    const panel = params.get("panel");
    const section = params.get("section");
    const view = params.get("view");

    const openQuickNoteCapture = () => {
      setMobileHomeView("themes");
      setCaptureKind("note");
      setCaptureThemeId("");
      closeOverlayPanels();
      setShowAddPlanner(true);
    };

    if (params.get("mode") === "ambient") {
      openAmbientMode();
      launchParamsHandledRef.current = true;
      return;
    }

    if (capture === "note" || capture === "task") {
      if (capture === "note") {
        openQuickNoteCapture();
      } else {
        setMobileHomeView("themes");
        closeOverlayPanels();
        setCaptureKind("task");
        setCaptureThemeId("");
        setShowAddPlanner(true);
      }
      launchParamsHandledRef.current = true;
      return;
    }

    if (panel === "workout" || panel === "routines" || panel === "outliner") {
      setMobileHomeView("today");
      openOverlayPanel(panel);
      launchParamsHandledRef.current = true;
      return;
    }

    if (view === "planner" || view === "themes" || view === "today") {
      setMobileHomeView(view);
      closeOverlayPanels();
      if (section === "waiting") {
        window.setTimeout(() => {
          document.getElementById("mobile-waiting-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 250);
      }
      launchParamsHandledRef.current = true;
      return;
    }

    getNativePlannerLaunchTarget().then((target) => {
      if (!target || launchParamsHandledRef.current) return;

      if (target === "quick-note") {
        openQuickNoteCapture();
      } else {
        setMobileHomeView("today");
        closeOverlayPanels();
      }
      launchParamsHandledRef.current = true;
    });
  }, [closeOverlayPanels, openAmbientMode, openOverlayPanel, user]);

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user, weekOffset, calendarDate]);

  const ambientWakeLockSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    let cancelled = false;

    const releaseWakeLock = async () => {
      const currentWakeLock = ambientWakeLockRef.current;
      ambientWakeLockRef.current = null;
      if (currentWakeLock) {
        try {
          await currentWakeLock.release();
        } catch {
          // The browser may have already released it.
        }
      }
      if (!cancelled) {
        setAmbientWakeLockActive(false);
      }
    };

    const requestWakeLock = async () => {
      if (!ambientWakeLockSupported) {
        setAmbientWakeLockActive(false);
        setAmbientWakeLockError("Screen awake is not available in this browser.");
        return;
      }

      try {
        const wakeLockApi = (navigator as Navigator & {
          wakeLock?: {
            request: (type: "screen") => Promise<{
              release: () => Promise<void>;
              addEventListener: (type: "release", listener: () => void) => void;
            }>;
          };
        }).wakeLock;
        const wakeLock = await wakeLockApi?.request("screen");
        if (!wakeLock || cancelled) return;
        ambientWakeLockRef.current = wakeLock;
        setAmbientWakeLockActive(true);
        setAmbientWakeLockError("");
        wakeLock.addEventListener("release", () => {
          ambientWakeLockRef.current = null;
          setAmbientWakeLockActive(false);
        });
      } catch (error) {
        setAmbientWakeLockActive(false);
        setAmbientWakeLockError(error instanceof Error ? error.message : "Screen awake could not be enabled.");
      }
    };

    if (!showAmbientMode || !ambientSettings.keepAwake) {
      releaseWakeLock();
      return () => {
        cancelled = true;
      };
    }

    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !ambientWakeLockRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [ambientSettings.keepAwake, ambientWakeLockSupported, showAmbientMode]);

  useEffect(() => {
    if (!user) {
      setOutlinerReminder(null);
      return;
    }

    checkOutlinerReminders();
    const timer = window.setInterval(checkOutlinerReminders, 30000);
    return () => window.clearInterval(timer);
  }, [user, checkOutlinerReminders]);

  useEffect(() => {
    if (!user) {
      setExerciseLibrary(defaultExerciseLibrary);
      setBlockExercises({});
      setWorkoutBlockRoutineLinks({});
      setExerciseHistory({});
      setWorkoutRoutines([]);
      setWorkoutRoutineHistory([]);
      return;
    }

    try {
      const savedLibrary = window.localStorage.getItem(`exercise-library:${user.id}`);
      const savedBlockExercises = window.localStorage.getItem(`workout-block-exercises:${user.id}`);
      const savedBlockRoutineLinks = window.localStorage.getItem(`workout-block-routine-links:${user.id}`);
      const savedExerciseHistory = window.localStorage.getItem(`workout-exercise-history:${user.id}`);
      const savedWorkoutRoutines = window.localStorage.getItem(`workout-routines:${user.id}`);
      const savedWorkoutRoutineHistory = window.localStorage.getItem(`workout-routine-history:${user.id}`);
      const parsedLibrary = savedLibrary
        ? (JSON.parse(savedLibrary) as ExerciseLibraryItem[])
        : [];
      setExerciseLibrary(mergeExerciseLibraries(starterExerciseLibrary, parsedLibrary));
      setBlockExercises(
        savedBlockExercises
          ? (JSON.parse(savedBlockExercises) as Record<string, WorkoutBlockExercise[]>)
          : {}
      );
      setWorkoutBlockRoutineLinks(
        savedBlockRoutineLinks
          ? (JSON.parse(savedBlockRoutineLinks) as Record<string, string>)
          : {}
      );
      setExerciseHistory(
        savedExerciseHistory
          ? (JSON.parse(savedExerciseHistory) as Record<string, WorkoutExerciseHistoryEntry[]>)
          : {}
      );
      const parsedWorkoutRoutines = savedWorkoutRoutines ? (JSON.parse(savedWorkoutRoutines) as WorkoutRoutine[]) : [];
      setWorkoutRoutines(mergeWorkoutRoutines(parsedWorkoutRoutines, importedWorkoutRoutines));
      setWorkoutRoutineHistory(
        savedWorkoutRoutineHistory
          ? (JSON.parse(savedWorkoutRoutineHistory) as WorkoutRoutineHistoryEntry[])
          : []
      );
    } catch (error) {
      console.error("Error loading exercise library:", error);
      setExerciseLibrary(defaultExerciseLibrary);
      setBlockExercises({});
      setWorkoutBlockRoutineLinks({});
      setExerciseHistory({});
      setWorkoutRoutines([]);
      setWorkoutRoutineHistory([]);
    }
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;

    setDataLoading(true);
    try {
      const weekStartDate = getWeekStartDateString(weekOffset);
      const [themesData, habitsData, blocksData, groupsData, sessionGroupsData, mealsData] = await Promise.all([
        database.themes.getAll(user.id),
        database.habits.getAll(user.id),
        database.blocks.getForWeek(user.id, weekStartDate),
        database.habitGroups.getAll(user.id),
        database.sessionGroups.getForWeek(user.id, weekStartDate),
        database.meals.getByUser(user.id),
        refreshHabitProgress(),
      ]);

      const mapHabit = (h: DBHabit, allHabits: DBHabit[]): Habit => ({
        id: h.id,
        name: h.name,
        targetPerWeek: h.target_per_week,
        doneCount: h.done_count,
        lastDoneAt: h.last_done_at ?? undefined,
        frequency: h.frequency,
        habitGroupId: h.habit_group_id ?? undefined,
        parentHabitId: h.parent_habit_id ?? undefined,
        subtasks: allHabits
          .filter((s) => s.parent_habit_id === h.id)
          .map((s) => mapHabit(s, allHabits)),
      });

      const themesWithHabits: Theme[] = themesData.map((theme) => {
        const themeHabits = habitsData.filter((h) => h.theme_id === theme.id);
        const topLevelHabits = themeHabits.filter((h) => !h.parent_habit_id);
        return {
          id: theme.id,
          name: theme.name,
          themeType: (theme.theme_type ?? "habit") as ThemeType,
          habits: topLevelHabits.map((h) => mapHabit(h, themeHabits)),
          groups: groupsData
            .filter((g) => g.theme_id === theme.id)
            .map((g) => ({
              id: g.id,
              name: g.name,
              groupType: g.group_type,
              linkBehavior: g.link_behavior,
            })),
          meals: mealsData.filter((m) => m.theme_id === theme.id),
        };
      });

      setThemes(themesWithHabits);
      setExpandedThemes((prev) => new Set([...prev].filter((id) => themesWithHabits.some((t) => t.id === id))));

      const blockIds = blocksData.map((b) => b.id);
      const [workoutDataArray, blockCreditsArray, mealBlockLinksArray, blockNotesArray, blockTasksArray] = await Promise.all([
        blockIds.length > 0 ? database.workoutData.getByBlockIds(blockIds) : Promise.resolve([]),
        blockIds.length > 0 ? database.blockHabitCredits.getByBlocks(blockIds) : Promise.resolve([]),
        blockIds.length > 0 ? database.mealBlockLinks.getByBlocks(blockIds) : Promise.resolve([]),
        blockIds.length > 0 ? database.blockNotes.getByBlocks(blockIds) : Promise.resolve([]),
        blockIds.length > 0 ? database.blockTasks.getByBlocks(blockIds) : Promise.resolve([]),
      ]);

      const workoutDataMap = new Map(
        workoutDataArray.map((wd) => [
          wd.block_id,
          {
            sets: wd.sets,
            reps: wd.reps,
            weight: wd.weight,
            unit: wd.unit,
          },
        ])
      );

      const creditsByBlock = new Map<string, string[]>();
      blockCreditsArray.forEach((c) => {
        const existing = creditsByBlock.get(c.block_id) ?? [];
        existing.push(c.habit_id);
        creditsByBlock.set(c.block_id, existing);
      });

      const sessionGroupMap = new Map(sessionGroupsData.map((sg) => [sg.id, sg]));

      const mealLinkByBlock = new Map(mealBlockLinksArray.map((ml) => [ml.block_id, ml.meal_id]));
      const mealMap = new Map(mealsData.map((m) => [m.id, m]));

      const blockNoteByBlock = new Map(blockNotesArray.map((n) => [n.block_id, n.content]));
      const blockNoteUpdatedAtByBlock = new Map(blockNotesArray.map((n) => [n.block_id, n.updated_at]));
      const blockTasksByBlock = new Map<string, BlockTask[]>();
      blockTasksArray.forEach((t) => {
        const existing = blockTasksByBlock.get(t.block_id) ?? [];
        existing.push(t);
        blockTasksByBlock.set(t.block_id, existing);
      });

      const convertedBlocks: Block[] = blocksData.map((b) => {
        const mealId = mealLinkByBlock.get(b.id);
        const linkedMeal = mealId ? mealMap.get(mealId) : undefined;
        return {
          id: b.id,
          label: b.label,
          isHabitBlock: b.is_habit_block,
          habitId: b.habit_id ?? undefined,
          completed: b.completed,
          hashtag: b.hashtag ?? undefined,
          linkedBlockId: b.linked_block_id ?? undefined,
          isLinkedGroup: b.is_linked_group,
          workoutData: workoutDataMap.get(b.id),
          workoutSubmitted: b.workout_submitted,
          sessionGroupId: b.session_group_id ?? undefined,
          sessionGroup: b.session_group_id ? sessionGroupMap.get(b.session_group_id) : undefined,
          themeId: b.theme_id ?? undefined,
          creditedHabitIds: creditsByBlock.get(b.id) ?? [],
          mealId: mealId ?? undefined,
          mealType: linkedMeal?.meal_type ?? undefined,
          blockNote: blockNoteByBlock.get(b.id),
          blockNoteUpdatedAt: blockNoteUpdatedAtByBlock.get(b.id),
          blockTasks: blockTasksByBlock.get(b.id) ?? [],
          location:
            b.location_type === "slot" && b.day_index !== null && b.time_index !== null
              ? { type: "slot", dayIndex: b.day_index, timeIndex: b.time_index }
              : { type: "unscheduled" },
        };
      });

      setBlocks(convertedBlocks);

      if (weekOffset === 0) {
        await generateStandingBlocksForWeek(
          user.id,
          weekStartDate,
          habitsData[0]?.id || '',
          blocksData.map(b => ({ day_index: b.day_index, time_index: b.time_index }))
        );
      }

      const ghosts = await generateGhostBlocks(
        user.id,
        weekStartDate,
        blocksData.map(b => ({ day_index: b.day_index, time_index: b.time_index }))
      );
      setGhostBlocks(ghosts);

      const { data: priorities } = await supabase
        .from('daily_priorities')
        .select('block_id, priority_rank')
        .eq('user_id', user.id)
        .eq('date', new Date().toISOString().split('T')[0]);

      setDailyPriorities(priorities || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setDataLoading(false);
    }
  };

  const handleAcceptGhostBlock = async (ghost: GhostBlockType) => {
    if (!user) return;

    const weekStartDate = getWeekStartDateString(weekOffset);
    const habit = findHabitByBlockLabel(ghost.label);
    if (!habit) {
      showToast("No matching habit found for this suggestion.", "info");
      return;
    }

    const blockId = await acceptGhostBlock(user.id, ghost, weekStartDate, {
      id: habit.id,
      name: habit.name,
      hashtag: habit.themeName,
      themeId: habit.themeId,
    });

    if (blockId) {
      const ancestorIds = getHabitAncestorIds(habit.id);
      if (ancestorIds.length > 0) {
        await saveBlockCredits(blockId, ancestorIds);
      }
      setGhostBlocks(prev => prev.filter(g =>
        !(g.day_index === ghost.day_index && g.time_index === ghost.time_index && g.label === ghost.label)
      ));
      await loadUserData();
      showToast('Habit block added to calendar');
    }
  };

  const handleDismissGhostBlock = async (ghost: GhostBlockType) => {
    await dismissPattern(ghost.pattern_id);
    setGhostBlocks(prev => prev.filter(g => g.pattern_id !== ghost.pattern_id));
    showToast('Suggestion dismissed');
  };

  const handleApplyTemplate = async (templateBlocks: Array<{ label: string; day_index: number; time_index: number }>) => {
    if (!user) return;

    const weekStartDate = getWeekStartDateString(weekOffset);
    const habit = allHabits[0];
    if (!habit) return;

    for (const templateBlock of templateBlocks) {
      await supabase.from('blocks').insert({
        user_id: user.id,
        habit_id: habit.id,
        label: templateBlock.label,
        day_index: templateBlock.day_index,
        time_index: templateBlock.time_index,
        week_start_date: weekStartDate,
        completed: false,
        is_habit_block: false
      });
    }

    setShowQuickStartModal(false);
    await loadUserData();
    showToast(`Applied template with ${templateBlocks.length} blocks`);
  };

  const normalizeHabitBlockLabel = (label: string) =>
    label
      .replace(/^habit:\s*/i, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const flattenHabits = (habits: Habit[], themeName: string, themeId: string): (Habit & { themeName: string; themeId: string })[] =>
    habits.flatMap((h) => [{ ...h, themeName, themeId }, ...flattenHabits(h.subtasks, themeName, themeId)]);

  const allHabits = useMemo(
    () => themes.flatMap((theme) => flattenHabits(theme.habits, theme.name, theme.id)),
    [themes]
  );
  const progressReference = new Date(getWeekStartDateString(weekOffset) + "T12:00:00");
  progressReference.setDate(progressReference.getDate() + mobileDayIndex);
  const progressDate = localDateKey(progressReference);
  const habitProgressCounts = useMemo(
    () => countHabitProgress(allHabits, habitProgressRecords, new Date(progressDate + "T12:00:00")),
    [allHabits, habitProgressRecords, progressDate]
  );

  const findHabitByBlockLabel = (label: string) => {
    const normalizedLabel = normalizeHabitBlockLabel(label);
    return allHabits.find((habit) => normalizeHabitBlockLabel(habit.name) === normalizedLabel);
  };

  const refreshSessionGroups = async () => {
    if (!user) return;

    try {
      const weekStartDate = getWeekStartDateString(weekOffset);
      const [blocksData, habitsData, habitGroupsData] = await Promise.all([
        database.blocks.getForWeek(user.id, weekStartDate),
        database.habits.getAll(user.id),
        database.habitGroups.getAll(user.id),
      ]);

      const dbBlocks: DBBlock[] = blocksData;
      const dbHabits: DBHabit[] = habitsData;

      await updateSessionGroups(user.id, dbBlocks, dbHabits, habitGroupsData);

      await loadUserData();
    } catch (error) {
      console.error("Error refreshing session groups:", error);
    }
  };

  const renameSession = async (sessionId: string, newName: string) => {
    try {
      await database.sessionGroups.update(sessionId, {
        custom_name: newName.trim() || null,
      });

      setBlocks((prev) =>
        prev.map((b) =>
          b.sessionGroupId === sessionId && b.sessionGroup
            ? { ...b, sessionGroup: { ...b.sessionGroup, custom_name: newName.trim() || null } }
            : b
        )
      );

      setRenamingSession(null);
      setSessionRenameValue("");
    } catch (error) {
      console.error("Error renaming session:", error);
      showToast("Failed to rename session", "error");
    }
  };

  const getHabitDoneCount = (habitId: string, frequency: "daily" | "weekly" | "monthly" | "none"): number => {
    const habit = allHabits.find((h) => h.id === habitId);
    if (frequency === "none") {
      return habit?.doneCount ?? 0;
    }

    return habitProgressCounts.get(habitId) ?? 0;
  };

  const getHouseholdChoreNeed = (habit: Habit) => {
    if (habit.frequency === "none") {
      return {
        label: habit.doneCount > 0 ? "Tracked" : "Optional",
        className: "optional",
        pct: habit.doneCount > 0 ? 25 : 0,
      };
    }

    const cadenceDays =
      habit.frequency === "daily"
        ? Math.max(1, 1 / Math.max(1, habit.targetPerWeek))
        : habit.frequency === "weekly"
          ? Math.max(1, 7 / Math.max(1, habit.targetPerWeek))
          : Math.max(1, 30 / Math.max(1, habit.targetPerWeek));
    const lastDoneMs = habit.lastDoneAt ? new Date(habit.lastDoneAt).getTime() : 0;
    const elapsedDays = lastDoneMs > 0
      ? Math.max(0, (Date.now() - lastDoneMs) / 86400000)
      : cadenceDays * 1.2;
    const ratio = elapsedDays / cadenceDays;

    if (ratio >= 1.15) {
      return { label: "Needs care", className: "due", pct: 100 };
    }
    if (ratio >= 0.8) {
      return { label: "Getting there", className: "soon", pct: Math.round(ratio * 100) };
    }
    return { label: "Okay", className: "fresh", pct: Math.round(ratio * 100) };
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setThemes([]);
    setBlocks([]);
  };

  const updateHabitInTree = (habits: Habit[], habitId: string, updater: (h: Habit) => Habit): Habit[] =>
    habits.map((h) =>
      h.id === habitId
        ? updater(h)
        : { ...h, subtasks: updateHabitInTree(h.subtasks, habitId, updater) }
    );

  const removeHabitFromTree = (habits: Habit[], habitId: string): Habit[] =>
    habits
      .filter((h) => h.id !== habitId)
      .map((h) => ({ ...h, subtasks: removeHabitFromTree(h.subtasks, habitId) }));

  const collectHabitTreeIds = (habit: Habit): string[] => [
    habit.id,
    ...habit.subtasks.flatMap(collectHabitTreeIds),
  ];

  const findHabitWithTheme = (habitId: string): { habit: Habit; theme: Theme } | null => {
    for (const theme of themes) {
      const habit = flattenHabits(theme.habits, theme.name, theme.id).find((item) => item.id === habitId);
      if (habit) return { habit, theme };
    }
    return null;
  };

  const ensureUnsortedHabitTheme = async (): Promise<Theme | null> => {
    if (!user) return null;

    const existing = themes.find(
      (theme) =>
        theme.themeType === "habit" &&
        normalizePlanningName(theme.name) === normalizePlanningName(UNSORTED_HABIT_THEME_NAME)
    );
    if (existing) return existing;

    const themeData = await database.themes.create(user.id, UNSORTED_HABIT_THEME_NAME, "habit");
    const newTheme: Theme = {
      id: themeData.id,
      name: themeData.name,
      themeType: "habit",
      habits: [],
      groups: [],
      meals: [],
    };

    setThemes((prev) => [...prev, newTheme]);
    setExpandedThemes((prev) => new Set([...prev, themeData.id]));
    return newTheme;
  };

  const resolveHabitThemeId = async (themeId?: string | null): Promise<string | null> => {
    if (themeId) return themeId;
    const unsortedTheme = await ensureUnsortedHabitTheme();
    return unsortedTheme?.id ?? null;
  };

  const addHabitToTheme = async (
    themeId: string | null | undefined,
    name: string,
    targetPerWeek: number,
    frequency: "daily" | "weekly" | "monthly" | "none",
    habitGroupId?: string
  ): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("Enter a habit name.", "error");
      return null;
    }
    if (frequency !== "none" && (!targetPerWeek || targetPerWeek <= 0)) {
      showToast("Enter a valid target.", "error");
      return null;
    }

    if (!user) return null;

    try {
      const resolvedThemeId = await resolveHabitThemeId(themeId);
      if (!resolvedThemeId) return null;

      const habitData = await database.habits.create(
        user.id,
        resolvedThemeId,
        trimmed,
        targetPerWeek,
        frequency,
        habitGroupId
      );

      const newHabit: Habit = {
        id: habitData.id,
        name: habitData.name,
        targetPerWeek: habitData.target_per_week,
        doneCount: habitData.done_count,
        frequency: habitData.frequency,
        habitGroupId: habitData.habit_group_id ?? undefined,
        subtasks: [],
      };

      setThemes((prevThemes) =>
        prevThemes.map((theme) =>
          theme.id === resolvedThemeId
            ? { ...theme, habits: [...theme.habits, newHabit] }
            : theme
        )
      );
      showToast("Habit added", "success");
      return habitData.id;
    } catch (error) {
      console.error("Error creating habit:", error);
      showToast("Failed to create habit", "error");
      return null;
    }
  };

  const findHabitInThemeByName = (themeId: string, name: string): Habit | null => {
    const theme = themes.find((t) => t.id === themeId);
    if (!theme) return null;
    const normalized = normalizePlanningName(name);
    return flattenHabits(theme.habits, theme.name, theme.id).find(
      (habit) => normalizePlanningName(habit.name) === normalized
    ) ?? null;
  };

  const createOrLinkOutlinerHabit = async (
    themeId: string | null | undefined,
    name: string,
    targetPerWeek: number,
    frequency: OutlineFrequency
  ): Promise<{ habitId: string; themeId: string; linkedExisting?: boolean } | null> => {
    const resolvedThemeId = await resolveHabitThemeId(themeId);
    if (!resolvedThemeId) return null;

    const existing = findHabitInThemeByName(resolvedThemeId, name);
    if (existing) {
      showToast("Linked existing habit", "info");
      return { habitId: existing.id, themeId: resolvedThemeId, linkedExisting: true };
    }

    const habitId = await addHabitToTheme(resolvedThemeId, name, targetPerWeek, frequency);
    return habitId ? { habitId, themeId: resolvedThemeId } : null;
  };

  const updateHabit = async (
    habitId: string,
    name: string,
    targetPerWeek: number,
    frequency: "daily" | "weekly" | "monthly" | "none",
    habitGroupId?: string
  ) => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("Enter a habit name.", "error");
      return;
    }
    if (frequency !== "none" && (!targetPerWeek || targetPerWeek <= 0)) {
      showToast("Enter a valid target.", "error");
      return;
    }

    if (!user) return;

    try {
      await database.habits.update(habitId, {
        name: trimmed,
        target_per_week: targetPerWeek,
        frequency,
        habit_group_id: habitGroupId || null,
      });

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: updateHabitInTree(theme.habits, habitId, (h) => ({
            ...h,
            name: trimmed,
            targetPerWeek,
            frequency,
            habitGroupId: habitGroupId || undefined,
          })),
        }))
      );

      setEditingHabitId(null);
      setEditHabitName("");
      setEditHabitTarget(2);
      setEditHabitFrequency("weekly");
      setEditHabitGroupId("");
    } catch (error) {
      console.error("Error updating habit:", error);
      showToast("Failed to update habit", "error");
    }
  };

  const addSubtask = async (
    parentHabit: Habit,
    themeId: string,
    name: string,
    targetPerWeek: number,
    frequency: "daily" | "weekly" | "monthly" | "none"
  ) => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("Enter a subtask name.", "error");
      return;
    }
    if (frequency !== "none" && (!targetPerWeek || targetPerWeek <= 0)) {
      showToast("Enter a valid target.", "error");
      return;
    }
    if (!user) return;

    try {
      const habitData = await database.habits.create(
        user.id,
        themeId,
        trimmed,
        targetPerWeek,
        frequency,
        parentHabit.habitGroupId,
        parentHabit.id
      );

      const newSubtask: Habit = {
        id: habitData.id,
        name: habitData.name,
        targetPerWeek: habitData.target_per_week,
        doneCount: habitData.done_count,
        frequency: habitData.frequency,
        habitGroupId: habitData.habit_group_id ?? undefined,
        parentHabitId: habitData.parent_habit_id ?? undefined,
        subtasks: [],
      };

      setThemes((prevThemes) =>
        prevThemes.map((theme) =>
          theme.id === themeId
            ? {
                ...theme,
                habits: updateHabitInTree(theme.habits, parentHabit.id, (h) => ({
                  ...h,
                  subtasks: [...h.subtasks, newSubtask],
                })),
              }
            : theme
        )
      );

      setAddingSubtaskForHabitId(null);
      setNewSubtaskName("");
      setNewSubtaskFrequency("weekly");
      setNewSubtaskTarget(2);
      showToast("Subtask added", "success");
    } catch (error) {
      console.error("Error creating subtask:", error);
      showToast("Failed to create subtask", "error");
    }
  };

  const addGroupToTheme = async (themeId: string, name: string, groupType: "strength_training" | "custom") => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("Enter a group name.", "error");
      return;
    }

    if (!user) return;

    try {
      const linkBehavior = "none"; // Keep all blocks separate, including strength training
      const groupData = await database.habitGroups.create(
        user.id,
        themeId,
        trimmed,
        groupType,
        linkBehavior
      );

      const newGroup: HabitGroup = {
        id: groupData.id,
        name: groupData.name,
        groupType: groupData.group_type,
        linkBehavior: groupData.link_behavior,
      };

      setThemes((prevThemes) =>
        prevThemes.map((theme) =>
          theme.id === themeId
            ? { ...theme, groups: [...theme.groups, newGroup] }
            : theme
        )
      );

      setNewGroupName("");
      setNewGroupType("custom");
    } catch (error) {
      console.error("Error creating group:", error);
      showToast("Failed to create group", "error");
    }
  };

  const deleteGroup = (groupId: string) => {
    showConfirm("Delete this group? Habits in this group will not be deleted.", async () => {
      try {
        await database.habitGroups.delete(groupId);
        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            groups: theme.groups.filter((g) => g.id !== groupId),
            habits: theme.habits.map((h) =>
              h.habitGroupId === groupId ? { ...h, habitGroupId: undefined } : h
            ),
          }))
        );
        showToast("Group deleted", "success");
      } catch (error) {
        console.error("Error deleting group:", error);
        showToast("Failed to delete group", "error");
      }
      setConfirmDialog(null);
    }, { confirmLabel: "Delete", destructive: true });
  };

  const incrementHabit = async (habitId: string) => {
    const habit = allHabits.find((h) => h.id === habitId);
    if (!habit || !user || pendingHabitCompletions.current.has(habitId)) return;
    pendingHabitCompletions.current.add(habitId);

    const now = new Date().toISOString();
    const newCount = habit.doneCount + 1;

    const ancestorIds = getHabitAncestorIds(habitId);

    try {
      const completion = await database.blocks.create(user.id, {
        label: `Habit: ${habit.name}`,
        habit_id: habitId,
        is_habit_block: true,
        completed: true,
        location_type: "unscheduled",
        week_start_date: null,
        day_index: null,
        time_index: null,
        hashtag: habit.themeName,
        linked_block_id: null,
        is_linked_group: false,
        workout_submitted: false,
        session_group_id: null,
        is_daily_template: false,
        daily_template_id: null,
      });
      try {
        await database.blockActivityLogs.create(user.id, completion.id, habitId, null, null, null, now);
      } catch (error) {
        await database.blocks.delete(completion.id);
        throw error;
      }
      setBlocks((current) => [...current, {
        id: completion.id, label: completion.label, habitId, isHabitBlock: true,
        completed: true, location: { type: "unscheduled" }, creditedHabitIds: [],
      }]);
      await database.habits.update(habitId, {
        done_count: newCount,
        last_done_at: now,
      });

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: updateHabitInTree(theme.habits, habitId, (h) => ({
            ...h,
            doneCount: newCount,
            lastDoneAt: now,
          })),
        }))
      );

      for (const ancestorId of ancestorIds) {
        const ancestor = allHabits.find((h) => h.id === ancestorId);
        if (!ancestor) continue;
        const ancestorNewCount = ancestor.doneCount + 1;
        await database.habits.update(ancestorId, {
          done_count: ancestorNewCount,
          last_done_at: now,
        });
        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            habits: updateHabitInTree(theme.habits, ancestorId, (h) => ({
              ...h,
              doneCount: ancestorNewCount,
              lastDoneAt: now,
            })),
          }))
        );
      }

      const theme = themes.find((t) => flattenHabits(t.habits, t.name, t.id).some((h) => h.id === habitId));
      if (theme) {
        const goals = await database.themeGoals.getByTheme(theme.id);
        const completedDate = now.split('T')[0];

        for (const goal of goals) {
          try {
            await database.themeGoals.recordCompletion(
              user.id,
              goal.id,
              habitId,
              completedDate
            );
          } catch (error) {
            console.error("Error recording goal completion:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error updating habit:", error);
      showToast("Could not finish recording this habit. Check its progress before trying again.", "error");
    } finally {
      await refreshHabitProgress();
      pendingHabitCompletions.current.delete(habitId);
    }
  };

  const clearLastDoneAt = async (habitId: string) => {
    if (!user) return;

    try {
      await database.habits.clearLastDoneAt(habitId);

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: updateHabitInTree(theme.habits, habitId, (h) => ({
            ...h,
            lastDoneAt: undefined,
          })),
        }))
      );
    } catch (error) {
      console.error("Error clearing last done timestamp:", error);
    }
  };

  const deleteHabit = (habitId: string) => {
    showConfirm("Delete this habit? Any linked habit blocks will become normal blocks.", async () => {
      try {
        await database.habits.delete(habitId);
        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            habits: removeHabitFromTree(theme.habits, habitId),
          }))
        );
        setBlocks((prevBlocks) =>
          prevBlocks.map((b) =>
            b.habitId === habitId
              ? { ...b, isHabitBlock: false, habitId: undefined, completed: false }
              : b
          )
        );
        const affectedBlocks = blocks.filter((b) => b.habitId === habitId);
        for (const block of affectedBlocks) {
          await database.blocks.update(block.id, {
            is_habit_block: false,
            habit_id: null,
            completed: false,
          });
        }
        showToast("Habit deleted", "success");
      } catch (error) {
        console.error("Error deleting habit:", error);
        showToast("Failed to delete habit", "error");
      }
      setConfirmDialog(null);
    }, { confirmLabel: "Delete", destructive: true });
  };

  const makeHabitIntoTheme = (habitId: string) => {
    const found = findHabitWithTheme(habitId);
    if (!found || !user) return;
    const { habit } = found;

    showConfirm(`Make "${habit.name}" its own theme? Its history and subtasks will move with it.`, async () => {
      try {
        const themeData = await database.themes.create(user.id, habit.name, "habit");
        const habitIds = collectHabitTreeIds(habit);

        await Promise.all(
          habitIds.map((id) =>
            database.habits.update(id, {
              theme_id: themeData.id,
              habit_group_id: null,
              ...(id === habit.id ? { parent_habit_id: null } : {}),
            })
          )
        );

        await Promise.all(
          blocks
            .filter((block) => block.habitId && habitIds.includes(block.habitId))
            .map((block) =>
              database.blocks.update(block.id, {
                theme_id: themeData.id,
                hashtag: themeData.name,
              })
            )
        );

        setReshapingHabitId(null);
        await loadUserData();
        setExpandedThemes((prev) => new Set([...prev, themeData.id]));
        showToast("Habit turned into theme", "success");
      } catch (error) {
        console.error("Error turning habit into theme:", error);
        showToast("Failed to change habit shape", "error");
      }
      setConfirmDialog(null);
    }, { confirmLabel: "Make theme" });
  };

  const makeThemeIntoHabit = (theme: Theme, targetThemeId: string) => {
    if (!user || !targetThemeId) return;
    const targetTheme = themes.find((item) => item.id === targetThemeId);
    if (!targetTheme || targetTheme.id === theme.id) return;

    showConfirm(`Make "${theme.name}" a habit inside "${targetTheme.name}"? Its habits will become subtasks.`, async () => {
      try {
        const habitData = await database.habits.create(user.id, targetTheme.id, theme.name, 1, "weekly");
        const habitIds = theme.habits.flatMap(collectHabitTreeIds);
        const topHabitIds = new Set(theme.habits.map((habit) => habit.id));

        await Promise.all(
          habitIds.map((id) =>
            database.habits.update(id, {
              theme_id: targetTheme.id,
              habit_group_id: null,
              ...(topHabitIds.has(id) ? { parent_habit_id: habitData.id } : {}),
            })
          )
        );

        await Promise.all(
          blocks
            .filter((block) => block.habitId && habitIds.includes(block.habitId))
            .map((block) =>
              database.blocks.update(block.id, {
                theme_id: targetTheme.id,
                hashtag: targetTheme.name,
              })
            )
        );

        await Promise.all(theme.groups.map((group) => database.habitGroups.delete(group.id)));
        await database.themes.delete(theme.id);

        setReshapingThemeId(null);
        setShapeTargetThemeId("");
        await loadUserData();
        setExpandedThemes((prev) => new Set([...prev, targetTheme.id]));
        setExpandedHabits((prev) => new Set([...prev, habitData.id]));
        showToast("Theme turned into habit", "success");
      } catch (error) {
        console.error("Error turning theme into habit:", error);
        showToast("Failed to change theme shape", "error");
      }
      setConfirmDialog(null);
    }, { confirmLabel: "Make habit" });
  };

  const toggleHabitExpanded = (habitId: string) => {
    setExpandedHabits((prev) => {
      const next = new Set(prev);
      if (next.has(habitId)) {
        next.delete(habitId);
      } else {
        next.add(habitId);
      }
      return next;
    });
  };

  const toggleSubtaskCollapse = (habitId: string) => {
    setCollapsedSubtasks((prev) => {
      const next = new Set(prev);
      if (next.has(habitId)) {
        next.delete(habitId);
      } else {
        next.add(habitId);
      }
      return next;
    });
  };

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const startEditingHabit = (habit: Habit) => {
    setEditingHabitId(habit.id);
    setEditHabitName(habit.name);
    setEditHabitTarget(habit.targetPerWeek);
    setEditHabitFrequency(habit.frequency);
    setEditHabitGroupId(habit.habitGroupId || "");
  };

  const cancelEditingHabit = () => {
    setEditingHabitId(null);
    setEditHabitName("");
    setEditHabitTarget(2);
    setEditHabitFrequency("weekly");
    setEditHabitGroupId("");
  };

  const addTheme = async () => {
    const trimmed = newThemeName.trim();
    if (!trimmed) {
      showToast("Enter a theme name.", "error");
      return;
    }

    if (!user) return;

    try {
      const themeData = await database.themes.create(user.id, trimmed, newThemeType);

      const seededGroups: HabitGroup[] = [];
      const seededHabits: Habit[] = [];

      if (newThemeType === "household") {
        for (const area of householdChoreTemplate) {
          const groupData = await database.habitGroups.create(
            user.id,
            themeData.id,
            area.area,
            "custom",
            "none"
          );
          const group: HabitGroup = {
            id: groupData.id,
            name: groupData.name,
            groupType: groupData.group_type,
            linkBehavior: groupData.link_behavior,
          };
          seededGroups.push(group);

          for (const chore of area.chores) {
            const habitData = await database.habits.create(
              user.id,
              themeData.id,
              chore.name,
              chore.target,
              chore.frequency,
              group.id
            );
            seededHabits.push({
              id: habitData.id,
              name: habitData.name,
              targetPerWeek: habitData.target_per_week,
              doneCount: habitData.done_count,
              frequency: habitData.frequency,
              habitGroupId: habitData.habit_group_id ?? undefined,
              parentHabitId: habitData.parent_habit_id ?? undefined,
              subtasks: [],
            });
          }
        }
      }

      const newTheme: Theme = {
        id: themeData.id,
        name: themeData.name,
        themeType: newThemeType,
        habits: seededHabits,
        groups: seededGroups,
        meals: [],
      };

      setThemes((prev) => [...prev, newTheme]);
      setExpandedThemes((prev) => new Set([...prev, themeData.id]));
      setNewThemeName("");
      setNewThemeType("habit");
      showToast(newThemeType === "household" ? "Household chores created" : "Theme created", "success");
    } catch (error) {
      console.error("Error creating theme:", error);
      showToast("Failed to create theme", "error");
    }
  };

  const createThemeFromOutliner = async (
    name: string,
    outlinerHabits: Array<{ nodeId: string; name: string; target: number; frequency: OutlineFrequency }>
  ): Promise<{ themeId: string; linkedExisting?: boolean; habitLinks: Array<{ nodeId: string; habitId: string }> } | null> => {
    const trimmed = name.trim();
    if (!trimmed || !user) return null;

    try {
      const existingTheme = themes.find(
        (theme) => theme.themeType === "habit" && normalizePlanningName(theme.name) === normalizePlanningName(trimmed)
      );
      const themeData = existingTheme
        ? {
            id: existingTheme.id,
            name: existingTheme.name,
          }
        : await database.themes.create(user.id, trimmed, "habit");
      const createdHabits: Habit[] = [];
      const habitLinks: Array<{ nodeId: string; habitId: string }> = [];
      const currentThemeHabits = existingTheme
        ? flattenHabits(existingTheme.habits, existingTheme.name, existingTheme.id)
        : [];
      const knownHabitIdsByName = new Map(
        currentThemeHabits.map((habit) => [normalizePlanningName(habit.name), habit.id])
      );

      for (const habit of outlinerHabits) {
        const habitName = habit.name.trim();
        if (!habitName) continue;
        const normalizedHabitName = normalizePlanningName(habitName);
        const existingHabitId = knownHabitIdsByName.get(normalizedHabitName);
        if (existingHabitId) {
          habitLinks.push({ nodeId: habit.nodeId, habitId: existingHabitId });
          continue;
        }

        const habitData = await database.habits.create(
          user.id,
          themeData.id,
          habitName,
          Math.max(1, habit.target || 1),
          habit.frequency
        );
        createdHabits.push({
          id: habitData.id,
          name: habitData.name,
          targetPerWeek: habitData.target_per_week,
          doneCount: habitData.done_count,
          frequency: habitData.frequency,
          habitGroupId: habitData.habit_group_id ?? undefined,
          parentHabitId: habitData.parent_habit_id ?? undefined,
          subtasks: [],
        });
        habitLinks.push({ nodeId: habit.nodeId, habitId: habitData.id });
        knownHabitIdsByName.set(normalizedHabitName, habitData.id);
      }

      if (existingTheme) {
        setThemes((prev) =>
          prev.map((theme) =>
            theme.id === existingTheme.id
              ? { ...theme, habits: [...theme.habits, ...createdHabits] }
              : theme
          )
        );
      } else {
        const newTheme: Theme = {
          id: themeData.id,
          name: themeData.name,
          themeType: "habit",
          habits: createdHabits,
          groups: [],
          meals: [],
        };

        setThemes((prev) => [...prev, newTheme]);
      }
      setExpandedThemes((prev) => new Set([...prev, themeData.id]));
      showToast(
        existingTheme
          ? createdHabits.length > 0
            ? `Linked theme and added ${createdHabits.length} habit(s)`
            : "Linked existing theme instead of creating a duplicate"
          : createdHabits.length > 0
          ? `Theme created with ${createdHabits.length} habit(s)`
          : "Theme created",
        "success"
      );
      return { themeId: themeData.id, linkedExisting: !!existingTheme, habitLinks };
    } catch (error) {
      console.error("Error creating theme from outliner:", error);
      showToast("Failed to create theme from outliner", "error");
      return null;
    }
  };

  const addMealToTheme = (themeId: string, meal: Meal) => {
    setThemes((prev) =>
      prev.map((t) =>
        t.id === themeId ? { ...t, meals: [...t.meals, meal] } : t
      )
    );
    setAddingMealForThemeId(null);
    showToast("Meal added", "success");
  };

  const deleteMeal = async (themeId: string, mealId: string) => {
    try {
      await database.meals.delete(mealId);
      setThemes((prev) =>
        prev.map((t) =>
          t.id === themeId
            ? { ...t, meals: t.meals.filter((m) => m.id !== mealId) }
            : t
        )
      );
      setBlocks((prev) =>
        prev.map((b) => (b.mealId === mealId ? { ...b, mealId: undefined, mealType: undefined } : b))
      );
    } catch {
      showToast("Failed to delete meal", "error");
    }
  };

  const createMealBlock = async (meal: Meal) => {
    if (!user) return;

    try {
      const blockData = await database.blocks.create(user.id, {
        label: meal.name,
        is_habit_block: false,
        habit_id: null,
        location_type: "unscheduled",
        day_index: null,
        time_index: null,
        completed: false,
        hashtag: null,
        week_start_date: null,
        linked_block_id: null,
        is_linked_group: false,
        workout_submitted: false,
        session_group_id: null,
        is_daily_template: false,
        daily_template_id: null,
        theme_id: meal.theme_id,
      });

      await database.mealBlockLinks.create(user.id, blockData.id, meal.id);

      const newBlock: Block = {
        id: blockData.id,
        label: blockData.label,
        isHabitBlock: false,
        location: { type: "unscheduled" },
        completed: false,
        themeId: meal.theme_id,
        mealId: meal.id,
        mealType: meal.meal_type,
        creditedHabitIds: [],
      };

      setBlocks((prev) => [...prev, newBlock]);
      showToast("Meal block added", "success");
    } catch {
      showToast("Failed to create meal block", "error");
    }
  };

  const createBlock = async (
    label: string,
    isHabitBlock = false,
    habitId?: string,
    hashtag?: string,
    locationOverride?: BlockLocation,
    options: { resetInputs?: boolean; suppressErrorToast?: boolean; weekStartDate?: string } = {}
  ): Promise<string | null> => {
    const trimmed = label.trim();
    if (!trimmed) {
      showToast("Enter a label for the block.", "error");
      return null;
    }

    if (!user) return null;

    try {
      const nextLocation = locationOverride ?? { type: "unscheduled" as const };
      const weekStartDate =
        nextLocation.type === "slot" ? options.weekStartDate ?? getWeekStartDateString(weekOffset) : null;

      const blockData = await database.blocks.create(user.id, {
        label: trimmed,
        is_habit_block: isHabitBlock,
        habit_id: habitId ?? null,
        location_type: nextLocation.type,
        day_index: nextLocation.type === "slot" ? nextLocation.dayIndex : null,
        time_index: nextLocation.type === "slot" ? nextLocation.timeIndex : null,
        completed: false,
        hashtag: hashtag?.trim() || null,
        week_start_date: weekStartDate,
        linked_block_id: null,
        is_linked_group: false,
        workout_submitted: false,
        session_group_id: null,
        is_daily_template: false,
        daily_template_id: null,
      });

      const newBlock: Block = {
        id: blockData.id,
        label: blockData.label,
        isHabitBlock: blockData.is_habit_block,
        location: nextLocation,
        habitId: blockData.habit_id ?? undefined,
        completed: blockData.completed,
        hashtag: blockData.hashtag ?? undefined,
        linkedBlockId: blockData.linked_block_id ?? undefined,
        isLinkedGroup: blockData.is_linked_group,
        workoutSubmitted: blockData.workout_submitted,
        creditedHabitIds: [],
      };

      if (nextLocation.type === "unscheduled" || weekStartDate === getWeekStartDateString(weekOffset)) {
        setBlocks((prev) => [...prev, newBlock]);
      }
      if (options.resetInputs ?? true) {
        setBlockLabel("");
        setBlockHashtag("");
      }
      return blockData.id;
    } catch (error) {
      console.error("Error creating block:", error);
      if (!options.suppressErrorToast) {
        showToast("Failed to create block", "error");
      }
      return null;
    }
  };

  const getPlanDateLocation = (planDate?: string | null): BlockLocation | undefined => {
    if (!planDate) return undefined;
    const weekStartDate = getWeekStartDateString(weekOffset);
    const weekStart = new Date(`${weekStartDate}T12:00:00`);
    const target = new Date(`${planDate}T12:00:00`);
    if (Number.isNaN(target.getTime())) return undefined;

    const dayIndex = Math.round((target.getTime() - weekStart.getTime()) / 86400000);
    if (dayIndex < 0 || dayIndex >= days.length) return undefined;

    return {
      type: "slot",
      dayIndex,
      timeIndex: getHourlyIndexForMobileSlot(firstOpenVisibleSlotIndex(dayIndex)),
    };
  };

  const createOutlinerBlock = async (
    label: string,
    options?: {
      planDate?: string | null;
      note?: string;
      taskLabels?: string[];
      hashtag?: string;
    }
  ): Promise<string | null> => {
    const location = getPlanDateLocation(options?.planDate);
    const blockId = await createBlock(
      label,
      false,
      undefined,
      options?.hashtag,
      location
    );
    if (!blockId || !user) return blockId;

    try {
      const note = options?.note?.trim();
      if (note) {
        await saveBlockNote(blockId, note);
      }

      const taskLabels = (options?.taskLabels ?? [])
        .map((task) => task.trim())
        .filter((task) => task.length > 0);
      if (taskLabels.length > 0) {
        const createdTasks = await Promise.all(
          taskLabels.map((taskLabel, index) =>
            database.blockTasks.create(user.id, blockId, taskLabel, index)
          )
        );
        setBlocks((prev) =>
          prev.map((block) =>
            block.id === blockId
              ? { ...block, blockTasks: [...(block.blockTasks ?? []), ...createdTasks] }
              : block
          )
        );
      }

      showToast(location ? "Outliner row scheduled" : "Outliner row added to waiting", "success");
    } catch (error) {
      console.error("Error finishing outliner block:", error);
      showToast("Block created, but details did not finish", "error");
    }

    return blockId;
  };

  const createRoutineFromOutliner = async (
    name: string,
    itemLabels: string[],
    notes = ""
  ): Promise<{ routineId: string } | null> => {
    if (!user) return null;
    const trimmedName = name.trim() || "Routine";
    const routine: RoutineTab = {
      id: createRoutineId("routine"),
      name: trimmedName,
      category: inferRoutineCategory([trimmedName, notes, ...itemLabels].join(" ")),
      notes: notes.trim(),
      items: itemLabels
        .map((label) => label.trim())
        .filter((label) => label.length > 0)
        .map((label) => ({ id: createRoutineId("routine-item"), label })),
      completedByDate: {},
      linkedWorkoutRoutineId: null,
    };

    const sourceRoutines = routineTabs.length > 0 ? routineTabs : loadRoutineNotes(user.id);
    const nextRoutines = [...sourceRoutines, routine];
    setRoutineTabs(nextRoutines);
    saveRoutineNotes(user.id, nextRoutines);
    showToast("Routine created from outliner", "success");
    return { routineId: routine.id };
  };

  const findOutlinerNodeIdByBlock = (nodes: OutlineNode[], blockId: string): string | null => {
    for (const node of nodes) {
      if (node.linked?.blockId === blockId) return node.id;
      const childMatch = findOutlinerNodeIdByBlock(node.children, blockId);
      if (childMatch) return childMatch;
    }
    return null;
  };

  const syncOutlinerBlockCompletion = async (blockId: string, completed: boolean) => {
    if (!user) return;
    const sourceNodes = outlinerNodes.length > 0 ? outlinerNodes : await loadPlanningOutliner(user.id, false);
    const nodeId = findOutlinerNodeIdByBlock(sourceNodes, blockId);
    if (!nodeId) return;

    const nextNodes = updateOutlineNode(sourceNodes, nodeId, (node) => ({
      ...node,
      taskDone: completed,
    }));
    setOutlinerNodes(nextNodes);
    await savePlanningOutliner(user.id, nextNodes);
    setOutlinerRefreshKey((key) => key + 1);
  };

  const findOutlinerNodeForBoardBlock = (nodes: OutlineNode[], block: Block): OutlineNode | null => {
    for (const node of nodes) {
      if (node.linked?.blockId === block.id) return node;
      if (block.habitId && node.linked?.habitId === block.habitId) return node;
      const childMatch = findOutlinerNodeForBoardBlock(node.children, block);
      if (childMatch) return childMatch;
    }
    return null;
  };

  const getBoardOutlineItemsForBlock = (block: Block): HabitCardOutlineItem[] => {
    if (!block.habitId && !block.isHabitBlock) return [];
    const node = findOutlinerNodeForBoardBlock(outlinerNodes, block);
    if (!node) return [];

    return node.children
      .filter((child) => child.tag === "task" || child.tag === "habit")
      .map((child) => ({
        id: child.id,
        text: child.text.trim() || "Untitled",
        tag: child.tag as "task" | "habit",
        taskDone: child.taskDone,
        linkedHabitId: child.linked?.habitId,
        onBoard: !!child.linked?.habitId && blocks.some((item) => item.habitId === child.linked?.habitId),
      }));
  };

  const toggleBoardOutlineTask = async (nodeId: string) => {
    if (!user) return;
    const sourceNodes = outlinerNodes.length > 0 ? outlinerNodes : await loadPlanningOutliner(user.id, false);
    let changed = false;
    const nextNodes = updateOutlineNode(sourceNodes, nodeId, (node) => {
      changed = true;
      return { ...node, taskDone: !node.taskDone };
    });
    if (!changed) return;

    setOutlinerNodes(nextNodes);
    await savePlanningOutliner(user.id, nextNodes);
    setOutlinerRefreshKey((key) => key + 1);
  };

  const addLinkedHabitToBoard = async (
    link: OutlineLink
  ): Promise<{ habitId: string; themeId: string; blockId?: string; linkedExisting?: boolean } | null> => {
    if (!link.habitId) return null;
    const habit = allHabits.find((item) => item.id === link.habitId);
    if (!habit) {
      showToast("Linked habit was not found", "error");
      return null;
    }

    const existingBlock = blocks.find((block) => block.habitId === habit.id);
    if (existingBlock) {
      showToast("That habit is already on the board", "info");
      return {
        habitId: habit.id,
        themeId: link.themeId ?? habit.themeId,
        blockId: existingBlock.id,
        linkedExisting: true,
      };
    }

    const blockId = await createBlock(`Habit: ${habit.name}`, true, habit.id, habit.themeName);
    if (blockId) showToast("Habit added to unscheduled", "success");
    return blockId
      ? { habitId: habit.id, themeId: link.themeId ?? habit.themeId, blockId }
      : null;
  };

  const scrollLinkedElementIntoView = (id: string) => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  const openLinkedOutlinerItem = (link: OutlineLink) => {
    if (link.blockId && blocks.some((block) => block.id === link.blockId)) {
      setShowPlanningOutliner(false);
      setMobileHomeView("planner");
      scrollLinkedElementIntoView(`block-${link.blockId}`);
      return;
    }

    if (link.routineId) {
      setSelectedRoutineId(link.routineId);
      refreshRoutineTabs();
      openOverlayPanel("routines");
      return;
    }

    if (link.habitId) {
      const habit = allHabits.find((item) => item.id === link.habitId);
      if (!habit) {
        showToast("Linked habit was not found", "error");
        return;
      }
      setExpandedThemes((prev) => new Set([...prev, habit.themeId]));
      setExpandedHabits((prev) => new Set([...prev, habit.id]));
      setThemeDetailsId(habit.themeId);
      setShowPlanningOutliner(false);
      scrollLinkedElementIntoView(`habit-${habit.id}`);
      return;
    }

    if (link.themeId) {
      const theme = themes.find((item) => item.id === link.themeId);
      if (!theme) {
        showToast("Linked theme was not found", "error");
        return;
      }
      setExpandedThemes((prev) => new Set([...prev, theme.id]));
      setThemeDetailsId(theme.id);
      setShowPlanningOutliner(false);
      scrollLinkedElementIntoView(`theme-${theme.id}`);
    }
  };

  const renameLinkedOutlinerItem = async (link: OutlineLink, nextName: string): Promise<boolean> => {
    const trimmed = nextName.trim();
    if (!trimmed) return false;
    const label = link.habitId ? "habit" : link.routineId ? "routine" : link.blockId ? "task" : "theme";

    try {
      if (link.habitId) {
        await database.habits.update(link.habitId, { name: trimmed });
        const affectedBlocks = blocks.filter((block) => block.habitId === link.habitId);
        for (const block of affectedBlocks) {
          await database.blocks.update(block.id, { label: `Habit: ${trimmed}` });
        }
        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            habits: updateHabitInTree(theme.habits, link.habitId!, (habit) => ({
              ...habit,
              name: trimmed,
            })),
          }))
        );
        setBlocks((prevBlocks) =>
          prevBlocks.map((block) =>
            block.habitId === link.habitId ? { ...block, label: `Habit: ${trimmed}` } : block
          )
        );
        showToast("Habit renamed", "success");
        return true;
      }

      if (link.routineId && user) {
        const sourceRoutines = routineTabs.length > 0 ? routineTabs : loadRoutineNotes(user.id);
        const nextRoutines = sourceRoutines.map((routine) =>
          routine.id === link.routineId
            ? { ...routine, name: trimmed, category: inferRoutineCategory(trimmed) }
            : routine
        );
        setRoutineTabs(nextRoutines);
        saveRoutineNotes(user.id, nextRoutines);
        showToast("Linked routine renamed", "success");
        return true;
      }

      if (link.blockId) {
        await database.blocks.update(link.blockId, { label: trimmed });
        setBlocks((current) => current.map((block) => block.id === link.blockId ? { ...block, label: trimmed } : block));
        return true;
      }

      if (link.themeId) {
        await database.themes.update(link.themeId, trimmed);
        setThemes((prevThemes) =>
          prevThemes.map((theme) => (theme.id === link.themeId ? { ...theme, name: trimmed } : theme))
        );
        showToast("Theme renamed", "success");
        return true;
      }
    } catch (error) {
      console.error("Error renaming linked outliner item:", error);
      showToast(`Failed to rename linked ${label}`, "error");
    }

    return false;
  };

  const loadLinkedOutlinerNote = async (link: OutlineLink): Promise<{ content: string; updatedAt?: string }> => {
    if (link.routineId && user) {
      const routine = (routineTabs.length > 0 ? routineTabs : loadRoutineNotes(user.id)).find(
        (item) => item.id === link.routineId
      );
      return { content: routine?.notes ?? "" };
    }

    if (link.habitId) {
      const note = await database.habitNotes.getByHabit(link.habitId);
      return { content: note?.content ?? "", updatedAt: note?.updated_at };
    }

    if (link.themeId && user) {
      const prefs = loadThemeNotesPrefs(user.id, link.themeId);
      return { content: prefs.generalNote, updatedAt: prefs.generalUpdatedAt };
    }

    return { content: "" };
  };

  const saveLinkedOutlinerNote = async (
    link: OutlineLink,
    content: string
  ): Promise<{ content: string; updatedAt?: string } | null> => {
    if (!user) return null;

    try {
      if (link.routineId) {
        const updatedAt = new Date().toISOString();
        const sourceRoutines = routineTabs.length > 0 ? routineTabs : loadRoutineNotes(user.id);
        const nextRoutines = sourceRoutines.map((routine) =>
          routine.id === link.routineId ? { ...routine, notes: content } : routine
        );
        setRoutineTabs(nextRoutines);
        saveRoutineNotes(user.id, nextRoutines);
        return { content, updatedAt };
      }

      if (link.habitId) {
        const note = await database.habitNotes.upsert(user.id, link.habitId, content);
        return { content: note.content, updatedAt: note.updated_at };
      }

      if (link.themeId) {
        const prefs = saveThemeGeneralNote(user.id, link.themeId, content);
        return { content: prefs.generalNote, updatedAt: prefs.generalUpdatedAt };
      }
    } catch (error) {
      console.error("Error saving linked outliner note:", error);
      showToast("Failed to save note", "error");
    }

    return null;
  };

  const openEntityInOutline = (habitId?: string, themeId?: string) => {
    const find = (nodes: OutlineNode[]): OutlineNode | undefined => {
      for (const node of nodes) {
        if (habitId ? node.linked?.habitId === habitId : node.linked?.themeId === themeId && !node.linked?.habitId && !node.linked?.blockId) return node;
        const child = find(node.children);
        if (child) return child;
      }
    };
    const node = find(outlinerNodes);
    setOutlinerFocusNodeId(node?.id ?? null);
    setOutlinerFocusRequestKey((value) => value + 1);
    setOutlinerRefreshKey((value) => value + 1);
    openOverlayPanel("outliner");
  };

  const addHabitViewToOutliner = (habit: Habit, _theme: Theme) => openEntityInOutline(habit.id);
  const addThemeViewToOutliner = (theme: Theme) => openEntityInOutline(undefined, theme.id);

  const saveOutlineNodes = (nodes: OutlineNode[]) => {
    if (!user || outlineLoading) return;
    const previousPlacements = new Map(outlineHabitPlacements(outlinerNodes).map((item) => [item.habitId, item]));
    const moves = outlineHabitPlacements(nodes).filter((item) => {
      const previous = previousPlacements.get(item.habitId);
      return previous && (previous.themeId !== item.themeId || previous.parentHabitId !== item.parentHabitId);
    });
    setOutlinerNodes(nodes);
    latestOutlineNodes.current = nodes;
    setOutlineSaveStatus('saving');
    if (moves.length) {
      setThemes((current) => {
        const habits = current.flatMap((theme) => flattenHabits(theme.habits, theme.name, theme.id)).map((habit) => {
          const move = moves.find((item) => item.habitId === habit.id);
          return move ? { ...habit, themeId: move.themeId, parentHabitId: move.parentHabitId ?? undefined } : habit;
        });
        const buildTree = (themeId: string, parentId?: string): Habit[] => habits
          .filter((habit) => habit.themeId === themeId && habit.parentHabitId === parentId)
          .map((habit) => ({ ...habit, subtasks: buildTree(themeId, habit.id) }));
        return current.map((theme) => ({ ...theme, habits: buildTree(theme.id) }));
      });
    }
    const save = outlineMutationQueue.current.catch(() => {}).then(async () => {
      for (const move of moves) {
        await database.habits.update(move.habitId, { theme_id: move.themeId, parent_habit_id: move.parentHabitId });
      }
      await savePlanningOutliner(user.id, nodes);
    });
    outlineMutationQueue.current = save;
    void save.then(() => { if (outlineMutationQueue.current === save) setOutlineSaveStatus('saved'); }, () => { if (outlineMutationQueue.current === save) setOutlineSaveStatus('error'); });
    void save.catch((error) => {
      console.error("Error saving outline:", error);
      showToast("Outline could not be saved. Please try again.", "error");
    });
    return save;
  };

  const saveOutlineHabitSettings = async (node: OutlineNode): Promise<boolean> => {
    if (!node.linked?.habitId || !node.text.trim()) return false;
    try {
      await database.habits.update(node.linked.habitId, {
        name: node.text.trim(), target_per_week: node.target, frequency: node.frequency,
      });
      setThemes((current) => current.map((theme) => ({
        ...theme,
        habits: updateHabitInTree(theme.habits, node.linked!.habitId!, (habit) => ({
          ...habit, name: node.text.trim(), targetPerWeek: node.target, frequency: node.frequency,
        })),
      })));
      return true;
    } catch (error) {
      console.error("Error saving habit settings:", error);
      return false;
    }
  };

  const changeOutlineCardType = async (nodeId: string, kind: OutlineCardType) => {
    if (!user || outlineLoading) throw new Error('Outline is still loading. Please try again.');
    const node = outlineBranchItems(latestOutlineNodes.current).find(item => item.id === nodeId);
    if (!node) throw new Error('This item is missing or in Trash.');
    prepareOutlineTypeChange(node, kind);
    let linkedCompletion: boolean | undefined;
    if (kind === 'task' || kind === 'note' || kind === 'link') {
      const ids = outlineTypeBlockIds(node);
      // Include occurrences outside the visible week. Never recreate a missing block.
      const linkedBlocks = await database.blocks.getByIds(user.id, ids);
      linkedCompletion = linkedBlocks.find(block => block.id === node.linked?.blockId)?.completed;
      if (linkedBlocks.some(block => block.habit_id || block.is_habit_block)) throw new Error('A linked calendar item belongs to a habit. Its history is protected.');
      for (const block of linkedBlocks) {
        const patch = blockTypePatch(block.label, kind);
        await database.blocks.update(block.id, patch);
        setBlocks(current => current.map(item => item.id === block.id ? { ...item, ...patch } : item));
      }
    }
    // Read the latest tree after network writes so concurrent note edits are retained.
    await saveOutlineNodes(updateOutlineNode(latestOutlineNodes.current, nodeId, item => ({
      ...prepareOutlineTypeChange(item, kind),
      ...((kind === 'task' || kind === 'link') && linkedCompletion !== undefined ? { taskDone: linkedCompletion } : {}),
    })));
    showToast('Type changed. Notes, children, and calendar times kept.', 'success');
  };

  const loadOutlinePlanning = async (node: OutlineNode) => {
    if (!user || outlineLoading) throw new Error('Outline is still loading.');
    const linkedBlocks = await database.blocks.getByIds(user.id, outlineTypeBlockIds(node));
    return describeOutlinePlanning(node, linkedBlocks, hourlySlots);
  };

  const unlinkOutlinePlanning = async (reviewed: OutlineNode, makeGroup: boolean) => {
    if (!user || outlineLoading) throw new Error('Outline is still loading. Please retry.');
    if (softPlanSaving.current) throw new Error('A plan is still saving. Please try again.');
    const reviewedKey = outlinePlanningKey(reviewed);
    const getCurrent = () => {
      const current = outlineBranchItems(latestOutlineNodes.current).find(item => item.id === reviewed.id);
      if (!current || outlinePlanningKey(current) !== reviewedKey) throw new Error('This item\'s plans changed. Review them again before unlinking.');
      return current;
    };
    const original = getCurrent();
    withoutOutlinePlanning(original, makeGroup);
    softPlanSaving.current = true;
    try {
      // Detach only this row. Never delete, move, or rewrite calendar history.
      const savedNote = original.linked?.blockId ? await database.blockNotes.getByBlock(original.linked.blockId) : null;
      const source = getCurrent();
      const replacement = withoutOutlinePlanning(source, makeGroup, savedNote?.content ?? '');
      try {
        await saveOutlineNodes(updateOutlineNode(latestOutlineNodes.current, source.id, () => replacement));
      } catch (error) {
        const restored = updateOutlineNode(latestOutlineNodes.current, source.id, item => outlinePlanningKey(item) === outlinePlanningKey(replacement)
          ? { ...item, tag: source.tag, isGroup: source.isGroup, linked: source.linked, plans: source.plans, planDate: source.planDate } : item);
        latestOutlineNodes.current = restored; setOutlinerNodes(restored);
        throw error;
      }
      showToast(makeGroup ? 'Group created. Existing calendar items kept.' : 'Planning links removed. Existing calendar items kept.', 'success');
    } finally { softPlanSaving.current = false; }
  };

  const saveOutlineReadingLink = async (nodeId: string, title: string, link: ReadingLink) => {
    if (!user || outlineLoading) throw new Error('Outline is still loading.');
    const readingLink = normalizeReadingLink(link);
    if (!title.trim() || !readingLink) throw new Error('Enter a title and a public http or https URL.');
    if (link.imageUrl?.trim() && !publicWebUrl(link.imageUrl)) throw new Error('Use a public http or https thumbnail URL.');
    const node = outlineBranchItems(latestOutlineNodes.current).find(item => item.id === nodeId);
    if (!node || node.tag !== 'link') throw new Error('This Link is no longer available.');
    for (const block of await database.blocks.getByIds(user.id, outlineTypeBlockIds(node))) {
      if (block.habit_id || block.is_habit_block) throw new Error('This calendar item belongs to a habit.');
      const patch = { label: `Link: ${title.trim()}`, hashtag: 'link' };
      await database.blocks.update(block.id, patch);
      setBlocks(current => current.map(item => item.id === block.id ? { ...item, ...patch } : item));
    }
    await saveOutlineNodes(updateOutlineNode(latestOutlineNodes.current, nodeId, item => ({ ...item, text: title.trim(), readingLink })));
    showToast('Link saved', 'success');
  };

  const closeThemeDetails = () => {
    setThemeDetailsId(null);
    setOutlinerRefreshKey((value) => value + 1);
  };

  const createHabitBlockAtSlot = async (
    habitId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    const habit = allHabits.find((h) => h.id === habitId);
    if (!habit || !user) return;

    try {
      const weekStartDate = getWeekStartDateString(weekOffset);

      if (timeIndex === -1) {
        const newBlocks: Block[] = [];

        for (let day = 0; day < 7; day++) {
          const instanceBlockData = await database.blocks.create(user.id, {
            label: `Habit: ${habit.name}`,
            is_habit_block: true,
            habit_id: habitId,
            location_type: "slot",
            day_index: day,
            time_index: -1,
            completed: false,
            hashtag: habit.themeName,
            week_start_date: weekStartDate,
            linked_block_id: null,
            is_linked_group: false,
            workout_submitted: false,
            session_group_id: null,
            is_daily_template: false,
            daily_template_id: null,
          });

          const instanceBlock: Block = {
            id: instanceBlockData.id,
            label: instanceBlockData.label,
            isHabitBlock: true,
            location: { type: "slot", dayIndex: day, timeIndex: -1 },
            habitId: habitId,
            completed: false,
            hashtag: habit.themeName,
            linkedBlockId: instanceBlockData.linked_block_id ?? undefined,
            isLinkedGroup: instanceBlockData.is_linked_group,
            workoutSubmitted: instanceBlockData.workout_submitted,
          };

          newBlocks.push(instanceBlock);
        }

        setBlocks((currentBlocks) => [...currentBlocks, ...newBlocks]);
        await refreshSessionGroups();
        return;
      }

      const habitTheme = themes.find((t) =>
        t.habits.some((h) => {
          const flat = flattenHabits([h], t.name, t.id);
          return flat.some((fh) => fh.id === habitId);
        })
      );

      const blockData = await database.blocks.create(user.id, {
        label: `Habit: ${habit.name}`,
        is_habit_block: true,
        habit_id: habitId,
        location_type: "slot",
        day_index: dayIndex,
        time_index: timeIndex,
        completed: false,
        hashtag: habit.themeName,
        week_start_date: weekStartDate,
        linked_block_id: null,
        is_linked_group: false,
        workout_submitted: false,
        session_group_id: null,
        is_daily_template: false,
        daily_template_id: null,
        theme_id: habitTheme?.id ?? null,
      });

      const ancestorIds = getHabitAncestorIds(habitId);

      const newBlock: Block = {
        id: blockData.id,
        label: blockData.label,
        isHabitBlock: true,
        location: { type: "slot", dayIndex, timeIndex },
        habitId: habitId,
        completed: false,
        hashtag: habit.themeName,
        linkedBlockId: blockData.linked_block_id ?? undefined,
        isLinkedGroup: blockData.is_linked_group,
        workoutSubmitted: blockData.workout_submitted,
        themeId: habitTheme?.id,
        creditedHabitIds: ancestorIds.length > 0 ? ancestorIds : [],
      };

      if (ancestorIds.length > 0) {
        await saveBlockCredits(blockData.id, ancestorIds);
      }

      setBlocks((currentBlocks) => [...currentBlocks, newBlock]);

      await refreshSessionGroups();
    } catch (error) {
      console.error("Error creating habit block:", error);
    }
  };

  const addHabitToTodayFromCare = async (habit: Habit) => {
    if (todayDayIndex < 0) {
      showToast("Go to the current week to add this to today.", "info");
      return;
    }

    await createHabitBlockAtSlot(
      habit.id,
      todayDayIndex,
      getHourlyIndexForMobileSlot(firstOpenVisibleSlotIndex(todayDayIndex))
    );
    showToast(`${habit.name} added to today`, "success");
  };

  const handleDragStart = (blockId: string, e?: React.DragEvent) => {
    currentDragBlockId = blockId;
    if (e) {
      e.dataTransfer.setData('application/block-id', blockId);
      e.dataTransfer.setData('text/plain', blockId);
      e.dataTransfer.effectAllowed = 'move';
    }
    requestAnimationFrame(() => {
      setDragBlockId(blockId);
      setDragHabitId(null);
    });
  };

  const handleDragEnd = () => {
    currentDragBlockId = null;
    setDragBlockId(null);
    setDragOverThemeId(null);
  };

  const assignBlockToTheme = async (blockId: string, themeId: string) => {
    try {
      await database.blocks.update(blockId, { theme_id: themeId });
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, themeId } : b))
      );
    } catch (error) {
      console.error("Error assigning block to theme:", error);
      showToast("Failed to assign block to theme", "error");
    }
  };

  const removeBlockFromTheme = async (blockId: string) => {
    try {
      await database.blocks.update(blockId, { theme_id: null });
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, themeId: undefined } : b))
      );
    } catch (error) {
      console.error("Error removing block from theme:", error);
      showToast("Failed to remove block from theme", "error");
    }
  };

  const convertBlockToHabit = async (blockId: string, themeId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || !user) return;

    try {
      const habitData = await database.habits.create(
        user.id,
        themeId,
        block.label,
        convertFrequency === "none" ? 0 : convertTarget,
        convertFrequency,
        convertGroupId || undefined
      );

      const newHabit: Habit = {
        id: habitData.id,
        name: habitData.name,
        targetPerWeek: habitData.target_per_week,
        doneCount: habitData.done_count,
        frequency: habitData.frequency,
        habitGroupId: habitData.habit_group_id ?? undefined,
        subtasks: [],
      };

      setThemes((prev) =>
        prev.map((t) =>
          t.id === themeId ? { ...t, habits: [...t.habits, newHabit] } : t
        )
      );

      if (user) await cancelTileTimer(localStorage, tileTimerAlarm, user.id, blockId);
      await database.blocks.delete(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));

      setConvertingBlockId(null);
      setConvertFrequency("weekly");
      setConvertTarget(3);
      setConvertGroupId("");
      showToast("Block converted to habit", "success");
    } catch (error) {
      console.error("Error converting block to habit:", error);
      showToast("Failed to convert block", "error");
    }
  };

  const handleThemeDragOver = (e: React.DragEvent<HTMLDivElement>, themeId: string) => {
    if (!dragBlockId && !currentDragBlockId) return;
    e.preventDefault();
    setDragOverThemeId(themeId);
  };

  const handleThemeDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragOverThemeId(null);
    }
  };

  const handleThemeDrop = (e: React.DragEvent<HTMLDivElement>, themeId: string) => {
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
  };

  const handleHabitDragStart = (habitId: string, e?: React.DragEvent) => {
    if (e) {
      e.dataTransfer.setData('application/habit-id', habitId);
      e.dataTransfer.setData('text/plain', habitId);
      e.dataTransfer.effectAllowed = 'move';
    }
    requestAnimationFrame(() => {
      setDragHabitId(habitId);
      setDragBlockId(null);
    });
  };

  const handleHabitDragEnd = () => {
    setDragHabitId(null);
  };

  const createHabitBlockForPriority = async (habitId: string): Promise<string | null> => {
    const habit = allHabits.find((h) => h.id === habitId);
    if (!habit || !user) return null;

    try {
      const todayIdx = getTodayDayIndex(weekOffset);
      if (todayIdx === -1) return null;

      const weekStartDate = getWeekStartDateString(weekOffset);

      const blockData = await database.blocks.create(user.id, {
        label: `Habit: ${habit.name}`,
        is_habit_block: true,
        habit_id: habitId,
        location_type: "slot",
        day_index: todayIdx,
        time_index: 0,
        completed: false,
        hashtag: habit.themeName,
        week_start_date: weekStartDate,
        linked_block_id: null,
        is_linked_group: false,
        workout_submitted: false,
        session_group_id: null,
        is_daily_template: false,
        daily_template_id: null,
      });

      const ancestorIds = getHabitAncestorIds(habitId);

      const newBlock: Block = {
        id: blockData.id,
        label: blockData.label,
        isHabitBlock: true,
        location: { type: "slot", dayIndex: todayIdx, timeIndex: 0 },
        habitId: habitId,
        completed: false,
        hashtag: habit.themeName,
        linkedBlockId: blockData.linked_block_id ?? undefined,
        isLinkedGroup: blockData.is_linked_group,
        workoutSubmitted: blockData.workout_submitted,
        creditedHabitIds: ancestorIds.length > 0 ? ancestorIds : undefined,
      };

      if (ancestorIds.length > 0) {
        await saveBlockCredits(blockData.id, ancestorIds);
      }

      setBlocks((currentBlocks) => [...currentBlocks, newBlock]);
      await refreshSessionGroups();
      return blockData.id;
    } catch (error) {
      console.error("Error creating habit block for priority:", error);
      return null;
    }
  };

  const linkBlocks = async (blockId1: string, blockId2: string) => {
    const block1 = blocks.find((b) => b.id === blockId1);
    const block2 = blocks.find((b) => b.id === blockId2);
    if (!block1 || !block2 || !user) return;

    try {
      const habit1 = allHabits.find((h) => h.id === block1.habitId);
      const habit2 = allHabits.find((h) => h.id === block2.habitId);
      if (!habit1 || !habit2) return;

      const theme = themes.find((t) => t.habits.some((h) => h.id === habit1.id));
      if (!theme) return;

      const group = theme.groups.find((g) => g.id === habit1.habitGroupId);
      if (!group) return;

      const groupLabel = `${group.name} Session: ${habit1.name} + ${habit2.name}`;

      await database.blocks.update(blockId1, {
        linked_block_id: blockId2,
        is_linked_group: true,
        label: groupLabel,
      });

      await database.blocks.update(blockId2, {
        linked_block_id: blockId1,
      });

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id === blockId1) {
            return { ...b, linkedBlockId: blockId2, isLinkedGroup: true, label: groupLabel };
          }
          if (b.id === blockId2) {
            return { ...b, linkedBlockId: blockId1 };
          }
          return b;
        })
      );

      setLinkConfirmation(null);
    } catch (error) {
      console.error("Error linking blocks:", error);
      showToast("Failed to link blocks", "error");
    }
  };

  const recurringSessionForBlock = (blockId: string) => {
    for (const node of outlineBranchItems(latestOutlineNodes.current)) {
      if (!isRepeatingPlanNode(node)) continue;
      const plan = node.plans.find(plan => plan.parentPlanId && (plan.scheduledBlockIds.includes(blockId) || plan.occurrenceBlockId === blockId));
      if (plan) return { node, plan };
    }
    return undefined;
  };
  const moveBlockToSlot = async (
    blockId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    try {
      const block = blocks.find((b) => b.id === blockId);
      const session = recurringSessionForBlock(blockId);
      if (session) {
        const date = new Date(`${getWeekStartDateString(weekOffset)}T12:00:00`);
        date.setDate(date.getDate() + dayIndex);
        await commitSoftPlan(session.node.id, session.plan.id, { kind: 'time', date: localDateKey(date), timeIndex });
        return true;
      }
      if (block?.linkedBlockId) {
        await database.blocks.update(block.linkedBlockId, {
          linked_block_id: null,
          is_linked_group: false,
        });

        const linkedBlock = blocks.find((b) => b.id === block.linkedBlockId);
        if (linkedBlock?.habitId) {
          const habit = allHabits.find((h) => h.id === linkedBlock.habitId);
          if (habit) {
            await database.blocks.update(block.linkedBlockId, {
              label: `Habit: ${habit.name}`,
            });
          }
        }
      }

      const weekStartDate = getWeekStartDateString(weekOffset);
      const originalHabit = allHabits.find((h) => h.id === block?.habitId);

      await database.blocks.update(blockId, {
        location_type: "slot",
        day_index: dayIndex,
        time_index: timeIndex,
        week_start_date: weekStartDate,
        linked_block_id: null,
        is_linked_group: false,
        daily_template_id: null,
        theme_id: null,
      });

      if (originalHabit && block?.isHabitBlock) {
        await database.blocks.update(blockId, {
          label: `Habit: ${originalHabit.name}`,
        });
      }

      const updatedBlocks = blocks.map((b) => {
        if (b.id === blockId) {
          return {
            ...b,
            location: { type: "slot" as const, dayIndex, timeIndex },
            linkedBlockId: undefined,
            isLinkedGroup: false,
            themeId: undefined,
            label: originalHabit ? `Habit: ${originalHabit.name}` : b.label,
          };
        }
        if (b.id === block?.linkedBlockId) {
          const habit = allHabits.find((h) => h.id === b.habitId);
          return {
            ...b,
            linkedBlockId: undefined,
            isLinkedGroup: false,
            label: habit ? `Habit: ${habit.name}` : b.label,
          };
        }
        return b;
      });

      setBlocks(updatedBlocks);

      await refreshSessionGroups();
      return true;
    } catch (error) {
      console.error("Error moving block:", error);
      showToast(error instanceof Error ? error.message : 'Could not move this item.', 'error');
      return false;
    }
  };

  const moveBlockToUnscheduled = async (blockId: string) => {
    try {
      const block = blocks.find((b) => b.id === blockId);
      const session = recurringSessionForBlock(blockId);
      if (session) {
        await commitSoftPlan(session.node.id, session.plan.id, { kind: 'week', date: session.plan.date });
        return true;
      }

      if (block?.linkedBlockId) {
        await database.blocks.update(block.linkedBlockId, {
          linked_block_id: null,
          is_linked_group: false,
        });

        const linkedBlock = blocks.find((b) => b.id === block.linkedBlockId);
        if (linkedBlock?.habitId) {
          const habit = allHabits.find((h) => h.id === linkedBlock.habitId);
          if (habit) {
            await database.blocks.update(block.linkedBlockId, {
              label: `Habit: ${habit.name}`,
            });
          }
        }
      }

      await database.blocks.update(blockId, {
        location_type: "unscheduled",
        day_index: null,
        time_index: null,
        week_start_date: null,
        linked_block_id: null,
        is_linked_group: false,
        daily_template_id: null,
      });

      const originalHabit = allHabits.find((h) => h.id === block?.habitId);

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id === blockId) {
            return {
              ...b,
              location: { type: "unscheduled" },
              linkedBlockId: undefined,
              isLinkedGroup: false,
              label: originalHabit ? `Habit: ${originalHabit.name}` : b.label,
            };
          }
          if (b.id === block?.linkedBlockId) {
            const habit = allHabits.find((h) => h.id === b.habitId);
            return {
              ...b,
              linkedBlockId: undefined,
              isLinkedGroup: false,
              label: habit ? `Habit: ${habit.name}` : b.label,
            };
          }
          return b;
        })
      );

      await refreshSessionGroups();
    } catch (error) {
      console.error("Error moving block:", error);
      showToast(error instanceof Error ? error.message : 'Could not move this item.', 'error');
      return false;
    }
    return true;
  };

  const getHabitAncestorIds = (habitId: string): string[] => {
    const ancestors: string[] = [];
    let current = allHabits.find((h) => h.id === habitId);
    while (current?.parentHabitId) {
      ancestors.push(current.parentHabitId);
      current = allHabits.find((h) => h.id === current!.parentHabitId);
    }
    return ancestors;
  };

  const toggleBlockCompletion = async (blockId: string, desiredCompleted?: boolean, offerUndo = false) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || pendingBlockCompletions.current.has(blockId)) return;
    pendingBlockCompletions.current.add(blockId);

    const newCompleted = desiredCompleted ?? !block.completed;
    if (!!block.completed === newCompleted) { pendingBlockCompletions.current.delete(blockId); return; }
    const notifyCompletion = () => {
      if (offerUndo) showToast(newCompleted ? 'Completed' : 'Marked incomplete', 'success', {
        label: 'Undo', onClick: () => { void completionAction.current(blockId, !!block.completed); },
      });
      else if (desiredCompleted !== undefined) showToast('Completion undone', 'info');
    };
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, completed: newCompleted } : b))
    );

    try {
      await database.blocks.update(blockId, { completed: newCompleted });
    } catch (error) {
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, completed: block.completed } : b))
      );
      console.error("Error toggling block completion:", error);
      showToast('Could not save completion. Please try again.', 'error');
      pendingBlockCompletions.current.delete(blockId);
      return;
    }

    const directHabitIds = Array.from(new Set([...(block.habitId ? [block.habitId] : []), ...(block.creditedHabitIds ?? [])]));
    if (!directHabitIds.length) {
      try {
        await syncOutlinerBlockCompletion(blockId, newCompleted);
        notifyCompletion();
      } catch (error) {
        console.error("Error syncing block completion:", error);
        showToast('Completion saved, but Outline could not be updated.', 'error');
      }
      pendingBlockCompletions.current.delete(blockId);
      return;
    }

    const primaryHabitId = block.habitId ?? directHabitIds[0];
    const allAffectedHabitIds = Array.from(new Set([
      ...directHabitIds,
      ...directHabitIds.flatMap((hId) => getHabitAncestorIds(hId)),
    ]));

    const delta = newCompleted ? 1 : -1;

    try {
      // Use the block's assigned day as the completion timestamp, not the current click time
      const blockDate = (() => {
        if (block.location.type === "slot") {
          const weekStart = getWeekStartDateString(weekOffset);
          const d = new Date(weekStart + "T12:00:00");
          d.setDate(d.getDate() + block.location.dayIndex);
          return d.toISOString();
        }
        return new Date().toISOString();
      })();
      const now = newCompleted ? blockDate : new Date().toISOString();

      for (const habitId of allAffectedHabitIds) {
        const habit = allHabits.find((h) => h.id === habitId);
        if (!habit) continue;
        const nextCount = Math.max(0, habit.doneCount + delta);

        if (newCompleted) {
          await database.habits.update(habitId, {
            done_count: nextCount,
            last_done_at: now,
          });
        } else {
          await database.habits.update(habitId, { done_count: nextCount });
        }

        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            habits: updateHabitInTree(theme.habits, habitId, (h) => ({
              ...h,
              doneCount: nextCount,
              ...(newCompleted ? { lastDoneAt: now } : {}),
            })),
          }))
        );
      }

      if (newCompleted && user) {
        const weekStartDate = block.location.type === "slot"
          ? getWeekStartDateString(weekOffset)
          : null;
        const dayIndex = block.location.type === "slot" ? block.location.dayIndex : null;
        const timeIndex = block.location.type === "slot" ? block.location.timeIndex : null;

        for (const habitId of directHabitIds) {
          await database.blockActivityLogs.create(
            user.id,
            blockId,
            habitId,
            weekStartDate,
            dayIndex,
            timeIndex
          );
        }

        const theme = themes.find((t) => flattenHabits(t.habits, t.name, t.id).some((h) => h.id === primaryHabitId));
        if (theme) {
          const goals = await database.themeGoals.getByTheme(theme.id);
          const completedDate = now.split('T')[0];
          for (const goal of goals) {
            try {
              await database.themeGoals.recordCompletion(user.id, goal.id, primaryHabitId, completedDate);
            } catch (error) {
              console.error("Error recording goal completion:", error);
            }
          }
        }
      } else if (!newCompleted) {
        await database.blockActivityLogs.deleteByBlock(blockId);
      }

      await syncOutlinerBlockCompletion(blockId, newCompleted);
      notifyCompletion();
    } catch (error) {
      console.error("Error updating completion side effects:", error);
      showToast('Completion saved, but some progress could not be updated.', 'error');
    } finally {
      await refreshHabitProgress();
      pendingBlockCompletions.current.delete(blockId);
    }
  };

  completionAction.current = toggleBlockCompletion;

  const markBlockDone = async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || block.completed) return;
    if (block.habitId || block.creditedHabitIds?.length) {
      await toggleBlockCompletion(blockId);
    } else {
      await database.blocks.update(blockId, { completed: true });
      setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, completed: true } : b));
      await syncOutlinerBlockCompletion(blockId, true);
    }
  };

  const saveBlockCredits = async (blockId: string, creditedHabitIds: string[]) => {
    if (!user) return;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    try {
      await database.blockHabitCredits.deleteAllForBlock(blockId);

      for (const habitId of creditedHabitIds) {
        await database.blockHabitCredits.create(user.id, blockId, habitId);
      }

      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, creditedHabitIds } : b))
      );

      if (block.completed) {
        await refreshHabitProgress();
        showToast("Credits updated", "success");
      }
    } catch (error) {
      console.error("Error saving block credits:", error);
      showToast("Failed to save credits", "error");
    }
  };

  const saveBlockNote = async (blockId: string, content: string, throwOnError = false) => {
    if (!user) { if (throwOnError) throw new Error('Please sign in again.'); return; }
    try {
      const savedNote = await database.blockNotes.upsert(user.id, blockId, content);
      setBlocks((prev) =>
        prev.map((b) => (
          b.id === blockId
            ? { ...b, blockNote: content, blockNoteUpdatedAt: savedNote.updated_at }
            : b
        ))
      );

    } catch (error) {
      console.error("Error saving block note:", error);
      if (throwOnError) throw error;
    }
  };

  const addBlockTask = async (blockId: string, label: string) => {
    if (!user || !label.trim()) return;
    try {
      const block = blocks.find((b) => b.id === blockId);
      const existingTasks = block?.blockTasks ?? [];
      const sortOrder = existingTasks.length;
      const newTask = await database.blockTasks.create(user.id, blockId, label.trim(), sortOrder);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, blockTasks: [...(b.blockTasks ?? []), newTask] } : b
        )
      );
    } catch (error) {
      console.error("Error adding block task:", error);
    }
  };

  const createRoutineBlockFromRoutine = async (routine: RoutineTab) => {
    if (!user) return;

    const blockId = await createBlock(
      routine.name.trim() || "Routine",
      false,
      undefined,
      routine.category === "custom" ? "routine" : routine.category
    );
    if (!blockId) return;

    try {
      const note = routine.notes.trim();
      if (note) {
        await saveBlockNote(blockId, note);
      }

      const taskLabels = routine.items
        .map((item) => item.label.trim())
        .filter((label) => label.length > 0);
      const createdTasks = await Promise.all(
        taskLabels.map((label, index) => database.blockTasks.create(user.id, blockId, label, index))
      );

      if (createdTasks.length > 0) {
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === blockId ? { ...b, blockTasks: [...(b.blockTasks ?? []), ...createdTasks] } : b
          )
        );
      }

      showToast("Routine added to unscheduled", "success");
    } catch (error) {
      console.error("Error creating routine block:", error);
      showToast("Routine block added, but the checklist did not finish", "error");
    }
  };

  const toggleBlockTask = async (blockId: string, taskId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    const task = block?.blockTasks?.find((t) => t.id === taskId);
    if (!task) return;
    try {
      const updated = await database.blockTasks.update(taskId, { completed: !task.completed });
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? { ...b, blockTasks: b.blockTasks?.map((t) => (t.id === taskId ? updated : t)) }
            : b
        )
      );
    } catch (error) {
      console.error("Error toggling block task:", error);
    }
  };

  const deleteBlockTask = async (blockId: string, taskId: string) => {
    try {
      await database.blockTasks.delete(taskId);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? { ...b, blockTasks: b.blockTasks?.filter((t) => t.id !== taskId) }
            : b
        )
      );
    } catch (error) {
      console.error("Error deleting block task:", error);
    }
  };

  const updateWorkoutData = async (blockId: string, workoutData: WorkoutData) => {
    if (!user) return;

    try {
      await database.workoutData.upsert(
        user.id,
        blockId,
        workoutData.sets,
        workoutData.reps,
        workoutData.weight,
        workoutData.unit
      );

      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, workoutData } : b
        )
      );
    } catch (error) {
      console.error("Error updating workout data:", error);
    }
  };

  const submitWorkout = async (blockId: string) => {
    if (!user) return;

    try {
      const block = blocks.find((b) => b.id === blockId);
      await database.blocks.update(blockId, {
        workout_submitted: true,
      });

      if (block?.habitId && block.workoutData) {
        const today = new Date().toISOString().split("T")[0];
        await database.workoutHistory.create(
          user.id,
          block.habitId,
          blockId,
          block.workoutData.sets,
          block.workoutData.reps,
          block.workoutData.weight,
          block.workoutData.unit,
          today
        );
      }

      const rows = blockExercises[blockId] ?? [];
      if (block && rows.length > 0) {
        const completedAt = new Date().toISOString();
        const nextHistory = { ...exerciseHistory };

        rows.forEach((row) => {
          const entry: WorkoutExerciseHistoryEntry = {
            id: createClientId("exercise-history"),
            exerciseId: row.exerciseId,
            blockId,
            blockLabel: block.label,
            completedAt,
            sets: row.sets,
            reps: row.reps,
            weight: row.weight,
            unit: row.unit,
            duration: row.duration,
            notes: row.notes,
          };
          nextHistory[row.exerciseId] = [entry, ...(nextHistory[row.exerciseId] ?? [])].slice(0, 30);
        });

        saveExerciseHistory(nextHistory);

        const linkedRoutineId = workoutBlockRoutineLinks[blockId];
        const linkedRoutine = linkedRoutineId
          ? workoutRoutines.find((routine) => routine.id === linkedRoutineId)
          : null;
        if (linkedRoutine) {
          const exerciseNames = rows
            .map((row) => exerciseLibrary.find((exercise) => exercise.id === row.exerciseId)?.name)
            .filter((name): name is string => !!name);
          const notes = [
            block.blockNote?.trim(),
            ...rows.map((row) => row.notes?.trim()).filter((note): note is string => !!note),
          ]
            .filter(Boolean)
            .join("\n");
          const routineEntry: WorkoutRoutineHistoryEntry = {
            id: createClientId("routine-history"),
            routineId: linkedRoutine.id,
            routineName: linkedRoutine.name,
            blockId,
            completedAt,
            exerciseNames,
            notes,
            bestEffort: formatWorkoutRoutineBestEffort(rows),
          };

          saveWorkoutRoutineHistory([
            routineEntry,
            ...workoutRoutineHistory.filter((entry) => entry.id !== routineEntry.id),
          ].slice(0, 80));
        }
      }

      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, workoutSubmitted: true } : b
        )
      );
      showToast("Workout logged", "success");
    } catch (error) {
      console.error("Error submitting workout:", error);
    }
  };

  const saveExerciseLibrary = (nextLibrary: ExerciseLibraryItem[]) => {
    setExerciseLibrary(nextLibrary);
    if (user) {
      window.localStorage.setItem(`exercise-library:${user.id}`, JSON.stringify(nextLibrary));
    }
  };

  const saveBlockExercises = (nextExercises: Record<string, WorkoutBlockExercise[]>) => {
    setBlockExercises(nextExercises);
    if (user) {
      window.localStorage.setItem(`workout-block-exercises:${user.id}`, JSON.stringify(nextExercises));
    }
  };

  const saveWorkoutBlockRoutineLinks = (nextLinks: Record<string, string>) => {
    setWorkoutBlockRoutineLinks(nextLinks);
    if (user) {
      window.localStorage.setItem(`workout-block-routine-links:${user.id}`, JSON.stringify(nextLinks));
    }
  };

  const setWorkoutBlockRoutineLink = (blockId: string, routineId: string | null) => {
    const nextLinks = { ...workoutBlockRoutineLinks };
    if (routineId) {
      nextLinks[blockId] = routineId;
    } else {
      delete nextLinks[blockId];
    }
    saveWorkoutBlockRoutineLinks(nextLinks);
  };

  const saveExerciseHistory = (nextHistory: Record<string, WorkoutExerciseHistoryEntry[]>) => {
    setExerciseHistory(nextHistory);
    if (user) {
      window.localStorage.setItem(`workout-exercise-history:${user.id}`, JSON.stringify(nextHistory));
    }
  };

  const saveWorkoutRoutines = (nextRoutines: WorkoutRoutine[]) => {
    setWorkoutRoutines(nextRoutines);
    if (user) {
      window.localStorage.setItem(`workout-routines:${user.id}`, JSON.stringify(nextRoutines));
    }
  };

  const saveWorkoutRoutineHistory = (nextHistory: WorkoutRoutineHistoryEntry[]) => {
    setWorkoutRoutineHistory(nextHistory);
    if (user) {
      window.localStorage.setItem(`workout-routine-history:${user.id}`, JSON.stringify(nextHistory));
    }
  };

  const estimateRoutineMinutes = (rows: Array<WorkoutRoutineExercise | WorkoutBlockExercise>) =>
    rows.reduce((total, row) => {
      if ((row.duration ?? 0) > 0) return total + Math.max(3, row.duration ?? 0);
      if ((row.sets ?? 0) > 0) return total + Math.max(5, (row.sets ?? 0) * 3);
      return total + 6;
    }, 0);

  const inferWorkoutRoutineMetadata = (
    rows: Array<WorkoutRoutineExercise | WorkoutBlockExercise>,
    overrides: Partial<Pick<WorkoutRoutine, "focus" | "energy" | "timeBudget" | "equipment">> = {}
  ): Pick<WorkoutRoutine, "focus" | "energy" | "timeBudget" | "equipment"> => {
    const routineExercises = rows
      .map((row) => exerciseLibrary.find((item) => item.id === row.exerciseId))
      .filter((exercise): exercise is ExerciseLibraryItem => !!exercise);
    const countBy = (predicate: (exercise: ExerciseLibraryItem) => boolean) =>
      routineExercises.filter(predicate).length;
    const lowerCount = countBy(
      (exercise) => exercise.bodyArea === "lower" || ["squat", "hinge"].includes(exercise.pattern ?? "")
    );
    const upperCount = countBy(
      (exercise) => exercise.bodyArea === "upper" || ["push", "pull"].includes(exercise.pattern ?? "")
    );
    const coreCount = countBy(
      (exercise) =>
        exercise.category === "core" ||
        exercise.bodyArea === "core" ||
        ["brace", "rotation", "carry"].includes(exercise.pattern ?? "")
    );
    const mobilityCount = countBy((exercise) => exercise.category === "mobility" || exercise.pattern === "stretch");
    const cardioCount = countBy((exercise) => exercise.category === "cardio" || exercise.pattern === "cardio");
    const strengthCount = countBy((exercise) => exercise.category === "strength" || exercise.category === "core");
    const estimatedMinutes = estimateRoutineMinutes(rows);
    const focus: WorkoutRoutineFocus =
      overrides.focus ??
      (mobilityCount > 0 && strengthCount === 0
        ? "mobility"
        : cardioCount > 0 && strengthCount === 0
          ? "cardio"
          : coreCount >= Math.max(lowerCount, upperCount) && coreCount > 0
            ? "core"
            : lowerCount > upperCount
              ? "lower"
              : upperCount > lowerCount
                ? "upper"
                : "full");
    const timeBudget: WorkoutRoutineTime =
      overrides.timeBudget ?? (estimatedMinutes <= 20 ? "short" : estimatedMinutes <= 45 ? "medium" : "long");
    const energy: WorkoutRoutineEnergy =
      overrides.energy ??
      (strengthCount >= 4 || estimatedMinutes > 45 ? "high" : strengthCount <= 1 && estimatedMinutes <= 20 ? "low" : "medium");

    return {
      focus,
      energy,
      timeBudget,
      equipment: overrides.equipment ?? "any",
    };
  };

  const formatWorkoutRoutineBestEffort = (rows: WorkoutBlockExercise[]) => {
    const sortedRows = [...rows].sort((a, b) => {
      const volumeA = (a.weight ?? 0) * (a.sets ?? 1) * (a.reps ?? 1);
      const volumeB = (b.weight ?? 0) * (b.sets ?? 1) * (b.reps ?? 1);
      const durationA = a.duration ?? 0;
      const durationB = b.duration ?? 0;
      return Math.max(volumeB, durationB) - Math.max(volumeA, durationA);
    });
    const bestRow = sortedRows.find((row) => formatExerciseResult(row));
    if (!bestRow) return "";
    const exercise = exerciseLibrary.find((item) => item.id === bestRow.exerciseId);
    const result = formatExerciseResult(bestRow);
    return result ? `${exercise?.name ?? "Exercise"}: ${result}` : "";
  };

  const formatWorkoutRoutineItemLabel = (row: WorkoutRoutineExercise) => {
    const exercise = exerciseLibrary.find((item) => item.id === row.exerciseId);
    const name = exercise?.name ?? "Exercise";
    const result = formatExerciseResult(row);
    return result ? `${name} - ${result}` : name;
  };

  const syncRoutineTabForWorkoutRoutine = (routine: WorkoutRoutine) => {
    if (!user) return;

    const sourceRoutines = routineTabs.length > 0 ? routineTabs : loadRoutineNotes(user.id);
    const matchingRoutineTab = sourceRoutines.find((item) => item.linkedWorkoutRoutineId === routine.id)
      ?? sourceRoutines.find(
        (item) =>
          item.category === "workout" &&
          normalizePlanningName(item.name) === normalizePlanningName(routine.name)
      );
    const workoutItems = routine.exercises.map((row) => ({
      id: createRoutineId("routine-item"),
      label: formatWorkoutRoutineItemLabel(row),
    }));
    const syncedRoutineTab: RoutineTab = {
      id: matchingRoutineTab?.id ?? createRoutineId("routine"),
      name: routine.name,
      category: "workout",
      notes: matchingRoutineTab?.notes ?? "Workout routine linked from your exercise library.",
      items: workoutItems,
      completedByDate: matchingRoutineTab?.completedByDate ?? {},
      linkedWorkoutRoutineId: routine.id,
    };
    const nextRoutineTabs = matchingRoutineTab
      ? sourceRoutines.map((item) => (item.id === matchingRoutineTab.id ? syncedRoutineTab : item))
      : [...sourceRoutines, syncedRoutineTab];

    setRoutineTabs(nextRoutineTabs);
    saveRoutineNotes(user.id, nextRoutineTabs);
  };

  const unlinkDeletedWorkoutRoutineTabs = (routineId: string) => {
    if (!user) return;

    const sourceRoutines = routineTabs.length > 0 ? routineTabs : loadRoutineNotes(user.id);
    const nextRoutineTabs = sourceRoutines.map((routine) =>
      routine.linkedWorkoutRoutineId === routineId
        ? { ...routine, linkedWorkoutRoutineId: null }
        : routine
    );
    setRoutineTabs(nextRoutineTabs);
    saveRoutineNotes(user.id, nextRoutineTabs);
  };

  const unlinkDeletedWorkoutRoutineBlocks = (routineId: string) => {
    const nextLinks = Object.fromEntries(
      Object.entries(workoutBlockRoutineLinks).filter(([, linkedRoutineId]) => linkedRoutineId !== routineId)
    );
    saveWorkoutBlockRoutineLinks(nextLinks);
  };

  const saveWorkoutRoutineFromRows = (
    name: string,
    rows: WorkoutBlockExercise[],
    metadataOverrides: Partial<Pick<WorkoutRoutine, "focus" | "energy" | "timeBudget" | "equipment">> = {},
    forceNew = false
  ) => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("Name the routine first", "error");
      return null;
    }

    if (rows.length === 0) {
      showToast("Add exercises before saving a routine", "info");
      return null;
    }

    const now = new Date().toISOString();
    const routineExercises: WorkoutRoutineExercise[] = rows.map(({ id: _id, ...row }) => row);
    const existing = forceNew
      ? null
      : workoutRoutines.find(
          (routine) => routine.name.trim().toLowerCase() === trimmed.toLowerCase()
        );
    const routineMetadata = inferWorkoutRoutineMetadata(routineExercises, {
      ...metadataOverrides,
      equipment: metadataOverrides.equipment ?? existing?.equipment,
    });
    const nextRoutine: WorkoutRoutine = {
      id: existing?.id ?? createClientId("workout-routine"),
      name: trimmed,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      exercises: routineExercises,
      ...routineMetadata,
    };
    const nextRoutines = existing
      ? workoutRoutines.map((routine) => (routine.id === existing.id ? nextRoutine : routine))
      : [...workoutRoutines, nextRoutine];

    saveWorkoutRoutines(nextRoutines);
    syncRoutineTabForWorkoutRoutine(nextRoutine);
    showToast(existing ? "Routine updated and linked to Routines" : "Routine saved and linked to Routines", "success");
    return nextRoutine;
  };

  const saveWorkoutRoutineFromBlock = (blockId: string, name: string) => {
    saveWorkoutRoutineFromRows(name, blockExercises[blockId] ?? []);
  };

  const saveWorkoutRoutineAsNewFromBlock = (blockId: string, name: string) => {
    const rows = blockExercises[blockId] ?? [];
    const fallbackName = name.trim() || `${blocks.find((block) => block.id === blockId)?.label ?? "Workout"} variation`;
    const routine = saveWorkoutRoutineFromRows(fallbackName, rows, {}, true);
    if (routine) {
      setWorkoutBlockRoutineLink(blockId, routine.id);
    }
  };

  const updateWorkoutRoutineFromBlock = (blockId: string, routineId: string) => {
    const existing = workoutRoutines.find((routine) => routine.id === routineId);
    const rows = blockExercises[blockId] ?? [];
    if (!existing) {
      showToast("Choose an attached routine first", "info");
      return;
    }
    if (rows.length === 0) {
      showToast("Add exercises before updating the routine", "info");
      return;
    }

    const now = new Date().toISOString();
    const routineExercises: WorkoutRoutineExercise[] = rows.map(({ id: _id, ...row }) => row);
    const nextRoutine: WorkoutRoutine = {
      ...existing,
      updatedAt: now,
      exercises: routineExercises,
      ...inferWorkoutRoutineMetadata(routineExercises, { equipment: existing.equipment }),
    };
    const nextRoutines = workoutRoutines.map((routine) =>
      routine.id === routineId ? nextRoutine : routine
    );

    saveWorkoutRoutines(nextRoutines);
    syncRoutineTabForWorkoutRoutine(nextRoutine);
    showToast(`${nextRoutine.name} updated`, "success");
  };

  const saveWorkoutRoutineFromExerciseIds = (
    name: string,
    exerciseIds: string[],
    metadataOverrides: Partial<Pick<WorkoutRoutine, "focus" | "energy" | "timeBudget" | "equipment">> = {}
  ) => {
    const rows = exerciseIds
      .map((exerciseId) => exerciseLibrary.find((exercise) => exercise.id === exerciseId))
      .filter((exercise): exercise is ExerciseLibraryItem => !!exercise)
      .map((exercise) => createWorkoutExerciseRow(exercise));

    saveWorkoutRoutineFromRows(name, rows, metadataOverrides);
  };

  const deleteWorkoutRoutine = (routineId: string) => {
    saveWorkoutRoutines(workoutRoutines.filter((routine) => routine.id !== routineId));
    saveWorkoutRoutineHistory(workoutRoutineHistory.filter((entry) => entry.routineId !== routineId));
    persistWeeklyRoutineIntentions(
      weeklyRoutineIntentions.filter((intention) => intention.routineId !== routineId)
    );
    unlinkDeletedWorkoutRoutineTabs(routineId);
    unlinkDeletedWorkoutRoutineBlocks(routineId);
    showToast("Routine deleted", "info");
  };

  const addExerciseIdsToBlock = (
    blockId: string,
    exerciseIds: string[],
    replace = false
  ) => {
    const rows = exerciseIds
      .map((exerciseId) => exerciseLibrary.find((exercise) => exercise.id === exerciseId))
      .filter((exercise): exercise is ExerciseLibraryItem => !!exercise)
      .map((exercise) => createWorkoutExerciseRow(exercise));

    if (rows.length === 0) return;

    saveBlockExercises({
      ...blockExercises,
      [blockId]: replace ? rows : [...(blockExercises[blockId] ?? []), ...rows],
    });
  };

  const loadWorkoutRoutineToBlock = (blockId: string, routineId: string) => {
    const routine = workoutRoutines.find((item) => item.id === routineId);
    if (!routine) return;

    const rows = routine.exercises
      .map((row) => {
        const exercise = exerciseLibrary.find((item) => item.id === row.exerciseId);
        return exercise ? createWorkoutExerciseRow(exercise, row) : null;
      })
      .filter((row): row is WorkoutBlockExercise => !!row);

    if (rows.length === 0) {
      showToast("That routine has no available exercises", "info");
      return;
    }

    saveBlockExercises({
      ...blockExercises,
      [blockId]: rows,
    });
    setWorkoutBlockRoutineLink(blockId, routine.id);
    showToast(`Loaded and attached ${routine.name}`, "success");
  };

  const attachWorkoutRoutineToBlock = (
    blockId: string,
    routineId: string,
    options: { loadExercises?: boolean } = {}
  ) => {
    const routine = workoutRoutines.find((item) => item.id === routineId);
    if (!routine) {
      showToast("Choose a saved routine first", "info");
      return;
    }

    if (options.loadExercises) {
      loadWorkoutRoutineToBlock(blockId, routine.id);
      return;
    }

    setWorkoutBlockRoutineLink(blockId, routine.id);
    showToast(`Attached ${routine.name}`, "success");
  };

  const detachWorkoutRoutineFromBlock = (blockId: string) => {
    setWorkoutBlockRoutineLink(blockId, null);
    showToast("Routine detached from block", "info");
  };

  const createWorkoutBlockFromExercises = async (label: string, exerciseIds: string[]) => {
    const blockId = await createBlock(label || "Strength training", false, undefined, "fitness");
    if (!blockId) return;

    addExerciseIdsToBlock(blockId, exerciseIds, true);
    showToast("Workout added to unscheduled", "success");
  };

  const createWorkoutBlockFromRoutine = async (routineId: string) => {
    const routine = workoutRoutines.find((item) => item.id === routineId);
    if (!routine) return;

    const blockId = await createBlock(routine.name, false, undefined, "fitness");
    if (!blockId) return;

    loadWorkoutRoutineToBlock(blockId, routineId);
  };

  const addCustomExercise = (
    exercise: Pick<ExerciseLibraryItem, "name" | "category" | "bodyArea" | "pattern">
  ) => {
    const trimmed = exercise.name.trim();
    if (!trimmed) return;

    const existing = exerciseLibrary.find((item) => item.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      showToast("Exercise is already in your library", "info");
      return;
    }

    saveExerciseLibrary([
      ...exerciseLibrary,
      {
        id: createClientId("exercise"),
        name: trimmed,
        category: exercise.category,
        bodyArea: exercise.bodyArea,
        pattern: exercise.pattern,
        defaultSets: exercise.category === "cardio" || exercise.category === "mobility" ? null : 3,
        defaultReps: exercise.category === "cardio" ? null : 10,
        defaultDuration: exercise.category === "cardio" || exercise.category === "mobility" ? 10 : null,
      },
    ]);
    showToast("Exercise added", "success");
  };

  const addExerciseToBlock = (blockId: string, exerciseName: string) => {
    const trimmed = exerciseName.trim();
    if (!trimmed) return;

    let nextLibrary = exerciseLibrary;
    let libraryItem = exerciseLibrary.find(
      (exercise) => exercise.name.toLowerCase() === trimmed.toLowerCase()
    );

    if (!libraryItem) {
      libraryItem = {
        id: createClientId("exercise"),
        name: trimmed,
        category: "strength",
        defaultSets: 3,
        defaultReps: 10,
      };
      nextLibrary = [...exerciseLibrary, libraryItem];
      saveExerciseLibrary(nextLibrary);
      showToast(`Added ${trimmed} to your exercise library`, "success");
    }

    const nextRow = createWorkoutExerciseRow(libraryItem);

    saveBlockExercises({
      ...blockExercises,
      [blockId]: [...(blockExercises[blockId] ?? []), nextRow],
    });
  };

  const updateBlockExercise = (
    blockId: string,
    rowId: string,
    updates: Partial<WorkoutBlockExercise>
  ) => {
    saveBlockExercises({
      ...blockExercises,
      [blockId]: (blockExercises[blockId] ?? []).map((row) =>
        row.id === rowId ? { ...row, ...updates } : row
      ),
    });
  };

  const deleteBlockExercise = (blockId: string, rowId: string) => {
    saveBlockExercises({
      ...blockExercises,
      [blockId]: (blockExercises[blockId] ?? []).filter((row) => row.id !== rowId),
    });
  };

  const isStrengthTrainingBlock = (block: Block): boolean => {
    if (!block.isHabitBlock || !block.habitId) return false;

    const habit = allHabits.find((h) => h.id === block.habitId);
    if (!habit || !habit.habitGroupId) return false;

    const habitGroup = themes
      .flatMap((t) => t.groups)
      .find((g) => g.id === habit.habitGroupId);

    return habitGroup?.groupType === "strength_training";
  };

  const isWorkoutBlock = (block: Block): boolean => {
    if (block.hashtag === 'link' || /^Link:/i.test(block.label)) return false;
    if (isStrengthTrainingBlock(block)) return true;

    const habit = block.habitId ? allHabits.find((h) => h.id === block.habitId) : undefined;
    const theme = block.themeId ? themes.find((t) => t.id === block.themeId) : undefined;
    const searchableText = [
      block.label,
      block.hashtag,
      habit?.name,
      theme?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return /\b(workout|training|strength|full body|upper|lower|core|mobility|stretch|cardio|walk|legs?|glutes?|push|pull)\b/.test(searchableText);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setShowBucketConfig(false);

    if (mode === "buckets") {
      setBlocks((prev) =>
        prev.map((b) =>
          b.location.type === "slot" &&
          b.location.timeIndex >= bucketSlots.length
            ? { ...b, location: { type: "unscheduled" } }
            : b
        )
      );
    }
  };

  const updateBucketName = (index: number, name: string) => {
    setBucketSlots((prev) =>
      prev.map((slot, i) => (i === index ? name : slot))
    );
  };

  const addBucket = () => {
    setBucketSlots((prev) => [...prev, "New bucket"]);
  };

  const deleteBucket = (index: number) => {
    setBucketSlots((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const safeNext = next.length > 0 ? next : ["Time"];

      setBlocks((prevBlocks) =>
        prevBlocks.map((b) =>
          b.location.type === "slot" &&
          b.location.timeIndex >= safeNext.length
            ? { ...b, location: { type: "unscheduled" } }
            : b
        )
      );

      return safeNext;
    });
  };

  const slotLabels = viewMode === "hourly" ? hourlySlots : bucketSlots;

  const softPlannedBlockIds = new Set<string>();
  const collectSoftPlannedBlocks = (nodes: OutlineNode[]) => nodes.forEach(node => {
    if (node.trashedAt) return;
    if (normalizeOutlinePlans(node.plans, node.id, node.planDate).length && node.linked?.blockId) softPlannedBlockIds.add(node.linked.blockId);
    for (const plan of node.plans ?? []) {
      plan.scheduledBlockIds.forEach(id => softPlannedBlockIds.add(id));
      if (plan.occurrenceBlockId) softPlannedBlockIds.add(plan.occurrenceBlockId);
    }
    collectSoftPlannedBlocks(node.children);
  });
  collectSoftPlannedBlocks(outlinerNodes);
  const unscheduledBlocks = blocks.filter(
    (b) => b.location.type === "unscheduled" && !b.themeId && !b.completed && !softPlannedBlockIds.has(b.id)
  );

  const getBlocksForSlot = (dayIndex: number, timeIndex: number) => {
    return blocks.filter((b) => {
      if (b.location.type !== "slot") return false;
      if (b.location.dayIndex !== dayIndex) return false;
      if (b.linkedBlockId && !b.isLinkedGroup) return false;
      if (viewMode === "buckets") {
        return getBucketForHourlyIndex(b.location.timeIndex) === timeIndex;
      }
      return b.location.timeIndex === timeIndex;
    });
  };

  const getDayColumnWidth = (dayIndex: number) => {
    const manualWidth = dayColWidths[dayIndex];
    if (manualWidth) return manualWidth;

    const cat = colCategory(dayIndex);
    if (cat === "past") return 38;

    const baseWidth = cat === "future" ? 118 : 142;
    const longestLabel = blocks
      .filter(
        (b) =>
          b.location.type === "slot" &&
          b.location.dayIndex === dayIndex &&
          !(b.linkedBlockId && !b.isLinkedGroup)
      )
      .reduce((longest, block) => {
        const blockTextLength = block.label.length + (block.hashtag?.length ?? 0);
        return Math.max(longest, blockTextLength);
      }, 0);

    return Math.min(320, Math.max(baseWidth, longestLabel * 7 + 72));
  };

  const hasAdjacentBlockBelow = (block: Block): boolean => {
    if (block.location.type !== "slot" || !block.sessionGroupId) return false;

    const currentDayIndex = block.location.dayIndex;
    const currentTimeIndex = block.location.timeIndex;

    const belowBlocks = blocks.filter(
      (b) =>
        b.location.type === "slot" &&
        b.location.dayIndex === currentDayIndex &&
        b.location.timeIndex === currentTimeIndex + 1 &&
        b.sessionGroupId === block.sessionGroupId
    );

    return belowBlocks.length > 0;
  };

  const handleSlotDrop = (
    e: React.DragEvent<HTMLElement>,
    dayIndex: number,
    timeIndex: number
  ) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");

    const hourlyIndex = viewMode === "buckets" ? BUCKET_TO_HOURLY[timeIndex] ?? timeIndex : timeIndex;
    const plainDrag = e.dataTransfer.getData('text/plain');
    const outlineId = e.dataTransfer.getData('application/outline-node-id') || (plainDrag.startsWith('outline-link:') ? plainDrag.slice('outline-link:'.length) : '');
    const reading = outlineBranchItems(latestOutlineNodes.current).find(node => node.id === outlineId && node.tag === 'link');
    if (reading) {
      const date = new Date(`${getWeekStartDateString(weekOffset)}T12:00:00`); date.setDate(date.getDate() + dayIndex);
      void savePlanItem(reading.id, localDateKey(date), hourlyIndex, 'time').catch(error => showToast(error instanceof Error ? error.message : 'Could not schedule this link. Please retry.', 'error'));
      return;
    }
    const droppedBlockId = currentDragBlockId || dragBlockId;
    if (droppedBlockId) {
      moveBlockToSlot(droppedBlockId, dayIndex, hourlyIndex);
    } else if (dragHabitId) {
      createHabitBlockAtSlot(dragHabitId, dayIndex, hourlyIndex);
    }
  };

  const handleSlotDragOver = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add("drag-over");
  };

  const handleSlotDragLeave = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.currentTarget.classList.remove("drag-over");
  };

  const handleWaitingDragOver = (e: React.DragEvent<HTMLElement>) => {
    const droppedBlockId = currentDragBlockId || dragBlockId;
    const block = droppedBlockId ? blocks.find((item) => item.id === droppedBlockId) : null;
    if (!block || block.location.type === "unscheduled") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    e.currentTarget.classList.add("drag-over");
  };

  const handleWaitingDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      e.currentTarget.classList.remove("drag-over");
    }
  };

  const handleWaitingDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove("drag-over");

    const droppedBlockId =
      currentDragBlockId ||
      dragBlockId ||
      e.dataTransfer.getData("application/block-id") ||
      e.dataTransfer.getData("text/plain");
    const block = droppedBlockId ? blocks.find((item) => item.id === droppedBlockId) : null;
    if (!droppedBlockId || !block || block.location.type === "unscheduled") {
      currentDragBlockId = null;
      setDragBlockId(null);
      return;
    }

    await moveBlockToUnscheduled(droppedBlockId);
    showMoveUndoToast("Moved to Waiting", block);
    currentDragBlockId = null;
    setDragBlockId(null);
  };

  const deleteBlockWithUndo = async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const completionRecord = habitProgressRecords.find((record) => record.id === blockId);

    try {
      if (block.linkedBlockId) {
        await database.blocks.update(block.linkedBlockId, {
          linked_block_id: null,
          is_linked_group: false,
        });
        const linkedBlock = blocks.find((b) => b.id === block.linkedBlockId);
        if (linkedBlock?.habitId) {
          const habit = allHabits.find((h) => h.id === linkedBlock.habitId);
          if (habit) {
            await database.blocks.update(block.linkedBlockId, {
              label: `Habit: ${habit.name}`,
            });
          }
        }
      }

      if (user) await cancelTileTimer(localStorage, tileTimerAlarm, user.id, blockId);
      await database.blocks.delete(blockId);
      setHabitProgressRecords(current => current.filter(record => record.id !== blockId));
      setBlocks((prev) =>
        prev
          .filter((b) => b.id !== blockId)
          .map((b) => {
            if (b.id === block.linkedBlockId) {
              const habit = allHabits.find((h) => h.id === b.habitId);
              return {
                ...b,
                linkedBlockId: undefined,
                isLinkedGroup: false,
                label: habit ? `Habit: ${habit.name}` : b.label,
              };
            }
            return b;
          })
      );
      await refreshSessionGroups();

      showToast("Block removed", "info", {
        label: "Undo",
        onClick: async () => {
          if (!user) return;
          try {
            const restored = await database.blocks.create(user.id, {
              label: block.label,
              is_habit_block: block.isHabitBlock,
              habit_id: block.habitId ?? null,
              location_type: block.location.type === "slot" ? "slot" : "unscheduled",
              day_index: block.location.type === "slot" ? block.location.dayIndex : null,
              time_index: block.location.type === "slot" ? block.location.timeIndex : null,
              completed: block.completed || false,
              hashtag: block.hashtag ?? null,
              week_start_date: block.location.type === "slot" ? getWeekStartDateString(weekOffset) : null,
              linked_block_id: null,
              is_linked_group: false,
              workout_submitted: block.workoutSubmitted || false,
              session_group_id: null,
              is_daily_template: false,
              daily_template_id: null,
            });
            const restoredBlock: Block = {
              id: restored.id,
              label: restored.label,
              isHabitBlock: restored.is_habit_block,
              location: block.location,
              habitId: restored.habit_id ?? undefined,
              completed: restored.completed,
              hashtag: restored.hashtag ?? undefined,
              workoutSubmitted: restored.workout_submitted,
              creditedHabitIds: block.creditedHabitIds,
            };
            for (const habitId of block.creditedHabitIds ?? []) {
              await database.blockHabitCredits.create(user.id, restored.id, habitId);
            }
            for (const log of completionRecord?.block_activity_logs ?? []) {
              await database.blockActivityLogs.create(
                user.id, restored.id, log.habit_id,
                completionRecord?.week_start_date ?? null,
                completionRecord?.day_index ?? null,
                block.location.type === "slot" ? block.location.timeIndex : null,
                log.completed_at
              );
            }
            setBlocks((prev) => [...prev, restoredBlock]);
            await refreshHabitProgress();
            showToast("Block restored", "success");
          } catch (err) {
            console.error("Error restoring block:", err);
            showToast("Failed to restore block", "error");
          }
        },
      });
    } catch (error) {
      console.error("Error deleting block:", error);
    }
  };

  const handleBlockDoubleClickWithUndo = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    if (block.isHabitBlock) {
      deleteBlockWithUndo(blockId);
    } else {
      moveBlockToUnscheduled(blockId);
    }
  };

  const toggleThemeExpanded = (themeId: string) => {
    setExpandedThemes((prev) => {
      if (prev.has(themeId)) return new Set();
      return new Set([themeId]);
    });
  };

  const startRenamingTheme = (themeId: string, currentName: string) => {
    setRenamingThemeId(themeId);
    setRenameThemeValue(currentName);
  };

  const saveThemeRename = async (themeId: string) => {
    const trimmed = renameThemeValue.trim();
    if (!trimmed) {
      showToast("Theme name cannot be empty.", "error");
      return;
    }
    try {
      await database.themes.update(themeId, trimmed);
      setThemes((prev) =>
        prev.map((t) => (t.id === themeId ? { ...t, name: trimmed } : t))
      );
      setRenamingThemeId(null);
      setRenameThemeValue("");
    } catch (error) {
      console.error("Error renaming theme:", error);
      showToast("Failed to rename theme", "error");
    }
  };

  const deleteTheme = (themeId: string) => {
    const theme = themes.find((t) => t.id === themeId);
    const habitCount = theme?.habits.length || 0;
    const msg = habitCount > 0
      ? `Delete "${theme?.name}" and its ${habitCount} habit(s)? This cannot be undone.`
      : `Delete "${theme?.name}"? This cannot be undone.`;

    showConfirm(msg, async () => {
      try {
        const themeHabitIds = theme?.habits.map((h) => h.id) || [];
        for (const hId of themeHabitIds) {
          await database.habits.delete(hId);
        }
        const themeGroupIds = theme?.groups.map((g) => g.id) || [];
        for (const gId of themeGroupIds) {
          await database.habitGroups.delete(gId);
        }
        await database.themes.delete(themeId);
        setThemes((prev) => prev.filter((t) => t.id !== themeId));
        setBlocks((prev) =>
          prev.map((b) =>
            themeHabitIds.includes(b.habitId || "")
              ? { ...b, isHabitBlock: false, habitId: undefined, completed: false }
              : b
          )
        );
        showToast("Theme deleted", "success");
      } catch (error) {
        console.error("Error deleting theme:", error);
        showToast("Failed to delete theme", "error");
      }
      setConfirmDialog(null);
    }, { confirmLabel: "Delete", destructive: true });
  };

  const saveBlockEdit = async (blockId: string) => {
    const trimmed = editBlockLabel.trim();
    if (!trimmed) {
      showToast("Block label cannot be empty.", "error");
      return;
    }
    try {
      await database.blocks.update(blockId, { label: trimmed });
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, label: trimmed } : b))
      );
      setEditingBlockId(null);
      setEditBlockLabel("");
    } catch (error) {
      console.error("Error editing block:", error);
      showToast("Failed to update block", "error");
    }
  };

  const copyLastWeek = async () => {
    if (!user) return;

    const prevWeekStart = getWeekStartDateString(weekOffset - 1);
    const currentWeekStart = getWeekStartDateString(weekOffset);

    try {
      const prevBlocks = await database.blocks.getForWeek(user.id, prevWeekStart);
      const scheduledPrev = prevBlocks.filter(
        (b) => b.location_type === "slot" && b.week_start_date === prevWeekStart
      );

      if (scheduledPrev.length === 0) {
        showToast("No blocks found in previous week.", "info");
        return;
      }

      let copied = 0;
      for (const pb of scheduledPrev) {
        if (pb.day_index === null || pb.time_index === null) continue;

        const blockData = await database.blocks.create(user.id, {
          label: pb.label,
          is_habit_block: pb.is_habit_block,
          habit_id: pb.habit_id,
          location_type: "slot",
          day_index: pb.day_index,
          time_index: pb.time_index,
          completed: false,
          hashtag: pb.hashtag,
          week_start_date: currentWeekStart,
          linked_block_id: null,
          is_linked_group: false,
          workout_submitted: false,
          session_group_id: null,
          is_daily_template: false,
          daily_template_id: null,
        });

        const newBlock: Block = {
          id: blockData.id,
          label: blockData.label,
          isHabitBlock: blockData.is_habit_block,
          location: { type: "slot", dayIndex: pb.day_index!, timeIndex: pb.time_index! },
          habitId: blockData.habit_id ?? undefined,
          completed: false,
          hashtag: blockData.hashtag ?? undefined,
          workoutSubmitted: false,
        };
        setBlocks((prev) => [...prev, newBlock]);
        copied++;
      }

      showToast(`Copied ${copied} block(s) from last week`, "success");
    } catch (error) {
      console.error("Error copying last week:", error);
      showToast("Failed to copy from last week", "error");
    }
  };

  const getSmartSetupOccupiedSlots = () =>
    new Set(
      blocks
        .filter((b) => b.location.type === "slot")
        .map((b) => {
          const location = b.location as { type: "slot"; dayIndex: number; timeIndex: number };
          return `${location.dayIndex}-${location.timeIndex}`;
        })
    );

  const findNextSmartSetupSlot = (occupiedSlots: Set<string>) => {
    const startDay = Math.max(0, getTodayDayIndex(weekOffset));
    const preferredTimes = [3, 9, 12, 15, 1, 6, 10, 13, 16];

    for (let dayOffset = 0; dayOffset < days.length; dayOffset++) {
      const dayIndex = (startDay + dayOffset) % days.length;
      for (const timeIndex of preferredTimes) {
        const slotKey = `${dayIndex}-${timeIndex}`;
        if (timeIndex < hourlySlots.length && !occupiedSlots.has(slotKey)) {
          occupiedSlots.add(slotKey);
          return { dayIndex, timeIndex };
        }
      }
    }

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      for (let timeIndex = 0; timeIndex < hourlySlots.length; timeIndex++) {
        const slotKey = `${dayIndex}-${timeIndex}`;
        if (!occupiedSlots.has(slotKey)) {
          occupiedSlots.add(slotKey);
          return { dayIndex, timeIndex };
        }
      }
    }

    return null;
  };

  const isCompletedOneTimeSmartSetupBlock = (block: DBBlock, blockTasks: BlockTask[] = []) =>
    !block.is_habit_block &&
    !block.habit_id &&
    !block.is_standing &&
    !block.standing_block_id &&
    (block.completed || (blockTasks.length > 0 && blockTasks.every((task) => task.completed)));

  const isCompletedOneTimeWaitingBlock = (block: Block) =>
    !block.isHabitBlock &&
    !block.habitId &&
    (block.completed || ((block.blockTasks?.length ?? 0) > 0 && block.blockTasks!.every((task) => task.completed)));

  const isOneTimeSmartSetupBlock = (block: DBBlock) =>
    !block.is_habit_block &&
    !block.habit_id &&
    !block.is_standing &&
    !block.standing_block_id;

  const isOneTimeWaitingBlock = (block: Block) =>
    !block.isHabitBlock && !block.habitId;

  const normalizeOneTimeSuggestionLabel = (label: string) =>
    label.replace(/^(Task|Note|Block):\s*/i, "").trim().toLowerCase();

  const hasSpecificDateText = (label: string) => {
    const normalized = label.toLowerCase();
    return (
      /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+\d{1,2}\b/.test(normalized) ||
      /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(normalized)
    );
  };

  const isDatedOneTimeSmartSetupTask = (block: DBBlock) =>
    /^Task:\s*/i.test(block.label) && isOneTimeSmartSetupBlock(block) && hasSpecificDateText(block.label);

  const isDatedOneTimeWaitingTask = (block: Block) =>
    /^Task:\s*/i.test(block.label) && isOneTimeWaitingBlock(block) && hasSpecificDateText(block.label);

  const isPlainOneTimeSmartSetupTask = (block: DBBlock) =>
    /^Task:\s*/i.test(block.label) && isOneTimeSmartSetupBlock(block);

  const isPlainOneTimeWaitingTask = (block: Block) =>
    /^Task:\s*/i.test(block.label) && isOneTimeWaitingBlock(block);

  const openSmartWeeklySetup = async () => {
    if (!user) return;

    setShowSmartWeeklySetup(true);
    setSmartWeeklyLoading(true);

    try {
      const prevWeekStart = getWeekStartDateString(weekOffset - 1);
      const [prevBlocks, standingBlocks] = await Promise.all([
        database.blocks.getForWeek(user.id, prevWeekStart),
        getActiveStandingBlocks(user.id),
      ]);
      const prevBlockTaskRows = await database.blockTasks.getByBlocks(prevBlocks.map((block) => block.id));
      const prevBlockTasksByBlock = new Map<string, BlockTask[]>();
      prevBlockTaskRows.forEach((task) => {
        const existing = prevBlockTasksByBlock.get(task.block_id) ?? [];
        existing.push(task);
        prevBlockTasksByBlock.set(task.block_id, existing);
      });
      const completedOneTimeSuggestionLabels = new Set([
        ...prevBlocks
          .filter((block) =>
            block.week_start_date === prevWeekStart &&
            (isCompletedOneTimeSmartSetupBlock(block, prevBlockTasksByBlock.get(block.id) ?? []) ||
              isDatedOneTimeSmartSetupTask(block))
          )
          .map((block) => normalizeOneTimeSuggestionLabel(block.label)),
        ...blocks
          .filter((block) => isCompletedOneTimeWaitingBlock(block) || isDatedOneTimeWaitingTask(block))
          .map((block) => normalizeOneTimeSuggestionLabel(block.label)),
      ].filter(Boolean));
      const occupiedSlots = getSmartSetupOccupiedSlots();
      const currentScheduledKeys = new Set(
        blocks
          .filter((b) => b.location.type === "slot")
          .map((b) => `${b.label.toLowerCase()}-${(b.location as { type: "slot"; dayIndex: number; timeIndex: number }).dayIndex}-${(b.location as { type: "slot"; dayIndex: number; timeIndex: number }).timeIndex}`)
      );
      const suggestions: SmartWeekSuggestion[] = [];

      standingBlocks.forEach((standing) => {
        const slotKey = `${standing.day_index}-${standing.time_index}`;
        if (
          standing.time_index >= hourlySlots.length ||
          occupiedSlots.has(slotKey) ||
          currentScheduledKeys.has(`${standing.block_label.toLowerCase()}-${slotKey}`)
        ) {
          return;
        }

        occupiedSlots.add(slotKey);
        suggestions.push({
          id: `standing-${standing.id}`,
          source: "standing",
          label: standing.block_label,
          dayIndex: standing.day_index,
          timeIndex: standing.time_index,
          isHabitBlock: false,
          standingBlockId: standing.id,
          reason: "Repeats weekly",
        });
      });

      prevBlocks
        .filter(
          (b) =>
            b.location_type === "slot" &&
            b.week_start_date === prevWeekStart &&
            !isPlainOneTimeSmartSetupTask(b) &&
            !isCompletedOneTimeSmartSetupBlock(b, prevBlockTasksByBlock.get(b.id) ?? []) &&
            !isDatedOneTimeSmartSetupTask(b) &&
            !(isOneTimeSmartSetupBlock(b) && completedOneTimeSuggestionLabels.has(normalizeOneTimeSuggestionLabel(b.label)))
        )
        .forEach((block) => {
          if (block.day_index === null || block.time_index === null) return;
          const slotKey = `${block.day_index}-${block.time_index}`;
          if (
            block.time_index >= hourlySlots.length ||
            occupiedSlots.has(slotKey) ||
            currentScheduledKeys.has(`${block.label.toLowerCase()}-${slotKey}`)
          ) {
            return;
          }

          occupiedSlots.add(slotKey);
          suggestions.push({
            id: `last-week-${block.id}`,
            source: "last-week",
            sourceBlockId: block.id,
            label: block.label,
            dayIndex: block.day_index,
            timeIndex: block.time_index,
            isHabitBlock: block.is_habit_block,
            habitId: block.habit_id ?? undefined,
            hashtag: block.hashtag ?? undefined,
            reason: "Scheduled last week",
          });
        });

      blocks
        .filter(
          (b) =>
            b.location.type === "unscheduled" &&
            !b.themeId &&
            !isPlainOneTimeWaitingTask(b) &&
            !isCompletedOneTimeWaitingBlock(b) &&
            !isDatedOneTimeWaitingTask(b) &&
            !(isOneTimeWaitingBlock(b) && completedOneTimeSuggestionLabels.has(normalizeOneTimeSuggestionLabel(b.label)))
        )
        .slice(0, 8)
        .forEach((block) => {
          const slot = findNextSmartSetupSlot(occupiedSlots);
          if (!slot) return;
          const matchedHabit = block.habitId
            ? allHabits.find((habit) => habit.id === block.habitId) ?? findHabitByBlockLabel(block.label)
            : findHabitByBlockLabel(block.label);

          suggestions.push({
            id: `unscheduled-${block.id}`,
            source: "unscheduled",
            sourceBlockId: block.id,
            label: matchedHabit ? `Habit: ${matchedHabit.name}` : block.label,
            dayIndex: slot.dayIndex,
            timeIndex: slot.timeIndex,
            isHabitBlock: block.isHabitBlock || !!matchedHabit,
            habitId: block.habitId ?? matchedHabit?.id,
            hashtag: block.hashtag ?? matchedHabit?.themeName,
            reason: "Waiting in unscheduled",
          });
        });

      setSmartWeeklySuggestions(suggestions.slice(0, 20));
      if (suggestions.length === 0) {
        showToast("No smart weekly setup suggestions found.", "info");
      }
    } catch (error) {
      console.error("Error building smart weekly setup:", error);
      showToast("Failed to build weekly setup suggestions", "error");
    } finally {
      setSmartWeeklyLoading(false);
    }
  };

  const applySmartWeeklySetup = async (suggestions: SmartWeekSuggestion[]) => {
    if (!user || suggestions.length === 0) return;

    setSmartWeeklyApplying(true);

    try {
      const currentWeekStart = getWeekStartDateString(weekOffset);
      const createPayloads: Omit<DBBlock, "id" | "user_id" | "created_at" | "updated_at">[] = [];
      const getSuggestionHabit = (suggestion: SmartWeekSuggestion) =>
        suggestion.habitId
          ? allHabits.find((habit) => habit.id === suggestion.habitId) ?? findHabitByBlockLabel(suggestion.label)
          : findHabitByBlockLabel(suggestion.label);
      const unscheduledSuggestions = suggestions.filter(
        (suggestion) => suggestion.source === "unscheduled" && suggestion.sourceBlockId
      );

      suggestions
        .filter((suggestion) => suggestion.source !== "unscheduled")
        .forEach((suggestion) => {
          const matchedHabit = getSuggestionHabit(suggestion);
          createPayloads.push({
            label: matchedHabit ? `Habit: ${matchedHabit.name}` : suggestion.label,
            is_habit_block: suggestion.isHabitBlock || !!matchedHabit,
            habit_id: suggestion.habitId ?? matchedHabit?.id ?? null,
            location_type: "slot",
            day_index: suggestion.dayIndex,
            time_index: suggestion.timeIndex,
            completed: false,
            hashtag: suggestion.hashtag ?? matchedHabit?.themeName ?? null,
            week_start_date: currentWeekStart,
            linked_block_id: null,
            is_linked_group: false,
            workout_submitted: false,
            session_group_id: null,
            is_daily_template: false,
            daily_template_id: null,
            is_standing: suggestion.source === "standing",
            standing_block_id: suggestion.standingBlockId ?? null,
            theme_id: matchedHabit?.themeId ?? null,
          });
        });

      const createdBlocks = await database.blocks.createMany(user.id, createPayloads);
      const updatedBlocks = await Promise.all(
        unscheduledSuggestions.map((suggestion) => {
          const matchedHabit = getSuggestionHabit(suggestion);
          return database.blocks.update(suggestion.sourceBlockId!, {
            label: matchedHabit ? `Habit: ${matchedHabit.name}` : suggestion.label,
            is_habit_block: suggestion.isHabitBlock || !!matchedHabit,
            habit_id: suggestion.habitId ?? matchedHabit?.id ?? null,
            location_type: "slot",
            day_index: suggestion.dayIndex,
            time_index: suggestion.timeIndex,
            week_start_date: currentWeekStart,
            hashtag: suggestion.hashtag ?? matchedHabit?.themeName ?? null,
            theme_id: matchedHabit?.themeId ?? null,
          });
        })
      );

      const acceptedBlocks = [...createdBlocks, ...updatedBlocks];
      await Promise.all(
        acceptedBlocks
          .filter((block) => block.is_habit_block && block.habit_id)
          .map((block) => {
            const ancestorIds = getHabitAncestorIds(block.habit_id!);
            return ancestorIds.length > 0 ? saveBlockCredits(block.id, ancestorIds) : Promise.resolve();
          })
      );

      await loadUserData();
      setShowSmartWeeklySetup(false);
      showToast(`Applied ${suggestions.length} smart setup suggestion(s)`, "success");
    } catch (error) {
      console.error("Error applying smart weekly setup:", error);
      showToast("Failed to apply smart weekly setup", "error");
    } finally {
      setSmartWeeklyApplying(false);
    }
  };

  const todayDayIndex = getTodayDayIndex(weekOffset);

  const colCategory = useCallback((dayIndex: number): "past" | "today" | "future" | "normal" => {
    if (dayColWidths[dayIndex]) return "normal";
    if (todayDayIndex === -1) return "normal";
    if (dayIndex === todayDayIndex) return "today";
    if (dayIndex === mobileDayIndex) return "normal";
    if (dayIndex < todayDayIndex) return expandedCols.has(dayIndex) ? "normal" : "past";
    return "future";
  }, [todayDayIndex, mobileDayIndex, expandedCols, dayColWidths]);

  useEffect(() => {
    if (keepMobileDayOnWeekChangeRef.current) {
      keepMobileDayOnWeekChangeRef.current = false;
      return;
    }

    setMobileDayIndex(todayDayIndex >= 0 ? todayDayIndex : 0);
  }, [todayDayIndex, weekOffset]);

  const mobileSelectedDayIndex = Math.min(Math.max(mobileDayIndex, 0), days.length - 1);
  const moveMobilePlannerDay = (direction: -1 | 1) => {
    closeOverlayPanels();

    setMobileDayIndex((currentDay) => {
      if (direction < 0 && currentDay <= 0) {
        keepMobileDayOnWeekChangeRef.current = true;
        setWeekOffset((offset) => offset - 1);
        return days.length - 1;
      }

      if (direction > 0 && currentDay >= days.length - 1) {
        keepMobileDayOnWeekChangeRef.current = true;
        setWeekOffset((offset) => offset + 1);
        return 0;
      }

      return Math.min(days.length - 1, Math.max(0, currentDay + direction));
    });
  };
  const todayScheduledBlocks =
    todayDayIndex >= 0
      ? blocks
          .filter(
            (b) =>
              b.location.type === "slot" &&
              b.location.dayIndex === todayDayIndex &&
              !(b.linkedBlockId && !b.isLinkedGroup)
          )
          .sort((a, b) => {
            const aTime = a.location.type === "slot" ? a.location.timeIndex : 0;
            const bTime = b.location.type === "slot" ? b.location.timeIndex : 0;
            return aTime - bTime;
          })
      : [];
  const incompleteTodayBlocks = todayScheduledBlocks.filter((block) => !block.completed);
  const mobileNowBlock = incompleteTodayBlocks[0] ?? null;
  const mobileSelectedScheduledBlocks = blocks
    .filter(
      (b) =>
        b.location.type === "slot" &&
        b.location.dayIndex === mobileSelectedDayIndex &&
        !(b.linkedBlockId && !b.isLinkedGroup)
    )
    .sort((a, b) => {
      const aTime = a.location.type === "slot" ? a.location.timeIndex : 0;
      const bTime = b.location.type === "slot" ? b.location.timeIndex : 0;
      return aTime - bTime;
    });
  const incompleteMobileSelectedBlocks = mobileSelectedScheduledBlocks.filter((block) => !block.completed);
  const mobileSelectedNowBlock = incompleteMobileSelectedBlocks[0] ?? null;
  const mobileSelectedNextBlocks = incompleteMobileSelectedBlocks.slice(1, 3);
  const mobileSelectedLaterCount = Math.max(
    0,
    incompleteMobileSelectedBlocks.length - (mobileSelectedNowBlock ? 1 : 0) - mobileSelectedNextBlocks.length
  );
  const isMobileSelectedDayToday = todayDayIndex >= 0 && mobileSelectedDayIndex === todayDayIndex;
  const mobileSelectedDateLabel = (() => {
    const date = new Date(`${getWeekStartDateString(weekOffset)}T12:00:00`);
    date.setDate(date.getDate() + mobileSelectedDayIndex);
    const month = date.toLocaleDateString("en-US", { month: "short" });
    return `${month === "Sep" ? "Sept" : month} ${date.getDate()}`;
  })();
  const todayDate = localDateKey(new Date());

  const collectOutlinerNodes = (
    nodes: OutlineNode[],
    path: string[] = [],
    parentThemeId?: string
  ): Array<{ node: OutlineNode; path: string[]; themeId?: string }> =>
    nodes.flatMap((node) => {
      if (node.trashedAt) return [];
      const nodeLabel = node.text.trim() || "Untitled";
      const nextPath = [...path, nodeLabel];
      const themeId = node.linked?.themeId ?? parentThemeId;
      return [{ node, path: nextPath, themeId }, ...collectOutlinerNodes(node.children, nextPath, themeId)];
    });

  const outlinerNodeEntries = collectOutlinerNodes(outlinerNodes);
  const outlinerParentOptions = outlinerNodeEntries.map(({ node, path }) => ({
    id: node.id,
    label: path.join(" > "),
  }));
  const outlinerBlockLinks = outlinerNodeEntries.flatMap(({ node, path }) =>
    [...new Set([node.linked?.blockId, ...(node.plans ?? []).flatMap(plan => [...plan.scheduledBlockIds, plan.occurrenceBlockId])])]
      .filter((id): id is string => !!id).map(blockId => ({ blockId, nodeId: node.id, path })));
  const outlinerLinkedBlockIdSet = new Set(outlinerBlockLinks.map(link => link.blockId));
  const outlinerLinkedBlockNodeIdMap = new Map(outlinerBlockLinks.map(link => [link.blockId, link.nodeId]));
  const outlinerLinkedBlockPathMap = new Map(outlinerBlockLinks.map(link => [link.blockId, link.path]));
  const collectThemeOutlineMeta = (
    themeNode: OutlineNode,
    themeId: string,
    themePath: string[]
  ): ThemeOutlineMeta => {
    const habitOrder: string[] = [];
    const outlineItems: ThemeOutlineItem[] = [];
    const nestedThemes: ThemeOutlineMeta["nestedThemes"] = [];

    const visit = (nodes: OutlineNode[], depth: number) => {
      for (const node of nodes) {
        if (node.trashedAt) continue;
        const label = node.text.trim() || node.linked?.label || "Untitled";
        const isNestedTheme = !!node.linked?.themeId && !node.linked.habitId;
        if (isNestedTheme) {
          nestedThemes.push({
            id: node.linked!.themeId!,
            name: label,
            nodeId: node.id,
          });
          continue;
        }

        if (node.linked?.habitId && node.linked.themeId === themeId) {
          habitOrder.push(node.linked.habitId);
          visit(node.children, depth + 1);
          continue;
        }

        outlineItems.push({
          id: node.id,
          text: label,
          tag: node.tag,
          depth,
          linkedLabel: node.linked?.routineId
            ? "Routine"
            : node.linked?.blockId
              ? "Block"
              : node.linked?.habitId
                ? "Habit"
                : undefined,
        });
        visit(node.children, depth + 1);
      }
    };

    visit(themeNode.children, 0);

    return {
      nodeId: themeNode.id,
      path: themePath,
      habitOrder,
      outlineItems,
      nestedThemes,
    };
  };
  const themeOutlineMetaMap = new Map<string, ThemeOutlineMeta>(
    outlinerNodeEntries
      .filter(({ node }) => !!node.linked?.themeId && !node.linked.habitId)
      .map(({ node, path }) => [
        node.linked!.themeId!,
        collectThemeOutlineMeta(node, node.linked!.themeId!, path),
      ])
  );
  const dueOutlinerItems = outlinerNodeEntries
    .filter(({ node }) => {
      if (!node.reminderAt || node.reminderDismissedAt) return false;
      return new Date(node.reminderAt).getTime() <= Date.now();
    })
    .sort((a, b) => {
      const aTime = a.node.reminderAt ? new Date(a.node.reminderAt).getTime() : 0;
      const bTime = b.node.reminderAt ? new Date(b.node.reminderAt).getTime() : 0;
      return aTime - bTime;
    });
  const mobileDueReminder = outlinerReminder
    ? {
        text: outlinerReminder.text,
        path: outlinerReminder.path,
        kind: outlinerReminder.reminderKind,
      }
    : dueOutlinerItems[0]
      ? {
          text: dueOutlinerItems[0].node.text.trim() || "Untitled",
          path: dueOutlinerItems[0].path,
          kind: dueOutlinerItems[0].node.reminderKind,
        }
      : null;
  const mobileDueReminderCount = Math.max(
    dueOutlinerItems.length,
    outlinerReminder ? 1 : 0
  );
  const mobileOutlineMiniItems = outlinerNodeEntries
    .filter(({ node }) => node.text.trim() && !((node.tag === "task" || node.tag === 'link') && node.taskDone))
    .sort((a, b) => {
      const aDue = !!a.node.reminderAt && !a.node.reminderDismissedAt && new Date(a.node.reminderAt).getTime() <= Date.now();
      const bDue = !!b.node.reminderAt && !b.node.reminderDismissedAt && new Date(b.node.reminderAt).getTime() <= Date.now();
      if (aDue !== bDue) return aDue ? -1 : 1;
      const aPlannedToday = a.node.planDate === todayDate;
      const bPlannedToday = b.node.planDate === todayDate;
      if (aPlannedToday !== bPlannedToday) return aPlannedToday ? -1 : 1;
      return a.path.length - b.path.length;
    })
    .slice(0, 4);

  const stackWeekDays = days.map((day, dayIndex) => {
    const scheduled = blocks.filter(
      (block) =>
        block.location.type === "slot" &&
        block.location.dayIndex === dayIndex &&
        !(block.linkedBlockId && !block.isLinkedGroup)
    );
    const open = scheduled.filter((block) => !block.completed).length;
    const habits = scheduled.filter((block) => block.isHabitBlock).length;
    const intentions =
      weeklyIntentions.reduce(
        (total, intention) =>
          total + intention.placements.filter((placement) => placement.dayIndex === dayIndex).length,
        0
      ) +
      weeklyRoutineIntentions.reduce(
        (total, intention) =>
          total + intention.placements.filter((placement) => placement.dayIndex === dayIndex).length,
        0
      );
    return {
      day,
      dayIndex,
      scheduledCount: scheduled.length,
      openCount: open,
      habitCount: habits,
      intentionCount: intentions,
      isToday: dayIndex === todayDayIndex,
      isSelected: dayIndex === mobileSelectedDayIndex,
    };
  });
  const stackTodayOpenBlocks = todayScheduledBlocks.filter((block) => !block.completed).slice(0, 5);
  const stackWaitingBlocks = unscheduledBlocks.slice(0, 5);
  const stackOutlineItems = outlinerNodeEntries
    .filter(({ node }) => {
      if (!node.text.trim() || ((node.tag === "task" || node.tag === 'link') && node.taskDone)) return false;
      const reminderDue = !!node.reminderAt && !node.reminderDismissedAt && new Date(node.reminderAt).getTime() <= Date.now();
      return reminderDue || node.planDate === todayDate || node.tag === "task" || !!node.linked?.blockId;
    })
    .slice(0, 5);
  const stackHabitThemes = themes
    .filter((theme) => theme.themeType === "habit")
    .map((theme) => {
      const habits = flattenHabits(theme.habits, theme.name, theme.id);
      const done = habits.reduce((total, habit) => total + getHabitDoneCount(habit.id, habit.frequency), 0);
      const target = habits.reduce(
        (total, habit) => total + (habit.frequency === "none" ? 0 : Math.max(1, habit.targetPerWeek)),
        0
      );
      return { id: theme.id, name: theme.name, done, target, count: habits.length };
    })
    .filter((theme) => theme.count > 0)
    .slice(0, 4);
  const stackHouseholdThemes = themes
    .filter((theme) => theme.themeType === "household")
    .map((theme) => {
      const habits = flattenHabits(theme.habits, theme.name, theme.id);
      const needCounts = habits.reduce(
        (counts, habit) => {
          const need = getHouseholdChoreNeed(habit);
          return { ...counts, [need.className]: (counts[need.className] ?? 0) + 1 };
        },
        {} as Record<string, number>
      );
      return {
        id: theme.id,
        name: theme.name,
        due: needCounts.due ?? 0,
        soon: needCounts.soon ?? 0,
        fresh: needCounts.fresh ?? 0,
      };
    })
    .slice(0, 3);
  const stackMealTheme = themes.find((theme) => theme.themeType === "meals");
  const stackMeals = stackMealTheme?.meals.slice(0, 4) ?? [];

  const isQuickCaptureBlock = (block: Block) => {
    const label = block.label.trim().toLowerCase();
    const hashtag = block.hashtag?.trim().toLowerCase();
    return hashtag === "note" || hashtag === "task" || label.startsWith("note:") || label.startsWith("task:");
  };
  const mobileSelectedDoneCount = mobileSelectedScheduledBlocks.filter((block) => block.completed).length;
  const mobileOpenTaskCount = mobileSelectedScheduledBlocks.reduce(
    (total, block) => total + (block.blockTasks ?? []).filter((task) => !task.completed).length,
    0
  );
  const mobileTimelinePreviewBlocks = mobileSelectedScheduledBlocks.slice(0, 6);
  const mobileIntentionStartDay =
    weekOffset === 0 && todayDayIndex >= 0 ? todayDayIndex : mobileSelectedDayIndex;
  const mobileWeeklyIntentionPlacements: SoftPlanPlacement[] = [
    ...weeklyIntentions.flatMap((intention) =>
      intention.placements.map((placement): SoftPlanPlacement => ({
        kind: "habit" as const,
        intention,
        placement,
        title: intention.habitName,
        detail: intention.themeName,
      }))
    ),
    ...weeklyRoutineIntentions.flatMap((intention) =>
      intention.placements.map((placement): SoftPlanPlacement => ({
          kind: "routine" as const,
          intention,
          placement,
          title: intention.routineName,
          detail: "Routine",
        }))
    ),
  ].sort((a, b) => {
      const aDayDistance = (a.placement.dayIndex - mobileIntentionStartDay + days.length) % days.length;
      const bDayDistance = (b.placement.dayIndex - mobileIntentionStartDay + days.length) % days.length;
      return aDayDistance === bDayDistance
        ? a.placement.timeIndex - b.placement.timeIndex
        : aDayDistance - bDayDistance;
    });
  const softPlanPreviewItems = mobileWeeklyIntentionPlacements.slice(0, 6);
  const softPlanTotal = mobileWeeklyIntentionPlacements.length;
  const openSoftPlanPanel = (dayIndex?: number) => {
    if (typeof dayIndex === "number") {
      setMobileDayIndex(dayIndex);
    }
    setShowSoftPlanPanel(false);
    setMobileHomeView("planner");
    window.setTimeout(() => document.getElementById("day-commitments")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const cleanBlockLabel = (block: Block) =>
    block.label.replace(/^(Note|Task|Habit|Routine|Link):\s*/i, "").trim() || block.label;

  const getBlockReadingLink = (block: Block) => {
    const owner = findGridOutlineEntry(outlinerNodes, block);
    return owner?.node.tag === 'link' ? normalizeReadingLink(owner.node.readingLink) : undefined;
  };

  const nativeWidgetStatus = mobileNowBlock
    ? `Next: ${cleanBlockLabel(mobileNowBlock)}`
    : todayScheduledBlocks.length > 0
      ? "All open blocks are complete."
      : "Nothing scheduled yet.";
  const nativeWidgetWaitingLabel =
    unscheduledBlocks.length === 1 ? "1 waiting item" : `${unscheduledBlocks.length} waiting items`;

  useEffect(() => {
    updateNativePlannerWidget({
      title: "Today",
      status: nativeWidgetStatus,
      waitingLabel: nativeWidgetWaitingLabel,
      updatedAt: new Date().toISOString(),
    });
  }, [nativeWidgetStatus, nativeWidgetWaitingLabel]);

  const getBlockKindLabel = (block: Block): "Habit" | "Task" | "Note" | "Routine" | "Workout" | "Block" | "Link" => {
    const label = block.label.trim().toLowerCase();
    const hashtag = block.hashtag?.trim().toLowerCase();
    if (block.isHabitBlock) return "Habit";
    if (getBlockReadingLink(block) || hashtag === 'link' || label.startsWith('link:')) return 'Link';
    if (hashtag === "task" || label.startsWith("task:")) return "Task";
    if (hashtag === "note" || label.startsWith("note:")) return "Note";
    if (hashtag === "routine" || routineTabs.some((routine) => routine.name.trim().toLowerCase() === label)) {
      return "Routine";
    }
    if (hashtag === "fitness" || isWorkoutBlock(block)) return "Workout";
    return "Block";
  };

  const getBlockSlotLabel = (block: Block) => {
    if (block.location.type !== "slot") return "";
    const visibleTimeIndex =
      viewMode === "buckets"
        ? getBucketForHourlyIndex(block.location.timeIndex)
        : block.location.timeIndex;
    return slotLabels[visibleTimeIndex] ?? "";
  };

  const getBlockRelationshipChips = (block: Block) => {
    const chips: string[] = [`Type: ${getBlockKindLabel(block)}`];
    if (block.location.type === "slot") {
      const slotLabel = getBlockSlotLabel(block);
      chips.push(`Scheduled: ${days[block.location.dayIndex]}${slotLabel ? ` ${slotLabel}` : ""}`);
    } else if (!block.themeId) {
      chips.push("Waiting");
    }

    const habit = block.habitId ? allHabits.find((item) => item.id === block.habitId) : undefined;
    const theme = habit
      ? themes.find((item) => item.id === habit.themeId)
      : block.themeId
        ? themes.find((item) => item.id === block.themeId)
        : undefined;
    if (theme) chips.push(`Theme: ${theme.name}`);
    if (habit) chips.push(`Habit: ${habit.name}`);
    for (const id of block.creditedHabitIds ?? []) {
      const credited = allHabits.find(item => item.id === id);
      if (credited && id !== block.habitId) chips.push(`Counts toward: ${credited.name}`);
    }
    if (block.hashtag) chips.push(`#${block.hashtag}`);
    const outlinerPath = outlinerLinkedBlockPathMap.get(block.id);
    if (outlinerPath) {
      chips.push(`Outliner: ${outlinerPath.slice(-3).join(" > ")}`);
    } else if (outlinerLinkedBlockIdSet.has(block.id)) {
      chips.push("Outliner");
    }
    if ((block.blockTasks ?? []).length > 0) chips.push(`${block.blockTasks!.length} task${block.blockTasks!.length === 1 ? "" : "s"}`);
    if ((block.blockNote ?? "").trim()) chips.push("Note attached");
    if (block.linkedBlockId) chips.push("Linked block");
    return [...new Set(chips)];
  };
  const ambientAutoRoutineId = (() => {
    if (routineTabs.length === 0) return "";
    const hour = new Date().getHours();
    const preferredCategories =
      hour < 12
        ? ["morning"]
        : hour >= 17
          ? ["evening"]
          : ["workout", "reset", "morning"];
    return (
      routineTabs.find((routine) => preferredCategories.includes(routine.category))?.id ??
      routineTabs[0]?.id ??
      ""
    );
  })();
  const ambientRoutineId =
    ambientSettings.routineId === "auto" ? ambientAutoRoutineId : ambientSettings.routineId;
  const ambientActiveRoutine =
    routineTabs.find((routine) => routine.id === ambientRoutineId) ?? routineTabs[0] ?? null;
  const taskBlockToAmbientTask = (block: Block, sourceLabel: string): AmbientTask => ({
    blockId: block.id,
    label: block.label.replace(/^Task:\s*/i, "").trim() || block.label,
    sourceLabel,
  });
  const ambientNextTask: AmbientTask | null = (() => {
    for (const block of todayScheduledBlocks) {
      const task = block.blockTasks?.find((item) => !item.completed);
      if (task) {
        return {
          blockId: block.id,
          taskId: task.id,
          label: task.label,
          sourceLabel: block.label.replace(/^Habit:\s*/i, "").trim(),
        };
      }
    }

    const scheduledTaskBlock = todayScheduledBlocks.find(
      (block) => !block.completed && isQuickCaptureBlock(block) && block.label.trim().toLowerCase().startsWith("task:")
    );
    if (scheduledTaskBlock) return taskBlockToAmbientTask(scheduledTaskBlock, "Today");

    const waitingTaskBlock = unscheduledBlocks.find(
      (block) => !block.completed && isQuickCaptureBlock(block) && block.label.trim().toLowerCase().startsWith("task:")
    );
    return waitingTaskBlock ? taskBlockToAmbientTask(waitingTaskBlock, "Waiting") : null;
  })();

  const scrollToMobileWaiting = () => {
    setMobileHomeView("planner");
    closeOverlayPanels();
    window.setTimeout(() => {
      document.getElementById("mobile-waiting-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const openMobileHabitPickerForSlot = (dayIndex: number, timeIndex: number) => {
    closeOverlayPanels();
    setMobileHabitPickerQuery("");
    setMobileHabitPickerSlot({ dayIndex, timeIndex });
  };

  const addHabitToMobileSlot = async (habitId: string) => {
    if (!mobileHabitPickerSlot) return;

    const targetSlot = mobileHabitPickerSlot;
    setMobileHabitPickerSlot(null);
    setMobileHabitPickerQuery("");

    await createHabitBlockAtSlot(
      habitId,
      targetSlot.dayIndex,
      targetSlot.timeIndex
    );
    showToast("Habit added to planner", "success");
  };

  const updateAmbientRoutineTabs = (updater: (routines: RoutineTab[]) => RoutineTab[]) => {
    if (!user) return;
    const sourceRoutines = routineTabs.length > 0 ? routineTabs : loadRoutineNotes(user.id);
    const next = updater(sourceRoutines);
    setRoutineTabs(next);
    saveRoutineNotes(user.id, next);
  };

  const toggleAmbientRoutineItem = (routineId: string, itemId: string) => {
    updateAmbientRoutineTabs((routines) =>
      routines.map((routine) => {
        if (routine.id !== routineId) return routine;
        const current = routine.completedByDate[todayDate] ?? [];
        const nextIds = current.includes(itemId)
          ? current.filter((id) => id !== itemId)
          : [...current, itemId];
        return {
          ...routine,
          completedByDate: {
            ...routine.completedByDate,
            [todayDate]: nextIds,
          },
        };
      })
    );
  };

  const completeAmbientRoutine = (routineId: string) => {
    updateAmbientRoutineTabs((routines) =>
      routines.map((routine) =>
        routine.id === routineId
          ? {
              ...routine,
              completedByDate: {
                ...routine.completedByDate,
                [todayDate]: routine.items.map((item) => item.id),
              },
            }
          : routine
      )
    );
  };

  const resetAmbientRoutine = (routineId: string) => {
    updateAmbientRoutineTabs((routines) =>
      routines.map((routine) =>
        routine.id === routineId
          ? {
              ...routine,
              completedByDate: {
                ...routine.completedByDate,
                [todayDate]: [],
              },
            }
          : routine
      )
    );
  };

  const buildCaptureNoteEntry = (label: string, mode: MobileCaptureMode) => {
    const stampedAt = new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const labelPrefix = mode === "task" ? "Task" : mode === "block" ? "Block idea" : "Note";
    return `- ${labelPrefix}: ${label} (${stampedAt})`;
  };

  const appendCaptureToThemeNotes = (label: string, mode: MobileCaptureMode, themeId: string) => {
    if (!user) return false;
    const theme = themes.find((item) => item.id === themeId);
    if (!theme) {
      showToast("Choose a theme for that note.", "error");
      return false;
    }

    const prefs = loadThemeNotesPrefs(user.id, theme.id);
    const entry = buildCaptureNoteEntry(label, mode);
    const nextNote = [prefs.generalNote.trim(), entry].filter(Boolean).join("\n");
    saveThemeGeneralNote(user.id, theme.id, nextNote);
    return true;
  };

  const appendCaptureToHabitNotes = async (label: string, mode: MobileCaptureMode, habitId: string) => {
    if (!user) return false;
    const habit = allHabits.find((item) => item.id === habitId);
    if (!habit) {
      showToast("Choose a habit for that note.", "error");
      return false;
    }

    try {
      const existingNote = await database.habitNotes.getByHabit(habit.id);
      const entry = buildCaptureNoteEntry(label, mode);
      const nextNote = [existingNote?.content.trim(), entry].filter(Boolean).join("\n");
      await database.habitNotes.upsert(user.id, habit.id, nextNote);
      return true;
    } catch (error) {
      console.error("Error appending habit note:", error);
      showToast("Failed to attach habit note", "error");
      return false;
    }
  };

  const queuePendingQuickCapture = (
    label: string,
    mode: MobileCaptureMode,
    destination: MobileCaptureDestination,
    captureLabel: string,
    options: {
      hashtag?: string;
      themeId?: string;
      habitId?: string;
      dayIndex?: number;
      timeIndex?: number;
    } = {}
  ) => {
    const pendingCapture: PendingQuickCapture = {
      id: createClientId("pending-capture"),
      label,
      mode,
      destination,
      captureLabel,
      hashtag: options.hashtag,
      themeId: options.themeId,
      habitId: options.habitId,
      dayIndex: options.dayIndex,
      timeIndex: options.timeIndex,
      createdAt: new Date().toISOString(),
    };
    savePendingQuickCaptures([pendingCapture, ...pendingQuickCaptures].slice(0, 30));
    showToast("Saved on this device. I will sync it when the app is online.", "info");
    return true;
  };

  const captureEntry = async (
    rawLabel: string,
    mode: MobileCaptureMode,
    destination: MobileCaptureDestination,
    options?: { hashtag?: string }
  ) => {
    const label = rawLabel.trim();
    if (!label) {
      showToast("Enter something to capture.", "error");
      return false;
    }

    if (!user) return false;

    const goesToWaiting = destination === "waiting";
    const goesToToday = destination === "today";
    const goesToThemeNote = destination === "theme-note";
    const goesToHabitNote = destination === "habit-note";
    const modeHashtag = mode === "block" ? undefined : mode;
    const captureHashtag = options?.hashtag?.trim() || modeHashtag;
    const captureLabel =
      mode === "block"
        ? label
        : `${mode === "note" ? "Note" : "Task"}: ${label}`;
    const slotDayIndex = mobileSelectedDayIndex;
    const slotTimeIndex = getHourlyIndexForMobileSlot(firstOpenVisibleSlotIndex(mobileSelectedDayIndex));
    let blockId: string | null = null;

    if (!navigator.onLine && (goesToWaiting || goesToToday)) {
      return queuePendingQuickCapture(label, mode, destination, captureLabel, {
        hashtag: captureHashtag,
        dayIndex: goesToToday ? slotDayIndex : undefined,
        timeIndex: goesToToday ? slotTimeIndex : undefined,
      });
    }

    if (goesToWaiting || goesToToday) {
      const captureLocation =
        goesToToday
          ? {
              type: "slot" as const,
              dayIndex: slotDayIndex,
              timeIndex: slotTimeIndex,
            }
          : undefined;
      blockId = await createBlock(captureLabel, false, undefined, captureHashtag, captureLocation);
      if (!blockId) {
        return queuePendingQuickCapture(label, mode, destination, captureLabel, {
          hashtag: captureHashtag,
          dayIndex: goesToToday ? slotDayIndex : undefined,
          timeIndex: goesToToday ? slotTimeIndex : undefined,
        });
      }

      if (mode === "note") {
        await saveBlockNote(blockId, label);
      }
      if (mode === "task") {
        await addBlockTask(blockId, label);
      }
    }

    if (goesToThemeNote && !(await appendCaptureToThemeNotes(label, mode, mobileCaptureThemeId))) {
      return queuePendingQuickCapture(label, mode, destination, captureLabel, {
        themeId: mobileCaptureThemeId,
      });
    }

    if (goesToHabitNote && !(await appendCaptureToHabitNotes(label, mode, mobileCaptureHabitId))) {
      return queuePendingQuickCapture(label, mode, destination, captureLabel, {
        habitId: mobileCaptureHabitId,
      });
    }

    const captureName = mode === "block" ? "Block" : mode === "note" ? "Note" : "Task";
    const destinationLabel =
      destination === "today"
        ? isMobileSelectedDayToday ? "Today" : days[mobileSelectedDayIndex]
        : destination === "theme-note"
          ? "Theme Notes"
          : destination === "habit-note"
            ? "Habit Notes"
            : "Waiting";
    showToast(`${captureName} captured to ${destinationLabel}`, "success");
    triggerMobileTap();
    return true;
  };

  const openSlotCapture = (dayIndex: number, timeIndex: number, mode: SlotCaptureMode) => {
    if (slotCaptureSaving.current) return;
    setSlotCaptureTarget({ dayIndex, timeIndex, mode });
    setSlotCaptureText("");
    setSlotCaptureHabitId('');
    setSlotCaptureError('');
    slotCaptureDraft.current = null;
  };

  const closeSlotCapture = () => {
    if (slotCaptureSaving.current) return;
    setSlotCaptureTarget(null);
    setSlotCaptureText("");
    setSlotCaptureHabitId('');
    setSlotCaptureError('');
    slotCaptureDraft.current = null;
  };

  const saveSlotCapture = async () => {
    if (slotCaptureSaving.current || !user) return;
    const text = slotCaptureText.trim();
    if (!slotCaptureTarget || !text) {
      showToast("Enter a task or note for this slot.", "error");
      return;
    }

    if (slotCaptureHabitId && !gridHabitCreditChoices(latestOutlineNodes.current).some(item => item.id === slotCaptureHabitId)) {
      setSlotCaptureError('That habit is no longer in the active Outline.'); return;
    }
    const { dayIndex, timeIndex, mode } = slotCaptureTarget;
    slotCaptureSaving.current = true; setSlotCaptureBusy(true); setSlotCaptureError('');
    slotCaptureDraft.current ??= { id: crypto.randomUUID(), taskId: crypto.randomUUID(), text, mode,
      dayIndex, timeIndex: getHourlyIndexForMobileSlot(timeIndex), weekStartDate: getWeekStartDateString(weekOffset), creditHabitId: slotCaptureHabitId };
    try {
      const result = await persistGridCapture(user.id, slotCaptureDraft.current);
      const next: Block = { id: result.block.id, label: result.block.label, isHabitBlock: false,
        location: { type: 'slot', dayIndex: result.block.day_index!, timeIndex: result.block.time_index! },
        completed: result.block.completed, hashtag: result.block.hashtag ?? undefined,
        blockNote: result.note?.content, blockNoteUpdatedAt: result.note?.updated_at, blockTasks: result.tasks,
        creditedHabitIds: result.credits.map(credit => credit.habit_id) };
      setBlocks(current => current.some(block => block.id === next.id) ? current.map(block => block.id === next.id ? next : block) : [...current, next]);
      slotCaptureSaving.current = false;
      closeSlotCapture();
      showToast(`${mode === 'note' ? 'Note' : 'Task'} added to ${days[dayIndex]}`, 'success');
    } catch {
      setSlotCaptureError('Could not finish saving. Retry will complete this same block.');
    } finally { slotCaptureSaving.current = false; setSlotCaptureBusy(false); }
  };

  const renderSlotCaptureComposer = (dayIndex: number, timeIndex: number) => {
    const isActive =
      slotCaptureTarget?.dayIndex === dayIndex &&
      slotCaptureTarget.timeIndex === timeIndex;

    if (!isActive) return null;

    const modeLabel = slotCaptureTarget.mode === "note" ? "note" : "task";

    return (
      <form
        className="slot-capture-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void saveSlotCapture();
        }}
      >
        <label>
          <span>{modeLabel}</span>
          <input
            required disabled={slotCaptureBusy || !!slotCaptureDraft.current}
            value={slotCaptureText}
            onChange={(event) => setSlotCaptureText(event.target.value)}
            placeholder={`Add ${modeLabel}`}
            autoFocus
          />
        </label>
        <label><span>Counts toward</span><select aria-label="Counts toward" value={slotCaptureHabitId} disabled={slotCaptureBusy || !!slotCaptureDraft.current || outlineLoading} onChange={event => setSlotCaptureHabitId(event.target.value)}>
          <option value="">Nothing (one-off)</option>
          {gridHabitCreditChoices(outlinerNodes).filter(item => allHabits.some(habit => habit.id === item.id)).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        {slotCaptureError && <p role="alert">{slotCaptureError}</p>}
        <div className="slot-capture-actions">
          <button type="submit" disabled={slotCaptureBusy}>{slotCaptureBusy ? 'Saving...' : slotCaptureDraft.current ? 'Retry' : 'Add'}</button>
          <button type="button" disabled={slotCaptureBusy} onClick={closeSlotCapture}>
            Cancel
          </button>
        </div>
      </form>
    );
  };

  const quickCapture = async () => {
    const captured = await captureEntry(blockLabel, mobileCaptureMode, mobileCaptureDestination, {
      hashtag: blockHashtag,
    });
    if (!captured) return;
    setBlockLabel("");
    setBlockHashtag("");
    setMobileQuickCapturePrimed(false);
    setMobileQuickCaptureOpen(false);
  };

  const captureAmbientQuickNote = async () => {
    const captured = await captureEntry(ambientQuickNote, "note", "waiting");
    if (captured) {
      setAmbientQuickNote("");
    }
  };

  const syncPendingQuickCaptures = async () => {
    if (!user || pendingQuickCaptures.length === 0 || syncingPendingCapturesRef.current) return;
    if (!navigator.onLine) return;

    syncingPendingCapturesRef.current = true;
    const remaining: PendingQuickCapture[] = [];
    let syncedCount = 0;

    for (const capture of [...pendingQuickCaptures].reverse()) {
      try {
        if (capture.destination === "waiting" || capture.destination === "today") {
          const location =
            capture.destination === "today" &&
            typeof capture.dayIndex === "number" &&
            typeof capture.timeIndex === "number"
              ? {
                  type: "slot" as const,
                  dayIndex: capture.dayIndex,
                  timeIndex: capture.timeIndex,
                }
              : undefined;
          const blockId = await createBlock(
            capture.captureLabel,
            false,
            undefined,
            capture.hashtag,
            location,
            { resetInputs: false, suppressErrorToast: true }
          );
          if (!blockId) {
            remaining.push(capture);
            continue;
          }

          if (capture.mode === "note") {
            await saveBlockNote(blockId, capture.label);
          }
          if (capture.mode === "task") {
            await addBlockTask(blockId, capture.label);
          }
          syncedCount += 1;
          continue;
        }

        if (capture.destination === "theme-note") {
          const saved = await appendCaptureToThemeNotes(
            capture.label,
            capture.mode,
            capture.themeId ?? mobileCaptureThemeId
          );
          if (saved) {
            syncedCount += 1;
          } else {
            remaining.push(capture);
          }
          continue;
        }

        if (capture.destination === "habit-note") {
          const saved = await appendCaptureToHabitNotes(
            capture.label,
            capture.mode,
            capture.habitId ?? mobileCaptureHabitId
          );
          if (saved) {
            syncedCount += 1;
          } else {
            remaining.push(capture);
          }
        }
      } catch (error) {
        console.error("Error syncing pending quick capture:", error);
        remaining.push(capture);
      }
    }

    savePendingQuickCaptures(remaining.reverse());
    syncingPendingCapturesRef.current = false;

    if (syncedCount > 0) {
      showToast(`${syncedCount} saved capture${syncedCount === 1 ? "" : "s"} synced`, "success");
    }
  };

  useEffect(() => {
    if (!user) return;
    const handleOnline = () => {
      void syncPendingQuickCaptures();
    };

    window.addEventListener("online", handleOnline);
    if (navigator.onLine && pendingQuickCaptures.length > 0) {
      void syncPendingQuickCaptures();
    }

    return () => window.removeEventListener("online", handleOnline);
  }, [pendingQuickCaptures, user]);

  const completeAmbientNextTask = async (task: AmbientTask) => {
    if (task.taskId) {
      await toggleBlockTask(task.blockId, task.taskId);
      return;
    }

    await markBlockDone(task.blockId);
  };

  const getHourlyIndexForMobileSlot = (slotIndex: number) =>
    viewMode === "buckets" ? BUCKET_TO_HOURLY[slotIndex] ?? slotIndex : slotIndex;

  const restoreBlockPlacement = async (previousBlock: Block) => {
    if (recurringSessionForBlock(previousBlock.id)) {
      const restored = previousBlock.location.type === 'slot'
        ? await moveBlockToSlot(previousBlock.id, previousBlock.location.dayIndex, previousBlock.location.timeIndex)
        : await moveBlockToUnscheduled(previousBlock.id);
      if (restored) showToast('Move undone', 'info');
      return;
    }
    const originalHabit = allHabits.find((habit) => habit.id === previousBlock.habitId);
    const restoredLabel = originalHabit && previousBlock.isHabitBlock
      ? `Habit: ${originalHabit.name}`
      : previousBlock.label;

    if (previousBlock.location.type === "slot") {
      const { dayIndex, timeIndex } = previousBlock.location;
      await database.blocks.update(previousBlock.id, {
        location_type: "slot",
        day_index: dayIndex,
        time_index: timeIndex,
        week_start_date: getWeekStartDateString(weekOffset),
        linked_block_id: null,
        is_linked_group: false,
        daily_template_id: null,
        theme_id: null,
        label: restoredLabel,
      });
      setBlocks((prev) =>
        prev.map((block) =>
          block.id === previousBlock.id
            ? {
                ...block,
                label: restoredLabel,
                location: {
                  type: "slot",
                  dayIndex,
                  timeIndex,
                },
                linkedBlockId: undefined,
                isLinkedGroup: false,
                themeId: undefined,
              }
            : block
        )
      );
      await refreshSessionGroups();
      showToast("Move undone", "info");
      return;
    }

    await database.blocks.update(previousBlock.id, {
      location_type: "unscheduled",
      day_index: null,
      time_index: null,
      week_start_date: null,
      linked_block_id: null,
      is_linked_group: false,
      daily_template_id: null,
      theme_id: previousBlock.themeId ?? null,
      label: restoredLabel,
    });
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === previousBlock.id
          ? {
              ...block,
              label: restoredLabel,
              location: { type: "unscheduled" },
              linkedBlockId: undefined,
              isLinkedGroup: false,
              themeId: previousBlock.themeId,
            }
          : block
      )
    );
    await refreshSessionGroups();
    showToast("Move undone", "info");
  };

  const showMoveUndoToast = (message: string, previousBlock?: Block) => {
    showToast(
      message === 'Moved to Waiting' && previousBlock && recurringSessionForBlock(previousBlock.id) ? 'Returned to its week' : message,
      "success",
      previousBlock
        ? {
            label: "Undo",
            onClick: () => {
              restoreBlockPlacement(previousBlock);
            },
          }
        : undefined
    );
  };

  const moveMobileBlockLater = async (blockId: string) => {
    const block = blocks.find((item) => item.id === blockId);
    if (!block || block.location.type !== "slot") return;

    const visibleSlotIndex =
      viewMode === "buckets"
        ? getBucketForHourlyIndex(block.location.timeIndex)
        : block.location.timeIndex;

    if (visibleSlotIndex < slotLabels.length - 1) {
      if (!await moveBlockToSlot(
        blockId,
        block.location.dayIndex,
        getHourlyIndexForMobileSlot(visibleSlotIndex + 1)
      )) return;
      showMoveUndoToast("Moved later today", block);
      return;
    }

    if (block.location.dayIndex < days.length - 1) {
      if (!await moveBlockToSlot(blockId, block.location.dayIndex + 1, getHourlyIndexForMobileSlot(0))) return;
      showMoveUndoToast("Moved to tomorrow morning", block);
      return;
    }

    if (!await moveBlockToUnscheduled(blockId)) return;
    showMoveUndoToast("Moved to Waiting", block);
  };

  const moveMobileBlockTomorrow = async (blockId: string) => {
    const block = blocks.find((item) => item.id === blockId);
    if (!block || block.location.type !== "slot") return;

    if (block.location.dayIndex >= days.length - 1) {
      if (!await moveBlockToUnscheduled(blockId)) return;
      showMoveUndoToast("Moved to Waiting", block);
      return;
    }

    if (!await moveBlockToSlot(blockId, block.location.dayIndex + 1, block.location.timeIndex)) return;
    showMoveUndoToast("Moved to tomorrow", block);
  };

  const moveMobileBlockToWaiting = async (blockId: string) => {
    const block = blocks.find((item) => item.id === blockId);
    if (!await moveBlockToUnscheduled(blockId)) return;
    showMoveUndoToast("Moved to Waiting", block);
  };

  const handleMobileBlockDrop = async (
    blockId: string,
    target:
      | { type: "slot"; dayIndex: number; timeIndex: number }
      | { type: "waiting" }
  ) => {
    const block = blocks.find((item) => item.id === blockId);
    if (!block) return;

    if (target.type === "waiting") {
      if (block.location.type === "unscheduled") return;
      if (!await moveBlockToUnscheduled(blockId)) return;
      showMoveUndoToast("Moved to Waiting", block);
      return;
    }

    const nextTimeIndex = getHourlyIndexForMobileSlot(target.timeIndex);
    if (
      block.location.type === "slot" &&
      block.location.dayIndex === target.dayIndex &&
      block.location.timeIndex === nextTimeIndex
    ) {
      return;
    }

    if (!await moveBlockToSlot(blockId, target.dayIndex, nextTimeIndex)) return;
    showMoveUndoToast(`Moved to ${days[target.dayIndex]} ${slotLabels[target.timeIndex]}`, block);
  };

  const firstOpenVisibleSlotIndex = (dayIndex: number) => {
    const openIndex = slotLabels.findIndex((_, index) => getBlocksForSlot(dayIndex, index).length === 0);
    return openIndex >= 0 ? openIndex : 0;
  };

  const getWeeklyIntentionForHabit = (habitId: string) =>
    weeklyIntentions.find((intention) => intention.habitId === habitId);

  const getWeeklyIntentionPlacementsForSlot = (dayIndex: number, timeIndex: number) =>
    weeklyIntentions.flatMap((intention) =>
      intention.placements
        .filter((placement) => placement.dayIndex === dayIndex && placement.timeIndex === timeIndex)
        .map((placement) => ({ intention, placement }))
    );

  const getWeeklyRoutineIntentionPlacementsForSlot = (dayIndex: number, timeIndex: number) =>
    weeklyRoutineIntentions.flatMap((intention) =>
      intention.placements
        .filter((placement) => placement.dayIndex === dayIndex && placement.timeIndex === timeIndex)
        .map((placement) => ({ intention, placement }))
    );

  const placeWeeklyHabitIntentions = (
    habit: HabitWithTheme,
    desiredCount: number,
    preferredDayIndexes = planningIntentionDayIndexes
  ) => {
    if (!user) return;

    const weekStartDate = getWeekStartDateString(weekOffset);
    const safeDesiredCount = Math.max(1, Math.min(14, Math.round(desiredCount) || 1));
    const safePreferredDayIndexes = Array.from(
      new Set(
        preferredDayIndexes.filter(
          (dayIndex) => Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex < days.length
        )
      )
    );
    const realHabitBlocks = blocks.filter(
      (block) => block.habitId === habit.id && block.location.type === "slot"
    );
    const realCount = realHabitBlocks.length;
    const neededCount = Math.max(0, safeDesiredCount - realCount);
    const otherIntentions = weeklyIntentions.filter((intention) => intention.habitId !== habit.id);

    if (neededCount === 0) {
      persistWeeklyIntentions(otherIntentions);
      setPlanningIntentionHabitId(null);
      showToast(`${habit.name} already has ${realCount} planned this week`, "info");
      return;
    }

    const occupiedSlots = new Set<string>();
    blocks.forEach((block) => {
      if (block.location.type === "slot") {
        occupiedSlots.add(`${block.location.dayIndex}-${block.location.timeIndex}`);
      }
    });
    ghostBlocks.forEach((ghost) => {
      occupiedSlots.add(`${ghost.day_index}-${ghost.time_index}`);
    });
    otherIntentions.forEach((intention) => {
      intention.placements.forEach((placement) => {
        occupiedSlots.add(`${placement.dayIndex}-${placement.timeIndex}`);
      });
    });
    weeklyRoutineIntentions.forEach((intention) => {
      intention.placements.forEach((placement) => {
        occupiedSlots.add(`${placement.dayIndex}-${placement.timeIndex}`);
      });
    });

    const startDay = weekOffset === 0 && todayDayIndex >= 0 ? todayDayIndex : 0;
    const weekDayOrder = [
      ...days.map((_, index) => index).filter((dayIndex) => dayIndex >= startDay),
      ...days.map((_, index) => index).filter((dayIndex) => dayIndex < startDay),
    ];
    const preferredDaySet = new Set(safePreferredDayIndexes);
    const preferredDayOrder = weekDayOrder.filter((dayIndex) => preferredDaySet.has(dayIndex));
    const fallbackDayOrder = weekDayOrder.filter((dayIndex) => !preferredDaySet.has(dayIndex));
    const dayOrder =
      preferredDayOrder.length > 0
        ? [...preferredDayOrder, ...fallbackDayOrder]
        : weekDayOrder;
    const placements: WeeklyHabitIntentionPlacement[] = [];

    for (const dayIndex of dayOrder) {
      for (let visibleSlotIndex = 0; visibleSlotIndex < slotLabels.length; visibleSlotIndex += 1) {
        const timeIndex = getHourlyIndexForMobileSlot(visibleSlotIndex);
        const slotKey = `${dayIndex}-${timeIndex}`;
        if (occupiedSlots.has(slotKey)) continue;
        if (getBlocksForSlot(dayIndex, visibleSlotIndex).length > 0) continue;

        occupiedSlots.add(slotKey);
        placements.push({
          id: createClientId("intention-slot"),
          dayIndex,
          timeIndex,
        });
        break;
      }

      if (placements.length >= neededCount) break;
    }

    if (placements.length === 0) {
      showToast("No open slots found for this week", "info");
      return;
    }

    const nextIntentions = [
      ...otherIntentions,
      {
        id: createClientId("weekly-intention"),
        habitId: habit.id,
        habitName: habit.name,
        themeId: habit.themeId,
        themeName: habit.themeName,
        weekStartDate,
        desiredCount: safeDesiredCount,
        preferredDayIndexes: safePreferredDayIndexes,
        placements,
      },
    ];

    persistWeeklyIntentions(nextIntentions);
    setPlanningIntentionHabitId(null);
    showToast(
      `Placed ${placements.length} ${habit.name} intention${placements.length === 1 ? "" : "s"} this week`,
      "success"
    );
  };

  const acceptWeeklyHabitIntention = async (
    intentionId: string,
    placementId: string
  ) => {
    const intention = weeklyIntentions.find((item) => item.id === intentionId);
    const placement = intention?.placements.find((item) => item.id === placementId);
    if (!intention || !placement) return;

    await createHabitBlockAtSlot(intention.habitId, placement.dayIndex, placement.timeIndex);
    const nextIntentions = weeklyIntentions
      .map((item) =>
        item.id === intentionId
          ? {
              ...item,
              placements: item.placements.filter((slot) => slot.id !== placementId),
            }
          : item
      )
      .filter((item) => item.placements.length > 0);
    persistWeeklyIntentions(nextIntentions);
    showToast("Intention became a real habit block", "success");
  };

  const dismissWeeklyHabitIntention = (intentionId: string, placementId: string) => {
    const nextIntentions = weeklyIntentions
      .map((intention) =>
        intention.id === intentionId
          ? {
              ...intention,
              placements: intention.placements.filter((placement) => placement.id !== placementId),
            }
          : intention
      )
      .filter((intention) => intention.placements.length > 0);
    persistWeeklyIntentions(nextIntentions);
    showToast("Intention removed", "info");
  };

  const placeWeeklyRoutineIntentions = (
    routineId: string,
    desiredCount: number,
    preferredDayIndexes: number[] = []
  ) => {
    if (!user) return;

    const routine = workoutRoutines.find((item) => item.id === routineId);
    if (!routine) {
      showToast("Choose a saved routine first", "info");
      return;
    }

    const weekStartDate = getWeekStartDateString(weekOffset);
    const safeDesiredCount = Math.max(1, Math.min(14, Math.round(desiredCount) || 1));
    const safePreferredDayIndexes = Array.from(
      new Set(
        preferredDayIndexes.filter(
          (dayIndex) => Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex < days.length
        )
      )
    );
    const realRoutineBlocks = blocks.filter(
      (block) => block.location.type === "slot" && workoutBlockRoutineLinks[block.id] === routine.id
    );
    const realCount = realRoutineBlocks.length;
    const neededCount = Math.max(0, safeDesiredCount - realCount);
    const otherRoutineIntentions = weeklyRoutineIntentions.filter(
      (intention) => intention.routineId !== routine.id
    );

    if (neededCount === 0) {
      persistWeeklyRoutineIntentions(otherRoutineIntentions);
      showToast(`${routine.name} already has ${realCount} planned this week`, "info");
      return;
    }

    const occupiedSlots = new Set<string>();
    blocks.forEach((block) => {
      if (block.location.type === "slot") {
        occupiedSlots.add(`${block.location.dayIndex}-${block.location.timeIndex}`);
      }
    });
    ghostBlocks.forEach((ghost) => {
      occupiedSlots.add(`${ghost.day_index}-${ghost.time_index}`);
    });
    weeklyIntentions.forEach((intention) => {
      intention.placements.forEach((placement) => {
        occupiedSlots.add(`${placement.dayIndex}-${placement.timeIndex}`);
      });
    });
    otherRoutineIntentions.forEach((intention) => {
      intention.placements.forEach((placement) => {
        occupiedSlots.add(`${placement.dayIndex}-${placement.timeIndex}`);
      });
    });

    const startDay = weekOffset === 0 && todayDayIndex >= 0 ? todayDayIndex : 0;
    const weekDayOrder = [
      ...days.map((_, index) => index).filter((dayIndex) => dayIndex >= startDay),
      ...days.map((_, index) => index).filter((dayIndex) => dayIndex < startDay),
    ];
    const preferredDaySet = new Set(safePreferredDayIndexes);
    const preferredDayOrder = weekDayOrder.filter((dayIndex) => preferredDaySet.has(dayIndex));
    const fallbackDayOrder = weekDayOrder.filter((dayIndex) => !preferredDaySet.has(dayIndex));
    const dayOrder =
      preferredDayOrder.length > 0
        ? [...preferredDayOrder, ...fallbackDayOrder]
        : weekDayOrder;
    const placements: WeeklyHabitIntentionPlacement[] = [];

    for (const dayIndex of dayOrder) {
      for (let visibleSlotIndex = 0; visibleSlotIndex < slotLabels.length; visibleSlotIndex += 1) {
        const timeIndex = getHourlyIndexForMobileSlot(visibleSlotIndex);
        const slotKey = `${dayIndex}-${timeIndex}`;
        if (occupiedSlots.has(slotKey)) continue;
        if (getBlocksForSlot(dayIndex, visibleSlotIndex).length > 0) continue;

        occupiedSlots.add(slotKey);
        placements.push({
          id: createClientId("routine-intention-slot"),
          dayIndex,
          timeIndex,
        });
        break;
      }

      if (placements.length >= neededCount) break;
    }

    if (placements.length === 0) {
      showToast("No open slots found for this week", "info");
      return;
    }

    persistWeeklyRoutineIntentions([
      ...otherRoutineIntentions,
      {
        id: createClientId("weekly-routine-intention"),
        routineId: routine.id,
        routineName: routine.name,
        weekStartDate,
        desiredCount: safeDesiredCount,
        preferredDayIndexes: safePreferredDayIndexes,
        placements,
      },
    ]);
    showToast(
      `Placed ${placements.length} ${routine.name} routine intention${placements.length === 1 ? "" : "s"}`,
      "success"
    );
  };

  const createWorkoutBlockFromRoutineAtSlot = async (
    routineId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    const routine = workoutRoutines.find((item) => item.id === routineId);
    if (!routine) return null;

    const blockId = await createBlock(routine.name, false, undefined, "fitness", {
      type: "slot",
      dayIndex,
      timeIndex,
    });
    if (!blockId) return null;

    loadWorkoutRoutineToBlock(blockId, routineId);
    return blockId;
  };

  const acceptWeeklyRoutineIntention = async (intentionId: string, placementId: string) => {
    const intention = weeklyRoutineIntentions.find((item) => item.id === intentionId);
    const placement = intention?.placements.find((item) => item.id === placementId);
    if (!intention || !placement) return;

    await createWorkoutBlockFromRoutineAtSlot(
      intention.routineId,
      placement.dayIndex,
      placement.timeIndex
    );
    const nextIntentions = weeklyRoutineIntentions
      .map((item) =>
        item.id === intentionId
          ? {
              ...item,
              placements: item.placements.filter((slot) => slot.id !== placementId),
            }
          : item
      )
      .filter((item) => item.placements.length > 0);
    persistWeeklyRoutineIntentions(nextIntentions);
    showToast("Routine intention became a workout block", "success");
  };

  const dismissWeeklyRoutineIntention = (intentionId: string, placementId: string) => {
    const nextIntentions = weeklyRoutineIntentions
      .map((intention) =>
        intention.id === intentionId
          ? {
              ...intention,
              placements: intention.placements.filter((placement) => placement.id !== placementId),
            }
          : intention
      )
      .filter((intention) => intention.placements.length > 0);
    persistWeeklyRoutineIntentions(nextIntentions);
    showToast("Routine intention removed", "info");
  };

  const clearWeeklyRoutineIntention = (routineId: string) => {
    persistWeeklyRoutineIntentions(
      weeklyRoutineIntentions.filter((intention) => intention.routineId !== routineId)
    );
    showToast("Routine intention cleared", "info");
  };

  const scheduleThemeBlock = async (
    blockId: string,
    dayIndex: number,
    visibleTimeIndex: number,
    successMessage?: string
  ) => {
    const block = blocks.find((item) => item.id === blockId);
    await moveBlockToSlot(blockId, dayIndex, getHourlyIndexForMobileSlot(visibleTimeIndex));
    showMoveUndoToast(successMessage ?? `Scheduled for ${days[dayIndex]}`, block);
  };

  const addThemeBlockToToday = async (blockId: string) => {
    if (todayDayIndex < 0) {
      showToast("Go to the current week to add this to today.", "info");
      return;
    }

    await scheduleThemeBlock(
      blockId,
      todayDayIndex,
      firstOpenVisibleSlotIndex(todayDayIndex),
      "Added to today"
    );
  };

  const addWaitingBlockToToday = async (blockId: string) => {
    if (todayDayIndex < 0) {
      showToast("Go to the current week to add this to today.", "info");
      return;
    }

    const block = blocks.find((item) => item.id === blockId);
    await moveBlockToSlot(blockId, todayDayIndex, getHourlyIndexForMobileSlot(firstOpenVisibleSlotIndex(todayDayIndex)));
    showMoveUndoToast("Added to today", block);
  };

  const openWaitingLinkedOutlinerBlock = async (blockId: string) => {
    if (!user) return;

    let nodeId = outlinerLinkedBlockNodeIdMap.get(blockId) ?? null;
    if (!nodeId) {
      const loadedNodes = await loadPlanningOutliner(user.id, false);
      nodeId = findOutlinerNodeIdByBlock(loadedNodes, blockId);
      setOutlinerNodes(loadedNodes);
    }

    setOutlinerFocusNodeId(nodeId);
    setOutlinerFocusRequestKey((value) => value + 1);
    openOverlayPanel("outliner");
  };

  const openWaitingOutlinerParentPicker = (block: Block) => {
    if (outlinerLinkedBlockIdSet.has(block.id)) {
      openWaitingLinkedOutlinerBlock(block.id);
      return;
    }

    setWaitingOutlinerParentBlockId((current) => (current === block.id ? null : block.id));
    setWaitingOutlinerParentNodeId(OUTLINER_TOP_LEVEL_PARENT);
    setWaitingOutlinerNewParentName("");
  };

  const sendWaitingBlockToOutliner = async (block: Block, parentNodeId?: string | null) => {
    if (!user) return;

    if (outlinerLinkedBlockIdSet.has(block.id)) {
      openWaitingLinkedOutlinerBlock(block.id);
      return;
    }

    const kind = getBlockKindLabel(block);
    const newParentText =
      parentNodeId === OUTLINER_NEW_PARENT ? waitingOutlinerNewParentName.trim() : "";
    const result = await addQuickCaptureToPlanningOutliner(user.id, {
      text: cleanBlockLabel(block),
      tag: kind === "Task" ? "task" : "note",
      draftNote: kind === "Note" ? cleanBlockLabel(block) : block.blockNote ?? "",
      blockId: block.id,
      parentNodeId:
        parentNodeId === OUTLINER_TOP_LEVEL_PARENT || parentNodeId === OUTLINER_NEW_PARENT
          ? null
          : parentNodeId ?? null,
      newParentText,
    });
    setOutlinerNodes(result.nodes);
    setOutlinerRefreshKey((value) => value + 1);
    setOutlinerFocusNodeId(result.nodeId);
    setOutlinerFocusRequestKey((value) => value + 1);
    setWaitingOutlinerParentBlockId(null);
    setWaitingOutlinerParentNodeId(OUTLINER_TOP_LEVEL_PARENT);
    setWaitingOutlinerNewParentName("");
    if (result.existing) openOverlayPanel("outliner");
    showToast(result.existing ? "Opened existing Outliner row" : "Linked to Outliner", result.existing ? "info" : "success");
  };

  const renderWaitingOutlinerParentPicker = (block: Block) => {
    if (waitingOutlinerParentBlockId !== block.id || outlinerLinkedBlockIdSet.has(block.id)) return null;

    return (
      <div className="waiting-parent-picker">
        <label>
          <span>Parent row</span>
          <select
            value={waitingOutlinerParentNodeId}
            onChange={(event) => setWaitingOutlinerParentNodeId(event.target.value)}
          >
            <option value={OUTLINER_TOP_LEVEL_PARENT}>Top level</option>
            {outlinerParentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            <option value={OUTLINER_NEW_PARENT}>New parent row...</option>
          </select>
        </label>
        {waitingOutlinerParentNodeId === OUTLINER_NEW_PARENT && (
          <label>
            <span>New parent</span>
            <input
              type="text"
              value={waitingOutlinerNewParentName}
              onChange={(event) => setWaitingOutlinerNewParentName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (waitingOutlinerNewParentName.trim()) {
                  sendWaitingBlockToOutliner(block, waitingOutlinerParentNodeId);
                }
              }}
              placeholder="Parent row name..."
            />
          </label>
        )}
        <div>
          <button
            type="button"
            onClick={() => sendWaitingBlockToOutliner(block, waitingOutlinerParentNodeId)}
            disabled={
              waitingOutlinerParentNodeId === OUTLINER_NEW_PARENT &&
              !waitingOutlinerNewParentName.trim()
            }
          >
            Add to Outliner
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setWaitingOutlinerParentBlockId(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const navigateMain = (view: "today" | "planner" | "themes") => {
    const root = document.getElementById("root");
    if (mobileHomeView === "themes") outlineScrollPosition.current = { root: root?.scrollTop ?? 0, window: window.scrollY };
    closeOverlayPanels();
    setMobileMoreOpen(false);
    setMobileHomeView(view);
    requestAnimationFrame(() => {
      root?.scrollTo({ top: view === "themes" ? outlineScrollPosition.current.root : 0, left: 0 });
      window.scrollTo({ top: view === "themes" ? outlineScrollPosition.current.window : 0, left: 0 });
    });
    if (view === "today") { setWeekOffset(0); setMobileDayIndex(todayDayIndex >= 0 ? todayDayIndex : 0); }
    if (view === "planner") setDesktopPlannerSurface(planView === "stack" ? "stack" : "week");
  };
  const selectPlanView = (view: PlanView) => {
    setPlanView(view);
    setDesktopPlannerSurface(view === "stack" ? "stack" : "week");
    setMobileHomeView("planner");
  };
  const selectedPlanDate = (() => {
    const date = new Date(`${getWeekStartDateString(weekOffset)}T12:00:00`);
    date.setDate(date.getDate() + mobileSelectedDayIndex);
    return localDateKey(date);
  })();
  const openPlanItem = (id?: string, date?: string, preferredMode?: PlanMode, selectedPlanId?: string) => {
    const node = outlineBranchItems(latestOutlineNodes.current).find(node => node.id === id);
    const plans = node ? normalizeOutlinePlans(node.plans, node.id, node.planDate) : [];
    const repeating = node && isRepeatingPlanNode(node);
    const desiredWeek = planningDate(date ?? selectedPlanDate).weekStartDate;
    const plan = selectedPlanId ? plans.find(plan => plan.id === selectedPlanId) : repeating
      ? plans.find(plan => plan.scope === 'week' && !plan.parentPlanId && plan.date === desiredWeek) ?? plans.find(plan => plan.legacyPlanDate)
      : plans.length === 1 ? plans[0] : undefined;
    const block = blocks.find(block => plan?.scheduledBlockIds.includes(block.id) || (!repeating && node?.linked?.blockId === block.id));
    const blockDate = new Date(`${getWeekStartDateString(weekOffset)}T12:00:00`);
    if (block?.location.type === 'slot') blockDate.setDate(blockDate.getDate() + block.location.dayIndex);
    setPlanSelection({ id, softPlanId: plan?.id, requestId: crypto.randomUUID(), targetCount: plan?.targetCount ?? (node && repeating ? defaultWeeklyTarget(node) : undefined),
      date: date ?? plan?.date ?? (block?.location.type === 'slot' ? localDateKey(blockDate) : mobileHomeView === 'planner' || mobileHomeView === 'stack' ? selectedPlanDate : todayDate),
      mode: preferredMode ?? (plan ? plan.scheduledBlockIds.length ? 'time' : plan.scope : block?.location.type === 'slot' ? 'time' : date ? 'day' : 'week'),
      time: block?.location.type === 'slot' ? block.location.timeIndex : undefined,
    });
  };
  const openTodayReschedule = (blockId: string) => {
    const block = blocks.find(block => block.id === blockId);
    if (block?.location.type !== 'slot') return;
    setPlanSelection({ id: `block:${blockId}`, blockId, date: todayDate, time: block.location.timeIndex });
  };
  const reschedulingBlock = blocks.find(block => block.id === planSelection?.blockId);
  const editingRecurringSession = outlineBranchItems(outlinerNodes).some(node => node.id === planSelection?.id && isRepeatingPlanNode(node) &&
    node.plans.some(plan => plan.id === planSelection.softPlanId && (plan.parentPlanId || plan.scope === 'day')));
  const reschedulingOwner = reschedulingBlock && outlineBranchItems(outlinerNodes).find(node => node.plans.some(plan => plan.scheduledBlockIds.includes(reschedulingBlock.id)));
  const canLoosenReschedulingBlock = !!reschedulingBlock && (!!reschedulingOwner || (!reschedulingBlock.habitId && ['Task', 'Note'].includes(getBlockKindLabel(reschedulingBlock))));
  const waitingBlockIds = new Set(unscheduledBlocks.filter(block => !block.completed).map(block => block.id));
  const planChoices: PlanChoice[] = [
    ...outlinerNodeEntries.filter(({ node }) => !((node.tag === 'task' || node.tag === 'link') && node.taskDone) && !node.isGroup && !isThemeOutlineNode(node)).map(({ node, path }): PlanChoice => ({ id: node.id, name: path.join(" / "), kind: node.linked?.routineId ? "routine" : node.tag, weeklyTarget: node.plans.find(plan => plan.scope === 'week' && !plan.parentPlanId && plan.date === getWeekStartDateString(weekOffset))?.targetCount ?? defaultWeeklyTarget(node), section: node.linked?.blockId && waitingBlockIds.has(node.linked.blockId) ? "Waiting" : "Outline" })),
    ...unscheduledBlocks.filter(block => !block.completed && !outlinerLinkedBlockIdSet.has(block.id)).map((block): PlanChoice => ({ id: `block:${block.id}`, name: cleanBlockLabel(block), kind: getBlockKindLabel(block).toLowerCase(), section: "Waiting" })),
  ];
  const selectedWeekStart = getWeekStartDateString(weekOffset);
  const visibleWeekPlans = getSoftPlansForWeek(outlinerNodes, selectedWeekStart);
  const progressBlocks = blocks.map(block => ({ id: block.id, completed: !!block.completed, location_type: block.location.type,
    week_start_date: block.location.type === 'slot' ? selectedWeekStart : null, day_index: block.location.type === 'slot' ? block.location.dayIndex : null, time_index: block.location.type === 'slot' ? block.location.timeIndex : null }));
  const weeklyLooseEntries = visibleWeekPlans.filter(entry => entry.placement === 'week').map(entry => ({ ...entry,
    ...(isRepeatingPlanNode(entry.node) ? { progress: recurringPlanProgress(entry.node, entry.plan, progressBlocks) } : {}) }));
  const weeklyChoices = outlinerNodeEntries.filter(({ node }) => {
    if (isThemeOutlineNode(node) || node.isGroup || ((node.tag === 'task' || node.tag === 'link') && node.taskDone)) return false;
    if (isRepeatingPlanNode(node)) return !node.plans.some(plan => plan.scope === 'week' && !plan.parentPlanId && plan.date === selectedWeekStart);
    if (normalizeOutlinePlans(node.plans, node.id, node.planDate).length) return false;
    const block = blocks.find(block => block.id === node.linked?.blockId);
    return !node.linked?.blockId || (block?.location.type === 'unscheduled' && !block.completed);
  }).map(({ node, path }) => ({ id: node.id, name: path.join(' / '), kind: node.linked?.routineId ? 'routine' : node.tag }));
  const dayCommitments = visibleWeekPlans.filter(entry => entry.placement === 'day').map(entry => ({
    node: { ...entry.node, planDate: entry.plan.date }, planId: entry.plan.id, legacy: !!entry.plan.legacyPlanDate,
    themeId: outlinerNodeEntries.find(item => item.node.id === entry.node.id)?.themeId,
  }));
  const commitSoftPlan = async (nodeId: string, planId: string, destination: SoftPlanDestination, parentPlanId?: string, targetCount?: number) => {
    if (!user || outlineLoading) throw new Error('Outline is still loading. Please try again.');
    const linkNode = outlineBranchItems(latestOutlineNodes.current).find(node => node.id === nodeId);
    if (destination.kind !== 'unplanned' && linkNode?.tag === 'link' && !normalizeReadingLink(linkNode.readingLink)) throw new Error('Add a valid URL in Link details before planning it.');
    if (softPlanSaving.current) throw new Error('A plan is still saving. Please try again.');
    softPlanSaving.current = true;
    try {
      const key = `${user.id}:${nodeId}:${planId}`;
      if (destination.kind === 'time' && !softPlanBlockIds.current.has(key)) softPlanBlockIds.current.set(key, crypto.randomUUID());
      const result = await persistSoftPlan(user.id, {
        nodeId, planId, destination, parentPlanId, targetCount, newBlockId: softPlanBlockIds.current.get(key),
      }, hourlySlots.length, { current: () => latestOutlineNodes.current, save: async nodes => { await saveOutlineNodes(nodes); },
        routine: routineTabs.find(routine => routine.id === outlineBranchItems(latestOutlineNodes.current).find(node => node.id === nodeId)?.linked?.routineId) });
      const source = outlineBranchItems(result.nodes).find(node => node.id === nodeId);
      setBlocks(current => {
        const updated = new Map(current.map(block => [block.id, block]));
        for (const block of result.blocks) {
          if (block.location_type === 'slot' && block.week_start_date !== selectedWeekStart) { updated.delete(block.id); continue; }
          const existing = updated.get(block.id);
          updated.set(block.id, { ...existing, id: block.id, label: block.label, isHabitBlock: block.is_habit_block,
            completed: block.completed, hashtag: block.hashtag ?? undefined, themeId: block.theme_id ?? undefined,
            habitId: block.habit_id ?? undefined, linkedBlockId: block.linked_block_id ?? undefined,
            isLinkedGroup: block.is_linked_group, workoutSubmitted: block.workout_submitted,
            blockNote: block.id === result.scheduledId ? result.note?.content ?? existing?.blockNote ?? source?.draftNote : existing?.blockNote,
            blockTasks: block.id === result.scheduledId && source?.linked?.routineId ? result.tasks : existing?.blockTasks,
            location: block.location_type === 'slot' ? { type: 'slot', dayIndex: block.day_index!, timeIndex: block.time_index! } : { type: 'unscheduled' },
          });
        }
        return [...updated.values()];
      });
    } finally { softPlanSaving.current = false; }
  };
  const removeDayCommitment = async (nodeId: string, planId: string, legacy: boolean) => {
    try {
      if (legacy) await saveOutlineNodes(updateOutlineNode(latestOutlineNodes.current, nodeId, node => ({ ...node, planDate: null })));
      else await commitSoftPlan(nodeId, planId, { kind: 'unplanned' });
      showToast('Day removed. Kept in Outline.', 'success');
    } catch { showToast('Could not remove the day. Please retry.', 'error'); }
  };
  const todayNoteNode = outlinerNodeEntries.find(({ node }) => node.id === todayNoteId)?.node;
  const todayNoteBlockId = todayNoteId?.startsWith('block:') ? todayNoteId.slice(6) : todayNoteNode?.linked?.blockId;
  const todayNoteName = todayNoteNode?.text ?? cleanBlockLabel(blocks.find(block => block.id === todayNoteBlockId) ?? { label: 'Note' } as Block);
  const occurrenceNoteOwner = todayNoteBlockId ? findGridOutlineEntry(outlinerNodes, {
    id: todayNoteBlockId, habitId: blocks.find(block => block.id === todayNoteBlockId)?.habitId,
  }) : undefined;
  const copyOccurrenceNoteToOutline = async (draft: { id: string; title: string; content: string; parentId: string }) => {
    if (!user || outlineLoading || !todayNoteBlockId) throw new Error('Outline is still loading. Please retry.');
    const note: OutlineNode = { ...createOutlineNode(draft.title), id: draft.id, draftNote: draft.content, draftNoteUpdatedAt: new Date().toISOString() };
    await saveOutlineNodes(placeOccurrenceNote(latestOutlineNodes.current, note, draft.parentId));
    showToast('Separate note saved to Outline. Occurrence note kept.', 'success', { label: 'Open', onClick: () => viewCapturedItem(draft.id) });
  };
  const loadTodayNote = async () => {
    if (todayNoteBlockId) return (await database.blockNotes.getByBlock(todayNoteBlockId))?.content ?? '';
    if (todayNoteNode?.linked?.habitId || todayNoteNode?.linked?.routineId) return (await loadLinkedOutlinerNote(todayNoteNode.linked)).content;
    return todayNoteNode?.draftNote ?? '';
  };
  const saveTodayNote = async (content: string) => {
    if (todayNoteBlockId) await saveBlockNote(todayNoteBlockId, content, true);
    else if (todayNoteNode?.linked?.habitId || todayNoteNode?.linked?.routineId) {
      if (!await saveLinkedOutlinerNote(todayNoteNode.linked, content)) throw new Error('Could not save note.');
    } else if (todayNoteNode) {
      saveOutlineNodes(updateOutlineNode(latestOutlineNodes.current, todayNoteNode.id, node => ({ ...node, draftNote: content, draftNoteUpdatedAt: new Date().toISOString() })));
      await outlineMutationQueue.current;
    } else throw new Error('This item is no longer available.');
    showToast(todayNoteBlockId ? 'Occurrence note saved' : 'Note saved', 'success');
  };
  const completeAnytimeTask = async (id: string) => {
    const node = outlinerNodeEntries.find(entry => entry.node.id === id)?.node;
    if (!node || !['task', 'link'].includes(node.tag) || node.linked?.habitId || node.linked?.routineId) return;
    if (node.linked?.blockId) { await toggleBlockCompletion(node.linked.blockId, true, true); return; }
    saveOutlineNodes(updateOutlineNode(latestOutlineNodes.current, id, row => ({ ...row, taskDone: true })));
    try {
      await outlineMutationQueue.current;
      showToast('Completed', 'success', { label: 'Undo', onClick: () => {
        saveOutlineNodes(updateOutlineNode(latestOutlineNodes.current, id, row => ({ ...row, taskDone: false })));
      } });
    } catch {
      const restored = updateOutlineNode(latestOutlineNodes.current, id, row => ({ ...row, taskDone: false }));
      latestOutlineNodes.current = restored; setOutlinerNodes(restored);
    }
  };
  const rescheduleTodayBlock = async (id: string, date: string, timeIndex: number | null, mode: PlanMode) => {
    if (mode !== 'time') {
      if (!canLoosenReschedulingBlock) throw new Error('Choose a time for this calendar item.');
      await savePlanItem(id, date, timeIndex, mode);
      return;
    }
    const block = reschedulingBlock;
    if (!block || block.location.type !== 'slot') throw new Error('This item is no longer scheduled.');
    if (timeIndex === null || !Number.isInteger(timeIndex) || timeIndex < 0 || timeIndex >= hourlySlots.length) throw new Error('Choose a time.');
    const target = planningDate(date);
    const previousWeekOffset = weekOffset;
    const previousWeek = getWeekStartDateString(weekOffset);
    const previousLocation = block.location;
    const owner = outlineBranchItems(latestOutlineNodes.current).find(node => normalizeOutlinePlans(node.plans, node.id, node.planDate).some(plan => !plan.legacyPlanDate && plan.scheduledBlockIds.includes(block.id)));
    const ownedPlan = owner && normalizeOutlinePlans(owner.plans, owner.id, owner.planDate).find(plan => plan.scheduledBlockIds.includes(block.id));
    if (owner && ownedPlan) await commitSoftPlan(owner.id, ownedPlan.id, { kind: 'time', date, timeIndex });
    else await database.blocks.update(block.id, { location_type: 'slot', week_start_date: target.weekStartDate, day_index: target.dayIndex, time_index: timeIndex });
    setBlocks(current => current.flatMap(item => item.id !== block.id ? [item] : target.weekOffset === weekOffset ? [{ ...item, location: { type: 'slot' as const, dayIndex: target.dayIndex, timeIndex } }] : []));
    setWeekOffset(target.weekOffset); setMobileDayIndex(target.dayIndex); navigateMain('planner');
    showToast('Rescheduled', 'success', { label: 'Undo', onClick: () => { void (async () => {
      try {
        if (owner && ownedPlan) {
          const previousDate = new Date(`${previousWeek}T12:00:00`);
          previousDate.setDate(previousDate.getDate() + previousLocation.dayIndex);
          await commitSoftPlan(owner.id, ownedPlan.id, { kind: 'time', date: localDateKey(previousDate), timeIndex: previousLocation.timeIndex });
        } else await database.blocks.update(block.id, { location_type: 'slot', week_start_date: previousWeek, day_index: previousLocation.dayIndex, time_index: previousLocation.timeIndex });
        setWeekOffset(previousWeekOffset); setMobileDayIndex(previousLocation.dayIndex);
        setBlocks(current => current.some(item => item.id === block.id) ? current.map(item => item.id === block.id ? { ...item, location: previousLocation } : item) : [...current, block]);
        navigateMain('planner'); showToast('Move undone', 'info');
      } catch { showToast('Could not undo the move. Please try again.', 'error'); }
    })(); } });
  };
  const openStackDay = (index: number) => { setMobileDayIndex(index); selectPlanView("day"); };
  const stackDays: StackDay[] = days.map((_, dayIndex) => {
    const date = new Date(`${getWeekStartDateString(weekOffset)}T12:00:00`);
    date.setDate(date.getDate() + dayIndex);
    const dateKey = localDateKey(date);
    return {
      date: dateKey,
      anytime: dayCommitments.filter(({ node }) => node.planDate === dateKey).map(({ node, themeId, planId, legacy }) => ({
        id: `${node.id}:${planId}`, name: node.text, themeId,
        readingLink: node.tag === 'link' ? node.readingLink : undefined,
        detail: [node.linked?.routineId ? 'Routine' : node.tag === 'task' ? 'Task' : node.tag === 'habit' ? 'Habit' : node.tag === 'link' ? 'Link' : 'Note', themes.find(theme => theme.id === themeId)?.name].filter(Boolean).join(' · '),
        onDone: node.tag === 'link' ? () => { void completeAnytimeTask(node.id); } : undefined,
        onOpen: () => openPlanItem(node.id, dateKey, 'day', planId),
        onRemove: () => { void removeDayCommitment(node.id, planId, legacy); },
      })),
      timed: blocks.filter(block => block.location.type === "slot" && block.location.dayIndex === dayIndex && !(block.linkedBlockId && !block.isLinkedGroup))
        .sort((a, b) => (a.location.type === "slot" ? a.location.timeIndex : 0) - (b.location.type === "slot" ? b.location.timeIndex : 0))
        .map(block => {
          const themeId = block.themeId ?? allHabits.find(habit => habit.id === block.habitId)?.themeId ?? outlinerNodeEntries.find(({ node }) => node.linked?.blockId === block.id)?.themeId;
          return { id: block.id, name: cleanBlockLabel(block), themeId, completed: !!block.completed,
            readingLink: getBlockReadingLink(block),
            detail: [getBlockKindLabel(block), themes.find(theme => theme.id === themeId)?.name].filter(Boolean).join(' · '),
            time: block.location.type === "slot" ? hourlySlots[block.location.timeIndex] ?? "Scheduled" : "Scheduled",
            onOpen: () => openStackDay(dayIndex), onDone: () => { void toggleBlockCompletion(block.id); },
            onActions: () => openGridItemActions(block.id),
            hasNote: !!block.blockNote?.trim(), onNote: () => setTodayNoteId(`block:${block.id}`),
          };
        }),
      suggestions: mobileWeeklyIntentionPlacements.filter(({ placement }) => placement.dayIndex === dayIndex).map(({ kind, intention, placement, title, detail }) => ({
        id: `${kind}-${intention.id}-${placement.id}`, name: title, detail: `${detail} · ${hourlySlots[placement.timeIndex] ?? "Choose a time"}`,
        openLabel: `Schedule ${title}`, removeLabel: `Dismiss ${title}`,
        themeId: kind === "habit" ? intention.themeId : undefined,
        onOpen: () => { if (kind === "habit") void acceptWeeklyHabitIntention(intention.id, placement.id); else void acceptWeeklyRoutineIntention(intention.id, placement.id); },
        onRemove: () => { if (kind === "habit") dismissWeeklyHabitIntention(intention.id, placement.id); else dismissWeeklyRoutineIntention(intention.id, placement.id); },
      })),
    };
  });

  const savePlanItem = async (id: string, date: string, timeIndex: number | null, mode: PlanMode, targetCount?: number) => {
    if (!user || outlineLoading) throw new Error("Outline is still loading. Please try again.");
    const target = planningDate(date);
    if (mode === 'time' && (timeIndex === null || !Number.isInteger(timeIndex) || timeIndex < 0 || timeIndex >= hourlySlots.length)) throw new Error('Choose a valid time.');
    if (mode !== 'time') timeIndex = null;
    let node = outlineBranchItems(latestOutlineNodes.current).find(item => item.id === id);
    let nextNodes = latestOutlineNodes.current;
    if (!node && id.startsWith("block:")) {
      const block = blocks.find(block => block.id === id.slice(6));
      if (!block) throw new Error("That item is no longer available.");
      const existing = findGridOutlineEntry(nextNodes, block);
      if (existing?.inTrash) throw new Error('Restore this item from Outline Trash before planning it.');
      node = existing?.node;
      if (!node) {
        node = { ...createOutlineNode(cleanBlockLabel(block)), tag: block.habitId ? 'habit' : getBlockKindLabel(block) === 'Task' ? 'task' : 'note',
          taskDone: !!block.completed, draftNote: block.blockNote ?? '',
          linked: { blockId: block.id, label: cleanBlockLabel(block), ...(block.habitId ? { habitId: block.habitId, themeId: block.themeId } : {}) } };
        nextNodes = [...nextNodes, node];
        // Persist identity first so a retry from Waiting reuses the same Outline entry.
        await saveOutlineNodes(nextNodes);
      }
    }
    if (!node) throw new Error("Choose an item from Outline or Waiting.");
    if (node.tag === 'link' && !normalizeReadingLink(node.readingLink)) throw new Error('Add a valid URL in the Link details before planning it.');
    if (isRepeatingPlanNode(node)) {
      const plans = normalizeOutlinePlans(node.plans, node.id, node.planDate);
      const selected = plans.find(plan => plan.id === (planSelection?.id === id ? planSelection.softPlanId : undefined))
        ?? (id.startsWith('block:') ? plans.find(plan => plan.scheduledBlockIds.includes(id.slice(6))) : undefined);
      const parent = plans.find(plan => plan.scope === 'week' && !plan.parentPlanId && plan.date === target.weekStartDate);
      const parentId = parent?.id ?? weeklyPlanId(node.id, date);
      const draftKey = `${node.id}:${planSelection?.requestId ?? 'calendar'}`;
      const existingSession = selected && (selected.parentPlanId || selected.scope === 'day') ? selected : undefined;
      if (mode === 'week' && !existingSession) {
        const pending = recurringDraftIds.current.get(draftKey);
        if (pending) await commitSoftPlan(node.id, pending, { kind: 'week', date }, parentId);
        await commitSoftPlan(node.id, parentId, { kind: 'week', date }, undefined, targetCount ?? parent?.targetCount ?? defaultWeeklyTarget(node));
      } else {
        let sessionId = existingSession?.id ?? recurringDraftIds.current.get(draftKey);
        if (!sessionId) {
          sessionId = plans.find(plan => plan.parentPlanId === parentId && plan.scope === 'week')?.id ?? crypto.randomUUID();
          recurringDraftIds.current.set(draftKey, sessionId);
        }
        await commitSoftPlan(node.id, sessionId, mode === 'week' ? { kind: 'week', date } : mode === 'day' ? { kind: 'day', date } : { kind: 'time', date, timeIndex: timeIndex! }, existingSession?.parentPlanId ?? parentId);
      }
      recurringDraftIds.current.delete(draftKey);
      setWeekOffset(target.weekOffset);
      if (mode !== 'week') setMobileDayIndex(target.dayIndex);
      navigateMain('planner');
      if (mode === 'week' && planView === 'day') selectPlanView('week');
      showToast(mode === 'week' ? 'Week intention saved.' : 'Session placed.', 'success');
      return;
    }
    if (!node.linked?.habitId && !node.linked?.routineId && node.tag !== 'habit') {
      const plans = normalizeOutlinePlans(node.plans, node.id, node.planDate);
      const planId = planSelection?.id === id && planSelection.softPlanId
        ? planSelection.softPlanId : plans.length === 1 ? plans[0].id : plans.length === 0 ? `plan:${node.id}` : null;
      if (!planId) throw new Error('Choose the plan you want to move.');
      await commitSoftPlan(node.id, planId, mode === 'week' ? { kind: 'week', date } : mode === 'day' ? { kind: 'day', date } : { kind: 'time', date, timeIndex: timeIndex! });
      setWeekOffset(target.weekOffset);
      if (mode !== 'week') setMobileDayIndex(target.dayIndex);
      navigateMain('planner');
      if (mode === 'week' && planView === 'day') selectPlanView('week');
      showToast(mode === 'week' ? 'Planned for the week. Day left open.' : mode === 'day' ? 'Day chosen. Time left open.' : 'Scheduled.', 'success');
      return;
    }
  };

  const openGridItemActions = (blockId: string) => {
    const block = blocks.find(item => item.id === blockId);
    if (!block) return;
    const existing = findGridOutlineEntry(latestOutlineNodes.current, block);
    setGridItemSelection({ blockId, existing: existing ? { id: existing.node.id, inTrash: existing.inTrash } : undefined });
  };
  const gridSelectedBlock = blocks.find(block => block.id === gridItemSelection?.blockId);
  const changeGridCardType = async (kind: 'task' | 'note') => {
    if (!user || outlineLoading || !gridSelectedBlock) throw new Error('This item is still loading. Please try again.');
    const block = gridSelectedBlock;
    if (block.habitId || block.isHabitBlock || getBlockKindLabel(block) === 'Routine' || getBlockKindLabel(block) === 'Workout') throw new Error('This card has a linked routine, workout, or habit history. Its type is protected.');
    const owner = findGridOutlineEntry(latestOutlineNodes.current, block);
    if (owner?.inTrash) throw new Error('Restore this item from Outline Trash before changing its type.');
    if (owner) { await changeOutlineCardType(owner.node.id, kind); return; }
    const patch = blockTypePatch(block.label, kind);
    await database.blocks.update(block.id, patch);
    setBlocks(current => current.map(item => item.id === block.id ? { ...item, ...patch } : item));
    showToast('Card type changed. Kept on the calendar only.', 'success');
  };
  const saveGridItemToOutline = async (choice: GridOutlineChoice) => {
    if (!user || outlineLoading || !gridSelectedBlock) throw new Error("Outline is still loading, or this calendar item is no longer available.");
    const block = gridSelectedBlock;
    const destinations = gridOutlineDestinations(latestOutlineNodes.current);
    const parent = destinations.find(item => item.id === choice.parentId);
    if (choice.parentId && !parent) throw new Error("Choose an available place in Outline.");
    if (choice.kind === "habit" && (!Number.isFinite(choice.target) || choice.target < 1)) throw new Error("Choose a goal of at least 1.");
    if (block.habitId && choice.kind !== "habit") throw new Error("Add this scheduled habit as a habit to keep its history.");
    const name = cleanBlockLabel(block);
    let habit = block.habitId ? { habitId: block.habitId, themeId: allHabits.find(item => item.id === block.habitId)?.themeId ?? block.themeId ?? "" } : undefined;
    if (choice.kind === "habit" && !habit) {
      habit = gridHabitDrafts.current.get(block.id);
      if (!habit) {
        const created = await createOrLinkOutlinerHabit(parent?.themeId, name, choice.target, choice.frequency);
        if (!created) throw new Error("Could not create the habit. Please retry.");
        habit = created;
        gridHabitDrafts.current.set(block.id, created);
      }
    }
    const existing = findGridOutlineEntry(latestOutlineNodes.current, { id: block.id, habitId: habit?.habitId });
    if (existing?.inTrash) throw new Error("This item is in Outline's Trash. Restore it there first.");
    const newHabit = !!habit && gridHabitDrafts.current.has(block.id) && !gridHabitDrafts.current.get(block.id)?.linkedExisting;
    if (existing && (newHabit || !habit) && outlineBranchItems([existing.node]).some(item => item.id === choice.parentId)) throw new Error("Choose a place outside this item.");
    if (habit && newHabit) {
      if (parent?.parentHabitId === habit.habitId) throw new Error("Choose a place outside this habit.");
      habit = { ...habit, themeId: parent?.themeId ?? habit.themeId };
      const updatedHabit = habit;
      await database.habits.update(habit.habitId, { theme_id: habit.themeId, parent_habit_id: parent?.parentHabitId ?? null, target_per_week: choice.target, frequency: choice.frequency });
      setThemes(current => {
        const habits = current.flatMap(theme => flattenHabits(theme.habits, theme.name, theme.id)).map(item => item.id === updatedHabit.habitId
          ? { ...item, themeId: updatedHabit.themeId, parentHabitId: parent?.parentHabitId, targetPerWeek: choice.target, frequency: choice.frequency } : item);
        const buildTree = (themeId: string, parentId?: string): Habit[] => habits.filter(item => item.themeId === themeId && item.parentHabitId === parentId).map(item => ({ ...item, subtasks: buildTree(themeId, item.id) }));
        return current.map(theme => ({ ...theme, habits: buildTree(theme.id) }));
      });
    }
    const label = `${choice.kind === "task" ? "Task" : choice.kind === "note" ? "Note" : "Habit"}: ${name}`;
    // Update classification only; never move or recreate the scheduled block.
    await database.blocks.update(block.id, { label, hashtag: choice.kind,
      ...(habit ? { habit_id: habit.habitId, theme_id: habit.themeId, is_habit_block: true } : {}),
    });
    setBlocks(current => current.map(item => item.id !== block.id ? item : { ...item, label, hashtag: choice.kind,
      ...(habit ? { habitId: habit.habitId, themeId: habit.themeId, isHabitBlock: true } : {}),
    }));
    const current = latestOutlineNodes.current;
    const draft: OutlineNode = { ...createOutlineNode(name), tag: choice.kind,
      taskDone: choice.kind === "task" && !!block.completed, draftNote: block.blockNote ?? "",
      target: choice.target, frequency: choice.frequency,
      linked: { blockId: block.id, label: name, ...(habit ?? {}) },
    };
    // A failed write or canonical habit sync may already have inserted this row.
    const placed = placeGridOutlineEntry(current, draft, choice.parentId, newHabit);
    await saveOutlineNodes(placed.nodes);
    gridHabitDrafts.current.delete(block.id);
    showToast(`${name} added to Outline. Calendar time kept.`, "success", { label: "Open", onClick: () => viewCapturedItem(placed.node.id) });
  };
  const rescheduleGridItem = () => {
    if (!gridSelectedBlock || gridSelectedBlock.location.type !== "slot") return;
    const date = new Date(`${getWeekStartDateString(weekOffset)}T12:00:00`);
    date.setDate(date.getDate() + gridSelectedBlock.location.dayIndex);
    setPlanSelection({ id: `block:${gridSelectedBlock.id}`, blockId: gridSelectedBlock.id, date: localDateKey(date), time: gridSelectedBlock.location.timeIndex });
    setGridItemSelection(null);
  };

  const addPlannerItem = async (item: NewPlannerItem): Promise<string> => {
    if (!user || outlineLoading) throw new Error("Outline is still loading. Please try again.");
    if (!item.name.trim()) throw new Error("Give this item a name.");
    if (item.kind === 'link' && !normalizeReadingLink(item.readingLink)) throw new Error('Enter a public http or https URL.');
    if (item.kind === 'link' && item.readingLink?.imageUrl?.trim() && !publicWebUrl(item.readingLink.imageUrl)) throw new Error('Enter a public thumbnail URL or leave it empty.');
    if (item.kind === "habit" && (!Number.isFinite(item.target) || item.target < 1)) throw new Error("Choose a goal of at least 1.");
    // An explicit null means Ungrouped; omission retains the legacy theme-based flow.
    const explicitParent = item.parentId !== undefined;
    const destinationPath = (nodes: OutlineNode[], id: string): OutlineNode[] | null => {
      for (const candidate of nodes) {
        if (candidate.trashedAt) continue;
        if (candidate.id === id) return [candidate];
        const child = destinationPath(candidate.children, id);
        if (child) return [candidate, ...child];
      }
      return null;
    };
    const initialPath = item.parentId ? destinationPath(latestOutlineNodes.current, item.parentId) : null;
    if (item.parentId && !initialPath) throw new Error("That destination is no longer available. Choose another place.");
    const destinationTheme = initialPath?.slice().reverse().find(isThemeOutlineNode)?.linked?.themeId;
    const key = JSON.stringify([user.id, item]);
    let node = pendingCapture.current?.key === key ? pendingCapture.current.node : null;
    if (!node) {
      node = { ...createOutlineNode(item.name.trim()), draftNote: item.notes, ...(item.kind === 'link' ? { readingLink: normalizeReadingLink(item.readingLink) } : {}) };
      if (item.kind === "habit") {
        const result = await createOrLinkOutlinerHabit(destinationTheme || item.themeId || null, item.name, item.target, item.frequency);
        if (!result) throw new Error("Could not add the habit.");
        node = { ...node, tag: "habit", frequency: item.frequency, target: item.target, linked: { ...result, label: item.name } };
      } else if (item.kind === "theme") {
        const result = await createThemeFromOutliner(item.name, []);
        if (!result) throw new Error("Could not add the theme.");
        node = { ...node, linked: { themeId: result.themeId, label: item.name } };
      } else if (item.kind === "routine") {
        const result = await createRoutineFromOutliner(item.name, item.notes.split("\n").filter(Boolean));
        if (!result) throw new Error("Could not add the routine.");
        node = { ...node, linked: { routineId: result.routineId, label: item.name } };
      } else node = { ...node, tag: item.kind };
      pendingCapture.current = { key, node };
    }
    // Canonical theme/habit sync may have inserted the row while capture was saving.
    const current = latestOutlineNodes.current;
    const entries = outlineBranchItems(current);
    if (item.parentId && !destinationPath(current, item.parentId)) throw new Error("That destination is no longer available. Choose another place.");
    const existing = entries.find(entry => entry.id === node!.id ||
      (node!.linked?.habitId ? entry.linked?.habitId === node!.linked.habitId :
        isThemeOutlineNode(node!) ? isThemeOutlineNode(entry) && entry.linked?.themeId === node!.linked?.themeId :
          node!.linked?.routineId ? entry.linked?.routineId === node!.linked.routineId : false));
    if (existing) {
      node = { ...existing, draftNote: item.notes || existing.draftNote };
      const updated = updateOutlineNode(current, existing.id, () => node!);
      if (explicitParent && item.parentId && !outlineBranchItems([existing]).every(entry => entry.id !== item.parentId)) {
        throw new Error("An item cannot be placed inside itself or its descendants.");
      }
      await saveOutlineNodes(explicitParent ? moveOutlineSelection(updated, new Set([existing.id]), item.parentId ?? null, { revealParent: false }) : updated);
    } else {
      const themeId = item.kind === "habit" ? node.linked?.themeId : item.themeId;
      const parent = explicitParent ? entries.find(entry => entry.id === item.parentId) : item.kind === "theme" ? null : entries.find(entry => isThemeOutlineNode(entry) && entry.linked?.themeId === themeId);
      await saveOutlineNodes(parent ? updateOutlineNode(current, parent.id, row => ({ ...row, collapsed: explicitParent ? row.collapsed : false, children: [...row.children, node!] })) : [...current, node]);
    }
    pendingCapture.current = null;
    return node.id;
  };

  const openCapture = (themeId = "") => { setCaptureThemeId(themeId); setCaptureKind("task"); setShowAddPlanner(true); };
  const viewCapturedItem = (id: string) => {
    setShowAddPlanner(false);
    setOutlinerFocusNodeId(id);
    setOutlinerFocusRequestKey(value => value + 1);
    navigateMain("themes");
    outlineScrollPosition.current = { root: 0, window: 0 };
  };
  const sendCaptureToRoutine = async (routineId: string) => {
    if (!user || !routineCaptureNode) throw new Error("Choose an Outline item.");
    const node = outlineBranchItems(latestOutlineNodes.current).find(item => item.id === routineCaptureNode.id);
    if (!node) throw new Error("This item is no longer in Outline.");
    const next = addOutlineItemToRoutine(routineTabs, routineId, node);
    saveRoutineNotes(user.id, next);
    setRoutineTabs(next);
    showToast(`${node.text} added to ${next.find(routine => routine.id === routineId)?.name}.`, "success");
  };

  if (!hasSupabaseConfig) {
    return <MissingSupabaseConfigScreen />;
  }

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        fontSize: "18px",
        color: "#666"
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthSuccess={() => {}} />;
  }

  return (
    <TileTimersProvider key={user.id} userId={user.id}>
      <PlannerNavigation view={mobileHomeView === "stack" ? "planner" : mobileHomeView}
        onView={navigateMain} onAdd={() => openCapture()} onMore={() => setMobileMoreOpen(value => !value)}
        more={mobileMoreOpen ? <>
          <button type="button" onClick={() => { setShowCalendarSettings(true); setMobileMoreOpen(false); }}>Settings & calendars</button>
          <button type="button" onClick={() => { setShowAnalytics(true); setMobileMoreOpen(false); }}>History</button>
          <button type="button" onClick={() => { openOverlayPanel("workout"); setMobileMoreOpen(false); }}>Workouts</button>
          <button type="button" onClick={() => { openOverlayPanel("routines"); setMobileMoreOpen(false); }}>Edit routines</button>
          <button type="button" onClick={() => { openAmbientMode(); setMobileMoreOpen(false); }}>Ambient</button>
          <button type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </> : null} />
      <AddPlannerDialog key={user.id} open={showAddPlanner} themes={themes.filter(theme => outlineBranchItems(outlinerNodes).some(node => isThemeOutlineNode(node) && node.linked?.themeId === theme.id))} initialKind={captureKind} initialThemeId={captureThemeId} onSave={addPlannerItem} onView={viewCapturedItem} onClose={() => setShowAddPlanner(false)} />
      {routineCaptureNode && <AddToRoutineDialog name={routineCaptureNode.text} routines={routineTabs} onSave={sendCaptureToRoutine} onClose={() => setRoutineCaptureNode(null)} />}
      {gridItemSelection && gridSelectedBlock && <GridOutlineDialog key={gridSelectedBlock.id} blockId={gridSelectedBlock.id} name={cleanBlockLabel(gridSelectedBlock)} currentType={getBlockKindLabel(gridSelectedBlock)} initialKind={gridSelectedBlock.habitId ? "habit" : getBlockKindLabel(gridSelectedBlock) === "Task" ? "task" : "note"} destinations={gridOutlineDestinations(outlinerNodes)} existing={gridItemSelection.existing} onSave={saveGridItemToOutline} onChangeType={changeGridCardType} onOpen={() => { if (gridItemSelection.existing) viewCapturedItem(gridItemSelection.existing.id); setGridItemSelection(null); }} onReschedule={rescheduleGridItem} onClose={() => setGridItemSelection(null)} />}
      <PlannerConnectionStatus />
      {outlineSaveStatus !== 'idle' && (mobileHomeView === 'themes' || outlineSaveStatus !== 'saved') && <div className="outline-save-status" role="status">{outlineSaveStatus === 'saving' ? 'Saving Outline...' : outlineSaveStatus === 'saved' ? 'Outline saved' : 'Outline not saved'}{outlineSaveStatus === 'error' && <button type="button" onClick={() => saveOutlineNodes(latestOutlineNodes.current)}>Retry</button>}</div>}
      {todayNoteId && <PlannerNoteDialog key={todayNoteId} name={todayNoteName} occurrence={!!todayNoteBlockId} outlineCopy={todayNoteBlockId ? {
        destinations: gridOutlineDestinations(outlinerNodes), initialParentId: occurrenceNoteOwner && !occurrenceNoteOwner.inTrash ? occurrenceNoteOwner.node.id : '', onSave: copyOccurrenceNoteToOutline,
      } : undefined} onLoad={loadTodayNote} onSave={saveTodayNote} onClose={() => setTodayNoteId(null)} />}
      {planSelection && <PlanItemDialog choices={reschedulingBlock ? [{ id: `block:${reschedulingBlock.id}`, name: cleanBlockLabel(reschedulingBlock), kind: getBlockKindLabel(reschedulingBlock).toLowerCase(), section: 'Outline' }] : planChoices} initialId={planSelection.id} initialDate={planSelection.date} initialTime={planSelection.time} initialMode={planSelection.mode} initialTarget={planSelection.targetCount} rescheduling={!!planSelection.blockId || editingRecurringSession} allowLoose={!planSelection.blockId || canLoosenReschedulingBlock} slots={hourlySlots} onSave={planSelection.blockId ? rescheduleTodayBlock : savePlanItem} onClose={() => setPlanSelection(null)} />}
      <div
        className={`app streamlined-app ${mobileHomeView === "themes" ? "app-mobile-themes" : ""}`}
        data-main-view={mobileHomeView === "stack" ? "planner" : mobileHomeView}
        data-plan-view={mobileHomeView === "stack" ? "stack" : planView}
        style={{ gridTemplateColumns: `${leftColWidth}px 4px 1fr` }}
      >
        <div className="left-column">
          <DailyFocus
            blocks={blocks}
            dailyPriorities={dailyPriorities}
            todayDayIndex={todayDayIndex}
            weekOffset={weekOffset}
            onComplete={markBlockDone}
          />
          <PriorityPickerPanel
            userId={user.id}
            blocks={blocks.map(b => ({
              id: b.id,
              label: b.label,
              completed: b.completed || false,
              day_index: b.location.type === 'slot' ? b.location.dayIndex : null,
              time_index: b.location.type === 'slot' ? b.location.timeIndex : null
            }))}
            dragBlockId={dragBlockId}
            dragHabitId={dragHabitId}
            onPriorityChange={() => loadUserData()}
            onHabitDrop={createHabitBlockForPriority}
            onDeleteBlock={deleteBlockWithUndo}
            onCreateBlock={(label) => createBlock(label)}
          />

          <section id="planning-outline" className="themes-card outline-home">
            <PlanningOutlinerPanel
          key={user.id}
          userId={user.id}
          nodes={outlinerNodes}
          loading={dataLoading || outlineLoading}
          onPlan={(node) => openPlanItem(node.id, node.planDate ?? undefined)}
          onAdd={openCapture}
          onAddToRoutine={setRoutineCaptureNode}
          onChangeType={changeOutlineCardType}
          onLoadPlanning={loadOutlinePlanning}
          onUnlinkPlanning={unlinkOutlinePlanning}
          onSaveReadingLink={saveOutlineReadingLink}
          getHabitProgress={(id) => {
            const habit = allHabits.find(habit => habit.id === id);
            return habit && habit.frequency !== "none" ? `${getHabitDoneCount(id, habit.frequency)}/${habit.targetPerWeek}` : "";
          }}
          onHabitDragStart={handleHabitDragStart}
          onHabitDragEnd={handleHabitDragEnd}
          onSaveHabitSettings={saveOutlineHabitSettings}
          onToggleTask={(node) => {
            if (node.linked?.blockId && blocks.some((block) => block.id === node.linked?.blockId)) {
              void toggleBlockCompletion(node.linked.blockId);
            } else {
              saveOutlineNodes(updateOutlineNode(outlinerNodes, node.id, (item) => ({ ...item, taskDone: !item.taskDone })));
            }
          }}
          presentation="inline"
          focusNodeIdRequest={outlinerFocusNodeId}
          focusRequestKey={outlinerFocusRequestKey}
          themes={themes
            .filter((theme) => theme.themeType === "habit" || theme.themeType === "household")
            .map((theme) => ({
              id: theme.id,
              name: theme.name,
              habits: flattenHabits(theme.habits, theme.name, theme.id).map((habit) => ({
                id: habit.id,
                name: habit.name,
              })),
            }))}
          boardHabitIds={blocks
            .map((block) => block.habitId)
            .filter((habitId): habitId is string => !!habitId)}
          onClose={() => setShowPlanningOutliner(false)}
          onCreateBlock={createOutlinerBlock}
          onCreateHabit={async (themeId, name, targetPerWeek, frequency) => {
            return createOrLinkOutlinerHabit(themeId, name, targetPerWeek, frequency);
          }}
          onCreateHabitBlock={async (themeId, name, targetPerWeek, frequency) => {
            const result = await createOrLinkOutlinerHabit(themeId, name, targetPerWeek, frequency);
            if (!result) return null;
            const boardResult = await addLinkedHabitToBoard({
              habitId: result.habitId,
              themeId: result.themeId,
              label: name,
            });
            return boardResult ? { ...result, blockId: boardResult.blockId } : result;
          }}
          onCreateThemeFromRow={async (name, habits) => {
            return createThemeFromOutliner(name, habits);
          }}
          onCreateRoutineFromRow={createRoutineFromOutliner}
          onOpenLinked={openLinkedOutlinerItem}
          onRenameLinked={renameLinkedOutlinerItem}
          onLoadLinkedNote={loadLinkedOutlinerNote}
          onSaveLinkedNote={saveLinkedOutlinerNote}
          onNodesChange={saveOutlineNodes}
          saveStatus={outlineSaveStatus}
        />
          </section>

          {themeDetailsId && <div className="modal-overlay theme-details-overlay" onClick={closeThemeDetails}>
          <div className="card theme-details-panel" role="dialog" aria-modal="true" aria-label="Theme details" onClick={(event) => event.stopPropagation()}>
            <div className="top-row">
              <h2>Theme details</h2>
              <button type="button" className="secondary" onClick={closeThemeDetails}>Close</button>
              <div className="theme-top-actions">
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setExpandedThemes(new Set(themes.map((theme) => theme.id)))}
                >
                  Open all
                </button>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setExpandedThemes(new Set())}
                >
                  Close all
                </button>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                >
                  Sign out
                </button>
              </div>
            </div>

            {dataLoading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                Loading your data...
              </div>
            ) : (
              <>
                <div className="theme-list">
                  {themes.filter((theme) => themeDetailsId === "all" || theme.id === themeDetailsId).map((theme) => {
                    const isThemeExpanded = expandedThemes.has(theme.id);
                    const themedBlocks = blocks.filter(
                      (b) => b.location.type === "unscheduled" && b.themeId === theme.id
                    );
                    const isDropTarget = dragOverThemeId === theme.id;
                    const isDraggingBlock = !!(dragBlockId || currentDragBlockId);
                    const isHouseholdTheme = theme.themeType === "household";
                    const themeOutlineMeta = themeOutlineMetaMap.get(theme.id);
                    const shapeTargetThemes = themes.filter(
                      (candidate) =>
                        candidate.id !== theme.id &&
                        (candidate.themeType === "habit" || candidate.themeType === "household")
                    );
                    const householdHabits = isHouseholdTheme
                      ? flattenHabits(theme.habits, theme.name, theme.id)
                      : [];
                    const householdNeedCounts = householdHabits.reduce(
                      (counts, habit) => {
                        const need = getHouseholdChoreNeed(habit);
                        return { ...counts, [need.className]: (counts[need.className] ?? 0) + 1 };
                      },
                      {} as Record<string, number>
                    );
                    return (
                    <div
                      id={`theme-${theme.id}`}
                      key={theme.id}
                      className={`theme-card${isHouseholdTheme ? " theme-card-household" : ""}${isDropTarget ? " theme-card-drop-target" : ""}`}
                    >
                      <div
                        className="theme-title-row"
                        onClick={() => toggleThemeExpanded(theme.id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isThemeExpanded}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleThemeExpanded(theme.id); } }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span
                            className="theme-collapse-chevron"
                            style={{ transform: isThemeExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                          >
                            &#9654;
                          </span>
                          {renamingThemeId === theme.id ? (
                            <input
                              className="theme-name-input"
                              type="text"
                              value={renameThemeValue}
                              onChange={(e) => setRenameThemeValue(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveThemeRename(theme.id);
                                if (e.key === "Escape") { setRenamingThemeId(null); setRenameThemeValue(""); }
                              }}
                              onBlur={() => saveThemeRename(theme.id)}
                              autoFocus
                            />
                          ) : (
                            <div
                              className="theme-name"
                              onDoubleClick={(e) => { e.stopPropagation(); startRenamingTheme(theme.id, theme.name); }}
                              title="Double-click to rename"
                            >
                              {theme.themeType === "meals" && (
                                <span className="meals-theme-icon" title="Meals theme">&#127860;</span>
                              )}
                              {isHouseholdTheme && (
                                <span className="household-theme-icon" title="Household theme">Home</span>
                              )}
                              {theme.name}
                              {themeOutlineMeta && themeOutlineMeta.path.length > 1 && (
                                <span className="theme-outline-path">
                                  {themeOutlineMeta.path.slice(0, -1).join(" / ")}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                          {isThemeExpanded && (
                            <>
                              <button
                                type="button"
                                className="secondary small-btn"
                                onClick={() => {
                                  if (theme.themeType === "meals") {
                                    setAddingMealForThemeId(theme.id);
                                  } else {
                                    setAddingThemeId(theme.id);
                                    setNewThemeHabitName("");
                                    setNewThemeHabitTarget(2);
                                    setNewThemeHabitFrequency("weekly");
                                    setNewThemeHabitGroupId("");
                                  }
                                }}
                              >
                                {theme.themeType === "meals" ? "Add meal" : isHouseholdTheme ? "Add chore" : "Add habit"}
                              </button>
                              <button
                                type="button"
                                className="secondary small-btn"
                                onClick={() => {
                                  if (themeOutlineMeta) {
                                    setOutlinerFocusNodeId(themeOutlineMeta.nodeId);
                                    setOutlinerFocusRequestKey((value) => value + 1);
                                    openOverlayPanel("outliner");
                                  } else {
                                    addThemeViewToOutliner(theme);
                                  }
                                }}
                                title="Open this theme in Outline"
                              >
                                Outline
                              </button>
                              <button
                                type="button"
                                className="secondary small-btn"
                                onClick={() => { closeThemeDetails(); setNotesThemeId(theme.id); }}
                              >
                                Notes
                              </button>
                              <button
                                type="button"
                                className="secondary small-btn"
                                onClick={() => {
                                  if (managingGroupsForTheme === theme.id) {
                                    setManagingGroupsForTheme(null);
                                  } else {
                                    setManagingGroupsForTheme(theme.id);
                                    setNewGroupName("");
                                    setNewGroupType("custom");
                                  }
                                }}
                              >
                                {managingGroupsForTheme === theme.id ? "Hide" : isHouseholdTheme ? "Areas" : "Groups"}
                              </button>
                              {theme.themeType !== "meals" && (
                                <button
                                  type="button"
                                  className="secondary small-btn"
                                  onClick={() => {
                                    setReshapingThemeId(reshapingThemeId === theme.id ? null : theme.id);
                                    setShapeTargetThemeId(shapeTargetThemes[0]?.id ?? "");
                                  }}
                                >
                                  Shape
                                </button>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            className="theme-delete-btn"
                            onClick={() => deleteTheme(theme.id)}
                            title="Delete theme"
                            aria-label={`Delete theme ${theme.name}`}
                          >
                            x
                          </button>
                        </div>
                      </div>

                      <div className={`theme-body ${isThemeExpanded ? "expanded" : "collapsed"}`}>

                      {reshapingThemeId === theme.id && theme.themeType !== "meals" && (
                        <div className="shape-change-panel">
                          <div>
                            <strong>Change shape</strong>
                            <span>Turn this theme into a habit inside another theme.</span>
                          </div>
                          {shapeTargetThemes.length === 0 ? (
                            <p>Create another habit theme first, then this can move into it.</p>
                          ) : (
                            <>
                              <label className="small-label">Put inside</label>
                              <select
                                value={shapeTargetThemeId}
                                onChange={(event) => setShapeTargetThemeId(event.target.value)}
                              >
                                {shapeTargetThemes.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name}
                                  </option>
                                ))}
                              </select>
                              <div className="shape-change-actions">
                                <button
                                  type="button"
                                  onClick={() => makeThemeIntoHabit(theme, shapeTargetThemeId)}
                                  disabled={!shapeTargetThemeId}
                                >
                                  Make habit
                                </button>
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => {
                                    setReshapingThemeId(null);
                                    setShapeTargetThemeId("");
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {managingGroupsForTheme === theme.id && (
                        <div className="add-habit-form" style={{ marginBottom: "8px" }}>
                          <label className="small-label">{isHouseholdTheme ? "Areas in this home" : "Groups in this theme"}</label>
                          {theme.groups.length === 0 ? (
                            <div style={{ fontSize: "12px", color: "#666", padding: "4px 0" }}>
                              {isHouseholdTheme ? "No areas yet" : "No groups yet"}
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                              {theme.groups.map((group) => (
                                <div key={group.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "#f8f8ff", borderRadius: "4px", fontSize: "12px" }}>
                                  <span>
                                    {group.name}
                                    {group.groupType === "strength_training" && " 🏋️"}
                                    {group.linkBehavior === "adjacent_merge" && " (Links adjacent)"}
                                  </span>
                                  <button
                                    type="button"
                                    className="secondary small-btn"
                                    onClick={() => deleteGroup(group.id)}
                                    style={{ fontSize: "10px", padding: "2px 6px" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <label className="small-label">{isHouseholdTheme ? "Add new area" : "Add new group"}</label>
                          <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder={isHouseholdTheme ? "e.g. Bedroom" : "e.g. Strength Training"}
                          />
                          {!isHouseholdTheme && (
                            <>
                              <label className="small-label">Group type</label>
                              <select
                                value={newGroupType}
                                onChange={(e) => setNewGroupType(e.target.value as "strength_training" | "custom")}
                              >
                                <option value="custom">Custom</option>
                                <option value="strength_training">Strength Training (auto-link)</option>
                              </select>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              addGroupToTheme(theme.id, newGroupName, isHouseholdTheme ? "custom" : newGroupType);
                            }}
                            style={{ marginTop: "4px" }}
                          >
                            {isHouseholdTheme ? "Add area" : "Add group"}
                          </button>
                        </div>
                      )}

                      {isHouseholdTheme && (
                        <div className="household-dashboard">
                          <div>
                            <span>Needs care</span>
                            <strong>{householdNeedCounts.due ?? 0}</strong>
                          </div>
                          <div>
                            <span>Getting there</span>
                            <strong>{householdNeedCounts.soon ?? 0}</strong>
                          </div>
                          <div>
                            <span>Okay</span>
                            <strong>{householdNeedCounts.fresh ?? 0}</strong>
                          </div>
                          <div>
                            <span>Areas</span>
                            <strong>{theme.groups.length}</strong>
                          </div>
                        </div>
                      )}

                      <div className="habit-list theme-habit-list">
                        {(() => {
                          const outlineHabitRank = new Map(
                            (themeOutlineMeta?.habitOrder ?? []).map((habitId, index) => [habitId, index])
                          );
                          const orderThemeHabits = (habits: Habit[]) =>
                            [...habits].sort((a, b) => {
                              const aRank = outlineHabitRank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
                              const bRank = outlineHabitRank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
                              if (aRank !== bRank) return aRank - bRank;
                              return theme.habits.findIndex((habit) => habit.id === a.id) -
                                theme.habits.findIndex((habit) => habit.id === b.id);
                            });
                          const orderedThemeHabits = orderThemeHabits(theme.habits);
                          const ungroupedHabits = orderedThemeHabits.filter(h => !h.habitGroupId);
                          const groupsWithHabits = theme.groups.map(g => ({
                            ...g,
                            habits: orderedThemeHabits.filter(h => h.habitGroupId === g.id)
                          })).filter(g => g.habits.length > 0);
                          const emptyGroups = theme.groups.filter(g => !theme.habits.some(h => h.habitGroupId === g.id));

                          const renderHabitItem = (habit: Habit, showGroupBadge: boolean) => {
                            const isExpanded = expandedHabits.has(habit.id);
                            const habitWithTheme: HabitWithTheme = { ...habit, themeName: theme.name, themeId: theme.id };
                            const activeIntention = getWeeklyIntentionForHabit(habit.id);
                            const choreNeed = isHouseholdTheme ? getHouseholdChoreNeed(habit) : null;
                            const intentionChoices = Array.from(
                              new Set([
                                1,
                                2,
                                3,
                                4,
                                habit.frequency === "weekly" && habit.targetPerWeek > 4 ? habit.targetPerWeek : null,
                              ].filter((value): value is number => typeof value === "number"))
                            );
                            const habitDone = getHabitDoneCount(habit.id, habit.frequency);
                            const habitTarget = habit.targetPerWeek;
                            const habitRemaining =
                              habit.frequency !== "none"
                                ? Math.max(0, habitTarget - habitDone)
                                : 0;
                            const habitProgressPct =
                              habit.frequency !== "none" && habitTarget > 0
                                ? Math.min(100, Math.round((habitDone / habitTarget) * 100))
                                : 0;
                            const habitProgressClass =
                              habitDone >= habitTarget && habitTarget > 0
                                ? habitDone > habitTarget
                                  ? "over"
                                  : "complete"
                                : "";
                            const scheduledHabitCount = blocks.filter(
                              (block) => block.habitId === habit.id && block.location.type === "slot"
                            ).length;
                            const intentionPlacementCount = activeIntention?.placements.length ?? 0;
                            const habitLastDoneLabel = habit.lastDoneAt ? formatTimeSince(habit.lastDoneAt) : "Not yet";
                            const habitCareSummary =
                              habit.frequency === "none"
                                ? `${habitDone} total done`
                                : habitRemaining === 0
                                  ? "Target met"
                                  : `${habitRemaining} left`;
                            return (
                              <div
                                id={`habit-${habit.id}`}
                                key={habit.id}
                                className={`habit-item${choreNeed ? ` household-chore household-chore--${choreNeed.className}` : ""}`}
                              >
                                <button
                                  onClick={() => toggleHabitExpanded(habit.id)}
                                  style={{
                                    position: "absolute",
                                    left: "8px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: "16px",
                                    color: "#999",
                                    padding: "4px",
                                    lineHeight: 1,
                                    transition: "transform 0.2s ease"
                                  }}
                                  title={isExpanded ? "Collapse" : "Expand"}
                                >
                                  <span style={{
                                    display: "inline-block",
                                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                    transition: "transform 0.2s ease"
                                  }}>
                                    ▶
                                  </span>
                                </button>

                                {!isExpanded && (() => {
                                  const creditedBySubtask = blocks.some(
                                    (b) => b.completed && b.creditedHabitIds?.includes(habit.id)
                                  );
                                  return (
                                  <div style={{
                                    paddingLeft: "28px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    width: "100%",
                                    minHeight: "48px"
                                  }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 500, color: "#333", marginBottom: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                                        {habit.name}
                                        {choreNeed && (
                                          <span className={`household-need-pill household-need-pill--${choreNeed.className}`}>
                                            {choreNeed.label}
                                          </span>
                                        )}
                                        <span style={{
                                          fontSize: "9px",
                                          fontWeight: 600,
                                          padding: "2px 5px",
                                          borderRadius: "3px",
                                          background: habit.frequency === "daily" ? "#fef08a" : habit.frequency === "weekly" ? "#bfdbfe" : habit.frequency === "monthly" ? "#d8b4fe" : "#e5e7eb",
                                          color: habit.frequency === "daily" ? "#713f12" : habit.frequency === "weekly" ? "#1e3a8a" : habit.frequency === "monthly" ? "#581c87" : "#374151",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.5px"
                                        }}>
                                          {habit.frequency === "daily" ? "D" : habit.frequency === "weekly" ? "W" : habit.frequency === "monthly" ? "M" : "N"}
                                        </span>
                                        {showGroupBadge && habit.habitGroupId && (() => {
                                          const group = theme.groups.find(g => g.id === habit.habitGroupId);
                                          return group ? (
                                            <span style={{ marginLeft: "0px", fontSize: "11px", color: "#666", background: "#f0f0f0", padding: "2px 6px", borderRadius: "3px" }}>
                                              {group.name}
                                            </span>
                                          ) : null;
                                        })()}
                                      </div>
                                      {habit.frequency !== "none" && (
                                        <div className="habit-progress-row">
                                          <span className="habit-progress-fraction">{habitDone}/{habitTarget}</span>
                                          <div className="habit-progress-bar-track">
                                            <div className={`habit-progress-bar-fill ${habitProgressClass}`} style={{ width: `${habitProgressPct}%` }} />
                                          </div>
                                          {creditedBySubtask && (
                                            <span className="habit-credited-badge">+subtask</span>
                                          )}
                                        </div>
                                      )}
                                      {habit.frequency === "none" && (
                                        <div className="habit-meta">
                                          Done: {habitDone}
                                          {creditedBySubtask && (
                                            <span className="habit-credited-badge" style={{ marginLeft: 6 }}>+subtask</span>
                                          )}
                                        </div>
                                      )}
                                      <div className="habit-care-mini">
                                        {choreNeed && (
                                          <span className="household-mini-meter">
                                            <i style={{ width: `${choreNeed.pct}%` }} />
                                          </span>
                                        )}
                                        <span>{habitCareSummary}</span>
                                        <span>Last: {habitLastDoneLabel}</span>
                                        {intentionPlacementCount > 0 && (
                                          <span>{intentionPlacementCount} dotted</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  );
                                })()}

                                {isExpanded && editingHabitId === habit.id && (
                                  <>
                                    <button
                                      className="habit-delete-x"
                                      onClick={cancelEditingHabit}
                                      title="Cancel editing"
                                    >
                                      ×
                                    </button>

                                    <div className="add-habit-form" style={{ paddingLeft: "24px", paddingRight: "24px" }}>
                                      <label className="small-label">{isHouseholdTheme ? "Chore name" : "Habit name"}</label>
                                      <input
                                        type="text"
                                        value={editHabitName}
                                        onChange={(e) => setEditHabitName(e.target.value)}
                                        placeholder={isHouseholdTheme ? "e.g. Reset entryway" : "e.g. Clean kitchen"}
                                      />
                                      {theme.groups.length > 0 && (
                                        <>
                                          <label className="small-label">{isHouseholdTheme ? "Area (optional)" : "Group (optional)"}</label>
                                          <select
                                            value={editHabitGroupId}
                                            onChange={(e) => setEditHabitGroupId(e.target.value)}
                                          >
                                            <option value="">None</option>
                                            {theme.groups.map((group) => (
                                              <option key={group.id} value={group.id}>
                                                {group.name}
                                                {group.groupType === "strength_training" ? " 🏋️" : ""}
                                              </option>
                                            ))}
                                          </select>
                                        </>
                                      )}
                                      <label className="small-label">Frequency</label>
                                      <select
                                        value={editHabitFrequency}
                                        onChange={(e) => setEditHabitFrequency(e.target.value as "daily" | "weekly" | "monthly" | "none")}
                                      >
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="none">No Target</option>
                                      </select>
                                      {editHabitFrequency !== "none" && (
                                        <>
                                          <label className="small-label">Target</label>
                                          <input
                                            type="number"
                                            min={1}
                                            max={editHabitFrequency === "daily" ? 7 : editHabitFrequency === "weekly" ? 14 : 28}
                                            value={editHabitTarget}
                                            onChange={(e) =>
                                              setEditHabitTarget(
                                                parseInt(e.target.value || "0", 10)
                                              )
                                            }
                                          />
                                        </>
                                      )}
                                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateHabit(
                                              habit.id,
                                              editHabitName,
                                              editHabitTarget,
                                              editHabitFrequency,
                                              editHabitGroupId || undefined
                                            );
                                          }}
                                        >
                                          Save changes
                                        </button>
                                        <button
                                          type="button"
                                          className="secondary"
                                          onClick={cancelEditingHabit}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                )}

                                {isExpanded && editingHabitId !== habit.id && (
                                  <>
                                    <button
                                      className="habit-delete-x"
                                      onClick={() => deleteHabit(habit.id)}
                                      title="Delete habit"
                                    >
                                      ×
                                    </button>

                                    <div className="habit-main" style={{ paddingLeft: "24px" }}>
                                      <div
                                        className="habit-drag-area"
                                        draggable
                                        onDragStart={(e) => handleHabitDragStart(habit.id, e)}
                                        onDragEnd={handleHabitDragEnd}
                                        title="Drag to schedule this habit"
                                        style={{ display: "flex", alignItems: "center", gap: "6px" }}
                                      >
                                        <span className="habit-name-draggable">{habit.name}</span>
                                        <span style={{
                                          fontSize: "9px",
                                          fontWeight: 600,
                                          padding: "2px 5px",
                                          borderRadius: "3px",
                                          background: habit.frequency === "daily" ? "#fef08a" : habit.frequency === "weekly" ? "#bfdbfe" : habit.frequency === "monthly" ? "#d8b4fe" : "#e5e7eb",
                                          color: habit.frequency === "daily" ? "#713f12" : habit.frequency === "weekly" ? "#1e3a8a" : habit.frequency === "monthly" ? "#581c87" : "#374151",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.5px"
                                        }}>
                                          {habit.frequency === "daily" ? "D" : habit.frequency === "weekly" ? "W" : habit.frequency === "monthly" ? "M" : "N"}
                                        </span>
                                      </div>

                                      <div className="habit-meta">
                                        {habit.frequency === "none" ? "No target" : `Target: ${habit.targetPerWeek} / ${habit.frequency}`}
                                      </div>

                                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                        <span className="pill">
                                          Done: {habitDone}
                                          {habit.frequency !== "none" && ` / ${habit.targetPerWeek}`}
                                        </span>
                                        {habit.lastDoneAt && (
                                          <>
                                            <span style={{ fontSize: "12px", color: "#666" }}>
                                              Last: {formatTimeSince(habit.lastDoneAt)}
                                            </span>
                                            <button
                                              onClick={() => clearLastDoneAt(habit.id)}
                                              style={{
                                                fontSize: "11px",
                                                padding: "2px 6px",
                                                background: "#f0f0f0",
                                                border: "1px solid #ddd",
                                                borderRadius: "3px",
                                                cursor: "pointer",
                                                color: "#666"
                                              }}
                                              title="Clear last done timestamp"
                                            >
                                              Clear
                                            </button>
                                          </>
                                        )}
                                      </div>
                                      <div className="habit-care-panel">
                                        {choreNeed && (
                                          <div className={`household-need-tile household-need-tile--${choreNeed.className}`}>
                                            <span>Need</span>
                                            <strong>{choreNeed.label}</strong>
                                          </div>
                                        )}
                                        <div>
                                          <span>Progress</span>
                                          <strong>{habitCareSummary}</strong>
                                        </div>
                                        <div>
                                          <span>Last done</span>
                                          <strong>{habitLastDoneLabel}</strong>
                                        </div>
                                        <div>
                                          <span>Scheduled</span>
                                          <strong>{scheduledHabitCount}</strong>
                                        </div>
                                        <div>
                                          <span>Dotted</span>
                                          <strong>{intentionPlacementCount}</strong>
                                        </div>
                                        {activeIntention && activeIntention.placements.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setMobileDayIndex(activeIntention.placements[0].dayIndex);
                                              setMobileHomeView("planner");
                                            }}
                                          >
                                            View plans
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    <div className="habit-actions">
                                      <button
                                        style={{ fontSize: 12 }}
                                        onClick={() => incrementHabit(habit.id)}
                                      >
                                        Done
                                      </button>
                                      <button
                                        style={{ fontSize: 12 }}
                                        className="secondary"
                                        onClick={() => addHabitToTodayFromCare(habit)}
                                        title="Add this habit to today"
                                      >
                                        Today
                                      </button>
                                      <button
                                        style={{ fontSize: 12 }}
                                        className="secondary"
                                        onClick={() => addHabitViewToOutliner(habit, theme)}
                                        title="Open this habit in Outline"
                                      >
                                        Plan
                                      </button>
                                      <button
                                        style={{ fontSize: 12 }}
                                        className="secondary"
                                        onClick={() => { closeThemeDetails(); setNotesThemeId(theme.id); }}
                                        title="Open this theme's habit notes"
                                      >
                                        Notes
                                      </button>
                                      <button
                                        style={{ fontSize: 12 }}
                                        className="secondary"
                                        onClick={() => {
                                          const opening = planningIntentionHabitId !== habit.id;
                                          setPlanningIntentionHabitId(opening ? habit.id : null);
                                          setPlanningIntentionCount(
                                            activeIntention?.desiredCount ??
                                              (habit.frequency === "weekly" && habit.targetPerWeek > 0
                                                ? habit.targetPerWeek
                                                : 3)
                                          );
                                          setPlanningIntentionDayIndexes(activeIntention?.preferredDayIndexes ?? []);
                                        }}
                                        title="Set a weekly intention for this habit"
                                      >
                                        Intention
                                      </button>
                                      <button
                                        style={{ fontSize: 12 }}
                                        className="secondary"
                                        onClick={() => startEditingHabit(habit)}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        style={{ fontSize: 12 }}
                                        className="secondary"
                                        onClick={() =>
                                          setReshapingHabitId(reshapingHabitId === habit.id ? null : habit.id)
                                        }
                                      >
                                        Shape
                                      </button>
                                      <button
                                        style={{ fontSize: 12 }}
                                        className="secondary"
                                        onClick={() => {
                                          setAddingSubtaskForHabitId(habit.id);
                                          setNewSubtaskName("");
                                          setNewSubtaskFrequency("weekly");
                                          setNewSubtaskTarget(2);
                                        }}
                                        title="Add a subtask"
                                      >
                                        + Subtask
                                      </button>
                                    </div>

                                    {reshapingHabitId === habit.id && (
                                      <div className="shape-change-panel shape-change-panel--habit">
                                        <div>
                                          <strong>Change shape</strong>
                                          <span>Make this habit its own theme. Its subtasks and history move with it.</span>
                                        </div>
                                        <div className="shape-change-actions">
                                          <button type="button" onClick={() => makeHabitIntoTheme(habit.id)}>
                                            Make theme
                                          </button>
                                          <button
                                            type="button"
                                            className="secondary"
                                            onClick={() => setReshapingHabitId(null)}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {planningIntentionHabitId === habit.id && (
                                      <div className="habit-intention-panel">
                                        <div className="habit-intention-copy">
                                          <strong>Weekly intention</strong>
                                          <span>
                                            Choose how many times you want this on the calendar, then pick preferred days.
                                          </span>
                                        </div>
                                        <div className="habit-intention-chips">
                                          {intentionChoices.map((count) => (
                                            <button
                                              key={`${habit.id}-intention-${count}`}
                                              type="button"
                                              className={planningIntentionCount === count ? "active" : ""}
                                              onClick={() => {
                                                setPlanningIntentionCount(count);
                                              }}
                                            >
                                              {count}x
                                            </button>
                                          ))}
                                        </div>
                                        <div className="habit-intention-controls">
                                          <label>
                                            Custom
                                            <input
                                              type="number"
                                              min={1}
                                              max={14}
                                              value={planningIntentionCount}
                                              onChange={(event) =>
                                                setPlanningIntentionCount(parseInt(event.target.value || "1", 10))
                                              }
                                            />
                                          </label>
                                          <details className="habit-intention-days">
                                            <summary>
                                              Days:{" "}
                                              {planningIntentionDayIndexes.length === 0
                                                ? "Any"
                                                : planningIntentionDayIndexes
                                                    .slice()
                                                    .sort((a, b) => a - b)
                                                    .map((dayIndex) => days[dayIndex])
                                                    .join(", ")}
                                            </summary>
                                            <div className="habit-intention-day-menu">
                                              <button
                                                type="button"
                                                className={planningIntentionDayIndexes.length === 0 ? "active" : ""}
                                                onClick={() => setPlanningIntentionDayIndexes([])}
                                              >
                                                Any day
                                              </button>
                                              {days.map((day, dayIndex) => {
                                                const selected = planningIntentionDayIndexes.includes(dayIndex);
                                                return (
                                                  <button
                                                    key={`${habit.id}-intention-day-${day}`}
                                                    type="button"
                                                    className={selected ? "active" : ""}
                                                    onClick={() =>
                                                      setPlanningIntentionDayIndexes((current) =>
                                                        current.includes(dayIndex)
                                                          ? current.filter((item) => item !== dayIndex)
                                                          : [...current, dayIndex]
                                                      )
                                                    }
                                                  >
                                                    {day}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </details>
                                          <button
                                            type="button"
                                            onClick={() => placeWeeklyHabitIntentions(habitWithTheme, planningIntentionCount)}
                                          >
                                            Set intention
                                          </button>
                                          {activeIntention && (
                                            <button
                                              type="button"
                                              className="secondary"
                                              onClick={() => {
                                                persistWeeklyIntentions(
                                                  weeklyIntentions.filter((intention) => intention.habitId !== habit.id)
                                                );
                                                setPlanningIntentionHabitId(null);
                                                showToast("Intentions cleared", "info");
                                              }}
                                            >
                                              Clear
                                            </button>
                                        )}
                                      </div>
                                      {activeIntention && (
                                          <div className="habit-intention-status">
                                            <span>
                                              {activeIntention.desiredCount}x this week: {scheduledHabitCount} real, {activeIntention.placements.length} dotted.
                                            </span>
                                            <button
                                              type="button"
                                              className="secondary"
                                              onClick={() => {
                                                setMobileDayIndex(activeIntention.placements[0]?.dayIndex ?? mobileSelectedDayIndex);
                                                setMobileHomeView("planner");
                                              }}
                                            >
                                              View dotted
                                            </button>
                                          </div>
                                      )}
                                    </div>
                                  )}

                                    {(() => {
                                      const themeId = themes.find((t) =>
                                        flattenHabits(t.habits, t.name, t.id).some((h) => h.id === habit.id)
                                      )?.id;

                                      const renderSubtaskItem = (subtask: Habit, depth = 0): React.ReactNode => {
                                        const done = getHabitDoneCount(subtask.id, subtask.frequency);
                                        const target = subtask.targetPerWeek;
                                        const pct = subtask.frequency !== "none" && target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
                                        const barClass = done >= target && target > 0 ? (done > target ? "over" : "complete") : "";
                                        return (
                                          <div key={subtask.id}>
                                            <div className="subtask-item">
                                              <div className="subtask-item-row">
                                                <div className="subtask-item-info">
                                                  <span
                                                    className="subtask-drag-area"
                                                    draggable
                                                    onDragStart={(e) => handleHabitDragStart(subtask.id, e)}
                                                    onDragEnd={handleHabitDragEnd}
                                                    title={subtask.name}
                                                  >
                                                    {subtask.name}
                                                  </span>
                                                  <span className="subtask-freq-badge" style={{
                                                    background: subtask.frequency === "daily" ? "#fef08a" : subtask.frequency === "weekly" ? "#bfdbfe" : subtask.frequency === "monthly" ? "#d8b4fe" : "#e5e7eb",
                                                    color: subtask.frequency === "daily" ? "#713f12" : subtask.frequency === "weekly" ? "#1e3a8a" : subtask.frequency === "monthly" ? "#581c87" : "#374151",
                                                  }}>
                                                    {subtask.frequency === "daily" ? "D" : subtask.frequency === "weekly" ? "W" : subtask.frequency === "monthly" ? "M" : "N"}
                                                  </span>
                                                </div>
                                                {subtask.frequency !== "none" && (
                                                  <div className="subtask-progress">
                                                    <span className="subtask-fraction">{done}/{target}</span>
                                                    <div className="subtask-bar-track">
                                                      <div className={`subtask-bar-fill ${barClass}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                  </div>
                                                )}
                                                <div className="subtask-actions">
                                                  <button
                                                    className="subtask-done-btn"
                                                    onClick={() => incrementHabit(subtask.id)}
                                                    title="Mark done"
                                                  >
                                                    Done
                                                  </button>
                                                  <button
                                                    className="subtask-add-btn"
                                                    onClick={() => addHabitViewToOutliner(subtask, theme)}
                                                    title="Open this subtask in Outline"
                                                  >
                                                    Plan
                                                  </button>
                                                  {depth < 1 && (
                                                  <button
                                                    className="subtask-add-btn"
                                                    onClick={() => {
                                                      setAddingSubtaskForHabitId(subtask.id);
                                                      setNewSubtaskName("");
                                                      setNewSubtaskFrequency("weekly");
                                                      setNewSubtaskTarget(2);
                                                    }}
                                                    title="Add subtask"
                                                  >
                                                    + Sub
                                                  </button>
                                                  )}
                                                  <button
                                                    className="subtask-delete-btn"
                                                    onClick={() => deleteHabit(subtask.id)}
                                                    title="Delete subtask"
                                                  >
                                                    ×
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                            {addingSubtaskForHabitId === subtask.id && themeId && (
                                              <div className="subtask-add-form" style={{ marginLeft: 12 }}>
                                                <div className="subtask-list-label">New subtask</div>
                                                <input
                                                  type="text"
                                                  value={newSubtaskName}
                                                  onChange={(e) => setNewSubtaskName(e.target.value)}
                                                  placeholder="e.g. Warm-up squats"
                                                  className="subtask-input"
                                                  autoFocus
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter") addSubtask(subtask, themeId, newSubtaskName, newSubtaskTarget, newSubtaskFrequency);
                                                    if (e.key === "Escape") setAddingSubtaskForHabitId(null);
                                                  }}
                                                />
                                                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                                  <select
                                                    value={newSubtaskFrequency}
                                                    onChange={(e) => setNewSubtaskFrequency(e.target.value as "daily" | "weekly" | "monthly" | "none")}
                                                    style={{ fontSize: 11, padding: "2px 4px" }}
                                                  >
                                                    <option value="daily">Daily</option>
                                                    <option value="weekly">Weekly</option>
                                                    <option value="monthly">Monthly</option>
                                                    <option value="none">No Target</option>
                                                  </select>
                                                  {newSubtaskFrequency !== "none" && (
                                                    <input
                                                      type="number"
                                                      min={1}
                                                      max={newSubtaskFrequency === "daily" ? 7 : newSubtaskFrequency === "weekly" ? 14 : 28}
                                                      value={newSubtaskTarget}
                                                      onChange={(e) => setNewSubtaskTarget(parseInt(e.target.value || "1", 10))}
                                                      style={{ fontSize: 11, padding: "2px 4px", width: 48 }}
                                                    />
                                                  )}
                                                  <button type="button" style={{ fontSize: 11 }} onClick={() => addSubtask(subtask, themeId, newSubtaskName, newSubtaskTarget, newSubtaskFrequency)}>Save</button>
                                                  <button type="button" className="secondary" style={{ fontSize: 11 }} onClick={() => setAddingSubtaskForHabitId(null)}>Cancel</button>
                                                </div>
                                              </div>
                                            )}
                                            {subtask.subtasks.length > 0 && (
                                              <div className="subtask-nested-list">
                                                {subtask.subtasks.map((s) => renderSubtaskItem(s, depth + 1))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      };

                                      const subtasksCollapsed = collapsedSubtasks.has(habit.id);

                                      return (
                                        <>
                                          {habit.subtasks.length > 0 && (
                                            <div className="subtask-list">
                                              <div className="subtask-list-label subtask-list-label-row">
                                                <span>Subtasks ({habit.subtasks.length})</span>
                                                <button
                                                  className="subtask-collapse-btn"
                                                  onClick={() => toggleSubtaskCollapse(habit.id)}
                                                  title={subtasksCollapsed ? "Expand subtasks" : "Collapse subtasks"}
                                                >
                                                  <span style={{ display: "inline-block", transform: subtasksCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>▾</span>
                                                </button>
                                              </div>
                                              {!subtasksCollapsed && habit.subtasks.map((s) => renderSubtaskItem(s, 0))}
                                            </div>
                                          )}
                                          {addingSubtaskForHabitId === habit.id && themeId && (
                                            <div className="subtask-add-form">
                                              <div className="subtask-list-label">New subtask</div>
                                              <input
                                                type="text"
                                                value={newSubtaskName}
                                                onChange={(e) => setNewSubtaskName(e.target.value)}
                                                placeholder="e.g. Warm-up squats"
                                                className="subtask-input"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") addSubtask(habit, themeId, newSubtaskName, newSubtaskTarget, newSubtaskFrequency);
                                                  if (e.key === "Escape") setAddingSubtaskForHabitId(null);
                                                }}
                                              />
                                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                                <select
                                                  value={newSubtaskFrequency}
                                                  onChange={(e) => setNewSubtaskFrequency(e.target.value as "daily" | "weekly" | "monthly" | "none")}
                                                  style={{ fontSize: 11, padding: "2px 4px" }}
                                                >
                                                  <option value="daily">Daily</option>
                                                  <option value="weekly">Weekly</option>
                                                  <option value="monthly">Monthly</option>
                                                  <option value="none">No Target</option>
                                                </select>
                                                {newSubtaskFrequency !== "none" && (
                                                  <input
                                                    type="number"
                                                    min={1}
                                                    max={newSubtaskFrequency === "daily" ? 7 : newSubtaskFrequency === "weekly" ? 14 : 28}
                                                    value={newSubtaskTarget}
                                                    onChange={(e) => setNewSubtaskTarget(parseInt(e.target.value || "1", 10))}
                                                    style={{ fontSize: 11, padding: "2px 4px", width: 48 }}
                                                  />
                                                )}
                                                <button type="button" style={{ fontSize: 11 }} onClick={() => addSubtask(habit, themeId, newSubtaskName, newSubtaskTarget, newSubtaskFrequency)}>Save</button>
                                                <button type="button" className="secondary" style={{ fontSize: 11 }} onClick={() => setAddingSubtaskForHabitId(null)}>Cancel</button>
                                              </div>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            );
                          };

                          return (
                            <>
                              {ungroupedHabits.map(h => renderHabitItem(h, false))}

                              {groupsWithHabits.map(group => {
                                const isGroupExpanded = expandedGroups.has(group.id);
                                const groupDone = group.habits.reduce((sum, h) => sum + getHabitDoneCount(h.id, h.frequency), 0);
                                const groupTarget = group.habits.reduce((sum, h) => sum + (h.frequency !== "none" ? h.targetPerWeek : 0), 0);
                                return (
                                  <div key={group.id} className="habit-group-section">
                                    <button
                                      className="habit-group-header"
                                      onClick={() => toggleGroupExpanded(group.id)}
                                    >
                                      <span className="habit-group-chevron" style={{
                                        transform: isGroupExpanded ? "rotate(90deg)" : "rotate(0deg)"
                                      }}>
                                        ▶
                                      </span>
                                      <span className="habit-group-name">{group.name}</span>
                                      {group.groupType === "strength_training" && (
                                        <span className="habit-group-type-badge">Strength</span>
                                      )}
                                      <span className="habit-group-count">
                                        {group.habits.length} {isHouseholdTheme ? group.habits.length === 1 ? "chore" : "chores" : group.habits.length === 1 ? "habit" : "habits"}
                                      </span>
                                      {groupTarget > 0 && (
                                        <span className="habit-group-progress">{groupDone}/{groupTarget}</span>
                                      )}
                                    </button>
                                    {isGroupExpanded && (
                                      <div className="habit-group-children">
                                        {group.habits.map(h => renderHabitItem(h, false))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {emptyGroups.map(group => {
                                const isGroupExpanded = expandedGroups.has(group.id);
                                return (
                                  <div key={group.id} className="habit-group-section">
                                    <button
                                      className="habit-group-header"
                                      onClick={() => toggleGroupExpanded(group.id)}
                                    >
                                      <span className="habit-group-chevron" style={{
                                        transform: isGroupExpanded ? "rotate(90deg)" : "rotate(0deg)"
                                      }}>
                                        ▶
                                      </span>
                                      <span className="habit-group-name">{group.name}</span>
                                      {group.groupType === "strength_training" && (
                                        <span className="habit-group-type-badge">Strength</span>
                                      )}
                                      <span className="habit-group-count">{isHouseholdTheme ? "0 chores" : "0 habits"}</span>
                                    </button>
                                    {isGroupExpanded && (
                                      <div className="habit-group-children habit-group-empty">
                                        {isHouseholdTheme ? "No chores in this area yet" : "No habits in this group yet"}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>

                      {themeOutlineMeta && (themeOutlineMeta.outlineItems.length > 0 || themeOutlineMeta.nestedThemes.length > 0) && (
                        <div className="theme-outline-summary">
                          <div className="theme-outline-summary-header">
                            <span>Notes & Outline</span>
                            <button
                              type="button"
                              className="secondary small-btn"
                              onClick={() => {
                                setOutlinerFocusNodeId(themeOutlineMeta.nodeId);
                                setOutlinerFocusRequestKey((value) => value + 1);
                                openOverlayPanel("outliner");
                              }}
                            >
                              Open row
                            </button>
                          </div>
                          <div className="theme-outline-summary-list">
                            {themeOutlineMeta.nestedThemes.map((nestedTheme) => (
                              <button
                                type="button"
                                key={nestedTheme.nodeId}
                                className="theme-outline-summary-row theme-outline-summary-row--theme"
                                onClick={() => {
                                  setOutlinerFocusNodeId(nestedTheme.nodeId);
                                  setOutlinerFocusRequestKey((value) => value + 1);
                                  openOverlayPanel("outliner");
                                }}
                              >
                                <span>Theme</span>
                                <strong>{nestedTheme.name}</strong>
                              </button>
                            ))}
                            {themeOutlineMeta.outlineItems.map((item) => (
                              <button
                                type="button"
                                key={item.id}
                                className={`theme-outline-summary-row theme-outline-summary-row--${item.tag}`}
                                style={{ paddingLeft: `${10 + item.depth * 14}px` }}
                                onClick={() => {
                                  setOutlinerFocusNodeId(item.id);
                                  setOutlinerFocusRequestKey((value) => value + 1);
                                  openOverlayPanel("outliner");
                                }}
                              >
                                <span>{item.linkedLabel ?? (item.tag === "task" ? "Task" : item.tag === "habit" ? "Habit" : "Row")}</span>
                                <strong>{item.text}</strong>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {addingThemeId === theme.id && (
                        <div className="add-habit-form">
                          <label className="small-label">{isHouseholdTheme ? "Chore name" : "Habit name"}</label>
                          <input
                            type="text"
                            value={newThemeHabitName}
                            onChange={(e) => setNewThemeHabitName(e.target.value)}
                            placeholder={isHouseholdTheme ? "e.g. Change sheets" : "e.g. Clean kitchen"}
                          />
                          {theme.groups.length > 0 && (
                            <>
                              <label className="small-label">{isHouseholdTheme ? "Area (optional)" : "Group (optional)"}</label>
                              <select
                                value={newThemeHabitGroupId}
                                onChange={(e) => setNewThemeHabitGroupId(e.target.value)}
                              >
                                <option value="">None</option>
                                {theme.groups.map((group) => (
                                  <option key={group.id} value={group.id}>
                                    {group.name}
                                    {group.groupType === "strength_training" ? " 🏋️" : ""}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          <label className="small-label">Frequency</label>
                          <select
                            value={newThemeHabitFrequency}
                            onChange={(e) => setNewThemeHabitFrequency(e.target.value as "daily" | "weekly" | "monthly" | "none")}
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="none">No Target</option>
                          </select>
                          {newThemeHabitFrequency !== "none" && (
                            <>
                              <label className="small-label">Target</label>
                              <input
                                type="number"
                                min={1}
                                max={newThemeHabitFrequency === "daily" ? 7 : newThemeHabitFrequency === "weekly" ? 14 : 28}
                                value={newThemeHabitTarget}
                                onChange={(e) =>
                                  setNewThemeHabitTarget(
                                    parseInt(e.target.value || "0", 10)
                                  )
                                }
                              />
                            </>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button
                              type="button"
                              onClick={() => {
                                addHabitToTheme(
                                  theme.id,
                                  newThemeHabitName,
                                  newThemeHabitTarget,
                                  newThemeHabitFrequency,
                                  newThemeHabitGroupId || undefined
                                );
                                setAddingThemeId(null);
                                setNewThemeHabitName("");
                                setNewThemeHabitTarget(2);
                                setNewThemeHabitFrequency("weekly");
                                setNewThemeHabitGroupId("");
                              }}
                            >
                              Save habit
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setAddingThemeId(null);
                                setNewThemeHabitName("");
                                setNewThemeHabitTarget(2);
                                setNewThemeHabitFrequency("weekly");
                                setNewThemeHabitGroupId("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {theme.themeType === "meals" && (
                        <div style={{ marginBottom: 8 }}>
                          {["breakfast", "lunch", "dinner"].map((mType) => {
                            const typeMeals = theme.meals.filter((m) => m.meal_type === mType);
                            if (typeMeals.length === 0) return null;
                            return (
                              <div key={mType}>
                                <div className="meal-group-header">
                                  {mType.charAt(0).toUpperCase() + mType.slice(1)}
                                </div>
                                {typeMeals.map((meal) => {
                                  const hasNutrition = !!(
                                    meal.calories || meal.protein_g || meal.carbs_g || meal.fat_g || meal.vitamins_notes
                                  );
                                  return (
                                    <div key={meal.id} className="meal-item-row">
                                      <span
                                        className={`meal-type-badge meal-${mType}`}
                                      >
                                        {mType === "breakfast" ? "B" : mType === "lunch" ? "L" : "D"}
                                      </span>
                                      <span style={{ flex: 1 }}>{meal.name}</span>
                                      {hasNutrition && (
                                        <span className="meal-nutrition-dot" title="Has nutrition info" />
                                      )}
                                      <button
                                        type="button"
                                        className="secondary small-btn"
                                        style={{ fontSize: 10, padding: "1px 6px" }}
                                        onClick={() => createMealBlock(meal)}
                                        title="Add to board"
                                      >
                                        + Block
                                      </button>
                                      <button
                                        type="button"
                                        className="theme-delete-btn"
                                        onClick={() => deleteMeal(theme.id, meal.id)}
                                        title="Delete meal"
                                      >
                                        x
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}

                          {addingMealForThemeId === theme.id && (
                            <MealForm
                              userId={user.id}
                              themeId={theme.id}
                              onSaved={(meal) => addMealToTheme(theme.id, meal)}
                              onCancel={() => setAddingMealForThemeId(null)}
                            />
                          )}
                        </div>
                      )}

                      {theme.themeType !== "meals" && (
                        <ThemeGoals
                          themeId={theme.id}
                          userId={user.id}
                          groups={theme.groups}
                          habits={theme.habits.map(h => ({ id: h.id, habitGroupId: h.habitGroupId }))}
                        />
                      )}

                      {(themedBlocks.length > 0 || isDraggingBlock) && (
                        <div
                          className={`theme-blocks-zone${isDropTarget ? " theme-blocks-zone-active" : ""}`}
                          onDragOver={(e) => handleThemeDragOver(e, theme.id)}
                          onDragLeave={handleThemeDragLeave}
                          onDrop={(e) => handleThemeDrop(e, theme.id)}
                        >
                          {themedBlocks.length > 0 && (
                            <div>
                              <div className="theme-blocks-queue-header">
                                <span>Queue</span>
                                <strong>{themedBlocks.length} waiting</strong>
                              </div>
                              <div className="theme-blocks-list">
                                {themedBlocks.map((block) => (
                                  <BlockCard
                                    key={block.id}
                                    block={block}
                                    variant="themed"
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    onDelete={deleteBlockWithUndo}
                                    isStrengthTraining={isStrengthTrainingBlock}
                                    isWorkoutBlock={isWorkoutBlock}
                                    onUpdateWorkout={updateWorkoutData}
                                    onSubmitWorkout={submitWorkout}
                                    exerciseLibrary={exerciseLibrary}
                                    blockExercises={blockExercises[block.id] ?? []}
                                    exerciseHistory={exerciseHistory}
                                    workoutRoutines={workoutRoutines}
                                    workoutRoutineHistory={workoutRoutineHistory}
                                    linkedWorkoutRoutineId={workoutBlockRoutineLinks[block.id] ?? null}
                                    onAddExerciseToBlock={addExerciseToBlock}
                                    onUpdateBlockExercise={updateBlockExercise}
                                    onDeleteBlockExercise={deleteBlockExercise}
                                    onLoadWorkoutRoutine={loadWorkoutRoutineToBlock}
                                    onSaveWorkoutRoutine={saveWorkoutRoutineFromBlock}
                                    onSaveWorkoutRoutineAsNew={saveWorkoutRoutineAsNewFromBlock}
                                    onUpdateWorkoutRoutineFromBlock={updateWorkoutRoutineFromBlock}
                                    onAttachWorkoutRoutine={attachWorkoutRoutineToBlock}
                                    onDetachWorkoutRoutine={detachWorkoutRoutineFromBlock}
                                    convertingBlockId={convertingBlockId}
                                    convertFrequency={convertFrequency}
                                    convertTarget={convertTarget}
                                    convertGroupId={convertGroupId}
                                    themeGroups={theme.groups}
                                    onSetConvertingBlock={setConvertingBlockId}
                                    onSetConvertFrequency={setConvertFrequency}
                                    onSetConvertTarget={setConvertTarget}
                                    onSetConvertGroupId={setConvertGroupId}
                                    onConvertToHabit={convertBlockToHabit}
                                    onRemoveFromTheme={removeBlockFromTheme}
                                    onAddThemeBlockToToday={addThemeBlockToToday}
                                    onScheduleThemeBlock={scheduleThemeBlock}
                                    scheduleDays={days}
                                    scheduleTimeSlots={slotLabels}
                                    defaultScheduleDayIndex={todayDayIndex >= 0 ? todayDayIndex : 0}
                                    kindLabel={getBlockKindLabel(block)}
                                    relationshipChips={getBlockRelationshipChips(block)}
                                    outlineItems={getBoardOutlineItemsForBlock(block)}
                                    onToggleOutlineTask={toggleBoardOutlineTask}
                                    themeId={theme.id}
                                    themes={themes}
                                    mealPopoverBlockId={mealPopoverBlockId}
                                    onSetMealPopover={setMealPopoverBlockId}
                                    onSaveBlockNote={saveBlockNote}
                                    onAddBlockTask={addBlockTask}
                                    onToggleBlockTask={toggleBlockTask}
                                    onDeleteBlockTask={deleteBlockTask}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {isDraggingBlock && themedBlocks.length === 0 && !isDropTarget && (
                            <div className="theme-blocks-drop-hint">Drop to add block</div>
                          )}
                          {isDropTarget && themedBlocks.length === 0 && (
                            <div className="theme-blocks-drop-hint theme-blocks-drop-hint-active">Drop block here</div>
                          )}
                        </div>
                      )}
                      </div>
                    </div>
                    );
                  })}
                </div>

                <div className="add-theme-row">
                  <label className="small-label">Add a new theme</label>
                  <div className="inline">
                    <input
                      type="text"
                      placeholder="e.g. Spiritual, Social"
                      value={newThemeName}
                      onChange={(e) => setNewThemeName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addTheme(); }}
                    />
                    <select
                      value={newThemeType}
                      onChange={(e) => setNewThemeType(e.target.value as ThemeType)}
                      style={{ minWidth: 80 }}
                    >
                      <option value="habit">Habit</option>
                      <option value="household">Household</option>
                      <option value="meals">Meals</option>
                    </select>
                    <button
                      type="button"
                      className="secondary"
                      onClick={addTheme}
                    >
                      Add theme
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          </div>}

          <div className="card">
            <h3>Unscheduled blocks</h3>

            <div className="blocks-panel">
              <div className="block-input-wrapper">
                <div className="inline">
                  <input
                    id="blockLabelInput"
                    type="text"
                    placeholder="e.g. Deep clean bathroom"
                    value={blockLabel}
                    onChange={(e) => setBlockLabel(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setShowSuggestions(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        createBlock(blockLabel, false, undefined, blockHashtag);
                        setShowSuggestions(false);
                      }
                    }}
                  />
                </div>
                {showSuggestions && (
                  <EventSuggestions
                    filter={blockLabel}
                    onSelect={(s: Suggestion) => {
                      setBlockLabel(s.label);
                      setBlockHashtag(s.hashtag);
                      setShowSuggestions(false);
                    }}
                  />
                )}
              </div>
              <div className="inline" style={{ marginTop: 4 }}>
                <input
                  id="blockHashtagInput"
                  type="text"
                  placeholder="Hashtag (optional)"
                  value={blockHashtag}
                  onChange={(e) => setBlockHashtag(e.target.value)}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => createBlock(blockLabel, false, undefined, blockHashtag)}
                  disabled={dataLoading}
                >
                  Add block
                </button>
              </div>

              <div
                className="block-list waiting-drop-zone"
                style={{ marginTop: 8 }}
                onDragOver={handleWaitingDragOver}
                onDragLeave={handleWaitingDragLeave}
                onDrop={handleWaitingDrop}
              >
                {unscheduledBlocks.map((block) => (
                  <div key={block.id} className="waiting-item">
                    <BlockCard
                      block={block}
                      variant="unscheduled"
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDelete={deleteBlockWithUndo}
                      isStrengthTraining={isStrengthTrainingBlock}
                      isWorkoutBlock={isWorkoutBlock}
                      onUpdateWorkout={updateWorkoutData}
                      onSubmitWorkout={submitWorkout}
                      exerciseLibrary={exerciseLibrary}
                      blockExercises={blockExercises[block.id] ?? []}
                      exerciseHistory={exerciseHistory}
                      workoutRoutines={workoutRoutines}
                      workoutRoutineHistory={workoutRoutineHistory}
                      linkedWorkoutRoutineId={workoutBlockRoutineLinks[block.id] ?? null}
                      onAddExerciseToBlock={addExerciseToBlock}
                      onUpdateBlockExercise={updateBlockExercise}
                      onDeleteBlockExercise={deleteBlockExercise}
                      onLoadWorkoutRoutine={loadWorkoutRoutineToBlock}
                      onSaveWorkoutRoutine={saveWorkoutRoutineFromBlock}
                      onSaveWorkoutRoutineAsNew={saveWorkoutRoutineAsNewFromBlock}
                      onUpdateWorkoutRoutineFromBlock={updateWorkoutRoutineFromBlock}
                      onAttachWorkoutRoutine={attachWorkoutRoutineToBlock}
                      onDetachWorkoutRoutine={detachWorkoutRoutineFromBlock}
                      kindLabel={getBlockKindLabel(block)}
                      relationshipChips={getBlockRelationshipChips(block)}
                                    outlineItems={getBoardOutlineItemsForBlock(block)}
                                    onToggleOutlineTask={toggleBoardOutlineTask}
                      themes={themes}
                      mealPopoverBlockId={mealPopoverBlockId}
                      onSetMealPopover={setMealPopoverBlockId}
                      onSaveBlockNote={saveBlockNote}
                      onAddBlockTask={addBlockTask}
                      onToggleBlockTask={toggleBlockTask}
                      onDeleteBlockTask={deleteBlockTask}
                    />
                    <button
                      type="button"
                      className="waiting-outliner-btn"
                      onClick={() => openWaitingOutlinerParentPicker(block)}
                    >
                      {outlinerLinkedBlockIdSet.has(block.id) ? "Open Outliner" : "Send to Outliner"}
                    </button>
                    {renderWaitingOutlinerParentPicker(block)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-resize-handle" onMouseDown={handleResizeMouseDown} />

        <div className="right-column">
          {mobileHomeView === "today" && <TodayHome date={todayDate}
            anytime={dayCommitments.filter(({ node }) => node.planDate === todayDate).map(({ node, planId }) => ({ id: planId, name: node.text, canComplete: (node.tag === 'task' || node.tag === 'link') && !node.linked?.habitId && !node.linked?.routineId }))}
            blocks={todayScheduledBlocks.map(block => ({ id: block.id, name: cleanBlockLabel(block), completed: !!block.completed, time: block.location.type === "slot" ? hourlySlots[block.location.timeIndex] ?? "Any time" : "" }))}
            waiting={unscheduledBlocks.filter(block => !block.completed).map(block => ({ id: outlinerLinkedBlockNodeIdMap.get(block.id) ?? `block:${block.id}`, name: cleanBlockLabel(block) }))}
            routineWidget={user && <RoutineWidget key={user.id} userId={user.id} routines={routineTabs} onOpenOutline={routineId => {
              const node = outlineBranchItems(outlinerNodes).find(item => !item.trashedAt && item.linked?.routineId === routineId);
              if (routineId && node) viewCapturedItem(node.id); else navigateMain('themes');
            }} />}
            onDone={id => void toggleBlockCompletion(id, undefined, true)} onAnytimeDone={id => { const entry = dayCommitments.find(item => item.planId === id); if (entry) void completeAnytimeTask(entry.node.id); }} onNote={id => setTodayNoteId(dayCommitments.find(item => item.planId === id)?.node.id ?? id)} onReschedule={openTodayReschedule} onPlan={id => { const entry = dayCommitments.find(item => item.planId === id); if (entry) openPlanItem(entry.node.id, entry.node.planDate!, 'day', entry.planId); else openPlanItem(id); }} onOpenPlan={() => navigateMain("planner")} />}
          {(mobileHomeView === "planner" || mobileHomeView === "stack") && <>
            <header className="plan-toolbar"><h1>Plan</h1><div className="plan-view-tabs" role="tablist" aria-label="Plan view">{(["day", "week", "stack"] as const).map(view => <button key={view} type="button" role="tab" aria-selected={planView === view} onClick={() => selectPlanView(view)}>{view === "day" ? "Day" : view === "week" ? "Week" : "Stack"}</button>)}</div><button type="button" onClick={() => openPlanItem()}><CalendarClock size={18} /> Plan an item</button></header>
            <div className="plan-week-nav"><button type="button" onClick={() => setWeekOffset(offset => offset - 1)} aria-label="Previous week" title="Previous week"><ChevronLeft size={18} /></button><strong>{getCurrentWeekRange(weekOffset)}</strong><button type="button" onClick={() => setWeekOffset(offset => offset + 1)} aria-label="Next week" title="Next week"><ChevronRight size={18} /></button><button type="button" onClick={() => { setWeekOffset(0); setMobileDayIndex(todayDayIndex >= 0 ? todayDayIndex : (new Date().getDay() + 6) % 7); }}>This week</button></div>
            <details className="reading-outline-tray">
              <summary>Links from Outline <span>{outlinerNodeEntries.filter(({ node }) => node.tag === 'link' && !node.taskDone && normalizeReadingLink(node.readingLink)).length}</span></summary>
              <ul>{outlinerNodeEntries.filter(({ node }) => node.tag === 'link' && !node.taskDone && normalizeReadingLink(node.readingLink)).map(({ node, path }) => <li key={node.id}>
                <button type="button" className="reading-drag-handle" draggable title={`Drag ${node.text} to calendar`} aria-label={`Drag ${node.text} to calendar`} onDragStart={event => { event.dataTransfer.setData('application/outline-node-id', node.id); event.dataTransfer.setData('text/plain', `outline-link:${node.id}`); event.dataTransfer.effectAllowed = 'move'; }}><GripVertical size={20} /></button>
                <div><ReadingLinkCard link={node.readingLink!} title={node.text} /><small>{path.slice(0, -1).join(' / ') || 'Outline'}</small></div>
                <button type="button" title={`Schedule ${node.text}`} aria-label={`Schedule ${node.text}`} onClick={() => openPlanItem(node.id, selectedPlanDate, 'time')}><CalendarClock size={20} /></button>
              </li>)}</ul>
              <button type="button" onClick={() => navigateMain('themes')}>Open Outline</button>
            </details>
            {(planView === 'week' || planView === 'stack') && <WeeklySoftPlan key={selectedWeekStart}
              title={weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : getCurrentWeekRange(weekOffset)}
              entries={weeklyLooseEntries} choices={weeklyChoices} loading={outlineLoading}
              onAdd={async id => { await commitSoftPlan(id, `week:${id}:${selectedWeekStart}`, { kind: 'week', date: selectedWeekStart }); showToast('Added to the week.', 'success'); }}
              onRemove={async entry => { await commitSoftPlan(entry.node.id, entry.plan.id, { kind: 'unplanned' }); showToast('Removed from week. Kept in Outline.', 'success'); }}
              onDay={entry => openPlanItem(entry.node.id, selectedPlanDate, 'day', entry.plan.id)}
              onSchedule={entry => openPlanItem(entry.node.id, selectedPlanDate, 'time', entry.plan.id)}
              onEdit={entry => openPlanItem(entry.node.id, entry.plan.date, 'week', entry.plan.id)}
              onOpen={viewCapturedItem} />}
            {planView !== "stack" && <section className="day-commitments" id="day-commitments"><header><h2>Any time</h2><button type="button" onClick={() => openPlanItem(undefined, getWeekStartDateString(weekOffset))} title="Plan an item" aria-label="Plan an item"><Plus size={18} /></button></header>
              {dayCommitments.length === 0 && softPlanTotal === 0 && <p className="quiet-empty">Nothing here yet.</p>}
              {dayCommitments.map(({ node, planId, legacy }) => <div key={`${node.id}:${planId}`} className="day-commitment-row"><time>{new Date(`${node.planDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><button type="button" onClick={() => openPlanItem(node.id, node.planDate!, 'day', planId)}>{node.text}</button><button type="button" onClick={() => openPlanItem(node.id, node.planDate!, 'time', planId)} title="Choose a time" aria-label={`Choose a time for ${node.text}`}><CalendarClock size={18} /></button><button type="button" onClick={() => void removeDayCommitment(node.id, planId, legacy)} title="Remove day" aria-label={`Remove day for ${node.text}`}><X size={18} /></button></div>)}
              {mobileWeeklyIntentionPlacements.map(({ kind, intention, placement, title }) => <div key={`${kind}-${intention.id}-${placement.id}`} className="day-commitment-row"><time>{days[placement.dayIndex]}</time><span>{title}</span><button type="button" onClick={() => kind === "habit" ? void acceptWeeklyHabitIntention(intention.id, placement.id) : void acceptWeeklyRoutineIntention(intention.id, placement.id)}>Schedule</button><button type="button" onClick={() => kind === "habit" ? dismissWeeklyHabitIntention(intention.id, placement.id) : dismissWeeklyRoutineIntention(intention.id, placement.id)} aria-label={`Dismiss ${title}`}><X size={18} /></button></div>)}
            </section>}
            {planView === "stack" && <WeeklyStack days={stackDays} today={todayDate} selectedDay={mobileSelectedDayIndex} onSelectDay={setMobileDayIndex} themes={themes} onAdd={date => openPlanItem(undefined, date)} onOpenDay={openStackDay} />}
            <details className="plan-waiting"><summary>Waiting <span>{unscheduledBlocks.length}</span></summary>{unscheduledBlocks.length === 0 && <p className="quiet-empty">Nothing waiting.</p>}{unscheduledBlocks.map(block => <div className="day-commitment-row" key={block.id}><span>{cleanBlockLabel(block)}</span><button type="button" onClick={() => openPlanItem(outlinerLinkedBlockNodeIdMap.get(block.id) ?? `block:${block.id}`)}>Plan</button></div>)}</details>
          </>}
          <div className="mobile-use-view">
            <section className={`mobile-today-card ${mobileHomeView !== "today" ? "mobile-view-hidden" : ""}`}>
              <div className="mobile-today-heading">
                <span>{isMobileSelectedDayToday ? "Today" : "Day view"}</span>
                <strong>
                  {days[mobileSelectedDayIndex]}
                  <small>{getCurrentWeekRange(weekOffset)}</small>
                </strong>
              </div>
              <div className="mobile-day-stepper mobile-day-stepper--dark" aria-label="Move one day at a time">
                <button type="button" onClick={() => moveMobilePlannerDay(-1)}>
                  Prev day
                </button>
                <div>
                  <span>{days[mobileSelectedDayIndex]}</span>
                  <strong>{isMobileSelectedDayToday ? "Today" : getCurrentWeekRange(weekOffset)}</strong>
                </div>
                <button type="button" onClick={() => moveMobilePlannerDay(1)}>
                  Next day
                </button>
              </div>
              <div className="mobile-intention-preview mobile-intention-preview--primary">
                <button
                  type="button"
                  className="mobile-intention-preview-header mobile-intention-preview-open"
                  onClick={() => openSoftPlanPanel()}
                >
                  <span>Soft plan</span>
                  <strong>{softPlanTotal} dotted</strong>
                </button>
                {softPlanPreviewItems.length === 0 ? (
                  <button
                    type="button"
                    className="mobile-intention-preview-empty"
                    onClick={() => openSoftPlanPanel()}
                  >
                    No soft commitments yet. Open a habit and tap Intention.
                  </button>
                ) : (
                  <div className="mobile-intention-preview-list">
                    {softPlanPreviewItems.slice(0, 3).map(({ kind, intention, placement, title }) => {
                      const visibleSlotIndex =
                        viewMode === "buckets"
                          ? getBucketForHourlyIndex(placement.timeIndex)
                          : placement.timeIndex;
                      const slotLabel = slotLabels[visibleSlotIndex] ?? "Open slot";
                      return (
                        <div key={`mobile-intention-preview-${kind}-${intention.id}-${placement.id}`}>
                          <button
                            type="button"
                            className="mobile-intention-preview-main"
                            onClick={() => openSoftPlanPanel(placement.dayIndex)}
                          >
                            <strong>{title}</strong>
                            <span>{days[placement.dayIndex]} · {slotLabel} · maybe</span>
                          </button>
                          <button
                            type="button"
                            className="mobile-intention-preview-accept"
                            onClick={() =>
                              kind === "habit"
                                ? acceptWeeklyHabitIntention(intention.id, placement.id)
                                : acceptWeeklyRoutineIntention(intention.id, placement.id)
                            }
                          >
                            Make real
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="mobile-structured-now">
                <div className="mobile-structured-now-copy">
                  <span>{isMobileSelectedDayToday ? "Now" : "First open block"}</span>
                  <strong>{mobileSelectedNowBlock ? cleanBlockLabel(mobileSelectedNowBlock) : "Nothing scheduled"}</strong>
                  <em>
                    {mobileSelectedNowBlock
                      ? `${mobileSelectedNextBlocks.length + mobileSelectedLaterCount} more open this day${
                          mobileOpenTaskCount > 0
                            ? `, ${mobileOpenTaskCount} open task${mobileOpenTaskCount === 1 ? "" : "s"}`
                            : ""
                        }`
                      : unscheduledBlocks.length > 0
                        ? `${unscheduledBlocks.length} waiting`
                        : "Clear for the moment"}
                  </em>
                </div>
                {mobileSelectedNowBlock ? (
                  <div className="mobile-now-actions">
                    <button type="button" onClick={() => markBlockDone(mobileSelectedNowBlock.id)}>
                      Done
                    </button>
                    <button type="button" onClick={() => moveMobileBlockLater(mobileSelectedNowBlock.id)}>
                      Later
                    </button>
                    <button type="button" onClick={() => setMobileHomeView("planner")}>
                      Open day
                    </button>
                  </div>
                ) : (
                  <div className="mobile-now-actions">
                    <button type="button" onClick={scrollToMobileWaiting}>
                      Pick waiting
                    </button>
                    <button type="button" onClick={() => setMobileHomeView("themes")}>
                      Outline
                    </button>
                  </div>
                )}
              </div>
              <div className="mobile-structured-stats">
                <button type="button" onClick={() => setMobileHomeView("planner")}>
                  <span>Scheduled</span>
                  <strong>{mobileSelectedDoneCount}/{mobileSelectedScheduledBlocks.length}</strong>
                </button>
                <button type="button" onClick={() => openOverlayPanel("outliner")}>
                  <span>Outline due</span>
                  <strong>{mobileDueReminderCount}</strong>
                </button>
                <button type="button" onClick={scrollToMobileWaiting}>
                  <span>Waiting</span>
                  <strong>{unscheduledBlocks.length}</strong>
                </button>
              </div>
              <section className="mobile-structured-timeline">
                <div className="mobile-structured-timeline-head">
                  <div>
                    <span>Timeline</span>
                    <strong>{mobileSelectedScheduledBlocks.length || "Open day"}</strong>
                  </div>
                  <button type="button" onClick={() => setMobileHomeView("planner")}>
                    Plan
                  </button>
                </div>
                {mobileTimelinePreviewBlocks.length === 0 ? (
                  <button
                    type="button"
                    className="mobile-structured-empty"
                    onClick={scrollToMobileWaiting}
                  >
                    Nothing scheduled yet. Pick from Waiting.
                  </button>
                ) : (
                  <div className="mobile-structured-timeline-list">
                    {mobileTimelinePreviewBlocks.map((block) => {
                      const timeLabel =
                        block.location.type === "slot"
                          ? viewMode === "buckets"
                            ? bucketSlots[getBucketForHourlyIndex(block.location.timeIndex)] ?? ""
                            : hourlySlots[block.location.timeIndex] ?? ""
                          : "";
                      return (
                        <div
                          key={`mobile-structured-timeline-${block.id}`}
                          className="mobile-structured-timeline-row"
                        >
                          <button
                            type="button"
                            className={`mobile-structured-timeline-item ${block.completed ? "is-done" : ""}`}
                            onClick={() => {
                              setMobileHomeView("planner");
                              window.setTimeout(() => {
                                document.getElementById(`block-${block.id}`)?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                              }, 80);
                            }}
                          >
                            <span>{timeLabel}</span>
                            <strong>{cleanBlockLabel(block)}</strong>
                            <em>{block.completed ? "Done" : getBlockKindLabel(block)}</em>
                          </button>
                          <label
                            className="mobile-structured-timeline-check"
                            title={block.completed ? "Mark not done" : "Mark done"}
                          >
                            <input
                              type="checkbox"
                              checked={block.completed}
                              onChange={() => void toggleBlockCompletion(block.id)}
                              aria-label={`${block.completed ? "Mark not done" : "Mark done"}: ${cleanBlockLabel(block)}`}
                            />
                          </label>
                        </div>
                      );
                    })}
                    {mobileSelectedScheduledBlocks.length > mobileTimelinePreviewBlocks.length && (
                      <button
                        type="button"
                        className="mobile-structured-more"
                        onClick={() => setMobileHomeView("planner")}
                      >
                        {mobileSelectedScheduledBlocks.length - mobileTimelinePreviewBlocks.length} more later
                      </button>
                    )}
                  </div>
                )}
              </section>
              {mobileDueReminder && (
                <button
                  type="button"
                  className={`mobile-due-reminder ${mobileDueReminder.kind === "pesky" ? "mobile-due-reminder--pesky" : ""}`}
                  onClick={() => openOverlayPanel("outliner")}
                >
                  <span>{mobileDueReminder.kind === "pesky" ? "Pesky reminder" : "Reminder due"}</span>
                  <strong>{mobileDueReminder.text}</strong>
                  {mobileDueReminder.path.length > 1 && (
                    <em>{mobileDueReminder.path.slice(0, -1).join(" / ")}</em>
                  )}
                </button>
              )}
              <section className="mobile-outline-mini-pane">
                <div className="mobile-outline-mini-header">
                  <div>
                    <span>Outline</span>
                    <strong>{outlinerNodeEntries.length} rows</strong>
                  </div>
                  <button type="button" onClick={() => openOverlayPanel("outliner")}>
                    Open
                  </button>
                </div>
                {mobileOutlineMiniItems.length === 0 ? (
                  <button
                    type="button"
                    className="mobile-outline-mini-empty"
                    onClick={() => openOverlayPanel("outliner")}
                  >
                    Start a soft outline
                  </button>
                ) : (
                  <div className="mobile-outline-mini-list">
                    {mobileOutlineMiniItems.map(({ node, path }) => {
                      const parentPath = path.slice(0, -1).join(" / ");
                      const isDue =
                        !!node.reminderAt &&
                        !node.reminderDismissedAt &&
                        new Date(node.reminderAt).getTime() <= Date.now();
                      return (
                        <button
                          type="button"
                          key={`mobile-outline-mini-${node.id}`}
                          onClick={() => {
                            setOutlinerFocusNodeId(node.id);
                            setOutlinerFocusRequestKey((value) => value + 1);
                            openOverlayPanel("outliner");
                          }}
                        >
                          <span className={`mobile-outline-mini-dot mobile-outline-mini-dot--${node.tag}`} />
                          <strong>{node.text.trim()}</strong>
                          <em>{isDue ? "Due" : parentPath || node.tag}</em>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
              {mobileSelectedNextBlocks.length > 0 && (
                <div className="mobile-next-preview">
                  <span>Up next</span>
                  <div>
                    {mobileSelectedNextBlocks.map((block) => (
                      <button
                        type="button"
                        key={`mobile-next-preview-${block.id}`}
                        onClick={() => {
                          setMobileHomeView("planner");
                          window.setTimeout(() => {
                            document.getElementById(`block-${block.id}`)?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                          }, 80);
                        }}
                      >
                        {cleanBlockLabel(block)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <form
                className={`mobile-quick-add ${mobileQuickCaptureOpen ? "mobile-quick-add--open" : ""} ${mobileQuickCapturePrimed ? "mobile-quick-add--primed" : ""}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  quickCapture();
                }}
              >
                {mobileQuickCapturePrimed && (
                  <div className="mobile-quick-add-status mobile-quick-add-status--ready">
                    Quick capture ready
                  </div>
                )}
                {pendingQuickCaptures.length > 0 && (
                  <button
                    type="button"
                    className="mobile-quick-add-status mobile-quick-add-status--pending"
                    onClick={() => syncPendingQuickCaptures()}
                  >
                    {pendingQuickCaptures.length} saved on device
                  </button>
                )}
                <input
                  ref={mobileQuickCaptureInputRef}
                  type="text"
                  placeholder={`Quick ${mobileCaptureMode}...`}
                  value={blockLabel}
                  onChange={(event) => {
                    setBlockLabel(event.target.value);
                    setMobileQuickCapturePrimed(false);
                  }}
                />
                <button
                  type="button"
                  className={`mobile-quick-add-options-btn ${mobileQuickCaptureOpen ? "active" : ""}`}
                  onClick={() => {
                    triggerMobileTap();
                    setMobileMoreOpen(false);
                    setMobileQuickCaptureOpen((value) => !value);
                  }}
                  aria-label={mobileQuickCaptureOpen ? "Hide capture options" : "Show capture options"}
                >
                  +
                </button>
                {mobileQuickCaptureOpen && (
                  <div className="mobile-capture-floating-menu">
                    <div className="mobile-capture-modes" role="group" aria-label="Capture type">
                      {(["block", "note", "task"] as MobileCaptureMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={mobileCaptureMode === mode ? "active" : ""}
                          onClick={() => {
                            triggerMobileTap();
                            setMobileCaptureMode(mode);
                          }}
                        >
                          {mode === "block" ? "Block" : mode === "note" ? "Note" : "Task"}
                        </button>
                      ))}
                    </div>
                    <div className="mobile-capture-destinations" role="group" aria-label="Capture destination">
                      {([
                        { id: "waiting" as MobileCaptureDestination, label: "Waiting" },
                        { id: "today" as MobileCaptureDestination, label: isMobileSelectedDayToday ? "Today" : "This day" },
                        { id: "theme-note" as MobileCaptureDestination, label: "Theme note" },
                        { id: "habit-note" as MobileCaptureDestination, label: "Habit note" },
                      ]).map((destination) => (
                        <button
                          key={destination.id}
                          type="button"
                          className={mobileCaptureDestination === destination.id ? "active" : ""}
                          onClick={() => {
                            triggerMobileTap();
                            setMobileCaptureDestination(destination.id);
                          }}
                        >
                          {destination.label}
                        </button>
                      ))}
                    </div>
                    {mobileCaptureDestination === "theme-note" && (
                      <select
                        className="mobile-capture-theme-select"
                        value={mobileCaptureThemeId}
                        onChange={(event) => setMobileCaptureThemeId(event.target.value)}
                        aria-label="Choose theme note"
                      >
                        {themes.map((theme) => (
                          <option key={theme.id} value={theme.id}>
                            {theme.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {mobileCaptureDestination === "habit-note" && (
                      allHabits.length === 0 ? (
                        <div className="mobile-capture-empty-target">No habits yet.</div>
                      ) : (
                        <select
                          className="mobile-capture-theme-select"
                          value={mobileCaptureHabitId}
                          onChange={(event) => setMobileCaptureHabitId(event.target.value)}
                          aria-label="Choose habit note"
                        >
                          {allHabits.map((habit) => (
                            <option key={habit.id} value={habit.id}>
                              {habit.themeName} / {habit.name}
                            </option>
                          ))}
                        </select>
                      )
                    )}
                    <button type="submit" disabled={dataLoading}>
                      Add
                    </button>
                  </div>
                )}
              </form>
            </section>

            <section className={`mobile-section-card ${mobileHomeView !== "today" ? "mobile-view-hidden" : ""}`}>
              <div className="mobile-section-header">
                <span>{isMobileSelectedDayToday ? "Today" : days[mobileSelectedDayIndex]}</span>
                <strong>{mobileSelectedScheduledBlocks.length} scheduled</strong>
              </div>
              {mobileSelectedScheduledBlocks.length === 0 ? (
                <div className="mobile-empty-state">No blocks scheduled for this day.</div>
              ) : (
                <div className="mobile-block-stack">
                  {mobileSelectedScheduledBlocks.map((block) => {
                    const priority = dailyPriorities.find((p) => p.block_id === block.id);
                    const timeLabel =
                      block.location.type === "slot"
                        ? viewMode === "buckets"
                          ? bucketSlots[getBucketForHourlyIndex(block.location.timeIndex)] ?? ""
                          : hourlySlots[block.location.timeIndex] ?? ""
                        : "";
                    return (
                      <div key={`mobile-today-${block.id}`} className="mobile-block-row">
                        <span className="mobile-time-chip">{timeLabel}</span>
                        <BlockCard
                          block={block}
                          variant="slot"
                          onItemActions={openGridItemActions}
                          readingLink={getBlockReadingLink(block)}
                          onOpenOccurrenceNote={id => setTodayNoteId(`block:${id}`)}
                          openDetailsOnClick
                          mobileMode
                          onMobileMoveLater={moveMobileBlockLater}
                          onMobileMoveTomorrow={moveMobileBlockTomorrow}
                          onMobileMoveUnscheduled={moveMobileBlockToWaiting}
                          priorityRank={priority ? (priority.priority_rank as 1 | 2 | 3) : undefined}
                          hasAdjacentBelow={hasAdjacentBlockBelow(block)}
                          mealPopoverBlockId={mealPopoverBlockId}
                          editingBlockId={editingBlockId}
                          editBlockLabel={editBlockLabel}
                          creditPopoverBlockId={creditPopoverBlockId}
                          themes={themes}
                          onSetMealPopover={setMealPopoverBlockId}
                          onSetRenamingSession={(session) => setRenamingSession(session as SessionGroup)}
                          onSetSessionRenameValue={setSessionRenameValue}
                          onToggleCompletion={toggleBlockCompletion}
                          onSetCreditPopover={setCreditPopoverBlockId}
                          onSaveBlockCredits={saveBlockCredits}
                          onSetEditingBlock={setEditingBlockId}
                          onSetEditBlockLabel={setEditBlockLabel}
                          onSaveBlockEdit={saveBlockEdit}
                          onDoubleClick={handleBlockDoubleClickWithUndo}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDelete={deleteBlockWithUndo}
                          isStrengthTraining={isStrengthTrainingBlock}
                          isWorkoutBlock={isWorkoutBlock}
                          onUpdateWorkout={updateWorkoutData}
                          onSubmitWorkout={submitWorkout}
                          exerciseLibrary={exerciseLibrary}
                          blockExercises={blockExercises[block.id] ?? []}
                          exerciseHistory={exerciseHistory}
                          workoutRoutines={workoutRoutines}
                          workoutRoutineHistory={workoutRoutineHistory}
                          linkedWorkoutRoutineId={workoutBlockRoutineLinks[block.id] ?? null}
                          onAddExerciseToBlock={addExerciseToBlock}
                          onUpdateBlockExercise={updateBlockExercise}
                          onDeleteBlockExercise={deleteBlockExercise}
                          onLoadWorkoutRoutine={loadWorkoutRoutineToBlock}
                          onSaveWorkoutRoutine={saveWorkoutRoutineFromBlock}
                          onSaveWorkoutRoutineAsNew={saveWorkoutRoutineAsNewFromBlock}
                          onUpdateWorkoutRoutineFromBlock={updateWorkoutRoutineFromBlock}
                          onAttachWorkoutRoutine={attachWorkoutRoutineToBlock}
                          onDetachWorkoutRoutine={detachWorkoutRoutineFromBlock}
                          kindLabel={getBlockKindLabel(block)}
                          relationshipChips={getBlockRelationshipChips(block)}
                                    outlineItems={getBoardOutlineItemsForBlock(block)}
                                    onToggleOutlineTask={toggleBoardOutlineTask}
                          onSaveBlockNote={saveBlockNote}
                          onAddBlockTask={addBlockTask}
                          onToggleBlockTask={toggleBlockTask}
                          onDeleteBlockTask={deleteBlockTask}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={`stacked-planner-view ${mobileHomeView !== "stack" ? "mobile-view-hidden" : ""}`}>
              <div className="stacked-hero">
                <div>
                  <span>Stacked planner</span>
                  <strong>Everything in front of you</strong>
                  <em>{getCurrentWeekRange(weekOffset)}</em>
                </div>
                <button type="button" onClick={() => openOverlayPanel("outliner")}>
                  Outline
                </button>
              </div>

              <div className="stacked-week-strip" aria-label="Week overview">
                {stackWeekDays.map((day) => (
                  <button
                    key={`stack-day-${day.day}`}
                    type="button"
                    className={`${day.isSelected ? "active" : ""} ${day.isToday ? "today" : ""}`}
                    onClick={() => {
                      setMobileDayIndex(day.dayIndex);
                      setMobileHomeView("planner");
                    }}
                  >
                    <span>{day.day}</span>
                    <strong>{day.openCount}</strong>
                    <em>{day.habitCount} habit{day.habitCount === 1 ? "" : "s"}</em>
                    {day.intentionCount > 0 && <small>{day.intentionCount} dotted</small>}
                  </button>
                ))}
              </div>

              <div className="stacked-grid">
                <section className="stacked-panel stacked-panel--today">
                  <div className="stacked-panel-head">
                    <div>
                      <span>Today insert</span>
                      <strong>{stackTodayOpenBlocks.length || "Clear"}</strong>
                    </div>
                    <button type="button" onClick={() => setMobileHomeView("planner")}>
                      Day
                    </button>
                  </div>
                  {stackTodayOpenBlocks.length === 0 ? (
                    <button type="button" className="stacked-empty" onClick={scrollToMobileWaiting}>
                      No open blocks. Pull something from Waiting.
                    </button>
                  ) : (
                    <div className="stacked-list">
                      {stackTodayOpenBlocks.map((block) => (
                        <div key={`stack-today-${block.id}`} className="stacked-row">
                          <button type="button" onClick={() => markBlockDone(block.id)} aria-label={`Mark ${cleanBlockLabel(block)} done`}>
                            ✓
                          </button>
                          <div>
                            <span>{getBlockSlotLabel(block) || getBlockKindLabel(block)}</span>
                            <strong>{cleanBlockLabel(block)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="stacked-panel">
                  <div className="stacked-panel-head">
                    <div>
                      <span>Waiting insert</span>
                      <strong>{unscheduledBlocks.length}</strong>
                    </div>
                    <button type="button" onClick={scrollToMobileWaiting}>
                      Inbox
                    </button>
                  </div>
                  {stackWaitingBlocks.length === 0 ? (
                    <div className="stacked-empty">Nothing waiting.</div>
                  ) : (
                    <div className="stacked-list">
                      {stackWaitingBlocks.map((block) => (
                        <div key={`stack-waiting-${block.id}`} className="stacked-row stacked-row--waiting">
                          <button type="button" onClick={() => addWaitingBlockToToday(block.id)}>
                            +
                          </button>
                          <div>
                            <span>{getBlockKindLabel(block)}</span>
                            <strong>{cleanBlockLabel(block)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="stacked-panel">
                  <div className="stacked-panel-head">
                    <div>
                      <span>Outline insert</span>
                      <strong>{stackOutlineItems.length}</strong>
                    </div>
                    <button type="button" onClick={() => openOverlayPanel("outliner")}>
                      Open
                    </button>
                  </div>
                  {stackOutlineItems.length === 0 ? (
                    <div className="stacked-empty">No outline rows asking for attention.</div>
                  ) : (
                    <div className="stacked-list">
                      {stackOutlineItems.map(({ node, path }) => (
                        <button
                          key={`stack-outline-${node.id}`}
                          type="button"
                          className="stacked-outline-row"
                          onClick={() => {
                            setOutlinerFocusNodeId(node.id);
                            setOutlinerFocusRequestKey((value) => value + 1);
                            openOverlayPanel("outliner");
                          }}
                        >
                          <span>{path.slice(0, -1).join(" / ") || node.tag}</span>
                          <strong>{node.text.trim() || "Untitled"}</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="stacked-panel">
                  <div className="stacked-panel-head">
                    <div>
                      <span>Care inserts</span>
                      <strong>{stackHabitThemes.length + stackHouseholdThemes.length + (stackMeals.length > 0 ? 1 : 0)}</strong>
                    </div>
                    <button type="button" onClick={() => setMobileHomeView("themes")}>
                      Outline
                    </button>
                  </div>
                  <div className="stacked-care-grid">
                    {stackHabitThemes.map((theme) => (
                      <button
                        key={`stack-habit-theme-${theme.id}`}
                        type="button"
                        onClick={() => {
                          setExpandedThemes((current) => new Set([...current, theme.id]));
                          setMobileHomeView("themes");
                        }}
                      >
                        <span>{theme.name}</span>
                        <strong>{theme.done}{theme.target > 0 ? `/${theme.target}` : ""}</strong>
                      </button>
                    ))}
                    {stackHouseholdThemes.map((theme) => (
                      <button
                        key={`stack-household-theme-${theme.id}`}
                        type="button"
                        onClick={() => {
                          setExpandedThemes((current) => new Set([...current, theme.id]));
                          setMobileHomeView("themes");
                        }}
                      >
                        <span>{theme.name}</span>
                        <strong>{theme.due} due</strong>
                        <em>{theme.soon} soon</em>
                      </button>
                    ))}
                    {stackMeals.length > 0 && (
                      <button type="button" onClick={() => setMobileHomeView("themes")}>
                        <span>Meals</span>
                        <strong>{stackMeals.length} ideas</strong>
                      </button>
                    )}
                  </div>
                </section>
              </div>
            </section>

            <section className={`mobile-section-card mobile-day-planner-card ${mobileHomeView !== "planner" ? "mobile-view-hidden" : ""}`}>
              <div className="mobile-section-header">
                <span>Day planner</span>
                <div className="mobile-section-header-actions">
                  <button
                    type="button"
                    className="mobile-section-link-btn"
                    onClick={() => setMobileHomeView("themes")}
                  >
                    Outline
                  </button>
                  <strong>{days[mobileSelectedDayIndex]}</strong>
                </div>
              </div>
              <div className="mobile-day-stepper" aria-label="Move one day at a time">
                <button type="button" onClick={() => moveMobilePlannerDay(-1)}>
                  Prev day
                </button>
                <div>
                  <span>{days[mobileSelectedDayIndex]}</span>
                  <strong>{mobileSelectedDateLabel}</strong>
                </div>
                <button type="button" onClick={() => moveMobilePlannerDay(1)}>
                  Next day
                </button>
              </div>
              <div className="mobile-week-controls">
                <button type="button" onClick={() => setWeekOffset(weekOffset - 1)}>
                  Prev week
                </button>
                <button type="button" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
                  This week
                </button>
                <button type="button" onClick={() => setWeekOffset(weekOffset + 1)}>
                  Next week
                </button>
              </div>
              <div className="mobile-view-toggle">
                <button
                  type="button"
                  className={viewMode === "hourly" ? "active" : ""}
                  onClick={() => handleViewModeChange("hourly")}
                >
                  Hourly
                </button>
                <button
                  type="button"
                  className={viewMode === "buckets" ? "active" : ""}
                  onClick={() => handleViewModeChange("buckets")}
                >
                  Buckets
                </button>
              </div>
              <div className="mobile-day-tabs" role="tablist" aria-label="Choose day">
                {days.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    className={`${index === mobileSelectedDayIndex ? "active" : ""} ${
                      index === todayDayIndex ? "today" : ""
                    }`}
                    onClick={(event) => {
                      resetMobileTabViewport(event.currentTarget);
                      setMobileDayIndex(index);
                    }}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <div className="mobile-day-slots">
                {slotLabels.map((slotLabel, slotIndex) => {
                  const slotBlocks = getBlocksForSlot(mobileSelectedDayIndex, slotIndex);
                  const slotIntentionBlocks = getWeeklyIntentionPlacementsForSlot(
                    mobileSelectedDayIndex,
                    getHourlyIndexForMobileSlot(slotIndex)
                  );
                  const slotRoutineIntentionBlocks = getWeeklyRoutineIntentionPlacementsForSlot(
                    mobileSelectedDayIndex,
                    getHourlyIndexForMobileSlot(slotIndex)
                  );
                  const slotGhostBlocks = showGhostBlocks
                    ? ghostBlocks.filter(
                        (ghost) =>
                          ghost.day_index === mobileSelectedDayIndex &&
                          ghost.time_index === slotIndex
                      )
                    : [];
                  const hasSlotContent =
                    slotBlocks.length > 0 ||
                    slotGhostBlocks.length > 0 ||
                    slotIntentionBlocks.length > 0 ||
                    slotRoutineIntentionBlocks.length > 0;
                  return (
                    <div
                      key={`mobile-${mobileSelectedDayIndex}-${slotIndex}`}
                      className={`mobile-slot-card ${hasSlotContent ? "has-content" : "is-empty"}`}
                      data-mobile-drop-day-index={mobileSelectedDayIndex}
                      data-mobile-drop-time-index={slotIndex}
                      onDragOver={handleSlotDragOver}
                      onDragEnter={handleSlotDragOver}
                      onDragLeave={handleSlotDragLeave}
                      onDrop={(event) => handleSlotDrop(event, mobileSelectedDayIndex, slotIndex)}
                    >
                      <div className="mobile-slot-label">{slotLabel}</div>
                      <div className="mobile-slot-content">
                        <div className="slot-quick-actions mobile-slot-quick-actions" aria-label={`Add to ${slotLabel}`}>
                          <button type="button" onClick={() => openSlotCapture(mobileSelectedDayIndex, slotIndex, "task")}>
                            Task
                          </button>
                          <button type="button" onClick={() => openSlotCapture(mobileSelectedDayIndex, slotIndex, "note")}>
                            Note
                          </button>
                        </div>
                        {renderSlotCaptureComposer(mobileSelectedDayIndex, slotIndex)}
                        {!hasSlotContent && (
                          <button
                            type="button"
                            className="mobile-slot-add-btn"
                            aria-label="Add from Outline"
                            title="Add from Outline"
                            onClick={() =>
                              openMobileHabitPickerForSlot(
                                mobileSelectedDayIndex,
                                getHourlyIndexForMobileSlot(slotIndex)
                              )
                            }
                          >
                            +
                          </button>
                        )}
                        {slotBlocks.map((block) => {
                          const priority = dailyPriorities.find((p) => p.block_id === block.id);
                          return (
                            <BlockCard
                              key={block.id}
                              block={block}
                              variant="slot"
                              onItemActions={openGridItemActions}
                              readingLink={getBlockReadingLink(block)}
                              onOpenOccurrenceNote={id => setTodayNoteId(`block:${id}`)}
                              openDetailsOnClick
                              mobileMode
                              onMobileMoveLater={moveMobileBlockLater}
                              onMobileMoveTomorrow={moveMobileBlockTomorrow}
                              onMobileMoveUnscheduled={moveMobileBlockToWaiting}
                              onMobileDrop={handleMobileBlockDrop}
                              priorityRank={priority ? (priority.priority_rank as 1 | 2 | 3) : undefined}
                              hasAdjacentBelow={hasAdjacentBlockBelow(block)}
                              mealPopoverBlockId={mealPopoverBlockId}
                              editingBlockId={editingBlockId}
                              editBlockLabel={editBlockLabel}
                              creditPopoverBlockId={creditPopoverBlockId}
                              themes={themes}
                              onSetMealPopover={setMealPopoverBlockId}
                              onSetRenamingSession={(session) => setRenamingSession(session as SessionGroup)}
                              onSetSessionRenameValue={setSessionRenameValue}
                              onToggleCompletion={toggleBlockCompletion}
                              onSetCreditPopover={setCreditPopoverBlockId}
                              onSaveBlockCredits={saveBlockCredits}
                              onSetEditingBlock={setEditingBlockId}
                              onSetEditBlockLabel={setEditBlockLabel}
                              onSaveBlockEdit={saveBlockEdit}
                              onDoubleClick={handleBlockDoubleClickWithUndo}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              onDelete={deleteBlockWithUndo}
                              isStrengthTraining={isStrengthTrainingBlock}
                              isWorkoutBlock={isWorkoutBlock}
                              onUpdateWorkout={updateWorkoutData}
                              onSubmitWorkout={submitWorkout}
                              exerciseLibrary={exerciseLibrary}
                              blockExercises={blockExercises[block.id] ?? []}
                              exerciseHistory={exerciseHistory}
                              workoutRoutines={workoutRoutines}
                              workoutRoutineHistory={workoutRoutineHistory}
                              linkedWorkoutRoutineId={workoutBlockRoutineLinks[block.id] ?? null}
                              onAddExerciseToBlock={addExerciseToBlock}
                              onUpdateBlockExercise={updateBlockExercise}
                              onDeleteBlockExercise={deleteBlockExercise}
                              onLoadWorkoutRoutine={loadWorkoutRoutineToBlock}
                              onSaveWorkoutRoutine={saveWorkoutRoutineFromBlock}
                              onSaveWorkoutRoutineAsNew={saveWorkoutRoutineAsNewFromBlock}
                              onUpdateWorkoutRoutineFromBlock={updateWorkoutRoutineFromBlock}
                              onAttachWorkoutRoutine={attachWorkoutRoutineToBlock}
                              onDetachWorkoutRoutine={detachWorkoutRoutineFromBlock}
                              kindLabel={getBlockKindLabel(block)}
                              relationshipChips={getBlockRelationshipChips(block)}
                                    outlineItems={getBoardOutlineItemsForBlock(block)}
                                    onToggleOutlineTask={toggleBoardOutlineTask}
                              onSaveBlockNote={saveBlockNote}
                              onAddBlockTask={addBlockTask}
                              onToggleBlockTask={toggleBlockTask}
                              onDeleteBlockTask={deleteBlockTask}
                            />
                          );
                        })}
                        {hasSlotContent && (
                          <button
                            type="button"
                            className="mobile-slot-add-btn mobile-slot-add-btn--compact"
                            aria-label="Add from Outline"
                            title="Add from Outline"
                            onClick={() =>
                              openMobileHabitPickerForSlot(
                                mobileSelectedDayIndex,
                                getHourlyIndexForMobileSlot(slotIndex)
                              )
                            }
                          >
                            +
                          </button>
                        )}
                        {slotIntentionBlocks.map(({ intention, placement }) => (
                          <GhostBlock
                            key={`mobile-intention-${intention.id}-${placement.id}`}
                            label={`Habit: ${intention.habitName}`}
                            badgeLabel="Plan"
                            variant="intention"
                            onAccept={() => acceptWeeklyHabitIntention(intention.id, placement.id)}
                            onDismiss={() => dismissWeeklyHabitIntention(intention.id, placement.id)}
                          />
                        ))}
                        {slotRoutineIntentionBlocks.map(({ intention, placement }) => (
                          <GhostBlock
                            key={`mobile-routine-intention-${intention.id}-${placement.id}`}
                            label={`Routine: ${intention.routineName}`}
                            badgeLabel="Plan"
                            variant="intention"
                            onAccept={() => acceptWeeklyRoutineIntention(intention.id, placement.id)}
                            onDismiss={() => dismissWeeklyRoutineIntention(intention.id, placement.id)}
                          />
                        ))}
                        {slotGhostBlocks.map((ghost, index) => (
                          <GhostBlock
                            key={`mobile-ghost-${mobileSelectedDayIndex}-${slotIndex}-${index}`}
                            label={ghost.label}
                            confidenceScore={ghost.confidence_score}
                            onAccept={() => handleAcceptGhostBlock(ghost)}
                            onDismiss={() => handleDismissGhostBlock(ghost)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section
              id="mobile-waiting-section"
              className={`mobile-section-card mobile-inbox-card ${mobileHomeView !== "planner" ? "mobile-view-hidden" : ""}`}
              data-mobile-drop-waiting
              onDragOver={handleWaitingDragOver}
              onDragLeave={handleWaitingDragLeave}
              onDrop={handleWaitingDrop}
            >
              <div className="mobile-section-header">
                <span>Inbox</span>
                <strong>{unscheduledBlocks.length} waiting</strong>
              </div>
              {unscheduledBlocks.length === 0 ? (
                <div className="mobile-empty-state">No waiting items.</div>
              ) : (
                <div className="mobile-unscheduled-scroll">
                  {unscheduledBlocks.map((block) => (
                    <div key={`mobile-waiting-${block.id}`} className="mobile-waiting-item">
                      <BlockCard
                        block={block}
                        variant="unscheduled"
                        openDetailsOnClick
                        mobileMode
                        onMobileScheduleToday={addWaitingBlockToToday}
                        onMobileOpenOutliner={() => openWaitingOutlinerParentPicker(block)}
                        mobileOutlinerActionLabel={outlinerLinkedBlockIdSet.has(block.id) ? "View in Outline" : "Add to Outline"}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDelete={deleteBlockWithUndo}
                        isStrengthTraining={isStrengthTrainingBlock}
                        isWorkoutBlock={isWorkoutBlock}
                        onUpdateWorkout={updateWorkoutData}
                        onSubmitWorkout={submitWorkout}
                        exerciseLibrary={exerciseLibrary}
                        blockExercises={blockExercises[block.id] ?? []}
                        exerciseHistory={exerciseHistory}
                        workoutRoutines={workoutRoutines}
                        workoutRoutineHistory={workoutRoutineHistory}
                        linkedWorkoutRoutineId={workoutBlockRoutineLinks[block.id] ?? null}
                        onAddExerciseToBlock={addExerciseToBlock}
                        onUpdateBlockExercise={updateBlockExercise}
                        onDeleteBlockExercise={deleteBlockExercise}
                        onLoadWorkoutRoutine={loadWorkoutRoutineToBlock}
                        onSaveWorkoutRoutine={saveWorkoutRoutineFromBlock}
                        onSaveWorkoutRoutineAsNew={saveWorkoutRoutineAsNewFromBlock}
                        onUpdateWorkoutRoutineFromBlock={updateWorkoutRoutineFromBlock}
                        onAttachWorkoutRoutine={attachWorkoutRoutineToBlock}
                        onDetachWorkoutRoutine={detachWorkoutRoutineFromBlock}
                        kindLabel={getBlockKindLabel(block)}
                        relationshipChips={getBlockRelationshipChips(block)}
                                    outlineItems={getBoardOutlineItemsForBlock(block)}
                                    onToggleOutlineTask={toggleBoardOutlineTask}
                        themes={themes}
                        mealPopoverBlockId={mealPopoverBlockId}
                        onSetMealPopover={setMealPopoverBlockId}
                        onSaveBlockNote={saveBlockNote}
                        onAddBlockTask={addBlockTask}
                        onToggleBlockTask={toggleBlockTask}
                        onDeleteBlockTask={deleteBlockTask}
                      />
                      {renderWaitingOutlinerParentPicker(block)}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {mobileMoreOpen && (
              <div className="mobile-more-menu" role="menu" aria-label="More mobile views">
                <button
                  type="button"
                  role="menuitem"
                  className={showAmbientMode ? "active" : ""}
                  onClick={(event) => handleMobileAmbientNav(event)}
                >
                  <strong>Ambient</strong>
                  <span>Calm mode</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={showRoutineNotes ? "active" : ""}
                  onClick={(event) => handleMobileOverlayNav("routines", event)}
                >
                  <strong>Routine</strong>
                  <span>Checklists</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={showWorkoutLibrary ? "active" : ""}
                  onClick={(event) => handleMobileOverlayNav("workout", event)}
                >
                  <strong>Workout</strong>
                  <span>Routines + library</span>
                </button>
              </div>
            )}

            <nav className="mobile-bottom-nav" aria-label="Mobile planner navigation">
              <button
                type="button"
                data-overlay-toggle="true"
                className={mobileHomeView === "today" ? "active" : ""}
                onClick={(event) => handleMobileHomeNav("today", event)}
              >
                <span>Today</span>
              </button>
              <button
                type="button"
                data-overlay-toggle="true"
                className={mobileHomeView === "stack" ? "active" : ""}
                onClick={(event) => handleMobileHomeNav("stack", event)}
              >
                <span>Stack</span>
              </button>
              <button
                type="button"
                data-overlay-toggle="true"
                className={mobileHomeView === "planner" ? "active" : ""}
                onClick={(event) => handleMobileHomeNav("planner", event)}
              >
                <span>Plan</span>
              </button>
              <button
                type="button"
                data-overlay-toggle="true"
                className={mobileHomeView === "themes" ? "active" : ""}
                onClick={(event) => handleMobileHomeNav("themes", event)}
              >
                <span>Outline</span>
              </button>
              <button
                type="button"
                data-overlay-toggle="true"
                className={mobileMoreOpen || showAmbientMode || showRoutineNotes || showWorkoutLibrary ? "active" : ""}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  resetMobileTabViewport(event.currentTarget);
                  setMobileMoreOpen((value) => !value);
                }}
              >
                <span>More</span>
              </button>
            </nav>
          </div>

          <div className="desktop-surface-switch" aria-label="Choose main planner view">
            <div>
              <span>Main view</span>
              <strong>{desktopPlannerSurface === "stack" ? "Stacked planner desk" : "Weekly planner"}</strong>
            </div>
            <div className="desktop-surface-switch-actions">
              <button
                type="button"
                className={desktopPlannerSurface === "stack" ? "active" : ""}
                onClick={() => setDesktopPlannerSurface("stack")}
              >
                Stack
              </button>
              <button
                type="button"
                className={desktopPlannerSurface === "week" ? "active" : ""}
                onClick={() => setDesktopPlannerSurface("week")}
              >
                Weekly
              </button>
            </div>
          </div>

          <div className="soft-plan-callout">
            <div>
              <span>Soft plan</span>
              <strong>{softPlanTotal} dotted intention{softPlanTotal === 1 ? "" : "s"}</strong>
              <em>
                {softPlanTotal > 0
                  ? "Maybe anchors for the week. Make them real when they feel right."
                  : "No soft commitments yet. Use a habit or routine Intention button to place dotted maybes."}
              </em>
            </div>
            <button
              type="button"
              onClick={() => openSoftPlanPanel()}
            >
              Open
            </button>
          </div>

          <div className={`card planner-controls-card ${desktopPlannerSurface !== "week" ? "desktop-surface-hidden" : ""}`}>
            <div className="top-row">
              <h2>Weekly Planner</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  title="Previous week"
                  aria-label="Previous week"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setWeekOffset(0)}
                  title="Go to current week"
                  aria-label="Go to current week"
                  disabled={weekOffset === 0}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  title="Next week"
                  aria-label="Next week"
                >
                  →
                </button>
                <span className="weekly-label">{getCurrentWeekRange(weekOffset)}</span>
                {weekOffset !== 0 && (
                  <span style={{ fontSize: "12px", color: "#666" }}>
                    ({weekOffset > 0 ? `+${weekOffset}` : weekOffset} week{Math.abs(weekOffset) !== 1 ? 's' : ''})
                  </span>
                )}
                <div className="planner-day-stepper" aria-label="Move one day at a time">
                  <button
                    type="button"
                    className="secondary small-btn"
                    onClick={() => moveMobilePlannerDay(-1)}
                    title="Previous day"
                  >
                    Prev day
                  </button>
                  <span>{days[mobileSelectedDayIndex]}</span>
                  <button
                    type="button"
                    className="secondary small-btn"
                    onClick={() => moveMobilePlannerDay(1)}
                    title="Next day"
                  >
                    Next day
                  </button>
                </div>
                <button
                  type="button"
                  className="copy-week-btn"
                  onClick={copyLastWeek}
                  title="Copy blocks from previous week"
                >
                  Copy last week
                </button>
                <div className="planning-menu-wrap">
                  <button
                    type="button"
                    className="copy-week-btn planning-menu-trigger"
                    onClick={() => setShowPlanningMenu((value) => !value)}
                    title="Open planning tools"
                  >
                    Planning
                  </button>
                  {showPlanningMenu && (
                    <div className="planning-menu">
                      <button
                        type="button"
                        onClick={() => {
                          openSmartWeeklySetup();
                          setShowPlanningMenu(false);
                        }}
                      >
                        <strong>Smart Setup</strong>
                        <span>Build this week from suggestions</span>
                      </button>
                      <button
                        type="button"
                        onClick={openAmbientMode}
                      >
                        <strong>Ambient Mode</strong>
                        <span>Open a calm routine, task, and quick note view</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuickStartModal(true);
                          setShowPlanningMenu(false);
                        }}
                      >
                        <strong>Quick Start</strong>
                        <span>Create from reusable templates</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toggleOverlayPanel("workout");
                          setShowPlanningMenu(false);
                        }}
                      >
                        <strong>{showWorkoutLibrary ? "Hide Workout Library" : "Show Workout Library"}</strong>
                        <span>Pick exercises, start workouts, and save routines</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toggleOverlayPanel("routines");
                          setShowPlanningMenu(false);
                        }}
                      >
                        <strong>{showRoutineNotes ? "Hide Routines" : "Show Routines"}</strong>
                        <span>Open routine notes and checklists</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toggleOverlayPanel("outliner");
                          setShowPlanningMenu(false);
                        }}
                      >
                        <strong>Open Outline</strong>
                        <span>Plan with nested collapsible rows</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowGhostBlocks((value) => !value);
                          setShowPlanningMenu(false);
                        }}
                      >
                        <strong>{showGhostBlocks ? "Hide Suggestions" : "Show Suggestions"}</strong>
                        <span>Toggle ghost blocks on the calendar</span>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="copy-week-btn"
                  onClick={() => setShowAnalytics(true)}
                  title="View habit analytics"
                  style={{ background: '#0f172a', color: 'white', border: 'none' }}
                >
                  Analytics
                </button>
                <button
                  type="button"
                  className="copy-week-btn"
                  onClick={() => setShowQuickHabit((v) => !v)}
                  title="Quick add habit"
                  style={{ background: showQuickHabit ? '#2563eb' : undefined, color: showQuickHabit ? 'white' : undefined, border: showQuickHabit ? 'none' : undefined }}
                >
                  + Habit
                </button>
              </div>
            </div>

            <div className="view-toggle">
              <span className="small-label">View:</span>
              <label>
                <input
                  type="radio"
                  value="hourly"
                  checked={viewMode === "hourly"}
                  onChange={() => handleViewModeChange("hourly")}
                />
                Hourly
              </label>
              <label>
                <input
                  type="radio"
                  value="buckets"
                  checked={viewMode === "buckets"}
                  onChange={() => handleViewModeChange("buckets")}
                />
                Buckets
              </label>

              {viewMode === "buckets" && (
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setShowBucketConfig((prev) => !prev)}
                >
                  {showBucketConfig ? "Hide bucket settings" : "Customize buckets"}
                </button>
              )}
            </div>

            {viewMode === "buckets" && showBucketConfig && (
              <div className="bucket-config">
                {bucketSlots.map((name, idx) => (
                  <div key={idx} className="bucket-row">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => updateBucketName(idx, e.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary small-btn"
                      onClick={() => deleteBucket(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={addBucket}
                  style={{ marginTop: 4 }}
                >
                  Add bucket
                </button>
              </div>
            )}
          </div>

          <section className={`stacked-planner-desktop ${desktopPlannerSurface !== "stack" ? "desktop-surface-hidden" : ""}`}>
            <div className="stacked-hero">
              <div>
                <span>Stacked planner desk</span>
                <strong>Today, week, waiting, outline, and care in one view</strong>
                <em>{getCurrentWeekRange(weekOffset)}</em>
              </div>
              <div className="stacked-hero-actions">
                <button type="button" onClick={() => openOverlayPanel("outliner")}>
                  Outline
                </button>
                <button type="button" onClick={scrollToMobileWaiting}>
                  Waiting
                </button>
                <button type="button" onClick={() => setDesktopPlannerSurface("week")}>
                  Weekly
                </button>
              </div>
            </div>

            <div className="stacked-week-strip" aria-label="Week overview">
              {stackWeekDays.map((day) => (
                <button
                  key={`desktop-stack-day-${day.day}`}
                  type="button"
                  className={`${day.isSelected ? "active" : ""} ${day.isToday ? "today" : ""}`}
                  onClick={() => setMobileDayIndex(day.dayIndex)}
                >
                  <span>{day.day}</span>
                  <strong>{day.openCount}</strong>
                  <em>{day.scheduledCount} total</em>
                  {day.intentionCount > 0 && <small>{day.intentionCount} dotted</small>}
                </button>
              ))}
            </div>

            <div className="stacked-grid stacked-grid--desktop">
              <section className="stacked-panel stacked-panel--soft-plan">
                <div className="stacked-panel-head">
                  <div>
                    <span>Soft plan</span>
                    <strong>{softPlanTotal} dotted</strong>
                  </div>
                  <div className="stacked-panel-head-actions">
                    <button type="button" onClick={() => openSoftPlanPanel()}>
                      Open
                    </button>
                    <button type="button" onClick={() => setDesktopPlannerSurface("week")}>
                      Grid
                    </button>
                  </div>
                </div>
                {softPlanPreviewItems.length === 0 ? (
                  <div className="stacked-empty">No soft commitments yet.</div>
                ) : (
                  <div className="stacked-list">
                    {softPlanPreviewItems.map(({ kind, intention, placement, title, detail }) => {
                      const visibleSlotIndex =
                        viewMode === "buckets"
                          ? getBucketForHourlyIndex(placement.timeIndex)
                          : placement.timeIndex;
                      const slotLabel = slotLabels[visibleSlotIndex] ?? "Open slot";
                      return (
                        <div
                          key={`desktop-soft-plan-${kind}-${intention.id}-${placement.id}`}
                          className="stacked-row stacked-row--soft-plan"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              kind === "habit"
                                ? acceptWeeklyHabitIntention(intention.id, placement.id)
                                : acceptWeeklyRoutineIntention(intention.id, placement.id)
                            }
                            aria-label={`Make ${title} real`}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="stacked-row-main"
                            onClick={() => openSoftPlanPanel(placement.dayIndex)}
                          >
                            <span>{days[placement.dayIndex]} · {slotLabel} · {detail}</span>
                            <strong>{title}</strong>
                          </button>
                          <button
                            type="button"
                            className="stacked-row-dismiss"
                            onClick={() =>
                              kind === "habit"
                                ? dismissWeeklyHabitIntention(intention.id, placement.id)
                                : dismissWeeklyRoutineIntention(intention.id, placement.id)
                            }
                            aria-label={`Dismiss ${title} intention`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="stacked-panel stacked-panel--today">
                <div className="stacked-panel-head">
                  <div>
                    <span>Today insert</span>
                    <strong>{stackTodayOpenBlocks.length || "Clear"}</strong>
                  </div>
                </div>
                {stackTodayOpenBlocks.length === 0 ? (
                  <div className="stacked-empty">No open blocks for today.</div>
                ) : (
                  <div className="stacked-list">
                    {stackTodayOpenBlocks.map((block) => (
                      <div key={`desktop-stack-today-${block.id}`} className="stacked-row">
                        <button type="button" onClick={() => markBlockDone(block.id)} aria-label={`Mark ${cleanBlockLabel(block)} done`}>
                          ✓
                        </button>
                        <div>
                          <span>{getBlockSlotLabel(block) || getBlockKindLabel(block)}</span>
                          <strong>{cleanBlockLabel(block)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="stacked-panel">
                <div className="stacked-panel-head">
                  <div>
                    <span>Waiting insert</span>
                    <strong>{unscheduledBlocks.length}</strong>
                  </div>
                </div>
                {stackWaitingBlocks.length === 0 ? (
                  <div className="stacked-empty">Nothing waiting.</div>
                ) : (
                  <div className="stacked-list">
                    {stackWaitingBlocks.map((block) => (
                      <div key={`desktop-stack-waiting-${block.id}`} className="stacked-row stacked-row--waiting">
                        <button type="button" onClick={() => addWaitingBlockToToday(block.id)}>
                          +
                        </button>
                        <div>
                          <span>{getBlockKindLabel(block)}</span>
                          <strong>{cleanBlockLabel(block)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="stacked-panel">
                <div className="stacked-panel-head">
                  <div>
                    <span>Outline insert</span>
                    <strong>{stackOutlineItems.length}</strong>
                  </div>
                </div>
                {stackOutlineItems.length === 0 ? (
                  <div className="stacked-empty">No outline rows asking for attention.</div>
                ) : (
                  <div className="stacked-list">
                    {stackOutlineItems.map(({ node, path }) => (
                      <button
                        key={`desktop-stack-outline-${node.id}`}
                        type="button"
                        className="stacked-outline-row"
                        onClick={() => {
                          setOutlinerFocusNodeId(node.id);
                          setOutlinerFocusRequestKey((value) => value + 1);
                          openOverlayPanel("outliner");
                        }}
                      >
                        <span>{path.slice(0, -1).join(" / ") || node.tag}</span>
                        <strong>{node.text.trim() || "Untitled"}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="stacked-panel">
                <div className="stacked-panel-head">
                  <div>
                    <span>Care inserts</span>
                    <strong>{stackHabitThemes.length + stackHouseholdThemes.length + (stackMeals.length > 0 ? 1 : 0)}</strong>
                  </div>
                </div>
                <div className="stacked-care-grid">
                  {stackHabitThemes.map((theme) => (
                    <button
                      key={`desktop-stack-habit-theme-${theme.id}`}
                      type="button"
                      onClick={() => {
                        setExpandedThemes((current) => new Set([...current, theme.id]));
                      }}
                    >
                      <span>{theme.name}</span>
                      <strong>{theme.done}{theme.target > 0 ? `/${theme.target}` : ""}</strong>
                    </button>
                  ))}
                  {stackHouseholdThemes.map((theme) => (
                    <button
                      key={`desktop-stack-household-theme-${theme.id}`}
                      type="button"
                      onClick={() => {
                        setExpandedThemes((current) => new Set([...current, theme.id]));
                      }}
                    >
                      <span>{theme.name}</span>
                      <strong>{theme.due} due</strong>
                      <em>{theme.soon} soon</em>
                    </button>
                  ))}
                  {stackMeals.length > 0 && (
                    <button type="button">
                      <span>Meals</span>
                      <strong>{stackMeals.length} ideas</strong>
                    </button>
                  )}
                </div>
              </section>
            </div>
          </section>

          <div className={`planner-wrapper desktop-planner-wrapper ${desktopPlannerSurface !== "week" ? "desktop-surface-hidden" : ""}`}>
            <table className="planner">
              <colgroup>
                <col style={{ width: "60px" }} />
                {days.map((_, idx) => {
                  const cat = colCategory(idx);
                  const w = cat === "past" ? "38px" : cat === "future" ? "110px" : cat === "today" ? "140px" : undefined;
                  return <col key={idx} style={w ? { width: w } : undefined} />;
                })}
              </colgroup>
              <thead>
                <tr>
                  <th className="time-col">Time</th>
                  {days.map((day, idx) => {
                    const cat = colCategory(idx);
                    const isPast = cat === "past";
                    const currentWidth = getDayColumnWidth(idx);
                    return (
                      <th
                        key={day}
                        className={`col-${cat} ${idx === mobileSelectedDayIndex ? "col-selected-day" : ""} day-header`}
                        onClick={isPast ? () => toggleColExpanded(idx) : undefined}
                        title={isPast ? `${day} — click to expand` : undefined}
                        style={isPast ? { cursor: "pointer" } : undefined}
                      >
                        <span className="day-header-content">
                          {isPast ? (
                            <span className="past-col-header">
                              <span className="past-col-initial">{day[0]}</span>
                              <span className="past-col-expand-icon">›</span>
                            </span>
                          ) : (
                            day
                          )}
                        </span>
                        <span
                          className="day-col-resize-handle"
                          title={`Resize ${day}`}
                          onMouseDown={(e) => handleDayResizeMouseDown(idx, currentWidth, e)}
                          aria-hidden="true"
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <MoodTracker
                  userId={user!.id}
                  weekStartDate={getWeekStartDateString(weekOffset)}
                  days={days}
                  todayDayIndex={todayDayIndex}
                  colCategory={colCategory}
                />
                <DailyEssentials
                  userId={user!.id}
                  weekStartDate={getWeekStartDateString(weekOffset)}
                  days={days}
                  todayDayIndex={todayDayIndex}
                  colCategory={colCategory}
                />
                {slotLabels.map((slotLabel, slotIndex) => (
                  <tr key={slotLabel + slotIndex}>
                    <th className="time-col">{slotLabel}</th>
                    {days.map((_, dayIndex) => {
                      const slotBlocks = getBlocksForSlot(dayIndex, slotIndex);
                      const slotIntentionBlocks = getWeeklyIntentionPlacementsForSlot(
                        dayIndex,
                        getHourlyIndexForMobileSlot(slotIndex)
                      );
                      const slotRoutineIntentionBlocks = getWeeklyRoutineIntentionPlacementsForSlot(
                        dayIndex,
                        getHourlyIndexForMobileSlot(slotIndex)
                      );
                      return (
                        <td
                          key={`${dayIndex}-${slotIndex}`}
                          className={`slot col-${colCategory(dayIndex)} ${dayIndex === mobileSelectedDayIndex ? "col-selected-day" : ""}`}
                          onDragOver={handleSlotDragOver}
                          onDragEnter={handleSlotDragOver}
                          onDragLeave={handleSlotDragLeave}
                          onDrop={(e) =>
                            handleSlotDrop(e, dayIndex, slotIndex)
                          }
                        >
                          <div className="slot-inner">
                            <div className="slot-quick-actions" aria-label={`Add to ${days[dayIndex]} ${slotLabel}`}>
                              <button type="button" onClick={() => openSlotCapture(dayIndex, slotIndex, "task")}>
                                Task
                              </button>
                              <button type="button" onClick={() => openSlotCapture(dayIndex, slotIndex, "note")}>
                                Note
                              </button>
                            </div>
                            {renderSlotCaptureComposer(dayIndex, slotIndex)}
                            {slotBlocks.map((block) => {
                              const priority = dailyPriorities.find(p => p.block_id === block.id);
                              return (
                                <BlockCard
                                  key={block.id}
                                  block={block}
                                  variant="slot"
                                  onItemActions={openGridItemActions}
                                  readingLink={getBlockReadingLink(block)}
                                  onOpenOccurrenceNote={id => setTodayNoteId(`block:${id}`)}
                                  priorityRank={priority ? (priority.priority_rank as 1 | 2 | 3) : undefined}
                                  hasAdjacentBelow={hasAdjacentBlockBelow(block)}
                                  mealPopoverBlockId={mealPopoverBlockId}
                                  editingBlockId={editingBlockId}
                                  editBlockLabel={editBlockLabel}
                                  creditPopoverBlockId={creditPopoverBlockId}
                                  themes={themes}
                                  onSetMealPopover={setMealPopoverBlockId}
                                  onSetRenamingSession={(session) => setRenamingSession(session as SessionGroup)}
                                  onSetSessionRenameValue={setSessionRenameValue}
                                  onToggleCompletion={toggleBlockCompletion}
                                  onSetCreditPopover={setCreditPopoverBlockId}
                                  onSaveBlockCredits={saveBlockCredits}
                                  onSetEditingBlock={setEditingBlockId}
                                  onSetEditBlockLabel={setEditBlockLabel}
                                  onSaveBlockEdit={saveBlockEdit}
                                  onDoubleClick={handleBlockDoubleClickWithUndo}
                                  onDragStart={handleDragStart}
                                  onDragEnd={handleDragEnd}
                                  onDelete={deleteBlockWithUndo}
                                  isStrengthTraining={isStrengthTrainingBlock}
                                  isWorkoutBlock={isWorkoutBlock}
                                  onUpdateWorkout={updateWorkoutData}
                                  onSubmitWorkout={submitWorkout}
                                  exerciseLibrary={exerciseLibrary}
                                  blockExercises={blockExercises[block.id] ?? []}
                                  exerciseHistory={exerciseHistory}
                                  workoutRoutines={workoutRoutines}
                                  workoutRoutineHistory={workoutRoutineHistory}
                                  linkedWorkoutRoutineId={workoutBlockRoutineLinks[block.id] ?? null}
                                  onAddExerciseToBlock={addExerciseToBlock}
                                  onUpdateBlockExercise={updateBlockExercise}
                                  onDeleteBlockExercise={deleteBlockExercise}
                                  onLoadWorkoutRoutine={loadWorkoutRoutineToBlock}
                                  onSaveWorkoutRoutine={saveWorkoutRoutineFromBlock}
                                  onSaveWorkoutRoutineAsNew={saveWorkoutRoutineAsNewFromBlock}
                                  onUpdateWorkoutRoutineFromBlock={updateWorkoutRoutineFromBlock}
                                  onAttachWorkoutRoutine={attachWorkoutRoutineToBlock}
                                  onDetachWorkoutRoutine={detachWorkoutRoutineFromBlock}
                                  kindLabel={getBlockKindLabel(block)}
                                  relationshipChips={getBlockRelationshipChips(block)}
                                    outlineItems={getBoardOutlineItemsForBlock(block)}
                                    onToggleOutlineTask={toggleBoardOutlineTask}
                                  onSaveBlockNote={saveBlockNote}
                                  onAddBlockTask={addBlockTask}
                                  onToggleBlockTask={toggleBlockTask}
                                  onDeleteBlockTask={deleteBlockTask}
                                />
                              );
                            })}
                            {showGhostBlocks && ghostBlocks
                              .filter(ghost => ghost.day_index === dayIndex && ghost.time_index === slotIndex)
                              .map((ghost, idx) => (
                                <GhostBlock
                                  key={`ghost-${dayIndex}-${slotIndex}-${idx}`}
                                  label={ghost.label}
                                  confidenceScore={ghost.confidence_score}
                                  onAccept={() => handleAcceptGhostBlock(ghost)}
                                  onDismiss={() => handleDismissGhostBlock(ghost)}
                                />
                              ))}
                            {slotIntentionBlocks.map(({ intention, placement }) => (
                              <GhostBlock
                                key={`intention-${intention.id}-${placement.id}`}
                                label={`Habit: ${intention.habitName}`}
                                badgeLabel="Plan"
                                variant="intention"
                                onAccept={() => acceptWeeklyHabitIntention(intention.id, placement.id)}
                                onDismiss={() => dismissWeeklyHabitIntention(intention.id, placement.id)}
                              />
                            ))}
                            {slotRoutineIntentionBlocks.map(({ intention, placement }) => (
                              <GhostBlock
                                key={`routine-intention-${intention.id}-${placement.id}`}
                                label={`Routine: ${intention.routineName}`}
                                badgeLabel="Plan"
                                variant="intention"
                                onAccept={() => acceptWeeklyRoutineIntention(intention.id, placement.id)}
                                onDismiss={() => dismissWeeklyRoutineIntention(intention.id, placement.id)}
                              />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showSoftPlanPanel && (
          <div className="modal-overlay modal-overlay--soft-plan" onClick={() => setShowSoftPlanPanel(false)}>
            <div
              className="modal-content soft-plan-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="soft-plan-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <span className="soft-plan-modal-kicker">Soft plan</span>
                  <h2 id="soft-plan-title">{softPlanTotal} dotted intention{softPlanTotal === 1 ? "" : "s"}</h2>
                </div>
                <button
                  className="modal-close"
                  onClick={() => setShowSoftPlanPanel(false)}
                  aria-label="Close soft plan"
                >
                  ×
                </button>
              </div>
              <div className="modal-body soft-plan-modal-body">
                <p>
                  Dotted intentions are maybes for the week. Make one real when you want it on the calendar, or dismiss it without penalty.
                </p>
                {softPlanPreviewItems.length === 0 ? (
                  <div className="soft-plan-modal-empty">
                    <strong>No soft commitments yet.</strong>
                    <span>Open a habit or routine and use Intention to place dotted maybes on the week.</span>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSoftPlanPanel(false);
                          setMobileHomeView("themes");
                        }}
                      >
                        Open Outline
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setShowSoftPlanPanel(false);
                          openOverlayPanel("workout");
                        }}
                      >
                        Open Routines
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="soft-plan-modal-list">
                    {mobileWeeklyIntentionPlacements.map(({ kind, intention, placement, title, detail }) => {
                      const visibleSlotIndex =
                        viewMode === "buckets"
                          ? getBucketForHourlyIndex(placement.timeIndex)
                          : placement.timeIndex;
                      const slotLabel = slotLabels[visibleSlotIndex] ?? "Open slot";
                      return (
                        <div
                          key={`soft-plan-modal-${kind}-${intention.id}-${placement.id}`}
                          className="soft-plan-modal-row"
                        >
                          <button
                            type="button"
                            className="soft-plan-modal-real"
                            onClick={() => {
                              if (kind === "habit") {
                                void acceptWeeklyHabitIntention(intention.id, placement.id);
                              } else {
                                void acceptWeeklyRoutineIntention(intention.id, placement.id);
                              }
                            }}
                          >
                            Make real
                          </button>
                          <button
                            type="button"
                            className="soft-plan-modal-main"
                            onClick={() => {
                              setMobileDayIndex(placement.dayIndex);
                              setDesktopPlannerSurface("week");
                              setMobileHomeView("planner");
                              setShowSoftPlanPanel(false);
                            }}
                          >
                            <span>{days[placement.dayIndex]} · {slotLabel} · {detail}</span>
                            <strong>{title}</strong>
                          </button>
                          <button
                            type="button"
                            className="soft-plan-modal-dismiss"
                            onClick={() => {
                              if (kind === "habit") {
                                dismissWeeklyHabitIntention(intention.id, placement.id);
                              } else {
                                dismissWeeklyRoutineIntention(intention.id, placement.id);
                              }
                            }}
                            aria-label={`Dismiss ${title} intention`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          className="settings-btn"
          onClick={() => setShowCalendarSettings(true)}
          title="Calendar Settings"
          aria-label="Calendar Settings"
        >
          📅
        </button>

        {showCalendarSettings && (
          <CalendarSettings
            userId={user?.id ?? null}
            onClose={() => setShowCalendarSettings(false)}
            onImportEvents={(importedBlocks) => {
              setBlocks((prev) => [...prev, ...importedBlocks]);
            }}
          />
        )}

        {linkConfirmation && (
          <div className="modal-overlay" onClick={() => setLinkConfirmation(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Link Habit Blocks?</h2>
                <button
                  className="modal-close"
                  onClick={() => setLinkConfirmation(null)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="info-message">
                  These two habit blocks are from the same group and placed next to each other.
                  Would you like to link them together to form a combined session?
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                  <button
                    onClick={() => {
                      linkBlocks(linkConfirmation.blockId1, linkConfirmation.blockId2);
                    }}
                  >
                    Link them
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setLinkConfirmation(null)}
                  >
                    Keep separate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {renamingSession && (
          <div className="modal-overlay" onClick={() => {
            setRenamingSession(null);
            setSessionRenameValue("");
          }}>
            <div className="modal-content session-rename-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Rename Session</h2>
                <button
                  className="modal-close"
                  onClick={() => {
                    setRenamingSession(null);
                    setSessionRenameValue("");
                  }}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <label className="small-label">Session name (leave empty to use auto-generated name)</label>
                <input
                  type="text"
                  value={sessionRenameValue}
                  onChange={(e) => setSessionRenameValue(e.target.value)}
                  placeholder={`Session ${renamingSession.session_number}`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      renameSession(renamingSession.id, sessionRenameValue);
                    }
                  }}
                />
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <button
                    onClick={() => renameSession(renamingSession.id, sessionRenameValue)}
                  >
                    Save
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setRenamingSession(null);
                      setSessionRenameValue("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          destructive={confirmDialog.destructive}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel ?? (() => setConfirmDialog(null))}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {mobileHabitPickerSlot && (() => {
        const habitThemes = themes.filter((theme) => theme.themeType === "habit" || theme.themeType === "household");
        const pickerQuery = mobileHabitPickerQuery.trim().toLowerCase();
        const allPickerHabits = habitThemes.flatMap((theme) => flattenHabits(theme.habits, theme.name, theme.id));
        const doesHabitMatch = (habit: HabitWithTheme) =>
          !pickerQuery ||
          habit.name.toLowerCase().includes(pickerQuery) ||
          habit.themeName.toLowerCase().includes(pickerQuery);
        const suggestedPickerHabits = allPickerHabits
          .filter(
            (habit) =>
              habit.frequency !== "none" &&
              habit.targetPerWeek > 0 &&
              getHabitDoneCount(habit.id, habit.frequency) < habit.targetPerWeek
          )
          .sort((a, b) => {
            const aLast = a.lastDoneAt ? new Date(a.lastDoneAt).getTime() : 0;
            const bLast = b.lastDoneAt ? new Date(b.lastDoneAt).getTime() : 0;
            return aLast - bLast;
          })
          .slice(0, 6);
        const filteredPickerThemes = habitThemes
          .map((theme) => ({
            theme,
            habits: flattenHabits(theme.habits, theme.name, theme.id).filter(doesHabitMatch),
          }))
          .filter(({ habits }) => !pickerQuery || habits.length > 0);
        const hasPickerMatches = allPickerHabits.some(doesHabitMatch);
        const visibleSlotIndex =
          viewMode === "buckets"
            ? getBucketForHourlyIndex(mobileHabitPickerSlot.timeIndex)
            : mobileHabitPickerSlot.timeIndex;
        const slotLabel = slotLabels[visibleSlotIndex] ?? "This slot";
        const renderPickerHabitButton = (habit: HabitWithTheme, keyPrefix = "habit") => {
          const done = getHabitDoneCount(habit.id, habit.frequency);
          const progressLabel =
            habit.frequency === "none"
              ? "No target"
              : `${done}/${habit.targetPerWeek} ${habit.frequency}`;
          const lastDoneLabel = habit.lastDoneAt ? `Last ${formatTimeSince(habit.lastDoneAt)}` : "Not done yet";

          return (
            <button
              key={`${keyPrefix}-${habit.id}`}
              type="button"
              onClick={() => addHabitToMobileSlot(habit.id)}
            >
              <span className="mobile-habit-picker-name">
                <strong>{habit.name}</strong>
                <small>{habit.themeName}</small>
              </span>
              <span className="mobile-habit-picker-meta">
                <em>{progressLabel}</em>
                <small>{lastDoneLabel}</small>
              </span>
            </button>
          );
        };

        return (
          <div
            className="modal-overlay mobile-habit-picker-overlay"
            onClick={() => setMobileHabitPickerSlot(null)}
          >
            <div className="mobile-habit-picker-modal" onClick={(event) => event.stopPropagation()}>
              <div className="mobile-habit-picker-header">
                <div>
                  <span>Add from Outline</span>
                  <strong>{days[mobileHabitPickerSlot.dayIndex]} · {slotLabel}</strong>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setMobileHabitPickerSlot(null)}
                  aria-label="Close habit picker"
                >
                  ×
                </button>
              </div>
              <div className="mobile-habit-picker-body">
                <div className="mobile-habit-picker-search">
                  <input
                    type="text"
                    value={mobileHabitPickerQuery}
                    onChange={(event) => setMobileHabitPickerQuery(event.target.value)}
                    placeholder="Search habits or themes"
                    autoFocus
                  />
                </div>
                {habitThemes.length === 0 ? (
                  <div className="mobile-habit-picker-empty">
                    No habits yet.
                  </div>
                ) : pickerQuery && !hasPickerMatches ? (
                  <div className="mobile-habit-picker-empty">
                    No matching habits.
                  </div>
                ) : (
                  <>
                    {!pickerQuery && suggestedPickerHabits.length > 0 && (
                      <section className="mobile-habit-picker-theme mobile-habit-picker-suggested">
                        <div className="mobile-habit-picker-theme-header">
                          <strong>Suggested</strong>
                          <span>Still open this week</span>
                        </div>
                        <div className="mobile-habit-picker-list">
                          {suggestedPickerHabits.map((habit) => renderPickerHabitButton(habit, "suggested"))}
                        </div>
                      </section>
                    )}
                    {filteredPickerThemes.map(({ theme, habits }) => (
                      <section key={theme.id} className="mobile-habit-picker-theme">
                        <div className="mobile-habit-picker-theme-header">
                          <strong>{theme.name}</strong>
                          <span>
                            {habits.length} {theme.themeType === "household" ? habits.length === 1 ? "chore" : "chores" : habits.length === 1 ? "habit" : "habits"}
                          </span>
                        </div>
                        {habits.length === 0 ? (
                          <div className="mobile-habit-picker-empty">
                            {theme.themeType === "household" ? "No chores in this theme yet." : "No habits in this theme yet."}
                          </div>
                        ) : (
                          <div className="mobile-habit-picker-list">
                            {habits.map((habit) => renderPickerHabitButton(habit, theme.id))}
                          </div>
                        )}
                      </section>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {notesThemeId && (() => {
        const theme = themes.find((t) => t.id === notesThemeId);
        if (!theme || !user) return null;
        const themeHabitIds = new Set(flattenHabits(theme.habits, theme.name, theme.id).map((h) => h.id));
        return (
          <ThemeNotes
            themeId={theme.id}
            themeName={theme.name}
            habits={theme.habits}
            groups={theme.groups}
            userId={user.id}
            getHabitDoneCount={getHabitDoneCount}
            onClose={() => setNotesThemeId(null)}
            onCreateBlockFromNote={async (label) => {
              const id = await createBlock(label);
              if (id) showToast("Note turned into an unscheduled block", "success");
            }}
            onCreateHabitFromNote={async (name) => {
              await addHabitToTheme(theme.id, name, 1, "weekly");
            }}
            blocks={blocks.filter((b) => b.habitId && themeHabitIds.has(b.habitId))}
          />
        );
      })()}

      {showQuickStartModal && (
        <QuickStartTemplateModal
          userId={user.id}
          unscheduledBlocks={blocks
            .filter(b => b.location.type === 'unscheduled')
            .map(b => ({ id: b.id, label: b.label }))}
          onClose={() => setShowQuickStartModal(false)}
          onApplyTemplate={handleApplyTemplate}
        />
      )}

      {showSmartWeeklySetup && (
        <SmartWeeklySetupModal
          suggestions={smartWeeklySuggestions}
          days={days}
          timeSlots={hourlySlots}
          loading={smartWeeklyLoading}
          applying={smartWeeklyApplying}
          onRefresh={openSmartWeeklySetup}
          onApply={applySmartWeeklySetup}
          onClose={() => setShowSmartWeeklySetup(false)}
        />
      )}

      {showAnalytics && (
        <AnalyticsDashboard
          userId={user.id}
          themes={themes}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {showQuickHabit && user && (
        <QuickHabitForm
          themes={themes}
          onClose={() => setShowQuickHabit(false)}
          onCreateHabit={async (themeId, name, targetPerWeek, frequency) => {
            await addHabitToTheme(themeId, name, targetPerWeek, frequency);
          }}
        />
      )}

      {showAmbientMode && user && (
        <AmbientMode
          settings={ambientSettings}
          routines={routineTabs}
          activeRoutine={ambientActiveRoutine}
          todayDate={todayDate}
          todayLabel={todayDayIndex >= 0 ? days[todayDayIndex] : "This week"}
          weekLabel={getCurrentWeekRange(weekOffset)}
          nextBlock={mobileNowBlock}
          nextTask={ambientNextTask}
          waitingCount={unscheduledBlocks.length}
          quickNote={ambientQuickNote}
          wakeLockSupported={ambientWakeLockSupported}
          wakeLockActive={ambientWakeLockActive}
          wakeLockError={ambientWakeLockError}
          onSettingsChange={updateAmbientSettings}
          onQuickNoteChange={setAmbientQuickNote}
          onQuickNoteSubmit={captureAmbientQuickNote}
          onToggleRoutineItem={toggleAmbientRoutineItem}
          onCompleteRoutine={completeAmbientRoutine}
          onResetRoutine={resetAmbientRoutine}
          onCompleteNextBlock={(blockId) => {
            markBlockDone(blockId);
          }}
          onCompleteNextTask={completeAmbientNextTask}
          onOpenPlanner={() => {
            setShowAmbientMode(false);
            setMobileHomeView("planner");
            closeOverlayPanels();
          }}
          onOpenRoutines={() => {
            setShowAmbientMode(false);
            refreshRoutineTabs();
            openOverlayPanel("routines");
          }}
          onClose={closeAmbientMode}
        />
      )}

      {showRoutineNotes && user && (
        <RoutineNotesPopup
          key={user.id}
          userId={user.id}
          initialRoutineId={selectedRoutineId}
          outlineItems={outlinerNodes}
          onOpenOutlineItem={viewCapturedItem}
          onClose={() => setShowRoutineNotes(false)}
          onCreateRoutineBlock={createRoutineBlockFromRoutine}
          workoutRoutines={workoutRoutines}
          onCreateWorkoutFromRoutine={createWorkoutBlockFromRoutine}
        />
      )}

      {showWorkoutLibrary && user && (
        <WorkoutLibraryPanel
          exerciseLibrary={exerciseLibrary}
          exerciseHistory={exerciseHistory}
          workoutRoutines={workoutRoutines}
          workoutRoutineHistory={workoutRoutineHistory}
          routineIntentions={weeklyRoutineIntentions}
          days={days}
          onClose={() => setShowWorkoutLibrary(false)}
          onCreateWorkout={createWorkoutBlockFromExercises}
          onCreateWorkoutFromRoutine={createWorkoutBlockFromRoutine}
          onSaveRoutine={saveWorkoutRoutineFromExerciseIds}
          onDeleteRoutine={deleteWorkoutRoutine}
          onAddExercise={addCustomExercise}
          onPlanRoutineIntention={placeWeeklyRoutineIntentions}
          onClearRoutineIntention={clearWeeklyRoutineIntention}
        />
      )}


      {outlinerReminder && user && (
        <div
          className={`outliner-reminder-notification ${
            outlinerReminder.reminderKind === "pesky" ? "outliner-reminder-notification--pesky" : ""
          }`}
          role="alert"
        >
          <div className="outliner-reminder-notification-eyebrow">
            {outlinerReminder.reminderKind === "pesky" ? "Pesky reminder" : "Outliner reminder"}
          </div>
          <strong>{outlinerReminder.text}</strong>
          {outlinerReminder.path.length > 1 && (
            <span>{outlinerReminder.path.slice(0, -1).join(" / ")}</span>
          )}
          {outlinerReminder.reminderKind === "pesky" && (() => {
            const repeatMinutes = outlinerReminder.reminderIntervalMinutes ?? 1440;
            return (
              <span>
                This will come back every {formatReminderInterval(repeatMinutes)} until you mark it done.
              </span>
            );
          })()}
          <div className="outliner-reminder-notification-actions">
            <button
              type="button"
              onClick={() => {
                openOverlayPanel("outliner");
                setOutlinerReminder(null);
              }}
            >
              Open outliner
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                snoozeOutlinerReminder(
                  user.id,
                  outlinerReminder.id,
                  outlinerReminder.reminderKind === "pesky"
                    ? outlinerReminder.reminderIntervalMinutes ?? 1440
                    : 60
                );
                setOutlinerReminder(null);
              }}
            >
              {outlinerReminder.reminderKind === "pesky"
                ? `Again in ${formatReminderInterval(outlinerReminder.reminderIntervalMinutes ?? 1440)}`
                : "Later"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (outlinerReminder.reminderKind === "pesky") {
                  clearOutlinerReminder(user.id, outlinerReminder.id);
                } else {
                  dismissOutlinerReminder(user.id, outlinerReminder.id);
                }
                setOutlinerReminder(null);
              }}
            >
              {outlinerReminder.reminderKind === "pesky" ? "Done" : "Dismiss"}
            </button>
          </div>
        </div>
      )}
    </TileTimersProvider>
  );
};

export default App;

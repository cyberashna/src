import React, { useState, useEffect } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";
import { AuthScreen } from "./components/AuthScreen";
import { CalendarSettings } from "./components/CalendarSettings";
import { ThemeGoals } from "./components/ThemeGoals";
import { database } from "./services/database";
import type { User } from "@supabase/supabase-js";

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
  frequency: "weekly" | "monthly" | "none";
  habitGroupId?: string;
};

type Theme = {
  id: string;
  name: string;
  habits: Habit[];
  groups: HabitGroup[];
};

type BlockLocation =
  | { type: "unscheduled" }
  | { type: "slot"; dayIndex: number; timeIndex: number };

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
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

const getMondayOfWeek = (weekOffset: number = 0): Date => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + (weekOffset * 7));
  monday.setHours(0, 0, 0, 0);

  return monday;
};

const getWeekStartDateString = (weekOffset: number = 0): string => {
  const monday = getMondayOfWeek(weekOffset);
  return monday.toISOString().split('T')[0];
};

const getCurrentWeekRange = (weekOffset: number = 0): string => {
  const monday = getMondayOfWeek(weekOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatDate = (date: Date) => {
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  return `${formatDate(monday)} - ${formatDate(sunday)}`;
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

type ViewMode = "hourly" | "buckets";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [weekOffset, setWeekOffset] = useState<number>(0);

  const [themes, setThemes] = useState<Theme[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dragHabitId, setDragHabitId] = useState<string | null>(null);

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
  const [newThemeHabitFrequency, setNewThemeHabitFrequency] = useState<"weekly" | "monthly" | "none">("weekly");
  const [newThemeHabitGroupId, setNewThemeHabitGroupId] = useState<string>("");
  const [expandedHabits, setExpandedHabits] = useState<Set<string>>(new Set());

  const [managingGroupsForTheme, setManagingGroupsForTheme] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupType, setNewGroupType] = useState<"strength_training" | "custom">("custom");

  const [linkConfirmation, setLinkConfirmation] = useState<{
    blockId1: string;
    blockId2: string;
  } | null>(null);

  const [newThemeName, setNewThemeName] = useState("");

  const [blockLabel, setBlockLabel] = useState("");
  const [blockHashtag, setBlockHashtag] = useState("");

  const [showCalendarSettings, setShowCalendarSettings] = useState(false);

  useEffect(() => {
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

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user, weekOffset]);

  const loadUserData = async () => {
    if (!user) return;

    setDataLoading(true);
    try {
      const weekStartDate = getWeekStartDateString(weekOffset);
      const [themesData, habitsData, blocksData, groupsData] = await Promise.all([
        database.themes.getAll(user.id),
        database.habits.getAll(user.id),
        database.blocks.getForWeek(user.id, weekStartDate),
        database.habitGroups.getAll(user.id),
      ]);

      const themesWithHabits: Theme[] = themesData.map((theme) => ({
        id: theme.id,
        name: theme.name,
        habits: habitsData
          .filter((h) => h.theme_id === theme.id)
          .map((h) => ({
            id: h.id,
            name: h.name,
            targetPerWeek: h.target_per_week,
            doneCount: h.done_count,
            lastDoneAt: h.last_done_at ?? undefined,
            frequency: h.frequency,
            habitGroupId: h.habit_group_id ?? undefined,
          })),
        groups: groupsData
          .filter((g) => g.theme_id === theme.id)
          .map((g) => ({
            id: g.id,
            name: g.name,
            groupType: g.group_type,
            linkBehavior: g.link_behavior,
          })),
      }));

      setThemes(themesWithHabits);

      const convertedBlocks: Block[] = blocksData.map((b) => ({
        id: b.id,
        label: b.label,
        isHabitBlock: b.is_habit_block,
        habitId: b.habit_id ?? undefined,
        completed: b.completed,
        hashtag: b.hashtag ?? undefined,
        linkedBlockId: b.linked_block_id ?? undefined,
        isLinkedGroup: b.is_linked_group,
        location:
          b.location_type === "slot" && b.day_index !== null && b.time_index !== null
            ? { type: "slot", dayIndex: b.day_index, timeIndex: b.time_index }
            : { type: "unscheduled" },
      }));

      setBlocks(convertedBlocks);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setDataLoading(false);
    }
  };

  const allHabits = themes.flatMap((theme) =>
    theme.habits.map((habit) => ({
      ...habit,
      themeName: theme.name,
    }))
  );

  const getHabitDoneCount = (habitId: string, frequency: "weekly" | "monthly" | "none"): number => {
    if (frequency === "none") {
      const habit = allHabits.find((h) => h.id === habitId);
      return habit?.doneCount ?? 0;
    }

    const habitBlocks = blocks.filter(
      (b) => b.habitId === habitId && b.completed && b.location.type === "slot"
    );

    return habitBlocks.length;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setThemes([]);
    setBlocks([]);
  };

  const addHabitToTheme = async (
    themeId: string,
    name: string,
    targetPerWeek: number,
    frequency: "weekly" | "monthly" | "none",
    habitGroupId?: string
  ) => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Enter a habit name.");
      return;
    }
    if (frequency !== "none" && (!targetPerWeek || targetPerWeek <= 0)) {
      alert("Enter a valid target.");
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
        habitGroupId
      );

      const newHabit: Habit = {
        id: habitData.id,
        name: habitData.name,
        targetPerWeek: habitData.target_per_week,
        doneCount: habitData.done_count,
        frequency: habitData.frequency,
        habitGroupId: habitData.habit_group_id ?? undefined,
      };

      setThemes((prevThemes) =>
        prevThemes.map((theme) =>
          theme.id === themeId
            ? { ...theme, habits: [...theme.habits, newHabit] }
            : theme
        )
      );
    } catch (error) {
      console.error("Error creating habit:", error);
      alert("Failed to create habit");
    }
  };

  const addGroupToTheme = async (themeId: string, name: string, groupType: "strength_training" | "custom") => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Enter a group name.");
      return;
    }

    if (!user) return;

    try {
      const linkBehavior = groupType === "strength_training" ? "adjacent_merge" : "none";
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
      alert("Failed to create group");
    }
  };

  const deleteGroup = async (groupId: string) => {
    if (!window.confirm("Delete this group? Habits in this group will not be deleted.")) {
      return;
    }

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
    } catch (error) {
      console.error("Error deleting group:", error);
      alert("Failed to delete group");
    }
  };

  const incrementHabit = async (habitId: string) => {
    const habit = allHabits.find((h) => h.id === habitId);
    if (!habit || !user) return;

    const now = new Date().toISOString();
    const newCount = habit.doneCount + 1;

    try {
      await database.habits.update(habitId, {
        done_count: newCount,
        last_done_at: now,
      });

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: theme.habits.map((h) =>
            h.id === habitId
              ? { ...h, doneCount: newCount, lastDoneAt: now }
              : h
          ),
        }))
      );

      const theme = themes.find((t) => t.habits.some((h) => h.id === habitId));
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
    }
  };

  const clearLastDoneAt = async (habitId: string) => {
    if (!user) return;

    try {
      await database.habits.clearLastDoneAt(habitId);

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: theme.habits.map((h) =>
            h.id === habitId ? { ...h, lastDoneAt: undefined } : h
          ),
        }))
      );
    } catch (error) {
      console.error("Error clearing last done timestamp:", error);
    }
  };

  const deleteHabit = async (habitId: string) => {
    if (
      !window.confirm(
        "Delete this habit? Any linked habit blocks will become normal blocks."
      )
    )
      return;

    try {
      await database.habits.delete(habitId);

      setThemes((prevThemes) =>
        prevThemes.map((theme) => ({
          ...theme,
          habits: theme.habits.filter((h) => h.id !== habitId),
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
    } catch (error) {
      console.error("Error deleting habit:", error);
      alert("Failed to delete habit");
    }
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

  const addTheme = async () => {
    const trimmed = newThemeName.trim();
    if (!trimmed) {
      alert("Enter a theme name.");
      return;
    }

    if (!user) return;

    try {
      const themeData = await database.themes.create(user.id, trimmed);

      const newTheme: Theme = {
        id: themeData.id,
        name: themeData.name,
        habits: [],
        groups: [],
      };

      setThemes((prev) => [...prev, newTheme]);
      setNewThemeName("");
    } catch (error) {
      console.error("Error creating theme:", error);
      alert("Failed to create theme");
    }
  };

  const createBlock = async (
    label: string,
    isHabitBlock = false,
    habitId?: string,
    hashtag?: string
  ) => {
    const trimmed = label.trim();
    if (!trimmed) {
      alert("Enter a label for the block.");
      return;
    }

    if (!user) return;

    try {
      const blockData = await database.blocks.create(user.id, {
        label: trimmed,
        is_habit_block: isHabitBlock,
        habit_id: habitId ?? null,
        location_type: "unscheduled",
        day_index: null,
        time_index: null,
        completed: false,
        hashtag: hashtag?.trim() || null,
        week_start_date: null,
        linked_block_id: null,
        is_linked_group: false,
      });

      const newBlock: Block = {
        id: blockData.id,
        label: blockData.label,
        isHabitBlock: blockData.is_habit_block,
        location: { type: "unscheduled" },
        habitId: blockData.habit_id ?? undefined,
        completed: blockData.completed,
        hashtag: blockData.hashtag ?? undefined,
        linkedBlockId: blockData.linked_block_id ?? undefined,
        isLinkedGroup: blockData.is_linked_group,
      };

      setBlocks((prev) => [...prev, newBlock]);
      setBlockLabel("");
      setBlockHashtag("");
    } catch (error) {
      console.error("Error creating block:", error);
      alert("Failed to create block");
    }
  };

  const createHabitBlockAtSlot = async (
    habitId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    console.log("========== createHabitBlockAtSlot called ==========", { habitId, dayIndex, timeIndex });
    const habit = allHabits.find((h) => h.id === habitId);
    console.log("Habit details:", {
      found: !!habit,
      name: habit?.name,
      groupId: habit?.habitGroupId
    });
    if (!habit || !user) return;

    try {
      const weekStartDate = getWeekStartDateString(weekOffset);
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
      });

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
      };

      console.log("New block created:", newBlock);
      console.log("About to call checkAdjacentLinkable for newly created block...");

      setBlocks((currentBlocks) => {
        const updatedBlocks = [...currentBlocks, newBlock];
        const adjacentBlockId = checkAdjacentLinkable(blockData.id, dayIndex, timeIndex, updatedBlocks);
        console.log("checkAdjacentLinkable returned:", adjacentBlockId);

        if (adjacentBlockId) {
          console.log("Setting link confirmation!");
          setLinkConfirmation({ blockId1: blockData.id, blockId2: adjacentBlockId });
        }

        return updatedBlocks;
      });
    } catch (error) {
      console.error("Error creating habit block:", error);
    }
  };

  const handleDragStart = (blockId: string) => {
    setDragBlockId(blockId);
    setDragHabitId(null);
  };

  const handleDragEnd = () => {
    setDragBlockId(null);
  };

  const handleHabitDragStart = (habitId: string) => {
    setDragHabitId(habitId);
    setDragBlockId(null);
  };

  const handleHabitDragEnd = () => {
    setDragHabitId(null);
  };

  const checkAdjacentLinkable = (
    blockId: string,
    dayIndex: number,
    timeIndex: number,
    blocksToSearch?: Block[]
  ): string | null => {
    const searchBlocks = blocksToSearch || blocks;
    console.log("===== checkAdjacentLinkable called =====", { blockId, dayIndex, timeIndex, searchingInCount: searchBlocks.length });
    console.log("All blocks being searched:", searchBlocks.map(b => ({
      id: b.id,
      label: b.label,
      location: b.location,
      habitId: b.habitId,
      linkedBlockId: b.linkedBlockId,
      isLinkedGroup: b.isLinkedGroup
    })));

    const block = searchBlocks.find((b) => b.id === blockId);
    console.log("1. Block lookup:", { found: !!block, isHabitBlock: block?.isHabitBlock, habitId: block?.habitId });
    if (!block || !block.habitId) {
      console.log("EARLY EXIT: Block not found or no habitId");
      return null;
    }

    const habit = allHabits.find((h) => h.id === block.habitId);
    console.log("2. Habit lookup:", {
      found: !!habit,
      habitName: habit?.name,
      habitGroupId: habit?.habitGroupId,
      allHabitsCount: allHabits.length
    });
    if (!habit || !habit.habitGroupId) {
      console.log("EARLY EXIT: Habit not found or no habitGroupId");
      return null;
    }

    const theme = themes.find((t) => t.habits.some((h) => h.id === habit.id));
    console.log("3. Theme lookup:", { found: !!theme, themeName: theme?.name, groupsCount: theme?.groups.length });
    if (!theme) {
      console.log("EARLY EXIT: Theme not found for habit");
      return null;
    }

    const group = theme.groups.find((g) => g.id === habit.habitGroupId);
    console.log("4. Group lookup:", {
      found: !!group,
      groupName: group?.name,
      linkBehavior: group?.linkBehavior,
      searchingForId: habit.habitGroupId,
      availableGroups: theme.groups.map(g => ({ id: g.id, name: g.name, behavior: g.linkBehavior }))
    });
    if (!group || group.linkBehavior !== "adjacent_merge") {
      console.log("EARLY EXIT: Group not found or wrong behavior");
      return null;
    }

    console.log("5. All checks passed! Searching for adjacent blocks...");

    const adjacentPositions = [
      { day: dayIndex - 1, time: timeIndex },
      { day: dayIndex + 1, time: timeIndex },
      { day: dayIndex, time: timeIndex - 1 },
      { day: dayIndex, time: timeIndex + 1 },
    ];

    for (const pos of adjacentPositions) {
      const blocksAtPosition = searchBlocks.filter(
        (b) =>
          b.location.type === "slot" &&
          b.location.dayIndex === pos.day &&
          b.location.timeIndex === pos.time
      );

      console.log(`6a. Blocks at position (${pos.day}, ${pos.time}):`, blocksAtPosition.map(b => ({
        id: b.id,
        label: b.label,
        habitId: b.habitId,
        linkedBlockId: b.linkedBlockId,
        isLinkedGroup: b.isLinkedGroup,
        matchesId: b.id !== blockId,
        notLinked: !b.linkedBlockId,
        notGroup: !b.isLinkedGroup
      })));

      const adjacentBlock = searchBlocks.find(
        (b) =>
          b.location.type === "slot" &&
          b.location.dayIndex === pos.day &&
          b.location.timeIndex === pos.time &&
          b.id !== blockId &&
          !b.linkedBlockId &&
          !b.isLinkedGroup
      );

      console.log(`6b. Checking position (${pos.day}, ${pos.time}):`, {
        found: !!adjacentBlock,
        blockId: adjacentBlock?.id,
        hasHabitId: !!adjacentBlock?.habitId
      });

      if (adjacentBlock && adjacentBlock.habitId) {
        const adjacentHabit = allHabits.find((h) => h.id === adjacentBlock.habitId);
        console.log("7. Adjacent habit details:", {
          adjacentHabitName: adjacentHabit?.name,
          adjacentGroupId: adjacentHabit?.habitGroupId,
          currentGroupId: habit.habitGroupId,
          matches: adjacentHabit?.habitGroupId === habit.habitGroupId
        });
        if (adjacentHabit && adjacentHabit.habitGroupId === habit.habitGroupId) {
          console.log("8. MATCH FOUND! Returning adjacent block id:", adjacentBlock.id);
          return adjacentBlock.id;
        }
      }
    }

    console.log("9. No matching adjacent blocks found");
    return null;
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
      alert("Failed to link blocks");
    }
  };

  const moveBlockToSlot = async (
    blockId: string,
    dayIndex: number,
    timeIndex: number
  ) => {
    console.log("========== moveBlockToSlot called ==========", { blockId, dayIndex, timeIndex });
    try {
      const block = blocks.find((b) => b.id === blockId);
      console.log("Block being moved:", {
        found: !!block,
        label: block?.label,
        isHabitBlock: block?.isHabitBlock,
        habitId: block?.habitId
      });

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

      console.log("About to call checkAdjacentLinkable...");
      const adjacentBlockId = checkAdjacentLinkable(blockId, dayIndex, timeIndex, updatedBlocks);
      console.log("checkAdjacentLinkable returned:", adjacentBlockId);

      setBlocks(updatedBlocks);

      if (adjacentBlockId) {
        setLinkConfirmation({ blockId1: blockId, blockId2: adjacentBlockId });
      }
    } catch (error) {
      console.error("Error moving block:", error);
    }
  };

  const moveBlockToUnscheduled = async (blockId: string) => {
    try {
      const block = blocks.find((b) => b.id === blockId);

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
    } catch (error) {
      console.error("Error moving block:", error);
    }
  };

  const deleteBlock = async (blockId: string) => {
    try {
      const block = blocks.find((b) => b.id === blockId);
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

      await database.blocks.delete(blockId);
      setBlocks((prev) =>
        prev
          .filter((b) => b.id !== blockId)
          .map((b) => {
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
    } catch (error) {
      console.error("Error deleting block:", error);
    }
  };

  const handleBlockDoubleClick = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    if (block.isHabitBlock) {
      deleteBlock(blockId);
    } else {
      moveBlockToUnscheduled(blockId);
    }
  };

  const toggleBlockCompletion = async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || !block.isHabitBlock || !block.habitId) return;

    const newCompleted = !block.completed;
    const delta = newCompleted ? 1 : -1;

    const habit = allHabits.find((h) => h.id === block.habitId);
    if (!habit) return;

    const nextCount = Math.max(0, habit.doneCount + delta);

    try {
      await database.blocks.update(blockId, { completed: newCompleted });

      if (newCompleted) {
        const now = new Date().toISOString();
        await database.habits.update(block.habitId, {
          done_count: nextCount,
          last_done_at: now,
        });

        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            habits: theme.habits.map((h) =>
              h.id === block.habitId
                ? { ...h, doneCount: nextCount, lastDoneAt: now }
                : h
            ),
          }))
        );

        const theme = themes.find((t) => t.habits.some((h) => h.id === block.habitId));
        if (theme && user) {
          const goals = await database.themeGoals.getByTheme(theme.id);
          const completedDate = now.split('T')[0];

          for (const goal of goals) {
            try {
              await database.themeGoals.recordCompletion(
                user.id,
                goal.id,
                block.habitId!,
                completedDate
              );
            } catch (error) {
              console.error("Error recording goal completion:", error);
            }
          }
        }
      } else {
        await database.habits.update(block.habitId, {
          done_count: nextCount,
        });

        setThemes((prevThemes) =>
          prevThemes.map((theme) => ({
            ...theme,
            habits: theme.habits.map((h) =>
              h.id === block.habitId ? { ...h, doneCount: nextCount } : h
            ),
          }))
        );
      }

      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, completed: newCompleted } : b
        )
      );
    } catch (error) {
      console.error("Error toggling completion:", error);
    }
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

  const unscheduledBlocks = blocks.filter(
    (b) => b.location.type === "unscheduled"
  );

  const getBlocksForSlot = (dayIndex: number, timeIndex: number) => {
    return blocks.filter(
      (b) =>
        b.location.type === "slot" &&
        b.location.dayIndex === dayIndex &&
        b.location.timeIndex === timeIndex &&
        !(b.linkedBlockId && !b.isLinkedGroup)
    );
  };

  const handleSlotDrop = (
    e: React.DragEvent<HTMLTableCellElement>,
    dayIndex: number,
    timeIndex: number
  ) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");

    if (dragBlockId) {
      moveBlockToSlot(dragBlockId, dayIndex, timeIndex);
    } else if (dragHabitId) {
      createHabitBlockAtSlot(dragHabitId, dayIndex, timeIndex);
    }
  };

  const handleSlotDragOver = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  };

  const handleSlotDragLeave = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.currentTarget.classList.remove("drag-over");
  };

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
    <>
      <div className="app">
        <div className="left-column">
          <div className="card">
            <div className="top-row">
              <h2>Habit themes</h2>
              <button
                type="button"
                className="secondary small-btn"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>

            {dataLoading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                Loading your data...
              </div>
            ) : (
              <>
                <div className="theme-list">
                  {themes.map((theme) => (
                    <div key={theme.id} className="theme-card">
                      <div className="theme-title-row">
                        <div className="theme-name">{theme.name}</div>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            type="button"
                            className="secondary small-btn"
                            onClick={() => {
                              setAddingThemeId(theme.id);
                              setNewThemeHabitName("");
                              setNewThemeHabitTarget(2);
                              setNewThemeHabitFrequency("weekly");
                              setNewThemeHabitGroupId("");
                            }}
                          >
                            Add habit
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
                            {managingGroupsForTheme === theme.id ? "Hide" : "Groups"}
                          </button>
                        </div>
                      </div>

                      {managingGroupsForTheme === theme.id && (
                        <div className="add-habit-form" style={{ marginBottom: "8px" }}>
                          <label className="small-label">Groups in this theme</label>
                          {theme.groups.length === 0 ? (
                            <div style={{ fontSize: "12px", color: "#666", padding: "4px 0" }}>
                              No groups yet
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
                          <label className="small-label">Add new group</label>
                          <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="e.g. Strength Training"
                          />
                          <label className="small-label">Group type</label>
                          <select
                            value={newGroupType}
                            onChange={(e) => setNewGroupType(e.target.value as "strength_training" | "custom")}
                          >
                            <option value="custom">Custom</option>
                            <option value="strength_training">Strength Training (auto-link)</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              addGroupToTheme(theme.id, newGroupName, newGroupType);
                            }}
                            style={{ marginTop: "4px" }}
                          >
                            Add group
                          </button>
                        </div>
                      )}

                      <div className="habit-list theme-habit-list">
                        {theme.habits.map((habit) => {
                          const isExpanded = expandedHabits.has(habit.id);
                          return (
                            <div key={habit.id} className="habit-item">
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

                              {!isExpanded && (
                                <div style={{
                                  paddingLeft: "28px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  width: "100%",
                                  minHeight: "48px"
                                }}>
                                  <div>
                                    <div style={{ fontWeight: 500, color: "#333", marginBottom: "2px" }}>
                                      {habit.name}
                                      {habit.habitGroupId && (() => {
                                        const group = theme.groups.find(g => g.id === habit.habitGroupId);
                                        return group ? (
                                          <span style={{ marginLeft: "6px", fontSize: "11px", color: "#666", background: "#f0f0f0", padding: "2px 6px", borderRadius: "3px" }}>
                                            {group.name}
                                          </span>
                                        ) : null;
                                      })()}
                                    </div>
                                    <div className="habit-meta">
                                      {habit.frequency === "none" ? "No target" : `Target: ${habit.targetPerWeek} / ${habit.frequency}`}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {isExpanded && (
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
                                      onDragStart={() => handleHabitDragStart(habit.id)}
                                      onDragEnd={handleHabitDragEnd}
                                      title="Drag to schedule this habit"
                                    >
                                      <span className="habit-name-draggable">{habit.name}</span>
                                    </div>

                                    <div className="habit-meta">
                                      {habit.frequency === "none" ? "No target" : `Target: ${habit.targetPerWeek} / ${habit.frequency}`}
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                      <span className="pill">
                                        Done: {getHabitDoneCount(habit.id, habit.frequency)}
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
                                  </div>

                                  <div className="habit-actions">
                                    <button
                                      style={{ fontSize: 12 }}
                                      onClick={() => incrementHabit(habit.id)}
                                    >
                                      Done
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {addingThemeId === theme.id && (
                        <div className="add-habit-form">
                          <label className="small-label">Habit name</label>
                          <input
                            type="text"
                            value={newThemeHabitName}
                            onChange={(e) => setNewThemeHabitName(e.target.value)}
                            placeholder="e.g. Clean kitchen"
                          />
                          {theme.groups.length > 0 && (
                            <>
                              <label className="small-label">Group (optional)</label>
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
                            onChange={(e) => setNewThemeHabitFrequency(e.target.value as "weekly" | "monthly" | "none")}
                          >
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
                                max={newThemeHabitFrequency === "weekly" ? 14 : 28}
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

                      <ThemeGoals
                        themeId={theme.id}
                        userId={user.id}
                      />
                    </div>
                  ))}
                </div>

                <div className="add-theme-row">
                  <label className="small-label">Add a new theme</label>
                  <div className="inline">
                    <input
                      type="text"
                      placeholder="e.g. Spiritual, Social"
                      value={newThemeName}
                      onChange={(e) => setNewThemeName(e.target.value)}
                    />
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

          <div className="card">
            <h3>Unscheduled blocks</h3>

            <div className="blocks-panel">
              <div className="inline">
                <input
                  id="blockLabelInput"
                  type="text"
                  placeholder="e.g. Deep clean bathroom"
                  value={blockLabel}
                  onChange={(e) => setBlockLabel(e.target.value)}
                />
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

              <div className="block-list" style={{ marginTop: 8 }}>
                {unscheduledBlocks.map((block) => (
                  <div
                    key={block.id}
                    className={
                      "block" +
                      (block.isHabitBlock ? " habit-block" : "") +
                      (block.completed ? " block-done" : "")
                    }
                    draggable
                    onDragStart={() => handleDragStart(block.id)}
                    onDragEnd={handleDragEnd}
                  >
                    {block.label}
                    {block.hashtag && <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 12 }}>#{block.hashtag}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="right-column">
          <div className="card">
            <div className="top-row">
              <h2>Weekly Planner</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  title="Previous week"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setWeekOffset(0)}
                  title="Go to current week"
                  disabled={weekOffset === 0}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="secondary small-btn"
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  title="Next week"
                >
                  →
                </button>
                <span className="weekly-label">{getCurrentWeekRange(weekOffset)}</span>
                {weekOffset !== 0 && (
                  <span style={{ fontSize: "12px", color: "#666" }}>
                    ({weekOffset > 0 ? `+${weekOffset}` : weekOffset} week{Math.abs(weekOffset) !== 1 ? 's' : ''})
                  </span>
                )}
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

          <div className="planner-wrapper">
            <table className="planner">
              <thead>
                <tr>
                  <th className="time-col">Time</th>
                  {days.map((day) => (
                    <th key={day}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slotLabels.map((slotLabel, slotIndex) => (
                  <tr key={slotLabel + slotIndex}>
                    <th className="time-col">{slotLabel}</th>
                    {days.map((_, dayIndex) => {
                      const slotBlocks = getBlocksForSlot(dayIndex, slotIndex);
                      return (
                        <td
                          key={`${dayIndex}-${slotIndex}`}
                          className="slot"
                          onDragOver={handleSlotDragOver}
                          onDragLeave={handleSlotDragLeave}
                          onDrop={(e) =>
                            handleSlotDrop(e, dayIndex, slotIndex)
                          }
                        >
                          <div className="slot-inner">
                            {slotBlocks.map((block) => (
                              <div
                                key={block.id}
                                className={
                                  "block" +
                                  (block.isHabitBlock ? " habit-block" : "") +
                                  (block.isLinkedGroup ? " linked-group" : "") +
                                  (block.completed ? " block-done" : "")
                                }
                                draggable
                                onDragStart={() => handleDragStart(block.id)}
                                onDragEnd={handleDragEnd}
                                onDoubleClick={() =>
                                  handleBlockDoubleClick(block.id)
                                }
                              >
                                {block.isHabitBlock ? (
                                  <label
                                    className="block-label-with-check"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!!block.completed}
                                      onChange={() =>
                                        toggleBlockCompletion(block.id)
                                      }
                                    />
                                    <span>
                                      {block.label}
                                      {block.hashtag && <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 10 }}> #{block.hashtag}</span>}
                                    </span>
                                  </label>
                                ) : (
                                  <>
                                    {block.label}
                                    {block.hashtag && <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 10 }}> #{block.hashtag}</span>}
                                  </>
                                )}
                                <button
                                  className="block-delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteBlock(block.id);
                                  }}
                                  title="Delete block"
                                >
                                  ×
                                </button>
                              </div>
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

        <button
          className="settings-btn"
          onClick={() => setShowCalendarSettings(true)}
          title="Calendar Settings"
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
      </div>
    </>
  );
};

export default App;

import { supabase } from "../lib/supabase";
import { hydrateOutline, isThemeRow, normalizeOutlinePlans, serializeOutline } from "./outlineModel";
import type { ReadingLink } from './readingLinks';

export type OutlineTag = "note" | "task" | "habit" | "link";
export type OutlineFrequency = "daily" | "weekly" | "monthly" | "none";
export type OutlineReminderKind = "regular" | "pesky";

export type OutlinePlan = {
  id: string;
  scope: "week" | "day";
  // Local calendar date; week plans use the Monday starting that week.
  date: string;
  targetCount: number | null;
  scheduledBlockIds: string[];
  parentPlanId?: string;
  // Preserve a session's identity when its time is released back to a loose plan.
  occurrenceBlockId?: string;
  sessionInitialized?: true;
  // Temporary bridge while existing controls still edit planDate.
  legacyPlanDate?: true;
};

export type OutlineLink = {
  habitId?: string;
  themeId?: string;
  blockId?: string;
  routineId?: string;
  label: string;
  renameDeclinedFor?: string | null;
};

export type OutlineNode = {
  id: string;
  text: string;
  collapsed: boolean;
  tag: OutlineTag;
  taskDone: boolean;
  isGroup?: boolean;
  readingLink?: ReadingLink;
  trashedAt?: string | null;
  frequency: OutlineFrequency;
  target: number;
  reminderAt: string | null;
  reminderDismissedAt: string | null;
  reminderKind: OutlineReminderKind;
  reminderIntervalMinutes: number | null;
  planDate: string | null;
  plans: OutlinePlan[];
  linked: OutlineLink | null;
  draftNote: string;
  draftNoteUpdatedAt: string | null;
  children: OutlineNode[];
};

export type OutlinerReminder = {
  id: string;
  text: string;
  reminderAt: string;
  reminderKind: OutlineReminderKind;
  reminderIntervalMinutes: number | null;
  path: string[];
};

export type AddHabitToOutlinerInput = {
  habitId: string;
  habitName: string;
  themeId: string;
  themeName: string;
  frequency: OutlineFrequency;
  target: number;
};

export type AddHabitToOutlinerResult = {
  added: boolean;
  existing: boolean;
  nodeId: string;
  nodes: OutlineNode[];
};

export type SyncHabitToOutlinerInput = AddHabitToOutlinerInput & {
  subtasks?: SyncHabitToOutlinerInput[];
};

export type SyncBlockToOutlinerInput = {
  blockId: string;
  label: string;
  tag: OutlineTag;
  draftNote?: string;
};

export type SyncThemeToOutlinerInput = AddThemeToOutlinerInput & {
  habits: SyncHabitToOutlinerInput[];
  blocks?: SyncBlockToOutlinerInput[];
};

export type SyncThemesToOutlinerResult = {
  createdThemes: number;
  createdHabits: number;
  createdBlocks: number;
  nodes: OutlineNode[];
};

export type AddThemeToOutlinerInput = {
  themeId: string;
  themeName: string;
};

export type AddThemeToOutlinerResult = {
  added: boolean;
  existing: boolean;
  nodeId: string;
  nodes: OutlineNode[];
};

export type QuickCaptureOutlinerInput = {
  text: string;
  tag: OutlineTag;
  draftNote?: string;
  blockId?: string | null;
  planDate?: string | null;
  parentNodeId?: string | null;
  newParentText?: string | null;
};

const legacyStorageKey = (userId: string) => `planning-outliner:${userId}`;

export const createOutlineId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createOutlineNode = (text = "New row"): OutlineNode => ({
  id: createOutlineId("outline"),
  text,
  collapsed: false,
  tag: "note",
  taskDone: false,
  frequency: "weekly",
  target: 1,
  reminderAt: null,
  reminderDismissedAt: null,
  reminderKind: "regular",
  reminderIntervalMinutes: null,
  planDate: null,
  plans: [],
  linked: null,
  draftNote: "",
  draftNoteUpdatedAt: null,
  children: [],
});

const defaultNodes = (): OutlineNode[] => {
  const weeklyRdl = createOutlineNode("Weekly RDL");
  const rdl = { ...createOutlineNode("RDL"), children: [weeklyRdl] };
  const gluteusMaximus = { ...createOutlineNode("Gluteus Maximus"), children: [rdl] };
  const glute = { ...createOutlineNode("Glute"), children: [gluteusMaximus] };
  const exerciseRoutine = createOutlineNode("Exercise routine");
  const exercise = { ...createOutlineNode("Exercise"), children: [glute, exerciseRoutine] };
  return [{ ...createOutlineNode("Look good"), children: [exercise] }];
};

export const normalizeOutlineNode = (node: Partial<OutlineNode>): OutlineNode => {
  const id = node.id ?? createOutlineId("outline");
  return {
    id,
    text: node.text ?? "New row",
    collapsed: node.collapsed ?? false,
    tag: node.tag ?? "note",
    isGroup: node.isGroup === true,
    readingLink: node.readingLink ? { ...node.readingLink } : undefined,
    taskDone: node.taskDone ?? false,
    trashedAt: node.trashedAt ?? null,
    frequency: node.frequency ?? "weekly",
    target: node.target ?? 1,
    reminderAt: node.reminderAt ?? null,
    reminderDismissedAt: node.reminderDismissedAt ?? null,
    reminderKind: node.reminderKind ?? "regular",
    reminderIntervalMinutes: node.reminderIntervalMinutes ?? null,
    planDate: node.planDate ?? null,
    plans: normalizeOutlinePlans(node.plans, id, node.planDate),
    linked: node.linked
      ? {
          habitId: node.linked.habitId,
          themeId: node.linked.themeId,
          blockId: node.linked.blockId,
          routineId: node.linked.routineId,
          label: node.linked.label ?? node.text ?? "Untitled",
          renameDeclinedFor: node.linked.renameDeclinedFor ?? null,
        }
      : null,
    draftNote: node.draftNote ?? "",
    draftNoteUpdatedAt: node.draftNoteUpdatedAt ?? null,
    children: Array.isArray(node.children) ? node.children.map(normalizeOutlineNode) : [],
  };
};

export const cloneOutlineNodes = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.map((node) => ({ ...node, plans: normalizeOutlinePlans(node.plans, node.id, node.planDate), children: cloneOutlineNodes(node.children) }));

const parseLegacyLocalStorage = (userId: string): OutlineNode[] | null => {
  try {
    const saved = localStorage.getItem(legacyStorageKey(userId));
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<OutlineNode>[];
    return Array.isArray(parsed) ? parsed.map(normalizeOutlineNode) : null;
  } catch {
    return null;
  }
};

export const loadPlanningOutliner = async (userId: string, seedDefault = true): Promise<OutlineNode[]> => {
  await outlineSaveQueues.get(userId)?.catch(() => {});
  const { data, error } = await supabase
    .from("planning_outliner_data")
    .select("nodes")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!error && data) {
    const parsed = data.nodes as Partial<OutlineNode>[];
    const nodes = Array.isArray(parsed) ? parsed.map(normalizeOutlineNode) : seedDefault ? defaultNodes() : [];
    const [themes, habits] = await Promise.all([
      supabase.from("themes").select("id, name").eq("user_id", userId),
      supabase.from("habits").select("id, name, theme_id, frequency, target_per_week").eq("user_id", userId),
    ]);
    if (themes.error) throw themes.error;
    if (habits.error) throw habits.error;
    return hydrateOutline(nodes, themes.data, habits.data);
  }

  // First load — migrate from localStorage if present
  const legacy = parseLegacyLocalStorage(userId);
  if (legacy !== null) {
    await savePlanningOutliner(userId, legacy);
    localStorage.removeItem(legacyStorageKey(userId));
    return loadPlanningOutliner(userId, seedDefault);
  }

  return seedDefault ? defaultNodes() : [];
};

const outlineSaveQueues = new Map<string, Promise<void>>();

export const savePlanningOutliner = (userId: string, nodes: OutlineNode[]): Promise<void> => {
  const storedNodes = serializeOutline(nodes);
  const save = (outlineSaveQueues.get(userId) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const { error } = await supabase
      .from("planning_outliner_data")
      .upsert({ user_id: userId, nodes: storedNodes, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
  });
  outlineSaveQueues.set(userId, save);
  return save;
};

const findNodeById = (nodes: OutlineNode[], nodeId: string): OutlineNode | null => {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNodeById(node.children, nodeId);
    if (child) return child;
  }
  return null;
};

const appendChildToNode = (nodes: OutlineNode[], parentId: string, child: OutlineNode): OutlineNode[] =>
  nodes.map((node) => {
    if (node.id === parentId) return { ...node, collapsed: false, children: [...node.children, child] };
    return { ...node, children: appendChildToNode(node.children, parentId, child) };
  });

const findNodeByLinkedBlock = (nodes: OutlineNode[], blockId: string): OutlineNode | null => {
  for (const node of nodes) {
    if (node.linked?.blockId === blockId) return node;
    const child = findNodeByLinkedBlock(node.children, blockId);
    if (child) return child;
  }
  return null;
};

export const addQuickCaptureToPlanningOutliner = async (
  userId: string,
  input: QuickCaptureOutlinerInput
): Promise<{ nodeId: string; nodes: OutlineNode[]; existing?: boolean }> => {
  const text = input.text.trim();
  const note = input.draftNote?.trim() ?? "";
  const currentNodes = await loadPlanningOutliner(userId, false);
  const existingBlockNode = input.blockId ? findNodeByLinkedBlock(currentNodes, input.blockId) : null;

  if (existingBlockNode) {
    return { nodeId: existingBlockNode.id, nodes: currentNodes, existing: true };
  }

  const node: OutlineNode = {
    ...createOutlineNode(text || (input.tag === "task" ? "New task" : "New row")),
    tag: input.tag,
    draftNote: input.tag === "note" ? note || text : note,
    draftNoteUpdatedAt: input.tag === "note" && (note || text) ? new Date().toISOString() : null,
    planDate: input.planDate ?? null,
    linked: input.blockId
      ? {
          blockId: input.blockId,
          label: text || "Captured block",
          renameDeclinedFor: null,
        }
      : null,
  };
  const newParentText = input.newParentText?.trim() ?? "";
  const nodeToInsert = newParentText
    ? { ...createOutlineNode(newParentText), collapsed: false, children: [node] }
    : node;
  const nextNodes =
    input.parentNodeId && findNodeById(currentNodes, input.parentNodeId)
      ? appendChildToNode(currentNodes, input.parentNodeId, nodeToInsert)
      : [...currentNodes, nodeToInsert];
  await savePlanningOutliner(userId, nextNodes);
  return { nodeId: node.id, nodes: nextNodes };
};

const findNodeByLinkedHabit = (nodes: OutlineNode[], habitId: string): OutlineNode | null => {
  for (const node of nodes) {
    if (node.linked?.habitId === habitId) return node;
    const child = findNodeByLinkedHabit(node.children, habitId);
    if (child) return child;
  }
  return null;
};

const findNodeByLinkedTheme = (nodes: OutlineNode[], themeId: string): OutlineNode | null => {
  for (const node of nodes) {
    if (node.linked?.themeId === themeId && isThemeRow(node)) return node;
    const child = findNodeByLinkedTheme(node.children, themeId);
    if (child) return child;
  }
  return null;
};

export const addThemeToPlanningOutliner = async (
  userId: string,
  theme: AddThemeToOutlinerInput
): Promise<AddThemeToOutlinerResult> => {
  const nodes = await loadPlanningOutliner(userId, false);
  const existingThemeNode = findNodeByLinkedTheme(nodes, theme.themeId);

  if (existingThemeNode) {
    return { added: false, existing: true, nodeId: existingThemeNode.id, nodes };
  }

  const themeNode: OutlineNode = {
    ...createOutlineNode(theme.themeName),
    linked: {
      themeId: theme.themeId,
      label: theme.themeName,
      renameDeclinedFor: null,
    },
  };
  const nextNodes = [...nodes, themeNode];

  await savePlanningOutliner(userId, nextNodes);
  return { added: true, existing: false, nodeId: themeNode.id, nodes: nextNodes };
};

export const addHabitToPlanningOutliner = async (
  userId: string,
  habit: AddHabitToOutlinerInput
): Promise<AddHabitToOutlinerResult> => {
  const nodes = await loadPlanningOutliner(userId, false);
  const existingHabitNode = findNodeByLinkedHabit(nodes, habit.habitId);

  if (existingHabitNode) {
    return { added: false, existing: true, nodeId: existingHabitNode.id, nodes };
  }

  const habitNode: OutlineNode = {
    ...createOutlineNode(habit.habitName),
    tag: "habit",
    frequency: habit.frequency,
    target: Math.max(1, habit.target || 1),
    linked: {
      habitId: habit.habitId,
      themeId: habit.themeId,
      label: habit.habitName,
      renameDeclinedFor: null,
    },
  };

  const existingThemeNode = findNodeByLinkedTheme(nodes, habit.themeId);
  const nextNodes = existingThemeNode
    ? appendChildToNode(nodes, existingThemeNode.id, habitNode)
    : [
        ...nodes,
        {
          ...createOutlineNode(habit.themeName),
          linked: { themeId: habit.themeId, label: habit.themeName, renameDeclinedFor: null },
          children: [habitNode],
        },
      ];

  await savePlanningOutliner(userId, nextNodes);
  return { added: true, existing: false, nodeId: habitNode.id, nodes: nextNodes };
};

export const syncThemesToPlanningOutliner = async (
  userId: string,
  themes: SyncThemeToOutlinerInput[]
): Promise<SyncThemesToOutlinerResult> => {
  let nextNodes = await loadPlanningOutliner(userId, false);
  let createdThemes = 0;
  let createdHabits = 0;
  let createdBlocks = 0;

  const makeHabitNode = (habit: SyncHabitToOutlinerInput): OutlineNode => ({
    ...createOutlineNode(habit.habitName),
    tag: "habit",
    frequency: habit.frequency,
    target: Math.max(1, habit.target || 1),
    linked: {
      habitId: habit.habitId,
      themeId: habit.themeId,
      label: habit.habitName,
      renameDeclinedFor: null,
    },
  });

  const syncHabitTree = (
    habits: SyncHabitToOutlinerInput[],
    themeId: string,
    parentNodeId: string
  ) => {
    for (const habit of habits) {
      const existingHabitNode = findNodeByLinkedHabit(nextNodes, habit.habitId);
      let habitNodeId = existingHabitNode?.id ?? null;

      if (!habitNodeId) {
        const habitNode = makeHabitNode(habit);
        nextNodes = appendChildToNode(nextNodes, parentNodeId, habitNode);
        createdHabits += 1;
        habitNodeId = habitNode.id;
      }

      if (habit.subtasks?.length) {
        syncHabitTree(
          habit.subtasks.map((subtask) => ({ ...subtask, themeId })),
          themeId,
          habitNodeId
        );
      }
    }
  };

  for (const theme of themes) {
    let themeNode = findNodeByLinkedTheme(nextNodes, theme.themeId);

    if (!themeNode) {
      const themeOutlineNode: OutlineNode = {
        ...createOutlineNode(theme.themeName),
        linked: {
          themeId: theme.themeId,
          label: theme.themeName,
          renameDeclinedFor: null,
        },
      };
      nextNodes = [...nextNodes, themeOutlineNode];
      createdThemes += 1;
      themeNode = themeOutlineNode;
    }

    syncHabitTree(theme.habits, theme.themeId, themeNode.id);

    for (const block of theme.blocks ?? []) {
      if (findNodeByLinkedBlock(nextNodes, block.blockId)) continue;

      const blockNode: OutlineNode = {
        ...createOutlineNode(block.label),
        tag: block.tag,
        draftNote: block.draftNote ?? "",
        draftNoteUpdatedAt: block.draftNote ? new Date().toISOString() : null,
        linked: {
          blockId: block.blockId,
          themeId: theme.themeId,
          label: block.label,
          renameDeclinedFor: null,
        },
      };
      nextNodes = appendChildToNode(nextNodes, themeNode.id, blockNode);
      createdBlocks += 1;
    }
  }

  await savePlanningOutliner(userId, nextNodes);

  return { createdThemes, createdHabits, createdBlocks, nodes: nextNodes };
};

export function updateOutlineNode(
  nodes: OutlineNode[],
  id: string,
  updater: (node: OutlineNode) => OutlineNode
): OutlineNode[] {
  return nodes.map((node) => {
    if (node.id === id) return updater(node);
    return { ...node, children: updateOutlineNode(node.children, id, updater) };
  });
}

const findDueReminder = (
  nodes: OutlineNode[],
  now: Date,
  path: string[] = []
): OutlinerReminder | null => {
  for (const node of nodes) {
    if (node.trashedAt) continue;
    const nodeText = node.text.trim() || "Untitled";
    const nextPath = [...path, nodeText];
    if (
      node.reminderAt &&
      !node.reminderDismissedAt &&
      new Date(node.reminderAt).getTime() <= now.getTime()
    ) {
      return {
        id: node.id,
        text: nodeText,
        reminderAt: node.reminderAt,
        reminderKind: node.reminderKind,
        reminderIntervalMinutes: node.reminderIntervalMinutes,
        path: nextPath,
      };
    }
    const childReminder = findDueReminder(node.children, now, nextPath);
    if (childReminder) return childReminder;
  }
  return null;
};

export const getDueOutlinerReminder = async (userId: string, now = new Date()): Promise<OutlinerReminder | null> =>
  findDueReminder(await loadPlanningOutliner(userId, false), now);

export const dismissOutlinerReminder = async (userId: string, nodeId: string): Promise<void> => {
  const nodes = await loadPlanningOutliner(userId, false);
  const next = updateOutlineNode(nodes, nodeId, (node) => ({
    ...node,
    reminderDismissedAt: new Date().toISOString(),
  }));
  await savePlanningOutliner(userId, next);
};

export const snoozeOutlinerReminder = async (userId: string, nodeId: string, minutes: number): Promise<void> => {
  const reminderAt = new Date(Date.now() + minutes * 60000).toISOString();
  const nodes = await loadPlanningOutliner(userId, false);
  const next = updateOutlineNode(nodes, nodeId, (node) => ({
    ...node,
    reminderAt,
    reminderDismissedAt: null,
  }));
  await savePlanningOutliner(userId, next);
};

export const clearOutlinerReminder = async (userId: string, nodeId: string): Promise<void> => {
  const nodes = await loadPlanningOutliner(userId, false);
  const next = updateOutlineNode(nodes, nodeId, (node) => ({
    ...node,
    reminderAt: null,
    reminderDismissedAt: null,
  }));
  await savePlanningOutliner(userId, next);
};

import { supabase } from "../lib/supabase";

export type OutlineTag = "note" | "task" | "habit";
export type OutlineFrequency = "daily" | "weekly" | "monthly" | "none";
export type OutlineReminderKind = "regular" | "pesky";

export type OutlineLink = {
  habitId?: string;
  themeId?: string;
  blockId?: string;
  label: string;
  renameDeclinedFor?: string | null;
};

export type OutlineNode = {
  id: string;
  text: string;
  collapsed: boolean;
  tag: OutlineTag;
  taskDone: boolean;
  frequency: OutlineFrequency;
  target: number;
  reminderAt: string | null;
  reminderDismissedAt: string | null;
  reminderKind: OutlineReminderKind;
  reminderIntervalMinutes: number | null;
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

const legacyStorageKey = (userId: string) => `planning-outliner:${userId}`;

export const createOutlineId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createOutlineNode = (text = "New note"): OutlineNode => ({
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

export const normalizeOutlineNode = (node: Partial<OutlineNode>): OutlineNode => ({
  id: node.id ?? createOutlineId("outline"),
  text: node.text ?? "New note",
  collapsed: node.collapsed ?? false,
  tag: node.tag ?? "note",
  taskDone: node.taskDone ?? false,
  frequency: node.frequency ?? "weekly",
  target: node.target ?? 1,
  reminderAt: node.reminderAt ?? null,
  reminderDismissedAt: node.reminderDismissedAt ?? null,
  reminderKind: node.reminderKind ?? "regular",
  reminderIntervalMinutes: node.reminderIntervalMinutes ?? null,
  linked: node.linked
    ? {
        habitId: node.linked.habitId,
        themeId: node.linked.themeId,
        blockId: node.linked.blockId,
        label: node.linked.label ?? node.text ?? "Untitled",
        renameDeclinedFor: node.linked.renameDeclinedFor ?? null,
      }
    : null,
  draftNote: node.draftNote ?? "",
  draftNoteUpdatedAt: node.draftNoteUpdatedAt ?? null,
  children: Array.isArray(node.children) ? node.children.map(normalizeOutlineNode) : [],
});

export const cloneOutlineNodes = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.map((node) => ({ ...node, children: cloneOutlineNodes(node.children) }));

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
  const { data, error } = await supabase
    .from("planning_outliner_data")
    .select("nodes")
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && data) {
    const parsed = data.nodes as Partial<OutlineNode>[];
    return Array.isArray(parsed) ? parsed.map(normalizeOutlineNode) : seedDefault ? defaultNodes() : [];
  }

  // First load — migrate from localStorage if present
  const legacy = parseLegacyLocalStorage(userId);
  if (legacy !== null) {
    await savePlanningOutliner(userId, legacy);
    localStorage.removeItem(legacyStorageKey(userId));
    return legacy;
  }

  return seedDefault ? defaultNodes() : [];
};

export const savePlanningOutliner = async (userId: string, nodes: OutlineNode[]): Promise<void> => {
  await supabase
    .from("planning_outliner_data")
    .upsert({ user_id: userId, nodes, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
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
    if (node.linked?.themeId === themeId && !node.linked.habitId) return node;
    const child = findNodeByLinkedTheme(node.children, themeId);
    if (child) return child;
  }
  return null;
};

const appendChildToNode = (nodes: OutlineNode[], parentId: string, child: OutlineNode): OutlineNode[] =>
  nodes.map((node) => {
    if (node.id === parentId) return { ...node, collapsed: false, children: [...node.children, child] };
    return { ...node, children: appendChildToNode(node.children, parentId, child) };
  });

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

export type OutlineTag = "note" | "task" | "habit";
export type OutlineFrequency = "daily" | "weekly" | "monthly" | "none";

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
  frequency: OutlineFrequency;
  target: number;
  reminderAt: string | null;
  reminderDismissedAt: string | null;
  linked: OutlineLink | null;
  children: OutlineNode[];
};

export type OutlinerReminder = {
  id: string;
  text: string;
  reminderAt: string;
  path: string[];
};

const storageKey = (userId: string) => `planning-outliner:${userId}`;

export const createOutlineId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createOutlineNode = (text = "New note"): OutlineNode => ({
  id: createOutlineId("outline"),
  text,
  collapsed: false,
  tag: "note",
  frequency: "weekly",
  target: 1,
  reminderAt: null,
  reminderDismissedAt: null,
  linked: null,
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
  frequency: node.frequency ?? "weekly",
  target: node.target ?? 1,
  reminderAt: node.reminderAt ?? null,
  reminderDismissedAt: node.reminderDismissedAt ?? null,
  linked: node.linked
    ? {
        habitId: node.linked.habitId,
        themeId: node.linked.themeId,
        blockId: node.linked.blockId,
        label: node.linked.label ?? node.text ?? "Untitled",
        renameDeclinedFor: node.linked.renameDeclinedFor ?? null,
      }
    : null,
  children: Array.isArray(node.children) ? node.children.map(normalizeOutlineNode) : [],
});

export const cloneOutlineNodes = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.map((node) => ({ ...node, children: cloneOutlineNodes(node.children) }));

export const loadPlanningOutliner = (userId: string, seedDefault = true): OutlineNode[] => {
  try {
    const saved = localStorage.getItem(storageKey(userId));
    if (!saved) return seedDefault ? defaultNodes() : [];
    const parsed = JSON.parse(saved) as Partial<OutlineNode>[];
    return Array.isArray(parsed) ? parsed.map(normalizeOutlineNode) : seedDefault ? defaultNodes() : [];
  } catch {
    return seedDefault ? defaultNodes() : [];
  }
};

export const savePlanningOutliner = (userId: string, nodes: OutlineNode[]) => {
  localStorage.setItem(storageKey(userId), JSON.stringify(nodes));
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
        path: nextPath,
      };
    }

    const childReminder = findDueReminder(node.children, now, nextPath);
    if (childReminder) return childReminder;
  }

  return null;
};

export const getDueOutlinerReminder = (userId: string, now = new Date()) =>
  findDueReminder(loadPlanningOutliner(userId, false), now);

export const dismissOutlinerReminder = (userId: string, nodeId: string) => {
  const next = updateOutlineNode(loadPlanningOutliner(userId, false), nodeId, (node) => ({
    ...node,
    reminderDismissedAt: new Date().toISOString(),
  }));
  savePlanningOutliner(userId, next);
};

export const snoozeOutlinerReminder = (userId: string, nodeId: string, minutes: number) => {
  const reminderAt = new Date(Date.now() + minutes * 60000).toISOString();
  const next = updateOutlineNode(loadPlanningOutliner(userId, false), nodeId, (node) => ({
    ...node,
    reminderAt,
    reminderDismissedAt: null,
  }));
  savePlanningOutliner(userId, next);
};

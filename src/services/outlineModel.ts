import type { OutlineNode, OutlinePlan } from "./planningOutliner";

export function outlineCardSections(items: OutlineNode[], fullItems = items) {
  const originals = new Map(fullItems.map(item => [item.id, item]));
  const sections: Array<{ key: string; label: string; items: OutlineNode[] }> = [
    { key: 'task', label: 'Tasks', items: [] },
    { key: 'habit', label: 'Habits', items: [] },
    { key: 'note', label: 'Notes', items: [] },
    { key: 'link', label: 'Links', items: [] },
    { key: 'routine', label: 'Routines', items: [] },
    { key: 'branches', label: '', items: [] },
  ];
  for (const item of items) {
    const original = originals.get(item.id) ?? item;
    // Group only direct siblings. A branch keeps its children and its own identity.
    const key = original.isGroup || isThemeRow(original) || original.children.some(child => !child.trashedAt)
      ? 'branches' : item.linked?.routineId ? 'routine' : item.tag;
    (sections.find(section => section.key === key) ?? sections[2]).items.push(item);
  }
  return sections.filter(section => section.items.length > 0);
}

const validPlanDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const normalizeOutlinePlans = (input: unknown, nodeId: string, legacyDate?: string | null): OutlinePlan[] => {
  const plans: OutlinePlan[] = [];
  const ids = new Set<string>();
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof raw !== "object") continue;
    const plan = raw as Partial<OutlinePlan>;
    if (plan.legacyPlanDate) continue;
    if (typeof plan.id !== "string" || !plan.id.trim() || ids.has(plan.id)) continue;
    if ((plan.scope !== "week" && plan.scope !== "day") || !validPlanDate(plan.date)) continue;
    if (plan.scope === "week" && new Date(`${plan.date}T00:00:00Z`).getUTCDay() !== 1) continue;
    ids.add(plan.id);
    plans.push({
      id: plan.id, scope: plan.scope, date: plan.date,
      targetCount: typeof plan.targetCount === "number" && Number.isSafeInteger(plan.targetCount) && plan.targetCount > 0 ? plan.targetCount : null,
      scheduledBlockIds: Array.isArray(plan.scheduledBlockIds)
        ? [...new Set(plan.scheduledBlockIds.filter((id): id is string => typeof id === "string" && !!id.trim()))] : [],
      ...(typeof plan.parentPlanId === 'string' && plan.parentPlanId.trim() && plan.parentPlanId !== plan.id ? { parentPlanId: plan.parentPlanId } : {}),
      ...(typeof plan.occurrenceBlockId === 'string' && plan.occurrenceBlockId.trim() ? { occurrenceBlockId: plan.occurrenceBlockId } : {}),
      ...(plan.sessionInitialized === true ? { sessionInitialized: true as const } : {}),
    });
  }
  // Rebuild only the legacy bridge on each load/save so old controls cannot leave stale dates.
  if (validPlanDate(legacyDate) && !plans.some(plan => plan.scope === "day" && plan.date === legacyDate)) {
    const id = `legacy-day:${nodeId}`;
    if (!ids.has(id)) plans.push({ id, scope: "day", date: legacyDate, targetCount: null, scheduledBlockIds: [], legacyPlanDate: true });
  }
  return plans;
};

export type OutlineThemeRecord = { id: string; name: string };
export type OutlineHabitRecord = {
  id: string;
  name: string;
  theme_id: string;
  frequency: OutlineNode["frequency"];
  target_per_week: number;
};

export type StoredOutlineNode = Omit<Partial<OutlineNode>, "children"> & {
  children: StoredOutlineNode[];
};

export const isThemeRow = (node: OutlineNode) =>
  !!node.linked?.themeId && !node.linked.habitId && !node.linked.blockId && !node.linked.routineId;

// Linked rows store placement and outline metadata; entity fields have one owner.
export const serializeOutline = (nodes: OutlineNode[]): StoredOutlineNode[] =>
  nodes.map((node) => {
    const stored: StoredOutlineNode = { ...node, plans: normalizeOutlinePlans(node.plans, node.id, node.planDate), children: serializeOutline(node.children) };
    if (node.linked?.habitId || isThemeRow(node)) {
      delete stored.text;
      delete stored.frequency;
      delete stored.target;
      stored.linked = { ...node.linked!, label: "" };
    }
    return stored;
  });

export const hydrateOutline = (
  nodes: OutlineNode[],
  themes: OutlineThemeRecord[],
  habits: OutlineHabitRecord[]
): OutlineNode[] => {
  const themeById = new Map(themes.map((theme) => [theme.id, theme]));
  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const visit = (items: OutlineNode[]): OutlineNode[] => items.flatMap((node): OutlineNode[] => {
    const children = visit(node.children);
    const habit = node.linked?.habitId ? habitById.get(node.linked.habitId) : undefined;
    if (habit) return [{
      ...node, children, text: habit.name, tag: "habit", frequency: habit.frequency,
      target: habit.target_per_week,
      linked: { ...node.linked!, themeId: habit.theme_id, label: habit.name },
    }];
    const theme = isThemeRow(node) ? themeById.get(node.linked!.themeId!) : undefined;
    if (theme) return [{ ...node, children, text: theme.name, linked: { ...node.linked!, label: theme.name } }];
    if (node.linked?.habitId || isThemeRow(node)) return node.trashedAt
      ? children.map(child => ({ ...child, trashedAt: child.trashedAt ?? node.trashedAt }))
      : children;
    return [{ ...node, children }];
  });
  return visit(nodes);
};

// Keep tombstones in the shared tree so canonical entity sync cannot recreate removed rows.
export const activeOutline = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.filter(node => !node.trashedAt).map(node => ({ ...node, children: activeOutline(node.children) }));

export const outlineTrashRoots = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.flatMap(node => node.trashedAt ? [node] : outlineTrashRoots(node.children));

// A selected branch owns its descendants: process it once, in outline order.
export const outlineSelectionRoots = (nodes: OutlineNode[], ids: ReadonlySet<string>): OutlineNode[] =>
  nodes.flatMap(node => node.trashedAt ? [] : ids.has(node.id) ? [node] : outlineSelectionRoots(node.children, ids));

export const outlineBranchItems = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.flatMap(node => node.trashedAt ? [] : [node, ...outlineBranchItems(node.children)]);

export type OutlineMoveDestination = { id: string; name: string; path: string; kind: string; container: boolean };

export const outlineMoveDestinations = (nodes: OutlineNode[], ids: ReadonlySet<string>): OutlineMoveDestination[] => {
  const visit = (items: OutlineNode[], ancestors: string[]): OutlineMoveDestination[] => items.flatMap(node => {
    if (node.trashedAt || ids.has(node.id)) return [];
    const name = node.text.trim() || 'Untitled';
    const kind = isThemeRow(node) ? 'Theme' : node.isGroup ? 'Group' : node.linked?.routineId ? 'Routine' : node.tag;
    return [{ id: node.id, name, path: ancestors.join(' / ') || 'Outline', kind, container: isThemeRow(node) || !!node.isGroup },
      ...visit(node.children, [...ancestors, name])];
  });
  return visit(nodes, []);
};

// Expand only the ancestors needed to reveal a moved item, keeping other branches unchanged.
export const revealOutlineItem = (nodes: OutlineNode[], id: string): OutlineNode[] => {
  const visit = (items: OutlineNode[]): { items: OutlineNode[]; found: boolean } => {
    let found = false;
    const next = items.map(node => {
      if (node.trashedAt) return node;
      if (node.id === id) { found = true; return node; }
      const children = visit(node.children);
      if (!children.found) return node;
      found = true;
      return { ...node, collapsed: false, children: children.items };
    });
    return { items: found ? next : items, found };
  };
  return visit(nodes).items;
};

export type OutlineCategory = "all" | "task" | "note" | "habit" | "link";
export const filterOutlineCategory = (nodes: OutlineNode[], category: OutlineCategory): OutlineNode[] =>
  nodes.flatMap(node => {
    if (node.trashedAt) return [];
    const children = filterOutlineCategory(node.children, category);
    const matches = category === "all" || (!node.isGroup && !isThemeRow(node) && !node.linked?.routineId && node.tag === category);
    return matches || children.length ? [{ ...node, children }] : [];
  });

export const moveOutlineSelection = (nodes: OutlineNode[], ids: ReadonlySet<string>, parentId: string | null, options: { revealParent?: boolean } = {}): OutlineNode[] => {
  const selected = outlineSelectionRoots(nodes, ids);
  if (!selected.length) return nodes;
  const affected = new Set(outlineBranchItems(selected).map(node => node.id));
  if (parentId && (affected.has(parentId) || !outlineBranchItems(nodes).some(node => node.id === parentId))) return nodes;
  const roots = new Set(selected.map(node => node.id));
  const detach = (items: OutlineNode[]): OutlineNode[] => items.filter(node => !roots.has(node.id)).map(node => ({ ...node, children: detach(node.children) }));
  const remaining = detach(nodes);
  if (!parentId) return [...remaining, ...selected];
  const attach = (items: OutlineNode[]): OutlineNode[] => items.map(node => node.id === parentId
    ? { ...node, collapsed: options.revealParent === false ? node.collapsed : false, children: [...node.children, ...selected] }
    : { ...node, children: attach(node.children) });
  return attach(remaining);
};

export type OutlineDropPosition = 'before' | 'inside' | 'after';

export const outlineDropPosition = (pointerY: number, top: number, height: number): OutlineDropPosition => {
  const fraction = height > 0 ? (pointerY - top) / height : 0.5;
  return fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside';
};

export const applyOutlineDrop = (nodes: OutlineNode[], sourceId: string, targetId: string, position: OutlineDropPosition): OutlineNode[] => {
  const source = outlineSelectionRoots(nodes, new Set([sourceId]))[0];
  if (!source || !outlineMoveDestinations(nodes, new Set([sourceId])).some(item => item.id === targetId)) return nodes;
  if (position === 'inside') return revealOutlineItem(moveOutlineSelection(nodes, new Set([sourceId]), targetId), sourceId);
  const detach = (items: OutlineNode[]): OutlineNode[] => items.filter(node => node.id !== sourceId)
    .map(node => ({ ...node, children: detach(node.children) }));
  const insert = (items: OutlineNode[]): OutlineNode[] => items.flatMap(node => node.id === targetId
    ? position === 'before' ? [source, node] : [node, source]
    : [{ ...node, children: insert(node.children) }]);
  return revealOutlineItem(insert(detach(nodes)), sourceId);
};

type OutlinePlacement = { id: string; parentId: string | null; index: number; previousId: string | null; nextId: string | null };
export type OutlineMoveUndo = { before: OutlinePlacement[]; after: OutlinePlacement[] };

const outlinePlacements = (nodes: OutlineNode[], parentId: string | null = null): OutlinePlacement[] =>
  nodes.flatMap((node, index) => node.trashedAt ? [] : [
    { id: node.id, parentId, index, previousId: nodes[index - 1]?.id ?? null, nextId: nodes[index + 1]?.id ?? null },
    ...outlinePlacements(node.children, node.id),
  ]);

export const moveOutlineOut = (nodes: OutlineNode[], id: string): OutlineNode[] => {
  const placement = outlinePlacements(nodes).find(item => item.id === id);
  return placement?.parentId ? applyOutlineDrop(nodes, id, placement.parentId, 'after') : nodes;
};

export const rememberOutlineMove = (before: OutlineNode[], after: OutlineNode[], ids: ReadonlySet<string>): OutlineMoveUndo | null => {
  const roots = new Set(outlineSelectionRoots(before, ids).map(node => node.id));
  const previous = outlinePlacements(before).filter(item => roots.has(item.id));
  const next = outlinePlacements(after).filter(item => roots.has(item.id));
  if (!previous.length || previous.length !== next.length) return null;
  if (previous.every(item => next.some(other => other.id === item.id && other.parentId === item.parentId && other.index === item.index))) return null;
  return { before: previous, after: next };
};

export const restoreOutlineMove = (nodes: OutlineNode[], undo: OutlineMoveUndo): { nodes: OutlineNode[]; error?: string } => {
  const locations = outlinePlacements(nodes);
  const activeItems = outlineBranchItems(nodes);
  const byId = new Map(activeItems.map(node => [node.id, node]));
  const ids = new Set(undo.before.map(item => item.id));
  if (outlineSelectionRoots(nodes, ids).length !== ids.size) return { nodes, error: 'These items have moved again or are in Trash. Choose their location with Move.' };
  for (const expected of undo.after) {
    const current = locations.find(item => item.id === expected.id);
    if (!current || current.parentId !== expected.parentId) return { nodes, error: 'This item has moved again. Choose its location with Move.' };
    const siblings = current.parentId ? byId.get(current.parentId)!.children : nodes;
    const previous = siblings.findIndex(item => item.id === expected.previousId);
    const next = siblings.findIndex(item => item.id === expected.nextId);
    if (previous >= current.index || (next >= 0 && next <= current.index)) return { nodes, error: 'The item order has changed. Choose its location with Move.' };
  }
  for (const original of undo.before) {
    if (original.parentId && (!byId.has(original.parentId) || outlineBranchItems(undo.before.map(item => byId.get(item.id)!)).some(item => item.id === original.parentId))) {
      return { nodes, error: 'The original parent is unavailable or has moved inside these items. Choose another location with Move.' };
    }
  }
  // Restore placement using the current branches, never old copies of content or plans.
  const detach = (items: OutlineNode[]): OutlineNode[] => items.filter(item => !ids.has(item.id)).map(item => ({ ...item, children: detach(item.children) }));
  let restored = detach(nodes);
  for (const original of undo.before) {
    const insert = (items: OutlineNode[]): OutlineNode[] => {
      const next = items.findIndex(item => item.id === original.nextId);
      const previous = items.findIndex(item => item.id === original.previousId);
      const index = next >= 0 ? next : previous >= 0 ? previous + 1 : Math.min(original.index, items.length);
      return [...items.slice(0, index), byId.get(original.id)!, ...items.slice(index)];
    };
    const attach = (items: OutlineNode[]): OutlineNode[] => items.map(item => item.id === original.parentId
      ? { ...item, children: insert(item.children) } : { ...item, children: attach(item.children) });
    restored = original.parentId ? attach(restored) : insert(restored);
  }
  return { nodes: undo.before.reduce((items, placement) => revealOutlineItem(items, placement.id), restored) };
};

// Preserve ancestor rows for context, without including their unrelated notes.
export const filterPlanningOutline = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.flatMap((node) => {
    if (node.trashedAt) return [];
    const children = filterPlanningOutline(node.children);
    return node.tag === "habit" || node.tag === "task" || node.tag === 'link' || children.length
      ? [{ ...node, children }]
      : [];
  });

export const outlineHabitPlacements = (
  nodes: OutlineNode[],
  themeId: string | null = null,
  parentHabitId: string | null = null
): Array<{ habitId: string; themeId: string; parentHabitId: string | null }> =>
  nodes.flatMap((node) => {
    const nextThemeId = isThemeRow(node) ? node.linked!.themeId! : themeId;
    const nextParentId = isThemeRow(node) ? null : parentHabitId;
    const habitId = node.linked?.habitId;
    const habitThemeId = nextThemeId ?? node.linked?.themeId;
    return [
      ...(habitId && habitThemeId ? [{ habitId, themeId: habitThemeId, parentHabitId: nextParentId }] : []),
      ...outlineHabitPlacements(node.children, nextThemeId, habitId ?? nextParentId),
    ];
  });

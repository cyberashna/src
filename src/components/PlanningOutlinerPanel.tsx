import { useEffect, useMemo, useRef, useState } from "react";
import {
  cloneOutlineNodes,
  createOutlineNode,
  loadPlanningOutliner,
  savePlanningOutliner,
  updateOutlineNode,
  type OutlineLink,
  type OutlineFrequency,
  type OutlineReminderKind,
  type OutlineNode,
} from "../services/planningOutliner";

type ThemeOption = {
  id: string;
  name: string;
  habits: Array<{ id: string; name: string }>;
};

type HabitLinkResult = {
  habitId: string;
  themeId: string;
  blockId?: string;
  linkedExisting?: boolean;
};

type ThemeLinkResult = {
  themeId: string;
  linkedExisting?: boolean;
  habitLinks: Array<{ nodeId: string; habitId: string }>;
};

type LinkedNoteResult = {
  content: string;
  updatedAt?: string;
};

type LinkedNoteState = {
  content: string;
  loading: boolean;
  saving: boolean;
  saved: boolean;
  updatedAt?: string;
};

type AttachTarget = {
  value: string;
  label: string;
  link: OutlineLink;
};

type OutlinerBlockOptions = {
  planDate?: string | null;
  note?: string;
  taskLabels?: string[];
  hashtag?: string;
};

type RoutineLinkResult = {
  routineId: string;
};

type ReviewFilter = "all" | "review" | "schedule" | "today" | "overdue" | "waiting";

const OUTLINER_TOP_LEVEL_PARENT = "__top-level__";

type Props = {
  userId: string;
  onClose: () => void;
  presentation?: "floating" | "bench";
  themes: ThemeOption[];
  onCreateBlock: (label: string, options?: OutlinerBlockOptions) => Promise<string | null>;
  onCreateHabit: (
    themeId: string | null,
    name: string,
    targetPerWeek: number,
    frequency: OutlineFrequency
  ) => Promise<HabitLinkResult | null>;
  onCreateHabitBlock: (
    themeId: string | null,
    name: string,
    targetPerWeek: number,
    frequency: OutlineFrequency
  ) => Promise<HabitLinkResult | null>;
  onCreateThemeFromRow: (
    name: string,
    habits: Array<{ nodeId: string; name: string; target: number; frequency: OutlineFrequency }>
  ) => Promise<ThemeLinkResult | null>;
  onCreateRoutineFromRow: (
    name: string,
    items: string[],
    notes?: string
  ) => Promise<RoutineLinkResult | null>;
  onAddBoardForLinkedHabit: (link: OutlineLink) => Promise<HabitLinkResult | null>;
  onOpenLinked: (link: OutlineLink) => void;
  onRenameLinked: (link: OutlineLink, nextName: string) => Promise<boolean>;
  onLoadLinkedNote: (link: OutlineLink) => Promise<LinkedNoteResult>;
  onSaveLinkedNote: (link: OutlineLink, content: string) => Promise<LinkedNoteResult | null>;
  boardHabitIds: string[];
  externalVersion?: number;
  focusNodeIdRequest?: string | null;
  focusRequestKey?: number;
  onNodesChange?: (nodes: OutlineNode[]) => void;
};

function findNode(
  nodes: OutlineNode[],
  id: string,
  path: OutlineNode[] = []
): { node: OutlineNode; path: OutlineNode[] } | null {
  for (const node of nodes) {
    const nextPath = [...path, node];
    if (node.id === id) return { node, path: nextPath };
    const childResult = findNode(node.children, id, nextPath);
    if (childResult) return childResult;
  }
  return null;
}

function addChild(nodes: OutlineNode[], parentId: string, child: OutlineNode): OutlineNode[] {
  return updateOutlineNode(nodes, parentId, (node) => ({
    ...node,
    collapsed: false,
    children: [...node.children, child],
  }));
}

function addSibling(nodes: OutlineNode[], siblingId: string, sibling: OutlineNode): OutlineNode[] {
  const next: OutlineNode[] = [];
  for (const node of nodes) {
    next.push({
      ...node,
      children: addSibling(node.children, siblingId, sibling),
    });
    if (node.id === siblingId) {
      next.push(sibling);
    }
  }
  return next;
}

function deleteNode(nodes: OutlineNode[], id: string): OutlineNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: deleteNode(node.children, id) }));
}

function findNodeLinkedToHabit(
  nodes: OutlineNode[],
  habitId: string,
  excludedNodeId?: string
): OutlineNode | null {
  for (const node of nodes) {
    if (node.id !== excludedNodeId && node.linked?.habitId === habitId) return node;
    const child = findNodeLinkedToHabit(node.children, habitId, excludedNodeId);
    if (child) return child;
  }
  return null;
}

function nestPreviousSiblingUnder(nodes: OutlineNode[], targetId: string): OutlineNode[] {
  const targetIndex = nodes.findIndex((node) => node.id === targetId);

  if (targetIndex > 0) {
    const previousSibling = nodes[targetIndex - 1];
    const targetNode = nodes[targetIndex];
    return [
      ...nodes.slice(0, targetIndex - 1),
      {
        ...targetNode,
        collapsed: false,
        children: [previousSibling, ...targetNode.children],
      },
      ...nodes.slice(targetIndex + 1),
    ];
  }

  return nodes.map((node) => ({
    ...node,
    children: nestPreviousSiblingUnder(node.children, targetId),
  }));
}

function nestRowUnderPreviousSibling(nodes: OutlineNode[], targetId: string): OutlineNode[] {
  const targetIndex = nodes.findIndex((node) => node.id === targetId);

  if (targetIndex > 0) {
    const previousSibling = nodes[targetIndex - 1];
    const targetNode = nodes[targetIndex];
    return [
      ...nodes.slice(0, targetIndex - 1),
      {
        ...previousSibling,
        collapsed: false,
        children: [...previousSibling.children, targetNode],
      },
      ...nodes.slice(targetIndex + 1),
    ];
  }

  return nodes.map((node) => ({
    ...node,
    children: nestRowUnderPreviousSibling(node.children, targetId),
  }));
}

function removeNodeById(
  nodes: OutlineNode[],
  id: string
): { nodes: OutlineNode[]; removed: OutlineNode | null } {
  const nextNodes: OutlineNode[] = [];
  let removed: OutlineNode | null = null;

  for (const node of nodes) {
    if (node.id === id) {
      removed = node;
      continue;
    }

    const childResult = removeNodeById(node.children, id);
    if (childResult.removed) {
      removed = childResult.removed;
      nextNodes.push({ ...node, children: childResult.nodes });
    } else {
      nextNodes.push(node);
    }
  }

  return { nodes: nextNodes, removed };
}

function insertNodeBefore(
  nodes: OutlineNode[],
  targetId: string,
  nodeToInsert: OutlineNode
): { nodes: OutlineNode[]; inserted: boolean } {
  const nextNodes: OutlineNode[] = [];
  let inserted = false;

  for (const node of nodes) {
    if (node.id === targetId) {
      nextNodes.push(nodeToInsert);
      inserted = true;
    }

    if (inserted) {
      nextNodes.push(node);
      continue;
    }

    const childResult = insertNodeBefore(node.children, targetId, nodeToInsert);
    inserted = childResult.inserted;
    nextNodes.push(inserted ? { ...node, children: childResult.nodes } : node);
  }

  return { nodes: nextNodes, inserted };
}

function insertNodeAfter(
  nodes: OutlineNode[],
  targetId: string,
  nodeToInsert: OutlineNode
): { nodes: OutlineNode[]; inserted: boolean } {
  const nextNodes: OutlineNode[] = [];
  let inserted = false;

  for (const node of nodes) {
    nextNodes.push(node);
    if (node.id === targetId) {
      nextNodes.push(nodeToInsert);
      inserted = true;
      continue;
    }

    if (inserted) continue;

    const childResult = insertNodeAfter(node.children, targetId, nodeToInsert);
    inserted = childResult.inserted;
    if (inserted) nextNodes[nextNodes.length - 1] = { ...node, children: childResult.nodes };
  }

  return { nodes: nextNodes, inserted };
}

function moveNodeRelative(
  nodes: OutlineNode[],
  draggedId: string,
  targetId: string,
  position: "before" | "after"
): OutlineNode[] {
  if (draggedId === targetId) return nodes;
  const removeResult = removeNodeById(nodes, draggedId);
  if (!removeResult.removed) return nodes;

  const insertResult =
    position === "before"
      ? insertNodeBefore(removeResult.nodes, targetId, removeResult.removed)
      : insertNodeAfter(removeResult.nodes, targetId, removeResult.removed);
  return insertResult.inserted ? insertResult.nodes : nodes;
}

function isDescendantOf(nodes: OutlineNode[], possibleChildId: string, possibleParentId: string): boolean {
  const parentResult = findNode(nodes, possibleParentId);
  if (!parentResult) return false;
  return !!findNode(parentResult.node.children, possibleChildId);
}

function moveNodeUnderParent(
  nodes: OutlineNode[],
  nodeId: string,
  parentId: string | null
): OutlineNode[] {
  if (parentId === nodeId) return nodes;
  if (parentId && isDescendantOf(nodes, parentId, nodeId)) return nodes;

  const removeResult = removeNodeById(nodes, nodeId);
  if (!removeResult.removed) return nodes;

  if (!parentId) return [...removeResult.nodes, removeResult.removed];
  if (!findNode(removeResult.nodes, parentId)) return nodes;
  return addChild(removeResult.nodes, parentId, removeResult.removed);
}

function wrapNodeInNewParent(
  nodes: OutlineNode[],
  nodeId: string,
  parentNode: OutlineNode
): { nodes: OutlineNode[]; wrapped: boolean } {
  const nextNodes: OutlineNode[] = [];
  let wrapped = false;

  for (const node of nodes) {
    if (node.id === nodeId) {
      nextNodes.push({ ...parentNode, collapsed: false, children: [node] });
      wrapped = true;
      continue;
    }

    const childResult = wrapNodeInNewParent(node.children, nodeId, parentNode);
    if (childResult.wrapped) {
      wrapped = true;
      nextNodes.push({ ...node, children: childResult.nodes });
    } else {
      nextNodes.push(node);
    }
  }

  return { nodes: nextNodes, wrapped };
}

function toLocalDatetimeValue(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toDateInputValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatPlanDate(dateString: string | null, todayDate: string) {
  if (!dateString) return "";
  if (dateString === todayDate) return "Today";
  const tomorrowDate = toDateInputValue(addDays(new Date(`${todayDate}T12:00:00`), 1));
  if (dateString === tomorrowDate) return "Tomorrow";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
}

function formatReminder(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatNoteTimestamp(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const peskyIntervalOptions = [
  { value: 15, label: "Every 15 min" },
  { value: 60, label: "Hourly" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" },
];

export default function PlanningOutlinerPanel({
  userId,
  onClose,
  presentation = "floating",
  themes,
  onCreateBlock,
  onCreateHabit,
  onCreateHabitBlock,
  onCreateThemeFromRow,
  onCreateRoutineFromRow,
  onAddBoardForLinkedHabit,
  onOpenLinked,
  onRenameLinked,
  onLoadLinkedNote,
  onSaveLinkedNote,
  boardHabitIds,
  externalVersion = 0,
  focusNodeIdRequest,
  focusRequestKey = 0,
  onNodesChange,
}: Props) {
  const [nodes, setNodes] = useState<OutlineNode[]>([]);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [reminderNodeId, setReminderNodeId] = useState<string | null>(null);
  const [reminderValue, setReminderValue] = useState("");
  const [reminderKind, setReminderKind] = useState<OutlineReminderKind>("regular");
  const [reminderIntervalMinutes, setReminderIntervalMinutes] = useState(1440);
  const [planNodeId, setPlanNodeId] = useState<string | null>(null);
  const [planDateValue, setPlanDateValue] = useState("");
  const [noteNodeId, setNoteNodeId] = useState<string | null>(null);
  const [linkedNotes, setLinkedNotes] = useState<Record<string, LinkedNoteState>>({});
  const [noteAttachTargets, setNoteAttachTargets] = useState<Record<string, string>>({});
  const [habitLinkNodeId, setHabitLinkNodeId] = useState<string | null>(null);
  const [selectedHabitLinkValue, setSelectedHabitLinkValue] = useState("");
  const [parentMoveNodeId, setParentMoveNodeId] = useState<string | null>(null);
  const [selectedParentNodeId, setSelectedParentNodeId] = useState(OUTLINER_TOP_LEVEL_PARENT);
  const [createParentNodeId, setCreateParentNodeId] = useState<string | null>(null);
  const [createParentName, setCreateParentName] = useState("");
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [actionMenuNodeId, setActionMenuNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [panelStatus, setPanelStatus] = useState("");
  const [habitThemeSelections, setHabitThemeSelections] = useState<Record<string, string>>({});
  const [habitTargetDrafts, setHabitTargetDrafts] = useState<Record<string, string>>({});
  const noteSaveTimers = useRef<Record<string, number>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const handledFocusRequestRef = useRef<number | null>(null);

  useEffect(() => {
    setNodesLoaded(false);
    setFocusNodeId(null);
    loadPlanningOutliner(userId).then((loaded) => {
      setNodes(loaded);
      onNodesChange?.(loaded);
      setNodesLoaded(true);
    });
  }, [userId, externalVersion, onNodesChange]);

  useEffect(() => {
    if (!nodesLoaded) return;
    savePlanningOutliner(userId, nodes);
  }, [nodes, userId, nodesLoaded]);

  useEffect(() => {
    return () => {
      Object.values(noteSaveTimers.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-overlay-toggle]")) return;
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!pendingFocusNodeId) return;
    const input = inputRefs.current[pendingFocusNodeId];
    if (!input) return;
    input.focus();
    input.select();
    setPendingFocusNodeId(null);
  }, [nodes, pendingFocusNodeId]);

  useEffect(() => {
    if (!focusNodeIdRequest || !nodesLoaded) return;
    if (handledFocusRequestRef.current === focusRequestKey) return;
    if (!findNode(nodes, focusNodeIdRequest)) return;
    handledFocusRequestRef.current = focusRequestKey;
    setFocusNodeId(focusNodeIdRequest);
    setSearchQuery("");
    setReviewFilter("all");
  }, [focusNodeIdRequest, focusRequestKey, nodes, nodesLoaded]);

  const focusResult = focusNodeId ? findNode(nodes, focusNodeId) : null;
  const focusNode = focusResult?.node ?? null;
  const focusPath = focusResult?.path ?? [];
  const visibleNodes = focusNode ? focusNode.children : nodes;
  const parentRowOptions = useMemo(() => {
    const collect = (items: OutlineNode[], path: string[] = []): Array<{ id: string; label: string }> =>
      items.flatMap((node) => {
        const label = node.text.trim() || "Untitled";
        const nextPath = [...path, label];
        return [
          { id: node.id, label: nextPath.join(" > ") },
          ...collect(node.children, nextPath),
        ];
      });
    return collect(nodes);
  }, [nodes]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const todayDate = toDateInputValue(new Date());
  const boardHabitIdSet = useMemo(() => new Set(boardHabitIds), [boardHabitIds]);
  const attachTargets = useMemo<AttachTarget[]>(
    () =>
      themes.flatMap((theme) => [
        {
          value: `theme:${theme.id}`,
          label: `Theme: ${theme.name}`,
          link: { themeId: theme.id, label: theme.name, renameDeclinedFor: null },
        },
        ...theme.habits.map((habit) => ({
          value: `habit:${theme.id}:${habit.id}`,
          label: `Habit: ${theme.name} / ${habit.name}`,
          link: {
            habitId: habit.id,
            themeId: theme.id,
            label: habit.name,
            renameDeclinedFor: null,
          },
        })),
      ]),
    [themes]
  );
  const habitLinkTargets = useMemo(
    () => attachTargets.filter((target) => !!target.link.habitId),
    [attachTargets]
  );

  const displayedNodes = useMemo(() => {
    const nodeMatchesSearch = (node: OutlineNode) => {
      const linkedNote = linkedNotes[node.id]?.content ?? "";
      const searchable = [
        node.text,
        node.tag,
        node.frequency,
        node.linked?.label,
        node.linked?.habitId ? "linked habit" : "",
        node.linked?.themeId && !node.linked?.habitId ? "linked theme" : "",
        node.taskDone ? "done completed" : "",
        node.reminderAt ? formatReminder(node.reminderAt) : "",
        node.reminderKind,
        node.planDate ? formatPlanDate(node.planDate, todayDate) : "",
        node.draftNote,
        node.linked?.routineId ? "linked routine routine" : "",
        linkedNote,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    };

    const isNodeComplete = (node: OutlineNode) => node.taskDone || !!node.linked?.blockId;
    const reminderDate = (node: OutlineNode) =>
      node.reminderAt ? toDateInputValue(new Date(node.reminderAt)) : null;
    const nodeMatchesFilter = (node: OutlineNode) => {
      if (reviewFilter === "all") return true;
      if (reviewFilter === "review") {
        return Boolean(
          node.reminderAt ||
            node.planDate ||
            node.tag === "task" ||
            node.tag === "habit" ||
            node.linked ||
            node.draftNote.trim() ||
            linkedNotes[node.id]?.content.trim()
        );
      }
      if (reviewFilter === "schedule") {
        return Boolean(
          !isNodeComplete(node) &&
            !node.linked?.blockId &&
            (node.planDate || node.tag === "habit")
        );
      }
      if (reviewFilter === "today") {
        return node.planDate === todayDate || reminderDate(node) === todayDate;
      }
      if (reviewFilter === "overdue") {
        return Boolean(
          !isNodeComplete(node) &&
            ((node.planDate && node.planDate < todayDate) ||
              (node.reminderAt && !node.reminderDismissedAt && new Date(node.reminderAt).getTime() < Date.now()))
        );
      }
      if (reviewFilter === "waiting") {
        return !!node.linked?.blockId && !node.taskDone;
      }
      return true;
    };

    const filterNodes = (items: OutlineNode[]): OutlineNode[] =>
      items
        .map((node) => {
          const children = filterNodes(node.children);
          return nodeMatchesSearch(node) || children.length > 0 ? { ...node, children } : null;
        })
        .filter((node): node is OutlineNode => !!node);

    const filterReviewNodes = (items: OutlineNode[]): OutlineNode[] =>
      items
        .map((node) => {
          const children = filterReviewNodes(node.children);
          return nodeMatchesFilter(node) || children.length > 0 ? { ...node, children } : null;
        })
        .filter((node): node is OutlineNode => !!node);

    const baseNodes = reviewFilter !== "all" ? filterReviewNodes(visibleNodes) : visibleNodes;
    return normalizedSearch ? filterNodes(baseNodes) : baseNodes;
  }, [visibleNodes, normalizedSearch, linkedNotes, reviewFilter, todayDate]);

  const visibleCount = useMemo(() => {
    const count = (items: OutlineNode[]): number =>
      items.reduce((total, item) => total + 1 + count(item.children), 0);
    return count(displayedNodes);
  }, [displayedNodes]);
  const filteredViewActive = !!focusNode || !!normalizedSearch || reviewFilter !== "all";

  const showAllRows = () => {
    setFocusNodeId(null);
    setSearchQuery("");
    setReviewFilter("all");
  };

  const updateAndSave = (updater: (current: OutlineNode[]) => OutlineNode[]) => {
    setNodes((current) => {
      const next = updater(cloneOutlineNodes(current));
      onNodesChange?.(next);
      return next;
    });
  };

  const updateRow = (id: string, updates: Partial<OutlineNode>) => {
    updateAndSave((current) =>
      updateOutlineNode(current, id, (item) => ({
        ...item,
        ...updates,
        target: Math.max(1, updates.target ?? item.target),
      }))
    );
  };

  const setRowLink = (id: string, link: OutlineLink) => {
    updateAndSave((current) =>
      updateOutlineNode(current, id, (item) => ({
        ...item,
        linked: link,
      }))
    );
  };

  const mergeOrCreateRowLink = (id: string, updates: Partial<OutlineLink>) => {
    updateAndSave((current) =>
      updateOutlineNode(current, id, (item) => ({
        ...item,
        linked: {
          ...(item.linked ?? { label: item.text.trim() || "Untitled", renameDeclinedFor: null }),
          ...updates,
        },
      }))
    );
  };

  const mergeRowLink = (id: string, updates: Partial<OutlineLink>) => {
    updateAndSave((current) =>
      updateOutlineNode(current, id, (item) => ({
        ...item,
        linked: item.linked ? { ...item.linked, ...updates } : null,
      }))
    );
  };

  const applyHabitLink = (node: OutlineNode, result: HabitLinkResult) => {
    setRowLink(node.id, {
      habitId: result.habitId,
      themeId: result.themeId,
      blockId: result.blockId,
      label: node.text.trim(),
      renameDeclinedFor: null,
    });
  };

  const maybeSyncLinkedRename = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label || !node.linked || node.linked.label === label) return;
    if (node.linked.renameDeclinedFor === label) return;
    const renamed = await onRenameLinked(node.linked, label);
    mergeRowLink(node.id, {
      label: renamed ? label : node.linked.label,
      renameDeclinedFor: renamed ? null : label,
    });
  };

  const addRootOrFocusedChild = () => {
    const node = createOutlineNode();
    updateAndSave((current) =>
      focusNode ? addChild(current, focusNode.id, node) : [...current, node]
    );
    setPendingFocusNodeId(node.id);
  };

  const addChildWithFocus = (parentId: string) => {
    const node = createOutlineNode("New detail");
    updateAndSave((current) => addChild(current, parentId, node));
    setPendingFocusNodeId(node.id);
  };

  const addSiblingWithFocus = (siblingId: string) => {
    const node = createOutlineNode("New next");
    updateAndSave((current) => addSibling(current, siblingId, node));
    setPendingFocusNodeId(node.id);
  };

  const deleteAndRecoverFocus = (id: string) => {
    updateAndSave((current) => deleteNode(current, id));
    if (focusNodeId === id || focusPath.some((node) => node.id === id)) {
      setFocusNodeId(null);
    }
  };

  const nestPreviousUnder = (id: string) => {
    updateAndSave((current) => nestPreviousSiblingUnder(current, id));
  };

  const indentRowUnderPrevious = (id: string) => {
    updateAndSave((current) => nestRowUnderPreviousSibling(current, id));
  };

  const openParentMovePanel = (node: OutlineNode) => {
    const nextOpen = parentMoveNodeId !== node.id;
    setParentMoveNodeId(nextOpen ? node.id : null);
    setCreateParentNodeId(null);
    setActionMenuNodeId(null);
    if (!nextOpen) return;

    const result = findNode(nodes, node.id);
    const currentParentId =
      result && result.path.length > 1
        ? result.path[result.path.length - 2].id
        : OUTLINER_TOP_LEVEL_PARENT;
    setSelectedParentNodeId(currentParentId);
  };

  const openCreateParentPanel = (node: OutlineNode) => {
    const nextOpen = createParentNodeId !== node.id;
    setCreateParentNodeId(nextOpen ? node.id : null);
    setParentMoveNodeId(null);
    setActionMenuNodeId(null);
    setCreateParentName("");
  };

  const saveParentMove = (node: OutlineNode) => {
    const nextParentId =
      selectedParentNodeId === OUTLINER_TOP_LEVEL_PARENT ? null : selectedParentNodeId;
    updateAndSave((current) => moveNodeUnderParent(current, node.id, nextParentId));
    setParentMoveNodeId(null);
    setSelectedParentNodeId(OUTLINER_TOP_LEVEL_PARENT);
  };

  const saveCreatedParent = (node: OutlineNode) => {
    const name = createParentName.trim();
    if (!name) return;

    const parentNode = createOutlineNode(name);
    updateAndSave((current) => {
      const result = wrapNodeInNewParent(current, node.id, parentNode);
      return result.wrapped ? result.nodes : current;
    });
    setCreateParentNodeId(null);
    setCreateParentName("");
    setPendingFocusNodeId(parentNode.id);
  };

  const getNodeNoteForBlock = (node: OutlineNode) =>
    (linkedNotes[node.id]?.content ?? node.draftNote).trim();

  const childLabelsForTasks = (node: OutlineNode) =>
    node.children
      .map((child) => child.text.trim())
      .filter((label) => label.length > 0);

  const convertToBlock = async (node: OutlineNode, planDate: string | null = null) => {
    const label = node.text.trim();
    if (!label) return;
    const blockId = await onCreateBlock(label, {
      planDate,
      note: getNodeNoteForBlock(node),
      taskLabels: childLabelsForTasks(node),
      hashtag: node.tag === "task" ? "task" : node.tag === "note" ? "note" : undefined,
    });
    if (blockId) {
      mergeOrCreateRowLink(node.id, {
        blockId,
        label,
        renameDeclinedFor: null,
      });
    }
  };

  const createRoutineFromRow = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label) return;
    const result = await onCreateRoutineFromRow(label, childLabelsForTasks(node), getNodeNoteForBlock(node));
    if (!result) return;
    mergeOrCreateRowLink(node.id, {
      routineId: result.routineId,
      label,
      renameDeclinedFor: null,
    });
  };

  const convertToHabit = async (node: OutlineNode, themeId: string) => {
    const label = node.text.trim();
    if (!label) return;
    const result = await onCreateHabit(themeId || null, label, node.target, node.frequency);
    if (result) applyHabitLink(node, result);
    if (result) {
      setHabitThemeSelections((current) => {
        const next = { ...current };
        delete next[node.id];
        return next;
      });
    }
  };

  const convertToHabitBlock = async (node: OutlineNode, themeId: string) => {
    const label = node.text.trim();
    if (!label) return;
    const result = await onCreateHabitBlock(themeId || null, label, node.target, node.frequency);
    if (result) applyHabitLink(node, result);
    if (result) {
      setHabitThemeSelections((current) => {
        const next = { ...current };
        delete next[node.id];
        return next;
      });
    }
  };

  const convertToTheme = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label) return;
    const directHabits = node.children
      .filter((child) => child.tag === "habit" && child.text.trim())
      .map((child) => ({
        nodeId: child.id,
        name: child.text.trim(),
        target: child.target,
        frequency: child.frequency,
      }));
    const result = await onCreateThemeFromRow(label, directHabits);
    if (!result) return;

    updateAndSave((current) =>
      updateOutlineNode(current, node.id, (item) => ({
        ...item,
        linked: {
          themeId: result.themeId,
          label,
          renameDeclinedFor: null,
        },
        children: item.children.map((child) => {
          const childLink = result.habitLinks.find((habit) => habit.nodeId === child.id);
          if (!childLink) return child;
          return {
            ...child,
            linked: {
              habitId: childLink.habitId,
              themeId: result.themeId,
              label: child.text.trim(),
              renameDeclinedFor: null,
            },
          };
        }),
      }))
    );
  };

  const addBoardForLinkedHabit = async (node: OutlineNode) => {
    if (!node.linked?.habitId) return;
    const result = await onAddBoardForLinkedHabit(node.linked);
    if (result?.blockId) mergeRowLink(node.id, { blockId: result.blockId });
  };

  const openHabitLinkPanel = (node: OutlineNode) => {
    const nextOpen = habitLinkNodeId !== node.id;
    setHabitLinkNodeId(nextOpen ? node.id : null);
    if (!nextOpen) return;
    const currentValue = node.linked?.habitId
      ? habitLinkTargets.find((target) => target.link.habitId === node.linked?.habitId)?.value
      : "";
    setSelectedHabitLinkValue(currentValue || habitLinkTargets[0]?.value || "");
  };

  const linkRowToExistingHabit = (node: OutlineNode) => {
    const target = habitLinkTargets.find((item) => item.value === selectedHabitLinkValue) ?? habitLinkTargets[0];
    if (!target) return;
    const habitId = target.link.habitId;
    const existingLinkedRow = habitId ? findNodeLinkedToHabit(nodes, habitId, node.id) : null;

    if (existingLinkedRow) {
      setFocusNodeId(existingLinkedRow.id);
      setSearchQuery("");
      setReviewFilter("all");
      setHabitLinkNodeId(null);
      setPanelStatus("That habit is already linked in the outliner.");
      window.setTimeout(() => setPanelStatus(""), 2200);
      return;
    }

    updateAndSave((current) =>
      updateOutlineNode(current, node.id, (item) => ({
        ...item,
        tag: "habit",
        text: item.text.trim() || target.link.label || "Linked habit",
        linked: {
          ...target.link,
          renameDeclinedFor: null,
        },
      }))
    );
    setHabitLinkNodeId(null);
    setPanelStatus("");
  };

  const openReminderPanel = (node: OutlineNode) => {
    setReminderNodeId((current) => current === node.id ? null : node.id);
    setReminderValue(toLocalDatetimeValue(node.reminderAt));
    setReminderKind(node.reminderKind);
    setReminderIntervalMinutes(node.reminderIntervalMinutes ?? 1440);
  };

  const openPlanPanel = (node: OutlineNode) => {
    setPlanNodeId((current) => (current === node.id ? null : node.id));
    setPlanDateValue(node.planDate ?? todayDate);
  };

  const savePlanDate = (nodeId: string, value = planDateValue) => {
    if (!value) return;
    updateRow(nodeId, { planDate: value });
    setPlanNodeId(null);
  };

  const clearPlanDate = (nodeId: string) => {
    updateRow(nodeId, { planDate: null });
    setPlanNodeId(null);
  };

  const saveReminder = (nodeId: string) => {
    if (!reminderValue) return;
    updateRow(nodeId, {
      reminderAt: new Date(reminderValue).toISOString(),
      reminderDismissedAt: null,
      reminderKind,
      reminderIntervalMinutes: reminderKind === "pesky" ? reminderIntervalMinutes : null,
    });
    setReminderNodeId(null);
  };

  const clearReminder = (nodeId: string) => {
    updateRow(nodeId, {
      reminderAt: null,
      reminderDismissedAt: null,
      reminderKind: "regular",
      reminderIntervalMinutes: null,
    });
    setReminderNodeId(null);
  };

  const openRowNote = async (node: OutlineNode) => {
    const willOpen = noteNodeId !== node.id;
    setNoteNodeId(willOpen ? node.id : null);
    if (!willOpen || linkedNotes[node.id]) return;

    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: { content: "", loading: true, saving: false, saved: false },
    }));

    if (!node.linked) {
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: {
          content: node.draftNote,
          loading: false,
          saving: false,
          saved: false,
          updatedAt: node.draftNoteUpdatedAt ?? undefined,
        },
      }));
      setNoteAttachTargets((prev) => ({
        ...prev,
        [node.id]: prev[node.id] || attachTargets[0]?.value || "",
      }));
      return;
    }

    try {
      const result = await onLoadLinkedNote(node.linked);
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: {
          content: result.content,
          loading: false,
          saving: false,
          saved: false,
          updatedAt: result.updatedAt,
        },
      }));
    } catch {
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: { content: "", loading: false, saving: false, saved: false },
      }));
    }
  };

  const saveLinkedNote = async (node: OutlineNode, content: string) => {
    if (!node.linked) {
      const updatedAt = new Date().toISOString();
      updateRow(node.id, { draftNote: content, draftNoteUpdatedAt: updatedAt });
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: {
          ...(prev[node.id] ?? { content }),
          content,
          loading: false,
          saving: false,
          saved: true,
          updatedAt,
        },
      }));
      window.setTimeout(() => {
        setLinkedNotes((prev) => ({
          ...prev,
          [node.id]: prev[node.id] ? { ...prev[node.id], saved: false } : prev[node.id],
        }));
      }, 1200);
      return;
    }

    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: { ...(prev[node.id] ?? { content: "" }), content, loading: false, saving: true, saved: false },
    }));

    const result = await onSaveLinkedNote(node.linked, content);
    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: {
        ...(prev[node.id] ?? { content }),
        content,
        loading: false,
        saving: false,
        saved: !!result,
        updatedAt: result?.updatedAt ?? prev[node.id]?.updatedAt,
      },
    }));
    window.setTimeout(() => {
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: prev[node.id] ? { ...prev[node.id], saved: false } : prev[node.id],
      }));
    }, 1800);
  };

  const updateLinkedNote = (node: OutlineNode, content: string) => {
    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: {
        ...(prev[node.id] ?? { loading: false, saving: false, saved: false }),
        content,
      },
    }));

    if (noteSaveTimers.current[node.id]) clearTimeout(noteSaveTimers.current[node.id]);
    noteSaveTimers.current[node.id] = window.setTimeout(() => {
      saveLinkedNote(node, content);
    }, 800);
  };

  const attachDraftNote = async (node: OutlineNode) => {
    if (node.linked) return;
    const targetValue = noteAttachTargets[node.id] || attachTargets[0]?.value;
    const target = attachTargets.find((item) => item.value === targetValue);
    if (!target) return;

    window.clearTimeout(noteSaveTimers.current[node.id]);
    delete noteSaveTimers.current[node.id];

    const content = (linkedNotes[node.id]?.content ?? node.draftNote).trim();
    const title = node.text.trim();
    if (!content && !title) return;

    const detailNote = title && content ? `## ${title}\n${content}` : content || title;
    const existing = await onLoadLinkedNote(target.link);
    const existingContent = existing.content.trim();
    const merged = existingContent.includes(detailNote.trim())
      ? existingContent
      : existingContent
      ? `${existing.content.trim()}\n\n${detailNote}`
      : detailNote;
    const saved = await onSaveLinkedNote(target.link, merged);
    if (!saved) return;

    const updatedAt = new Date().toISOString();
    updateRow(node.id, { draftNote: content, draftNoteUpdatedAt: updatedAt });
    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: {
        content,
        loading: false,
        saving: false,
        saved: true,
        updatedAt,
      },
    }));
    setPanelStatus(`Attached note to ${target.label.replace(/^(Theme|Habit):\s*/, "")}. Row note stayed separate.`);
    window.setTimeout(() => setPanelStatus(""), 2600);
  };

  const reorderRow = (
    draggedId: string | null,
    targetId: string,
    position: "before" | "after"
  ) => {
    if (!draggedId || draggedId === targetId) return;
    updateAndSave((current) => moveNodeRelative(current, draggedId, targetId, position));
    setDraggingNodeId(null);
    setDragOverNodeId(null);
  };

  const focusRow = (node: OutlineNode) => {
    setFocusNodeId(node.id);
    setSearchQuery("");
    setReviewFilter("all");
    setActionMenuNodeId(null);
  };

  const renderRows = (
    items: OutlineNode[],
    depth = 0,
    forceExpanded = false,
    nearestThemeId: string | null = null
  ): JSX.Element[] =>
    items.map((node, index) => {
      const hasChildren = node.children.length > 0;
      const isHabitLinked = !!node.linked?.habitId;
      const isThemeLinked = !!node.linked?.themeId && !node.linked?.habitId;
      const rowThemeId = isThemeLinked ? node.linked!.themeId! : nearestThemeId;
      const habitThemeId = habitThemeSelections[node.id] ?? rowThemeId ?? themes[0]?.id ?? "";
      const isBlockLinked = !!node.linked?.blockId;
      const isRoutineLinked = !!node.linked?.routineId;
      const isOnBoard = !!node.linked?.habitId && boardHabitIdSet.has(node.linked.habitId);
      const canMakeTheme = !node.linked && !!node.text.trim();
      const isDoneRow = node.taskDone;
      const isDragTarget = dragOverNodeId === node.id && draggingNodeId !== node.id;
      const availableParentOptions = parentRowOptions.filter(
        (option) => option.id !== node.id && !isDescendantOf(nodes, option.id, node.id)
      );
      const noteLabel = node.linked
        ? node.linked.routineId
          ? "Routine note"
          : node.linked.habitId
            ? "Habit note"
            : "Theme note"
        : "Row note";
      const notePlaceholder = node.linked?.routineId
        ? "Write notes for this routine..."
        : node.linked?.habitId
        ? "Write notes for this habit..."
        : node.linked?.themeId
        ? "Write notes for this theme..."
        : "Write a row note here, then attach it to a habit or theme when you are ready...";
      return (
        <div key={node.id} className="outliner-row-wrap">
          <div
            className={[
              "outliner-row",
              isDragTarget ? "outliner-row--drag-over" : "",
              focusNodeId === node.id ? "outliner-row--focused" : "",
              isDoneRow ? "outliner-row--done" : "",
              node.linked ? "outliner-row--linked" : "",
            ].filter(Boolean).join(" ")}
            style={{ paddingLeft: `${depth * 18 + 8}px` }}
            onDragOver={(event) => {
              if (!draggingNodeId || draggingNodeId === node.id) return;
              event.preventDefault();
              setDragOverNodeId(node.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const draggedId = draggingNodeId || event.dataTransfer.getData("text/plain");
              const bounds = event.currentTarget.getBoundingClientRect();
              const position = event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
              reorderRow(draggedId, node.id, position);
            }}
            onDragLeave={() => {
              setDragOverNodeId((current) => (current === node.id ? null : current));
            }}
          >
            <button
              type="button"
              className="outliner-drag-handle"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", node.id);
                setDraggingNodeId(node.id);
              }}
              onDragEnd={() => {
                setDraggingNodeId(null);
                setDragOverNodeId(null);
              }}
              title="Drag to reorder"
              aria-label="Drag to reorder row"
            >
              =
            </button>
            <button
              type="button"
              className={`outliner-collapse ${hasChildren ? "" : "outliner-collapse--empty"}`}
              onClick={() => {
                if (!hasChildren) return;
                updateRow(node.id, { collapsed: !node.collapsed });
              }}
              aria-label={node.collapsed ? "Expand row" : "Collapse row"}
            >
              {hasChildren ? (node.collapsed ? ">" : "v") : ""}
            </button>
            {node.tag === "task" ? (
              <button
                type="button"
                className={`outliner-task-check ${node.taskDone ? "outliner-task-check--done" : ""}`}
                onClick={() => updateRow(node.id, { taskDone: !node.taskDone })}
                title={node.taskDone ? "Mark task not done" : "Mark task done"}
                aria-label={node.taskDone ? "Mark task not done" : "Mark task done"}
              >
                {node.taskDone ? "✓" : ""}
              </button>
            ) : node.tag === "habit" ? (
              <button
                type="button"
                className="outliner-bullet"
                onClick={() => focusRow(node)}
                title="Focus this row"
                aria-label="Focus this row"
              />
            ) : (
              <span className="outliner-task-check-placeholder" />
            )}
            <input
              ref={(element) => {
                inputRefs.current[node.id] = element;
              }}
              className={`outliner-input ${isDoneRow ? "outliner-input--done" : ""}`}
              value={node.text}
              onChange={(event) => updateRow(node.id, { text: event.target.value })}
              onBlur={() => maybeSyncLinkedRename(node)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (event.shiftKey) addChildWithFocus(node.id);
                  else addSiblingWithFocus(node.id);
                  return;
                }
                if (event.key === "Tab" && !event.shiftKey && !normalizedSearch && index > 0) {
                  event.preventDefault();
                  indentRowUnderPrevious(node.id);
                }
              }}
              placeholder="Planning row..."
            />
            <select
              className={`outliner-tag-select outliner-tag-select--${node.tag}`}
              value={node.tag}
              onChange={(event) => {
                const nextTag = event.target.value as OutlineNode["tag"];
                updateRow(node.id, { tag: nextTag });
                if (nextTag === "habit") {
                  setHabitThemeSelections((current) => ({
                    ...current,
                    [node.id]: current[node.id] ?? rowThemeId ?? themes[0]?.id ?? "",
                  }));
                }
              }}
              title="Tag this row"
            >
              <option value="note">Row</option>
              <option value="task">Task</option>
              <option value="habit">Habit</option>
            </select>
            {(isThemeLinked || isHabitLinked || isBlockLinked || isRoutineLinked || isOnBoard || node.planDate || isDoneRow) && (
              <div className="outliner-link-pills">
                {isThemeLinked && <span>Linked theme</span>}
                {isHabitLinked && <span>Linked habit</span>}
                {isBlockLinked && <span>Linked block</span>}
                {isRoutineLinked && <span>Routine</span>}
                {isOnBoard && <span>On board</span>}
                {node.planDate && <span>Plan {formatPlanDate(node.planDate, todayDate)}</span>}
                {isDoneRow && <span>Done</span>}
              </div>
            )}
            <div className="outliner-row-actions">
              <button
                type="button"
                className="outliner-quick-action"
                onClick={() => addChildWithFocus(node.id)}
                title="Add detail under this row"
              >
                +
              </button>
              <button
                type="button"
                className="outliner-quick-action"
                onClick={() => addSiblingWithFocus(node.id)}
                title="Add row at the same level"
              >
                ↵
              </button>
              <div className="outliner-more-wrap">
                <button
                  type="button"
                  className={`outliner-more-btn ${actionMenuNodeId === node.id ? "outliner-more-btn--active" : ""}`}
                  onClick={() => setActionMenuNodeId((current) => (current === node.id ? null : node.id))}
                  title="More row actions"
                  aria-label="More row actions"
                >
                  ...
                </button>
                {actionMenuNodeId === node.id && (
                  <div className="outliner-action-menu">
                    <button
                      type="button"
                      onClick={() => {
                        openRowNote(node);
                        setActionMenuNodeId(null);
                      }}
                    >
                      Row note
                    </button>
                    <button
                      type="button"
                      onClick={() => focusRow(node)}
                    >
                      Focus row
                    </button>
                    <button
                      type="button"
                      onClick={() => openParentMovePanel(node)}
                    >
                      Change parent
                    </button>
                    <button
                      type="button"
                      onClick={() => openCreateParentPanel(node)}
                    >
                      Create parent
                    </button>
                    {node.linked && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenLinked(node.linked!);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Open linked
                      </button>
                    )}
                    {!node.linked && node.tag !== "habit" && habitLinkTargets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          openHabitLinkPanel(node);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Link existing habit
                      </button>
                    )}
                    {isHabitLinked && !isOnBoard && (
                      <button
                        type="button"
                        onClick={() => {
                          addBoardForLinkedHabit(node);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Add to board
                      </button>
                    )}
                    {node.tag !== "habit" && (
                      <button
                        type="button"
                        onClick={() => {
                          convertToBlock(node, null);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Send to Waiting
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        updateRow(node.id, { planDate: todayDate });
                        setActionMenuNodeId(null);
                      }}
                    >
                      Mark for today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const tomorrow = toDateInputValue(addDays(new Date(`${todayDate}T12:00:00`), 1));
                        updateRow(node.id, { planDate: tomorrow });
                        setActionMenuNodeId(null);
                      }}
                    >
                      Mark for tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openPlanPanel(node);
                        setActionMenuNodeId(null);
                      }}
                    >
                      Pick plan date
                    </button>
                    {node.planDate && !isBlockLinked && (
                      <button
                        type="button"
                        onClick={() => {
                          convertToBlock(node, node.planDate);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Schedule block
                      </button>
                    )}
                    {hasChildren && (
                      <button
                        type="button"
                        onClick={() => {
                          createRoutineFromRow(node);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Make routine
                      </button>
                    )}
                    {canMakeTheme && (
                      <button
                        type="button"
                        onClick={() => {
                          convertToTheme(node);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Make theme
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        openReminderPanel(node);
                        setActionMenuNodeId(null);
                      }}
                    >
                      Remind me
                    </button>
                    {!normalizedSearch && index > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          indentRowUnderPrevious(node.id);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Indent under previous
                      </button>
                    )}
                    {!normalizedSearch && index > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          nestPreviousUnder(node.id);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Pull previous row under this
                      </button>
                    )}
                    <button
                      type="button"
                      className="outliner-delete"
                      onClick={() => {
                        deleteAndRecoverFocus(node.id);
                        setActionMenuNodeId(null);
                      }}
                    >
                      Delete row
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {node.reminderAt && (
            <div
              className={`outliner-reminder-pill ${node.reminderKind === "pesky" ? "outliner-reminder-pill--pesky" : ""}`}
              style={{ marginLeft: `${depth * 18 + 44}px` }}
            >
              {node.reminderKind === "pesky" ? "Pesky" : "Reminds"} {formatReminder(node.reminderAt)}
            </div>
          )}
          {parentMoveNodeId === node.id && (
            <div className="outliner-parent-panel" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span>Parent row</span>
              <select
                value={
                  selectedParentNodeId === OUTLINER_TOP_LEVEL_PARENT ||
                  availableParentOptions.some((option) => option.id === selectedParentNodeId)
                    ? selectedParentNodeId
                    : OUTLINER_TOP_LEVEL_PARENT
                }
                onChange={(event) => setSelectedParentNodeId(event.target.value)}
              >
                <option value={OUTLINER_TOP_LEVEL_PARENT}>Top level</option>
                {availableParentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => saveParentMove(node)}>
                Move
              </button>
              <button type="button" className="outliner-reminder-clear" onClick={() => setParentMoveNodeId(null)}>
                Cancel
              </button>
            </div>
          )}
          {createParentNodeId === node.id && (
            <div className="outliner-parent-panel" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span>New parent</span>
              <input
                type="text"
                value={createParentName}
                onChange={(event) => setCreateParentName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  saveCreatedParent(node);
                }}
                placeholder="Parent row name..."
              />
              <button type="button" onClick={() => saveCreatedParent(node)} disabled={!createParentName.trim()}>
                Create
              </button>
              <button type="button" className="outliner-reminder-clear" onClick={() => setCreateParentNodeId(null)}>
                Cancel
              </button>
            </div>
          )}
          {reminderNodeId === node.id && (
            <div className="outliner-reminder-panel" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span>Remind me</span>
              <input
                type="datetime-local"
                value={reminderValue}
                onChange={(event) => setReminderValue(event.target.value)}
              />
              <select
                value={reminderKind}
                onChange={(event) => {
                  const nextKind = event.target.value as OutlineReminderKind;
                  setReminderKind(nextKind);
                  if (nextKind === "pesky") setReminderIntervalMinutes((value) => value || 1440);
                }}
                title="Reminder type"
              >
                <option value="regular">Regular</option>
                <option value="pesky">Pesky</option>
              </select>
              {reminderKind === "pesky" && (
                <select
                  value={reminderIntervalMinutes}
                  onChange={(event) => setReminderIntervalMinutes(parseInt(event.target.value, 10))}
                  title="How often pesky reminders come back"
                >
                  {peskyIntervalOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" onClick={() => saveReminder(node.id)}>
                Save
              </button>
              {node.reminderAt && (
                <button type="button" className="outliner-reminder-clear" onClick={() => clearReminder(node.id)}>
                  Clear
                </button>
              )}
            </div>
          )}
          {planNodeId === node.id && (
            <div className="outliner-plan-panel" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span>Plan date</span>
              <input
                type="date"
                value={planDateValue}
                onChange={(event) => setPlanDateValue(event.target.value)}
              />
              <button type="button" onClick={() => savePlanDate(node.id)}>
                Save
              </button>
              <button type="button" onClick={() => savePlanDate(node.id, todayDate)}>
                Today
              </button>
              <button
                type="button"
                onClick={() =>
                  savePlanDate(node.id, toDateInputValue(addDays(new Date(`${todayDate}T12:00:00`), 1)))
                }
              >
                Tomorrow
              </button>
              {node.planDate && (
                <button type="button" className="outliner-reminder-clear" onClick={() => clearPlanDate(node.id)}>
                  Clear
                </button>
              )}
            </div>
          )}
          {habitLinkNodeId === node.id && (
            <div className="outliner-convert-panel" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span>Link existing habit</span>
              <select
                value={selectedHabitLinkValue}
                onChange={(event) => setSelectedHabitLinkValue(event.target.value)}
                disabled={habitLinkTargets.length === 0}
              >
                {habitLinkTargets.length === 0 ? (
                  <option value="">No habits yet</option>
                ) : (
                  habitLinkTargets.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label.replace(/^Habit:\s*/, "")}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => linkRowToExistingHabit(node)}
                disabled={habitLinkTargets.length === 0}
              >
                Link
              </button>
              <button type="button" className="secondary" onClick={() => setHabitLinkNodeId(null)}>
                Cancel
              </button>
            </div>
          )}
          {noteNodeId === node.id && (
            <div className="outliner-linked-note" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span className="outliner-linked-note-dot" aria-hidden="true" />
              <div className="outliner-linked-note-content">
                <div className="outliner-linked-note-header">
                  <span>{noteLabel}</span>
                  {linkedNotes[node.id]?.loading && <em>Loading...</em>}
                  {linkedNotes[node.id]?.saving && <em>Saving...</em>}
                  {linkedNotes[node.id]?.saved && <em>Saved</em>}
                  {linkedNotes[node.id]?.updatedAt && !linkedNotes[node.id]?.saving && (
                    <em>Edited {formatNoteTimestamp(linkedNotes[node.id]?.updatedAt)}</em>
                  )}
                </div>
                <textarea
                  value={linkedNotes[node.id]?.content ?? ""}
                  onChange={(event) => updateLinkedNote(node, event.target.value)}
                  placeholder={notePlaceholder}
                  rows={3}
                />
                {!node.linked && (
                  <div className="outliner-note-attach">
                    <span>Attach note to theme/habit</span>
                    <select
                      value={noteAttachTargets[node.id] || attachTargets[0]?.value || ""}
                      onChange={(event) =>
                        setNoteAttachTargets((prev) => ({
                          ...prev,
                          [node.id]: event.target.value,
                        }))
                      }
                      disabled={attachTargets.length === 0}
                    >
                      {attachTargets.length === 0 ? (
                        <option value="">No themes yet</option>
                      ) : (
                        attachTargets.map((target) => (
                          <option key={target.value} value={target.value}>
                            {target.label}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => attachDraftNote(node)}
                      disabled={attachTargets.length === 0}
                    >
                      Attach note
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {node.tag === "habit" && !isHabitLinked && (
            <div className="outliner-habit-settings outliner-habit-setup" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span>Theme</span>
              <select
                value={habitThemeId}
                onChange={(event) =>
                  setHabitThemeSelections((current) => ({
                    ...current,
                    [node.id]: event.target.value,
                  }))
                }
              >
                <option value="">Not sorted</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
              <span>Frequency</span>
              <select
                value={node.frequency}
                onChange={(event) =>
                  updateRow(node.id, { frequency: event.target.value as OutlineFrequency })
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="none">No schedule</option>
              </select>
              {node.frequency !== "none" && (
                <input
                  type="number"
                  min={1}
                  value={habitTargetDrafts[node.id] ?? String(node.target)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setHabitTargetDrafts((current) => ({
                      ...current,
                      [node.id]: nextValue,
                    }));
                    const parsedTarget = Number(nextValue);
                    if (nextValue !== "" && Number.isFinite(parsedTarget) && parsedTarget >= 1) {
                      updateRow(node.id, { target: parsedTarget });
                    }
                  }}
                  onBlur={() =>
                    setHabitTargetDrafts((current) => {
                      const next = { ...current };
                      delete next[node.id];
                      return next;
                    })
                  }
                  aria-label="Target count"
                />
              )}
              <button type="button" onClick={() => convertToHabit(node, habitThemeId)}>
                Save habit
              </button>
              <button type="button" onClick={() => convertToHabitBlock(node, habitThemeId)}>
                Save + board
              </button>
              {habitLinkTargets.length > 0 && (
                <button type="button" className="secondary" onClick={() => openHabitLinkPanel(node)}>
                  Link existing
                </button>
              )}
            </div>
          )}
          {hasChildren && (forceExpanded || !node.collapsed) && renderRows(node.children, depth + 1, forceExpanded, rowThemeId)}
        </div>
	      );
	    });

  const filterOptions: Array<{ id: ReviewFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "review", label: "Review" },
    { id: "schedule", label: "Schedule" },
    { id: "today", label: "Today" },
    { id: "overdue", label: "Overdue" },
    { id: "waiting", label: "Waiting" },
  ];
  const filterNoticeText =
    reviewFilter === "review"
      ? "Review is showing rows with reminders, plan dates, tasks, habits, links, or notes."
      : reviewFilter === "schedule"
        ? "Schedule is showing rows that are ready to place on the planner."
        : reviewFilter === "today"
          ? "Today is showing rows dated or reminded for today."
          : reviewFilter === "overdue"
            ? "Overdue is showing unfinished rows whose plan date or reminder has passed."
            : reviewFilter === "waiting"
              ? "Waiting is showing outline rows already linked to waiting/planner blocks."
              : normalizedSearch
                ? "Search is hiding rows that do not match."
                : "You are focused inside one row.";
  const emptyText = normalizedSearch
    ? "No matching rows."
    : reviewFilter !== "all"
      ? "Nothing in this view at this level."
      : "Add a row to start planning at this level.";
  const footerQualifier = normalizedSearch
    ? "matching"
    : reviewFilter !== "all"
      ? "in this view"
      : "in view";

  return (
    <div className={`outliner-panel outliner-panel--${presentation}`} ref={panelRef}>
      <div className="outliner-header">
        <div>
          <span className="outliner-title">Planning Outliner</span>
          <span className="outliner-subtitle">Nest ideas from broad to specific.</span>
        </div>
        <button className="outliner-header-btn" type="button" onClick={onClose} title="Close">
          x
        </button>
      </div>

      <div className="outliner-breadcrumbs">
        <button type="button" onClick={() => setFocusNodeId(null)}>
          All plans
        </button>
        {focusPath.map((node) => (
          <button key={node.id} type="button" onClick={() => setFocusNodeId(node.id)}>
            {node.text.trim() || "Untitled"}
          </button>
        ))}
      </div>

	      <div className="outliner-search-row">
	        <input
	          type="search"
	          value={searchQuery}
	          onChange={(event) => setSearchQuery(event.target.value)}
	          placeholder="Search rows, notes, tasks, habits, reminders..."
	        />
	        {searchQuery && (
	          <button type="button" onClick={() => setSearchQuery("")}>
	            Clear
	          </button>
	        )}
	      </div>

      <div className="outliner-filter-tabs">
        {filterOptions.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={reviewFilter === filter.id ? "active" : ""}
            onClick={() => setReviewFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filteredViewActive && (
        <div className="outliner-filter-notice">
          <span>{filterNoticeText}</span>
	          <button type="button" onClick={showAllRows}>
	            Show all
          </button>
        </div>
      )}

      {panelStatus && (
        <div className="outliner-status-note">
          {panelStatus}
        </div>
      )}

      {focusNode && (
        <div className="outliner-focus-card">
          <div>
            <span>Focused on</span>
            <strong>{focusNode.text.trim() || "Untitled"}</strong>
          </div>
          <button type="button" onClick={() => setFocusNodeId(null)}>
            All rows
          </button>
        </div>
      )}

	      <div className="outliner-body">
	        {displayedNodes.length === 0 ? (
	          <div className="outliner-empty">{emptyText}</div>
	        ) : (
	          renderRows(displayedNodes, 0, !!normalizedSearch || reviewFilter !== "all")
	        )}
	      </div>

	      <div className="outliner-footer">
	        <span>
	          {visibleCount} row{visibleCount === 1 ? "" : "s"} {footerQualifier}
	        </span>
        <button type="button" onClick={addRootOrFocusedChild}>
          + Add row here
        </button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, MoreHorizontal, ChevronRight, ChevronDown, GripVertical, ChevronsDownUp, ChevronsUpDown, Trash2, RotateCcw, CalendarDays, Folder, FolderInput, StickyNote, Repeat2, ListChecks, Check, CornerDownRight, ArrowUp, ArrowDown, Outdent, X } from "lucide-react";
import {
  cloneOutlineNodes,
  createOutlineNode,
  updateOutlineNode,
  type OutlineLink,
  type OutlineFrequency,
  type OutlineReminderKind,
  type OutlineNode,
} from "../services/planningOutliner";
import { activeOutline, outlineTrashRoots, filterOutlineCategory, type OutlineCategory, isThemeRow, outlineSelectionRoots, outlineBranchItems, moveOutlineSelection, revealOutlineItem, outlineMoveDestinations, outlineDropPosition, applyOutlineDrop, type OutlineDropPosition, moveOutlineOut, rememberOutlineMove, restoreOutlineMove, type OutlineMoveUndo } from "../services/outlineModel";
import { PlannerModal } from "./PlannerShell";
import { OutlineMovePicker } from './OutlineMovePicker';
import { OutlineTypePicker } from './OutlineTypePicker';
import type { OutlineCardType } from '../services/cardTypes';
import { ReadingLinkCard, ReadingLinkEditor } from './ReadingLink';
import { publicWebUrl, readingSite, type ReadingLink } from '../services/readingLinks';
import { outlineCardSections } from '../services/outlineModel';

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

type ReviewFilter = "all" | "review" | "schedule" | "today" | "overdue" | "waiting" | "completed" | "trash";
type ParsedRowInput = { text: string; tag?: OutlineNode["tag"] };

type Props = {
  userId: string;
  onClose: () => void;
  presentation?: "floating" | "bench" | "inline";
  nodes: OutlineNode[];
  loading?: boolean;
  onAdd?: (themeId?: string) => void;
  onAddToRoutine?: (node: OutlineNode) => void;
  onChangeType: (nodeId: string, kind: OutlineCardType) => Promise<void>;
  onLoadPlanning: (node: OutlineNode) => Promise<import('../services/cardTypes').OutlinePlanningDetail[]>;
  onUnlinkPlanning: (node: OutlineNode, makeGroup: boolean) => Promise<void>;
  onSaveReadingLink: (nodeId: string, title: string, link: ReadingLink) => Promise<void>;
  onPlan: (node: OutlineNode) => void;
  getHabitProgress?: (id: string) => string;
  onHabitDragStart?: (habitId: string, event: React.DragEvent) => void;
  onHabitDragEnd?: () => void;
  onSaveHabitSettings: (node: OutlineNode) => Promise<boolean>;
  onToggleTask?: (node: OutlineNode) => void;
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
  onOpenLinked: (link: OutlineLink) => void;
  onRenameLinked: (link: OutlineLink, nextName: string) => Promise<boolean>;
  onLoadLinkedNote: (link: OutlineLink) => Promise<LinkedNoteResult>;
  onSaveLinkedNote: (link: OutlineLink, content: string) => Promise<LinkedNoteResult | null>;
  boardHabitIds: string[];
  focusNodeIdRequest?: string | null;
  focusRequestKey?: number;
  onNodesChange?: (nodes: OutlineNode[]) => void | Promise<void>;
  saveStatus?: "idle" | "saving" | "saved" | "error";
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

function setNodeTreeCollapsed(nodes: OutlineNode[], collapsed: boolean, rootId?: string): OutlineNode[] {
  return nodes.map((node) => {
    if (!rootId || node.id === rootId) {
      return {
        ...node,
        collapsed,
        children: setNodeTreeCollapsed(node.children, collapsed),
      };
    }
    return {
      ...node,
      children: setNodeTreeCollapsed(node.children, collapsed, rootId),
    };
  });
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

function parseRowInputPrefix(value: string): ParsedRowInput {
  const leadingSpace = value.match(/^\s*/)?.[0] ?? "";
  const text = value.slice(leadingSpace.length);
  const patterns: Array<{ pattern: RegExp; tag: OutlineNode["tag"] }> = [
    { pattern: /^-\s+\[\s?\]\s+/i, tag: "task" },
    { pattern: /^\[\s?\]\s+/i, tag: "task" },
    { pattern: /^todo:\s+/i, tag: "task" },
    { pattern: /^task:\s+/i, tag: "task" },
    { pattern: /^habit:\s+/i, tag: "habit" },
    { pattern: /^@\s+/, tag: "habit" },
    { pattern: /^-\s+/, tag: "note" },
    { pattern: /^•\s+/, tag: "note" },
  ];
  const match = patterns.find(({ pattern }) => pattern.test(text));
  if (!match) return { text: value };
  return {
    text: `${leadingSpace}${text.replace(match.pattern, "")}`,
    tag: match.tag,
  };
}

const peskyIntervalOptions = [
  { value: 15, label: "Every 15 min" },
  { value: 60, label: "Hourly" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" },
];

export default function PlanningOutlinerPanel({
  onClose,
  presentation = "floating",
  nodes,
  loading = false,
  onAdd,
  onAddToRoutine,
  onChangeType,
  onLoadPlanning,
  onUnlinkPlanning,
  onSaveReadingLink,
  onPlan,
  getHabitProgress,
  onHabitDragStart,
  onHabitDragEnd,
  onSaveHabitSettings,
  onToggleTask,
  themes,
  onCreateBlock,
  onCreateHabit,
  onCreateHabitBlock,
  onCreateThemeFromRow,
  onCreateRoutineFromRow,
  onOpenLinked,
  onRenameLinked,
  onLoadLinkedNote,
  onSaveLinkedNote,
  boardHabitIds,
  focusNodeIdRequest,
  focusRequestKey = 0,
  onNodesChange,
  saveStatus,
}: Props) {
  const nodesLoaded = !loading;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
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
  const [habitSettingsNodeId, setHabitSettingsNodeId] = useState<string | null>(null);
  const [selectedHabitLinkValue, setSelectedHabitLinkValue] = useState("");
  const [parentMoveNodeId, setParentMoveNodeId] = useState<string | null>(null);
  const [revealedMoveId, setRevealedMoveId] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ undo: OutlineMoveUndo; label: string } | null>(null);
  const [createParentNodeId, setCreateParentNodeId] = useState<string | null>(null);
  const [createParentName, setCreateParentName] = useState("");
  const [groupParentId, setGroupParentId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState('');
  const groupDraft = useRef<OutlineNode | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const draggingNodeRef = useRef<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ id: string; position: OutlineDropPosition } | null>(null);
  const [actionMenuNodeId, setActionMenuNodeId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"Details" | "Organize" | "Settings">("Details");
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [category, setCategory] = useState<OutlineCategory>("all");
  const [panelStatus, setPanelStatus] = useState("");
  useEffect(() => {
    if (saveStatus === "saved") setPanelStatus(current => current === "Change could not be saved. Retry saving the Outline." ? "" : current);
  }, [saveStatus]);
  const [lastTrashedIds, setLastTrashedIds] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<{ kind: "trash" | "move"; ids: string[] } | null>(null);
  const feedbackRevision = useRef(0);
  const [habitThemeSelections, setHabitThemeSelections] = useState<Record<string, string>>({});
  const [habitTargetDrafts, setHabitTargetDrafts] = useState<Record<string, string>>({});
  const noteSaveTimers = useRef<Record<string, number>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const handledFocusRequestRef = useRef<number | null>(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setPendingAction(null);
  }, [searchQuery, reviewFilter, category, focusNodeId]);



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

    if (presentation === "inline") return;
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, presentation]);

  useEffect(() => {
    if (!pendingFocusNodeId) return;
    const input = inputRefs.current[pendingFocusNodeId];
    if (!input) return;
    input.focus();
    setDetailTab("Details");
    setActionMenuNodeId(pendingFocusNodeId);
    setPendingFocusNodeId(null);
  }, [nodes, pendingFocusNodeId]);

  useEffect(() => {
    if (!revealedMoveId) return;
    const frame = requestAnimationFrame(() => {
      const row = inputRefs.current[revealedMoveId];
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    });
    const timer = window.setTimeout(() => setRevealedMoveId(null), 3000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [revealedMoveId]);

  useEffect(() => {
    if (!focusNodeIdRequest || !nodesLoaded) return;
    if (handledFocusRequestRef.current === focusRequestKey) return;
    if (!findNode(nodes, focusNodeIdRequest)) return;
    handledFocusRequestRef.current = focusRequestKey;
    setFocusNodeId(focusNodeIdRequest);
    setSearchQuery("");
    setReviewFilter("all");
    setCategory("all");
  }, [focusNodeIdRequest, focusRequestKey, nodes, nodesLoaded]);

  const activeNodes = useMemo(() => activeOutline(nodes), [nodes]);
  useEffect(() => {
    if (!focusNodeId) return;
    const frame = requestAnimationFrame(() => inputRefs.current[focusNodeId]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusNodeId]);
  const dropDestinations = useMemo(() => new Set(draggingNodeId
    ? outlineMoveDestinations(nodes, new Set([draggingNodeId])).map(item => item.id) : []), [nodes, draggingNodeId]);
  const trashRoots = useMemo(() => outlineTrashRoots(nodes), [nodes]);
  const focusResult = focusNodeId && reviewFilter !== "trash" ? findNode(activeNodes, focusNodeId) : null;
  const focusNode = focusResult?.node ?? null;
  const focusPath = focusResult?.path ?? [];
  const visibleNodes = reviewFilter === "trash" ? trashRoots : focusNode ? [focusNode] : activeNodes;
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
    if (reviewFilter === "trash") {
      const matches = (node: OutlineNode): boolean =>
        [node.text, node.draftNote].join(" ").toLowerCase().includes(normalizedSearch) || node.children.some(matches);
      return visibleNodes.filter(matches);
    }
    const nodeMatchesSearch = (node: OutlineNode) => {
      const linkedNote = linkedNotes[node.id]?.content ?? "";
      const searchable = [
        node.text,
        node.isGroup ? 'group subgroup' : node.tag,
        node.frequency,
        node.linked?.label,
        node.linked?.habitId ? "linked habit" : "",
        node.linked?.themeId && !node.linked?.habitId ? "linked theme" : "",
        (node.tag === 'task' || node.tag === 'link') && node.taskDone ? "done completed read" : "",
        node.readingLink?.url,
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

    const isNodeComplete = (node: OutlineNode) => ((node.tag === 'task' || node.tag === 'link') && node.taskDone) || !!node.linked?.blockId;
    const reminderDate = (node: OutlineNode) =>
      node.reminderAt ? toDateInputValue(new Date(node.reminderAt)) : null;
    const nodeMatchesFilter = (node: OutlineNode) => {
      if (reviewFilter === "all") return true;
      if (node.isGroup) return false;
      if (reviewFilter === "completed") return (node.tag === 'task' || node.tag === 'link') && node.taskDone;
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

    const planningNodes = filterOutlineCategory(visibleNodes, category);
    const baseNodes = reviewFilter !== "all" ? filterReviewNodes(planningNodes) : planningNodes;
    return normalizedSearch ? filterNodes(baseNodes) : baseNodes;
  }, [visibleNodes, normalizedSearch, linkedNotes, reviewFilter, todayDate, category]);

  const visibleCount = useMemo(() => {
    const count = (items: OutlineNode[]): number =>
      items.reduce((total, item) => total + 1 + count(item.children), 0);
    return count(displayedNodes);
  }, [displayedNodes]);
  const filteredViewActive = !!focusNode || !!normalizedSearch || reviewFilter !== "all" || category !== "all";
  const cardLayout = presentation === 'inline' && reviewFilter !== 'trash';
  // Use the full active branch so filtering out its children never changes its grouping.
  const groupRootIds = new Set(visibleNodes.filter(node =>
    node.isGroup || isThemeRow(node) || node.children.length > 0
  ).map(node => node.id));
  const groupedNodes = displayedNodes.filter(node => groupRootIds.has(node.id));
  const looseNodes = displayedNodes.filter(node => !groupRootIds.has(node.id));
  const navigationItems = outlineBranchItems(activeNodes).filter(node => isThemeRow(node) || node.isGroup || node.children.length > 0);

  const showAllRows = () => {
    setFocusNodeId(null);
    setSearchQuery("");
    setReviewFilter("all");
    setCategory("all");
  };

  const updateAndSave = (updater: (current: OutlineNode[]) => OutlineNode[], message?: string) => {
    const next = updater(cloneOutlineNodes(nodesRef.current));
    nodesRef.current = next;
    const revision = ++feedbackRevision.current;
    setPanelStatus(message ? "Saving change..." : "");
    Promise.resolve(onNodesChange?.(next)).then(() => {
      if (message && revision === feedbackRevision.current) setPanelStatus(message);
    }).catch(() => {
      if (revision === feedbackRevision.current) setPanelStatus("Change could not be saved. Retry saving the Outline.");
    });
  };

  const performOutlineMove = (ids: string[], updater: (current: OutlineNode[]) => OutlineNode[], message: string) => {
    const current = nodesRef.current;
    const next = updater(current);
    const undo = rememberOutlineMove(current, next, new Set(ids));
    if (!undo) return;
    setLastMove({ undo, label: ids.length === 1 ? findNode(current, ids[0])?.node.text || 'item' : `${undo.before.length} items` });
    updateAndSave(() => revealOutlineItem(next, ids[0]), message);
    showAllRows();
    setRevealedMoveId(ids[0]);
  };

  const undoLastMove = () => {
    if (!lastMove) return;
    const result = restoreOutlineMove(nodesRef.current, lastMove.undo);
    if (result.error) { setPanelStatus(result.error); return; }
    // The shared save retry retains this restored placement if persistence fails.
    setLastMove(null);
    updateAndSave(() => result.nodes, 'Move undone. Original placement restored.');
    showAllRows();
    setRevealedMoveId(lastMove.undo.before[0].id);
  };

  const moveRowOut = (node: OutlineNode) => {
    performOutlineMove([node.id], current => moveOutlineOut(current, node.id), `Moved ${node.text || 'item'} out one level.`);
    setParentMoveNodeId(null);
    setActionMenuNodeId(null);
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

  const updateRowText = (node: OutlineNode, value: string) => {
    const parsed = parseRowInputPrefix(value);
    const updates: Partial<OutlineNode> = { text: parsed.text };
    if (parsed.tag && parsed.text !== value && !node.linked && !node.isGroup) {
      updates.tag = parsed.tag;
      if (parsed.tag === "habit") {
        setHabitThemeSelections((current) => ({
          ...current,
          [node.id]: current[node.id] ?? themes[0]?.id ?? "",
        }));
      }
    }
    updateRow(node.id, updates);
  };

  const setFocusedTreeCollapsed = (collapsed: boolean) => {
    updateAndSave((current) => setNodeTreeCollapsed(current, collapsed, focusNode?.id));
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
    const renamed = await onRenameLinked(node.linked, label);
    mergeRowLink(node.id, {
      label: renamed ? label : node.linked.label,
      renameDeclinedFor: renamed ? null : label,
    });
  };

  const addRootOrFocusedChild = () => {
    setSearchQuery("");
    setReviewFilter("all");
    const node = createOutlineNode(category === "task" ? "New task" : "New note");
    if (category === "task") node.tag = "task";
    updateAndSave((current) =>
      focusNode ? addChild(current, focusNode.id, node) : [...current, node]
    );
    setPendingFocusNodeId(node.id);
  };

  const addChildWithFocus = (parentId: string) => {
    showAllRows();
    const node = createOutlineNode(category === "task" ? "New task" : "New note");
    if (category === "task") node.tag = "task";
    updateAndSave((current) => addChild(current, parentId, node));
    setPendingFocusNodeId(node.id);
  };

  const addSiblingWithFocus = (siblingId: string) => {
    showAllRows();
    const node = createOutlineNode(category === "task" ? "New task" : "New note");
    if (category === "task") node.tag = "task";
    updateAndSave((current) => addSibling(current, siblingId, node));
    setPendingFocusNodeId(node.id);
  };

  const trashRow = (id: string) => {
    const node = findNode(nodesRef.current, id)?.node;
    if (!node) return;
    setActionMenuNodeId(null);
    if (outlineBranchItems(node.children).length) setPendingAction({ kind: "trash", ids: [id] });
    else trashItems([id]);
  };

  const restoreRow = (id: string) => {
    const name = findNode(nodesRef.current, id)?.node.text || "Item";
    updateAndSave(current => updateOutlineNode(current, id, node => ({ ...node, trashedAt: null })), `Restored ${name} to Outline.`);
    setLastTrashedIds(current => current.filter(item => item !== id));
  };

  const trashItems = (ids: string[]) => {
    const roots = outlineSelectionRoots(nodesRef.current, new Set(ids));
    const affected = outlineBranchItems(roots);
    if (!roots.length) return;
    const rootIds = roots.map(node => node.id);
    updateAndSave(current => rootIds.reduce((items, id) => updateOutlineNode(items, id, node => ({ ...node, trashedAt: new Date().toISOString() })), current),
      affected.length === 1 ? `Moved ${roots[0].text || "item"} to Trash.` : `Moved ${affected.length} items to Trash.`);
    setLastTrashedIds(rootIds);
    setSelectedIds(new Set());
    setPendingAction(null);
    if (affected.some(node => node.id === focusNodeId)) setFocusNodeId(null);
  };

  const undoTrash = () => {
    const ids = lastTrashedIds.filter(id => findNode(nodesRef.current, id)?.node.trashedAt);
    updateAndSave(current => ids.reduce((items, id) => updateOutlineNode(items, id, node => ({ ...node, trashedAt: null })), current), "Restored items to their original places.");
    setLastTrashedIds([]);
  };

  const toggleSelected = (id: string) => setSelectedIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pendingRoots = pendingAction ? outlineSelectionRoots(nodes, new Set(pendingAction.ids)) : [];
  const pendingItems = outlineBranchItems(pendingRoots);
  const pendingUnfinishedCount = pendingItems.filter(node => node.tag === "task" && !node.taskDone).length;
  const confirmBulkMove = (parentId: string | null) => {
    if (!pendingAction || !pendingRoots.length) return;
    const destination = parentId ? findNode(nodesRef.current, parentId)?.node.text : "Outline (top level)";
    performOutlineMove(pendingRoots.map(node => node.id), current => moveOutlineSelection(current, new Set(pendingAction.ids), parentId), `Moved ${pendingRoots.length === 1 ? pendingRoots[0].text : `${pendingRoots.length} selected items`} to ${destination}.`);
    setPendingAction(null);
    setSelectedIds(new Set());
    setSelecting(false);
    showAllRows();
    setRevealedMoveId(pendingRoots[0].id);
  };

  const visibleSelectableItems = (items: OutlineNode[]): OutlineNode[] => items.flatMap(node => [node,
    ...(!node.collapsed || normalizedSearch || reviewFilter !== "all" || category !== "all" ? visibleSelectableItems(node.children) : []),
  ]);
  const selectableItems = visibleSelectableItems(displayedNodes);
  const selectedRoots = outlineSelectionRoots(nodes, selectedIds);

  const nestPreviousUnder = (id: string) => {
    const location = findNode(nodesRef.current, id);
    const siblings = location?.path[location.path.length - 2]?.children ?? nodesRef.current;
    const previous = siblings[siblings.findIndex(item => item.id === id) - 1];
    if (previous) performOutlineMove([previous.id], current => nestPreviousSiblingUnder(current, id), `Moved ${previous.text || 'item'} inside ${location?.node.text || 'item'}.`);
  };

  const indentRowUnderPrevious = (id: string) => {
    performOutlineMove([id], current => nestRowUnderPreviousSibling(current, id), 'Moved item inside the previous item.');
  };

  const openParentMovePanel = (node: OutlineNode) => {
    const nextOpen = parentMoveNodeId !== node.id;
    setParentMoveNodeId(nextOpen ? node.id : null);
    setCreateParentNodeId(null);
    setActionMenuNodeId(null);
  };

  const openCreateParentPanel = (node: OutlineNode) => {
    const nextOpen = createParentNodeId !== node.id;
    setCreateParentNodeId(nextOpen ? node.id : null);
    setParentMoveNodeId(null);
    setActionMenuNodeId(null);
    setCreateParentName("");
  };

  const saveParentMove = (node: OutlineNode, nextParentId: string | null) => {
    const destination = nextParentId ? findNode(nodesRef.current, nextParentId)?.node.text : "Outline (top level)";
    performOutlineMove([node.id], current => moveOutlineSelection(current, new Set([node.id]), nextParentId), `Moved ${node.text || "item"} ${nextParentId ? 'inside' : 'to'} ${destination}.`);
    setParentMoveNodeId(null);
    showAllRows();
    setRevealedMoveId(node.id);
  };

  const saveCreatedParent = (node: OutlineNode) => {
    const name = createParentName.trim();
    if (!name) return;

    const parentNode = createOutlineNode(name);
    parentNode.isGroup = true;
    performOutlineMove([node.id], (current) => {
      const result = wrapNodeInNewParent(current, node.id, parentNode);
      return result.wrapped ? result.nodes : current;
    }, `Moved ${node.text || 'item'} inside ${name}.`);
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
    if (node.linked?.blockId) {
      onOpenLinked(node.linked);
      return;
    }
    const label = node.text.trim();
    if (!label) return;
    const blockId = await onCreateBlock(label, {
      planDate,
      note: getNodeNoteForBlock(node),
      taskLabels: childLabelsForTasks(node),
      hashtag: node.tag === "task" ? "task" : node.tag === 'link' ? 'link' : node.tag === "note" ? "note" : undefined,
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
    onPlan(node);
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

  const clearOutlineDrag = () => {
    if (draggingNodeRef.current) onHabitDragEnd?.();
    draggingNodeRef.current = null;
    setDraggingNodeId(null);
    setDropPreview(null);
  };

  const previewOutlineDrop = (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggingNodeRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (!dropDestinations.has(targetId)) {
      event.dataTransfer.dropEffect = 'none';
      setDropPreview(null);
      return;
    }
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = outlineDropPosition(event.clientY, bounds.top, bounds.height);
    setDropPreview(current => current?.id === targetId && current.position === position ? current : { id: targetId, position });
  };

  const focusRow = (node: OutlineNode) => {
    if (node.collapsed) updateRow(node.id, { collapsed: false });
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
      const nodeLocation = findNode(nodesRef.current, node.id)!;
      const fullNode = nodeLocation.node;
      const siblings = nodeLocation.path.length > 1 ? nodeLocation.path[nodeLocation.path.length - 2].children : nodesRef.current;
      const previousSibling = siblings[siblings.findIndex(item => item.id === node.id) - 1];
      const hasChildren = node.children.length > 0;
      const isHabitLinked = !!node.linked?.habitId;
      const isThemeLinked = isThemeRow(node);
      const rowThemeId = isThemeLinked ? node.linked!.themeId! : nearestThemeId;
      const habitThemeId = habitThemeSelections[node.id] ?? rowThemeId ?? themes[0]?.id ?? "";
      const isBlockLinked = !!node.linked?.blockId;
      const isRoutineLinked = !!node.linked?.routineId;
      const isOnBoard = !!node.linked?.habitId && boardHabitIdSet.has(node.linked.habitId);
      const canMakeTheme = !node.linked && !!node.text.trim();
      const isDoneRow = (node.tag === 'task' || node.tag === 'link') && node.taskDone;
      const isCardRoot = cardLayout && depth === 0 && groupRootIds.has(node.id);
      const childCount = isCardRoot ? outlineBranchItems(node.children).length : 0;
      const dropPosition = dropPreview?.id === node.id ? dropPreview.position : null;
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
        <div key={node.id} className={`outliner-row-wrap${isCardRoot ? ' outliner-group-card' : ''}${dropPosition ? ` outliner-drop--${dropPosition}` : ''}`} role={isCardRoot ? 'region' : undefined} aria-label={isCardRoot ? node.text || 'Untitled group' : undefined} style={{ '--outline-drop-indent': `${depth * 18 + 8}px` } as React.CSSProperties}>
          <div
            className={[
              "outliner-row",
              node.isGroup && depth > 0 ? 'outliner-row--group-heading' : '',
              selecting ? "outliner-row--selecting" : "",
              dropPosition ? 'outliner-row--drop-target' : '',
              draggingNodeId === node.id ? 'outliner-row--dragging' : '',
              revealedMoveId === node.id ? "outliner-row--moved" : "",
              focusNodeId === node.id ? "outliner-row--focused" : "",
              isDoneRow ? "outliner-row--done" : "",
              node.linked ? "outliner-row--linked" : "",
            ].filter(Boolean).join(" ")}
            style={{ paddingLeft: `${depth * 18 + 8}px`, "--outline-indent": `${depth * 14}px` } as React.CSSProperties}
            onDragEnter={event => previewOutlineDrop(event, node.id)}
            onDragOver={event => previewOutlineDrop(event, node.id)}
            onDrop={(event) => {
              const draggedId = draggingNodeRef.current;
              if (!draggedId) return;
              event.preventDefault();
              event.stopPropagation();
              const bounds = event.currentTarget.getBoundingClientRect();
              const position = outlineDropPosition(event.clientY, bounds.top, bounds.height);
              const current = nodesRef.current;
              const next = applyOutlineDrop(current, draggedId, node.id, position);
              if (next !== current) {
                const sourceName = findNode(current, draggedId)?.node.text || 'item';
                performOutlineMove([draggedId], tree => applyOutlineDrop(tree, draggedId, node.id, position), `Moved ${sourceName} ${position} ${fullNode.text || 'item'}.`);
                showAllRows();
                setRevealedMoveId(draggedId);
              }
              clearOutlineDrag();
            }}
            onDragLeave={event => {
              if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
              setDropPreview(current => current?.id === node.id ? null : current);
            }}
          >
            {dropPosition && <span className="outliner-drop-hint" aria-hidden="true">
              {dropPosition === 'inside' ? <CornerDownRight size={16} /> : dropPosition === 'before' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              {dropPosition === 'inside' ? 'Inside' : dropPosition === 'before' ? 'Before' : 'After'}
            </span>}
            <button
              type="button"
              className="outliner-drag-handle"
              draggable={!selecting}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", node.tag === 'link' ? `outline-link:${node.id}` : node.id);
                event.dataTransfer.setData("application/outline-node-id", node.id);
                draggingNodeRef.current = node.id;
                setDropPreview(null);
                if (node.linked?.habitId) onHabitDragStart?.(node.linked.habitId, event);
                setDraggingNodeId(node.id);
              }}
              onDragEnd={clearOutlineDrag}
              title={isHabitLinked || node.tag === 'link' ? "Drag to move, nest or schedule" : "Drag to move or nest"}
              aria-label={`Drag ${node.text || 'item'} to move or nest`}
            >
              <GripVertical size={14} />
            </button>
            {hasChildren ? <button
              type="button"
              className="outliner-collapse"
              onClick={() => {
                updateRow(node.id, { collapsed: !node.collapsed });
              }}
              disabled={forceExpanded}
              aria-expanded={forceExpanded || !node.collapsed}
              aria-label={`${node.collapsed && !forceExpanded ? "Expand" : "Collapse"} ${node.text}`}
            >
              {node.collapsed && !forceExpanded ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
            </button> : <span className="outliner-collapse-space" aria-hidden="true" />}
            {selecting ? <button type="button" role="checkbox" aria-checked={selectedIds.has(node.id)} aria-label={`Select ${node.text}`} className="outliner-task-check" onClick={() => toggleSelected(node.id)}><span className="outliner-check-box" aria-hidden="true">{selectedIds.has(node.id) && <Check size={14} />}</span></button> : node.tag === "task" || node.tag === 'link' ? (
              <button
                type="button"
                className={`outliner-task-check ${node.taskDone ? "outliner-task-check--done" : ""}`}
                onClick={() => onToggleTask ? onToggleTask(node) : updateRow(node.id, { taskDone: !node.taskDone })}
                title={node.tag === 'link' ? (node.taskDone ? 'Mark unread' : 'Mark read') : node.taskDone ? "Mark task not done" : "Mark task done"}
                role="checkbox"
                aria-checked={node.taskDone}
                aria-label={`Complete ${node.text}`}
              >
                <span className="outliner-check-box" aria-hidden="true">{node.taskDone && <Check size={14} />}</span>
              </button>
            ) : (
              <span className="outliner-type-icon" title={isCardRoot ? "Group" : isThemeLinked ? "Theme" : node.isGroup ? "Group" : isRoutineLinked ? "Routine" : node.tag === "habit" ? "Habit" : "Note"}>
                {isCardRoot || isThemeLinked || node.isGroup ? <Folder size={16} /> : isRoutineLinked ? <ListChecks size={16} /> : node.tag === "habit" ? <Repeat2 size={16} /> : <StickyNote size={16} />}
              </span>
            )}
            <div className="outliner-row-title" role={isCardRoot ? 'heading' : undefined} aria-level={isCardRoot ? 3 : undefined} aria-label={isCardRoot ? node.text || 'Untitled group' : undefined}>
            <button
              type="button"
              ref={(element) => {
                inputRefs.current[node.id] = element;
              }}
              className={`outliner-input ${isDoneRow ? "outliner-input--done" : ""}`}
              aria-label={`${selecting ? "Toggle selection for" : "Details for"} ${node.text}`}
              onClick={() => { if (selecting) toggleSelected(node.id); else { setDetailTab("Details"); setActionMenuNodeId(node.id); } }}
            >{node.text || "Untitled"}</button>
            {isCardRoot && <span className="outliner-card-count">{childCount} {normalizedSearch || reviewFilter !== 'all' || category !== 'all' ? 'shown' : childCount === 1 ? 'item' : 'items'}</span>}
            </div>
            <span className="outliner-kind-label">{isThemeLinked ? "Theme" : node.isGroup ? "Group" : isRoutineLinked ? "Routine" : node.tag === "habit" ? "Habit" : node.tag === "task" ? "Task" : node.tag === 'link' ? 'Link' : "Note"}</span>
            {isHabitLinked && <span className="outliner-progress">{getHabitProgress?.(node.linked!.habitId!)}</span>}
            {(isBlockLinked || isRoutineLinked || isOnBoard || node.planDate || isDoneRow) && (
              <div className="outliner-link-pills">
                {isBlockLinked && <span>Planned</span>}
                {isRoutineLinked && <span>Routine</span>}
                {isOnBoard && <span>On board</span>}
                {node.planDate && <span>Plan {formatPlanDate(node.planDate, todayDate)}</span>}
                {isDoneRow && <span>Done</span>}
              </div>
            )}
            {!selecting && <div className="outliner-row-actions">
              <button type="button" className="outliner-move-action" title={`Move ${node.text} inside...`} aria-label={`Move ${node.text}`} onClick={() => openParentMovePanel(fullNode)}><FolderInput size={18} /></button>
              {isDoneRow && <button type="button" className="outliner-trash-btn" title={`Move ${node.text} to Trash`} aria-label={`Move ${node.text} to Trash`} onClick={() => trashRow(node.id)}><Trash2 size={18} /></button>}
              {!isDoneRow && !isThemeLinked && !node.isGroup && (
                <button
                  type="button"
                  className="outliner-plan-action"
                  title={`Plan ${node.text}`}
                  aria-label={`Plan ${node.text}`}
                  onClick={() => onPlan(node)}
                >
                  <CalendarDays size={18} />
                </button>
              )}
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
                  onClick={() => { setDetailTab("Organize"); setActionMenuNodeId(node.id); }}
                  title={`Actions for ${node.text}`}
                  aria-label={`Actions for ${node.text}`}
                >
                  <MoreHorizontal size={18} />
                </button>
                {actionMenuNodeId === node.id && (
                  <PlannerModal title={isThemeLinked ? "Theme details" : node.isGroup ? "Group details" : isRoutineLinked ? "Routine details" : node.tag === "habit" ? "Habit details" : node.tag === "task" ? "Task details" : node.tag === 'link' ? 'Link details' : "Note details"} onClose={() => setActionMenuNodeId(null)}>
                    <div className="outliner-detail-tabs" role="tablist" aria-label="Item details">
                      {(["Details", "Organize", "Settings"] as const).map((tab, tabIndex, tabs) => (
                        <button key={tab} type="button" role="tab" id={`outline-tab-${node.id}-${tab}`} aria-controls={`outline-panel-${node.id}`} aria-selected={detailTab === tab} tabIndex={detailTab === tab ? 0 : -1}
                          onClick={() => setDetailTab(tab)}
                          onKeyDown={event => {
                            const next = event.key === "ArrowRight" ? (tabIndex + 1) % tabs.length : event.key === "ArrowLeft" ? (tabIndex + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
                            if (next < 0) return;
                            event.preventDefault();
                            setDetailTab(tabs[next]);
                            (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
                          }}>{tab}</button>
                      ))}
                    </div>
                    <div className="outliner-action-menu" role="tabpanel" id={`outline-panel-${node.id}`} aria-labelledby={`outline-tab-${node.id}-${detailTab}`}>
                      <p className="outliner-item-name">{node.text || "Untitled"}</p>
                      {detailTab === "Details" && <>
                        {node.tag === 'link' ? <ReadingLinkEditor key={node.id} title={node.text} link={node.readingLink} onSave={(title, link) => onSaveReadingLink(node.id, title, link)} /> : <label>Name<input value={node.text} onChange={event => updateRowText(node, event.target.value)} onPaste={event => {
                          const url = publicWebUrl(event.clipboardData.getData('text/plain'));
                          if (url && !node.linked && !node.isGroup && node.tag !== 'habit') {
                            event.preventDefault();
                            updateRow(node.id, { text: readingSite(url), tag: 'link', readingLink: { url } });
                          }
                        }} onBlur={() => maybeSyncLinkedRename(node)} /></label>}
                        {isRoutineLinked && <button type="button" onClick={() => { onOpenLinked(node.linked!); setActionMenuNodeId(null); }}><ListChecks size={18} />Open routine</button>}
                        {!isThemeLinked && !isRoutineLinked && <OutlineTypePicker key={node.id} node={fullNode} onChange={kind => onChangeType(node.id, kind)} onLoadPlanning={onLoadPlanning} onUnlinkPlanning={onUnlinkPlanning} />}
                        {!isThemeLinked && !node.isGroup && !isDoneRow && <button type="button" onClick={() => { onPlan(fullNode); setActionMenuNodeId(null); }}><CalendarDays size={18} />Plan</button>}
                        <button type="button" onClick={() => { openRowNote(fullNode); setActionMenuNodeId(null); }}><StickyNote size={18} />Notes</button>
                        {onAddToRoutine && !isThemeLinked && !node.isGroup && !isRoutineLinked && <button type="button" onClick={() => { onAddToRoutine(fullNode); setActionMenuNodeId(null); }}><ListChecks size={18} />Add to routine</button>}
                        {(node.tag === "task" || node.tag === 'link') && <button type="button" onClick={() => { onToggleTask ? onToggleTask(fullNode) : updateRow(node.id, { taskDone: !node.taskDone }); setActionMenuNodeId(null); }}><Check size={18} />{node.taskDone ? "Mark unfinished" : node.tag === 'link' ? 'Mark read' : "Mark complete"}</button>}
                        <button type="button" className="outliner-delete" onClick={() => trashRow(node.id)}><Trash2 size={18} />{fullNode.children.length ? "Move item and nested items to Trash" : "Move to Trash"}</button>
                      </>}
                      {detailTab === "Organize" && <>
                        {!isThemeLinked && !node.isGroup && !isDoneRow && <button type="button" onClick={() => { onPlan(fullNode); setActionMenuNodeId(null); }}><CalendarDays size={18} />Plan</button>}
                        {onAddToRoutine && !isThemeLinked && !node.isGroup && !isRoutineLinked && <button type="button" onClick={() => { onAddToRoutine(fullNode); setActionMenuNodeId(null); }}><ListChecks size={18} />Add to routine</button>}
                        {!isThemeLinked && !isRoutineLinked && <button type="button" onClick={() => setDetailTab('Details')}>Change type</button>}
                        <button type="button" onClick={() => { groupDraft.current = null; setGroupName(''); setGroupError(''); setGroupParentId(node.id); setActionMenuNodeId(null); }}><Folder size={18} />Add subgroup</button>
                        <button type="button" onClick={() => { addChildWithFocus(node.id); setActionMenuNodeId(null); }}><Plus size={18} />Add inside</button>
                        <button type="button" onClick={() => { addSiblingWithFocus(node.id); setActionMenuNodeId(null); }}><Plus size={18} />Add after</button>
                        <button type="button" onClick={() => openParentMovePanel(fullNode)}>Move to...</button>
                        {nodeLocation.path.length > 1 && <button type="button" onClick={() => moveRowOut(fullNode)}><Outdent size={18} />Move out one level</button>}
                        <button type="button" onClick={() => openCreateParentPanel(fullNode)}>Place in a new group</button>
                        {hasChildren && <button type="button" onClick={() => focusRow(fullNode)}>Open just this branch</button>}
                        {category === "all" && reviewFilter === "all" && !normalizedSearch && index > 0 && previousSibling?.id === items[index - 1].id && <>
                          <button type="button" onClick={() => { indentRowUnderPrevious(node.id); setActionMenuNodeId(null); }}>Move inside previous item</button>
                          <button type="button" onClick={() => { nestPreviousUnder(node.id); setActionMenuNodeId(null); }}>Move previous item inside this</button>
                        </>}
                        <button type="button" className="outliner-delete" onClick={() => trashRow(node.id)}><Trash2 size={18} />{fullNode.children.length ? "Move item and nested items to Trash" : "Move to Trash"}</button>
                      </>}
                      {detailTab === "Settings" && <>
                        {node.linked && <button type="button" onClick={() => { onOpenLinked(node.linked!); setActionMenuNodeId(null); }}>{isThemeLinked ? "Theme settings" : isHabitLinked ? "Habit history" : isRoutineLinked ? "Open routine" : "Open planned item"}</button>}
                        {isHabitLinked && <button type="button" onClick={() => { setHabitSettingsNodeId(node.id); setActionMenuNodeId(null); }}>Habit goal and frequency</button>}
                        {!node.linked && node.tag !== "habit" && habitLinkTargets.length > 0 && <button type="button" onClick={() => { openHabitLinkPanel(fullNode); setActionMenuNodeId(null); }}>Link existing habit</button>}
                        {!node.linked && !node.isGroup && node.tag !== "habit" && <button type="button" onClick={() => { convertToBlock(fullNode, null); setActionMenuNodeId(null); }}>Send to Waiting</button>}
                        {!isThemeLinked && !node.isGroup && <button type="button" onClick={() => { openPlanPanel(fullNode); setActionMenuNodeId(null); }}>Day preference</button>}
                        {hasChildren && !node.linked && <button type="button" onClick={() => { createRoutineFromRow(fullNode); setActionMenuNodeId(null); }}>Make routine</button>}
                        {canMakeTheme && <button type="button" onClick={() => { convertToTheme(fullNode); setActionMenuNodeId(null); }}>Make theme</button>}
                        <button type="button" onClick={() => { openReminderPanel(fullNode); setActionMenuNodeId(null); }}>Reminder</button>
                      </>}
                    </div>
                  </PlannerModal>
                )}
              </div>
            </div>}
          </div>
          {node.tag === 'link' && node.readingLink && <div className="outline-reading-preview" style={{ marginLeft: `${depth * 18 + 44}px` }}><ReadingLinkCard link={node.readingLink} title={node.text} /></div>}
          {node.reminderAt && (
            <div
              className={`outliner-reminder-pill ${node.reminderKind === "pesky" ? "outliner-reminder-pill--pesky" : ""}`}
              style={{ marginLeft: `${depth * 18 + 44}px` }}
            >
              {node.reminderKind === "pesky" ? "Pesky" : "Reminds"} {formatReminder(node.reminderAt)}
            </div>
          )}
          {parentMoveNodeId === node.id && (
            <OutlineMovePicker nodes={nodes} ids={[node.id]}
              summary={`${node.text}${outlineBranchItems(fullNode.children).length ? ` and ${outlineBranchItems(fullNode.children).length} nested item${outlineBranchItems(fullNode.children).length === 1 ? '' : 's'}` : ''}`}
              currentParentId={nodeLocation.path[nodeLocation.path.length - 2]?.id ?? null}
              onMoveOut={nodeLocation.path.length > 1 ? () => moveRowOut(fullNode) : undefined}
              onMove={parentId => saveParentMove(fullNode, parentId)} onClose={() => setParentMoveNodeId(null)} />
          )}
          {createParentNodeId === node.id && (
            <PlannerModal title="New group" onClose={() => setCreateParentNodeId(null)}><div className="outliner-parent-panel outliner-parent-sheet">
              <span>Group name</span>
              <input
                aria-label="Group name"
                type="text"
                value={createParentName}
                onChange={(event) => setCreateParentName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  saveCreatedParent(node);
                }}
                placeholder="Group name..."
              />
              <button type="button" onClick={() => saveCreatedParent(node)} disabled={!createParentName.trim()}>
                Create
              </button>
              <button type="button" className="outliner-reminder-clear" onClick={() => setCreateParentNodeId(null)}>
                Cancel
              </button>
            </div></PlannerModal>
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
          {node.tag === "habit" && (!isHabitLinked || habitSettingsNodeId === node.id) && (
            <div className="outliner-habit-settings outliner-habit-setup" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              {!isHabitLinked && <><span>Theme</span>
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
              </select></>}
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
              <button type="button" onClick={async () => {
                if (isHabitLinked) {
                  const saved = await onSaveHabitSettings(node);
                  setPanelStatus(saved ? "Habit saved" : "Could not save habit. Please try again.");
                  if (saved) setHabitSettingsNodeId(null);
                } else await convertToHabit(node, habitThemeId);
              }}>
                Save habit
              </button>
              {!isHabitLinked && <button type="button" onClick={() => convertToHabitBlock(node, habitThemeId)}>
                Save + board
              </button>}
              {!isHabitLinked && habitLinkTargets.length > 0 && (
                <button type="button" className="secondary" onClick={() => openHabitLinkPanel(node)}>
                  Link existing
                </button>
              )}
            </div>
          )}
          {hasChildren && (forceExpanded || !node.collapsed) && <div className="outliner-children" style={{ '--branch-depth': depth } as React.CSSProperties}>
            {isCardRoot ? outlineCardSections(node.children, fullNode.children).map(section => (
              <div className={`outliner-card-section outliner-card-section--${section.key}`} key={section.key}>
                {section.label && <h4>{section.label}</h4>}
                {renderRows(section.items, depth + 1, forceExpanded, rowThemeId)}
              </div>
            )) : renderRows(node.children, depth + 1, forceExpanded, rowThemeId)}
          </div>}
          {isCardRoot && !selecting && <div className="outliner-group-footer">
            <button type="button" onClick={() => addChildWithFocus(node.id)} aria-label={`Add item inside ${node.text}`}><Plus size={18} />Add item</button>
            {focusNodeId !== node.id && <button type="button" onClick={() => focusRow(fullNode)} aria-label={`Open ${node.text}`}>Open<ChevronRight size={18} /></button>}
          </div>}
        </div>
	      );
	    });

  const filterOptions: Array<{ id: ReviewFilter; label: string }> = [
    { id: "all", label: "All active items" },
    { id: "review", label: "Review" },
    { id: "schedule", label: "Schedule" },
    { id: "today", label: "Today" },
    { id: "overdue", label: "Overdue" },
    { id: "waiting", label: "Waiting" },
    { id: "completed", label: "Completed" },
    { id: "trash", label: `Trash (${trashRoots.length})` },
  ];
  const filterNoticeText = [
    reviewFilter !== "all" ? filterOptions.find(filter => filter.id === reviewFilter)?.label : "",
    category !== "all" && reviewFilter !== "trash" ? (category === "task" ? "Tasks" : category === "note" ? "Notes" : category === 'link' ? 'Links' : "Habits") : "",
    normalizedSearch ? `Search: ${searchQuery.trim()}` : "",
    focusNode ? `Inside: ${focusNode.text}` : "",
  ].filter(Boolean).join(" / ");
  const emptyText = reviewFilter === "trash" && !normalizedSearch ? "Trash is empty." : normalizedSearch
    ? "No matching rows."
    : reviewFilter !== "all"
      ? "Nothing in this view at this level."
      : "No items here yet.";
  const footerQualifier = normalizedSearch
    ? "matching"
    : reviewFilter !== "all"
      ? "in this view"
      : "in view";

  return (
    <div className={`outliner-panel outliner-panel--${presentation}${cardLayout ? ' outliner-panel--cards' : ''}`} ref={panelRef}
      onDragOver={event => { if (!(event.target instanceof Element) || !event.target.closest('.outliner-row')) setDropPreview(null); }}
      onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropPreview(null); }}>
      <span className="outliner-drag-announcement" role="status" aria-live="polite" aria-atomic="true">
        {dropPreview ? `Move ${findNode(nodes, draggingNodeId || '')?.node.text || 'item'} ${dropPreview.position} ${findNode(nodes, dropPreview.id)?.node.text || 'item'}` : ''}
      </span>
      <div className="outliner-header">
        <div>
          <h2 className="outliner-title">Outline</h2>
        </div>
        {onAdd && <button className="outliner-capture" type="button" onClick={() => onAdd([...focusPath].reverse().find(isThemeRow)?.linked?.themeId)}><Plus size={18} />Capture</button>}
        {reviewFilter !== "trash" && <button type="button" className="outliner-select-toggle" aria-pressed={selecting} title={selecting ? "Done selecting" : "Select items"} aria-label={selecting ? "Done selecting" : "Select items"} onClick={() => { setSelecting(!selecting); setSelectedIds(new Set()); setActionMenuNodeId(null); }}>{selecting ? "Done selecting" : <ListChecks size={20} />}</button>}
        {presentation !== "inline" && <button className="outliner-header-btn" type="button" onClick={onClose} title="Close">
          x
        </button>}
      </div>

      <div className="outliner-controls">
      <label className="outliner-theme-jump">Jump to<select value={[...focusPath].reverse().find(node => navigationItems.some(item => item.id === node.id))?.id ?? ""} onChange={event => { showAllRows(); const node = navigationItems.find(item => item.id === event.target.value); if (node) focusRow(node); }}><option value="">Whole outline</option>{navigationItems.map(node => <option key={node.id} value={node.id}>{findNode(activeNodes, node.id)?.path.map(item => item.text || 'Untitled').join(' / ')}</option>)}</select></label>
      {reviewFilter !== "trash" && <div className="outliner-categories" role="group" aria-label="Outline category">{([['all', 'All'], ['task', 'Tasks'], ['note', 'Notes'], ['habit', 'Habits'], ['link', 'Links']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>)}</div>}

      <div className={`outliner-breadcrumbs ${focusNode ? "" : "outliner-breadcrumbs--root"}`}>
        <button type="button" onClick={() => setFocusNodeId(null)}>
          Outline
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
	          placeholder="Search Outline"
              aria-label="Search Outline"
	        />
	        {searchQuery && (
	          <button type="button" onClick={() => setSearchQuery("")}>
	            Clear
	          </button>
	        )}
	      </div>

      <label className="outliner-filter-select">View<select value={reviewFilter} onChange={event => setReviewFilter(event.target.value as ReviewFilter)}>{filterOptions.map(filter => <option key={filter.id} value={filter.id}>{filter.label}</option>)}</select></label>
      </div>

      <div className="outliner-workbar">
        <div className="outliner-workbar-context">
          <span>{focusNode ? "Focused outline" : "Whole outline"}</span>
          <strong>{visibleCount} item{visibleCount === 1 ? "" : "s"}</strong>
        </div>
        {reviewFilter !== "trash" && <div className="outliner-workbar-actions">
          <button type="button" onClick={() => setFocusedTreeCollapsed(false)} title="Expand all" aria-label="Expand all">
            <ChevronsUpDown size={18} />
          </button>
          <button type="button" onClick={() => setFocusedTreeCollapsed(true)} title="Collapse all" aria-label="Collapse all">
            <ChevronsDownUp size={18} />
          </button>
        </div>}
      </div>

      {filteredViewActive && (
        <div className="outliner-filter-notice">
          <span>{filterNoticeText}</span>
	          <button type="button" onClick={showAllRows}>
            Show all items
          </button>
        </div>
      )}

      {selecting && reviewFilter !== "trash" && <section className="outliner-selection-bar" aria-label="Selected items">
        <strong role="status">{selectedIds.size} selected</strong>
        <div>
          <button type="button" onClick={() => setSelectedIds(new Set(selectableItems.map(node => node.id)))}>Select shown</button>
          <button type="button" onClick={() => setSelectedIds(new Set(selectableItems.filter(node => (node.tag === "task" || node.tag === 'link') && node.taskDone).map(node => node.id)))}>Select completed</button>
          <button type="button" disabled={!selectedIds.size} onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
        <div>
          <button type="button" disabled={!selectedRoots.length} onClick={() => setPendingAction({ kind: "move", ids: [...selectedIds] })}>Move to...</button>
          <button type="button" disabled={!selectedRoots.length} onClick={() => setPendingAction({ kind: "trash", ids: [...selectedIds] })}><Trash2 size={18} />Move to Trash</button>
        </div>
      </section>}

      {panelStatus && (
        <div className="outliner-status-note" role="status">
          {panelStatus}
        </div>
      )}
      {lastTrashedIds.some(id => findNode(nodes, id)?.node.trashedAt) && <div className="outliner-trash-status"><span>Last removal</span><button type="button" onClick={undoTrash}><RotateCcw size={16} />Undo</button></div>}
      {lastMove && <div className="outliner-move-status" role="group" aria-label="Last Outline move">
        <span>Last move: <strong>{lastMove.label}</strong></span>
        <button type="button" onClick={undoLastMove}><RotateCcw size={16} />Undo move</button>
        <button type="button" className="outliner-dismiss-undo" title="Dismiss Undo move" aria-label="Dismiss Undo move" onClick={() => setLastMove(null)}><X size={18} /></button>
      </div>}

      {focusNode && (
        <div className="outliner-focus-card">
          <div>
            <span>Focused on</span>
            <strong>{focusNode.text.trim() || "Untitled"}</strong>
          </div>
          <button type="button" onClick={() => setFocusNodeId(null)}>
            All items
          </button>
        </div>
      )}

	      <div className="outliner-body">
	        {loading ? <div className="outliner-empty">Loading outline...</div> : displayedNodes.length === 0 ? (
	          <div className="outliner-empty">{emptyText}</div>
	        ) : reviewFilter === "trash" ? displayedNodes.map(node => (
            <div className="outliner-trash-row" key={node.id}>
              <div><strong>{node.text || "Untitled"}</strong>{node.children.length > 0 && <small>Includes nested items</small>}</div>
              <button type="button" title={`Restore ${node.text}`} aria-label={`Restore ${node.text}`} onClick={() => restoreRow(node.id)}><RotateCcw size={18} />Restore</button>
            </div>
          )) : cardLayout ? <>
            {groupedNodes.length > 0 && <div className={`outliner-group-grid${focusNode ? ' outliner-group-grid--focused' : ''}`}>
              {renderRows(groupedNodes, 0, !!normalizedSearch || reviewFilter !== 'all' || category !== 'all')}
            </div>}
            {looseNodes.length > 0 && <section className="outliner-ungrouped" aria-label={focusNode ? 'Focused item' : 'Ungrouped'}>
              {!focusNode && <h3>Ungrouped <span>{looseNodes.length}</span></h3>}
              {renderRows(looseNodes, 0, !!normalizedSearch || reviewFilter !== 'all' || category !== 'all')}
            </section>}
          </> : (
	          renderRows(displayedNodes, 0, !!normalizedSearch || reviewFilter !== "all" || category !== "all")
	        )}
	      </div>

	      <div className="outliner-footer">
	        <span>
          {visibleCount} item{visibleCount === 1 ? "" : "s"} {footerQualifier}
	        </span>
        {reviewFilter !== "trash" && <button type="button" onClick={() => onAdd ? onAdd([...focusPath].reverse().find(isThemeRow)?.linked?.themeId) : addRootOrFocusedChild()} disabled={loading}>
          <Plus size={18} /> Capture
        </button>}
      </div>
      {groupParentId && <PlannerModal title="Add subgroup" onClose={() => setGroupParentId(null)} busy={groupSaving}>
        <form className="capture-form" onSubmit={async event => {
          event.preventDefault();
          if (groupSaving || !groupName.trim()) return;
          if (!findNode(nodesRef.current, groupParentId)) { setGroupError('That parent is no longer available.'); return; }
          setGroupSaving(true); setGroupError('');
          const draft = groupDraft.current ?? { ...createOutlineNode(groupName.trim()), isGroup: true };
          groupDraft.current = draft;
          try {
            const current = nodesRef.current;
            await onNodesChange?.(findNode(current, draft.id) ? current : addChild(current, groupParentId, draft));
            showAllRows(); setGroupParentId(null); setPendingFocusNodeId(draft.id);
          } catch { setGroupError('Could not save the group. Please retry.'); }
          finally { setGroupSaving(false); }
        }}>
          <label>Group name<input autoFocus required value={groupName} disabled={groupSaving || !!groupDraft.current} onChange={event => setGroupName(event.target.value)} placeholder="Kitchen" /></label>
          <p>Inside {findNode(nodesRef.current, groupParentId)?.node.text}</p>
          {groupError && <p role="alert">{groupError}</p>}
          <footer><button type="button" disabled={groupSaving} onClick={() => setGroupParentId(null)}>Cancel</button><button type="submit" disabled={groupSaving || !groupName.trim()}>{groupSaving ? 'Saving...' : groupError ? 'Retry' : 'Add group'}</button></footer>
        </form>
      </PlannerModal>}
      {pendingAction?.kind === 'move' && <OutlineMovePicker nodes={nodes} ids={pendingAction.ids}
        summary={`${pendingRoots.length} selected items${pendingItems.length > pendingRoots.length ? ` and ${pendingItems.length - pendingRoots.length} nested items` : ''}`}
        onMove={confirmBulkMove} onClose={() => setPendingAction(null)} />}
      {pendingAction?.kind === 'trash' && <PlannerModal title="Move to Trash?" onClose={() => setPendingAction(null)}>
        <div className="outliner-batch-dialog">
          <p className="outliner-action-summary">{pendingRoots.length} selected item{pendingRoots.length === 1 ? "" : "s"}{pendingItems.length > pendingRoots.length ? ` and ${pendingItems.length - pendingRoots.length} nested items` : ""}</p>
          <ul>{pendingRoots.map(node => <li key={node.id}>{node.text || "Untitled"}</li>)}</ul>
          <>
            {pendingUnfinishedCount > 0 && <p>{pendingUnfinishedCount} unfinished task{pendingUnfinishedCount === 1 ? " is" : "s are"} included.</p>}
            <p>Items can be restored from Trash. Existing scheduled blocks and habit history will be kept.</p>
          </>
          <footer><button type="button" onClick={() => setPendingAction(null)}>Cancel</button><button type="button" disabled={!pendingRoots.length} onClick={() => trashItems(pendingAction.ids)}>Move to Trash</button></footer>
        </div>
      </PlannerModal>}
    </div>
  );
}

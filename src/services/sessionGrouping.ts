import { database, Block, SessionGroup, Habit } from "./database";

const ACCENT_COLORS = ["blue", "teal", "green", "orange", "coral", "amber"];

function getWeekStartDate(date: Date): string {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

function getNextColor(existingSessions: SessionGroup[]): string {
  const usedColors = existingSessions.map((s) => s.accent_color);
  for (const color of ACCENT_COLORS) {
    if (!usedColors.includes(color)) {
      return color;
    }
  }
  return ACCENT_COLORS[existingSessions.length % ACCENT_COLORS.length];
}

export type BlockPosition = {
  dayIndex: number;
  timeIndex: number;
};

export type AdjacentGroup = {
  blocks: Block[];
  positions: BlockPosition[];
};

function areBlocksAdjacent(
  block1: { day_index: number | null; time_index: number | null },
  block2: { day_index: number | null; time_index: number | null }
): boolean {
  if (
    block1.day_index === null ||
    block1.time_index === null ||
    block2.day_index === null ||
    block2.time_index === null
  ) {
    return false;
  }

  return (
    block1.day_index === block2.day_index &&
    Math.abs(block1.time_index - block2.time_index) === 1
  );
}

function isStrengthTrainingBlock(block: Block, habits: Habit[]): boolean {
  if (!block.is_habit_block || !block.habit_id) return false;
  const habit = habits.find((h) => h.id === block.habit_id);
  if (!habit || !habit.habit_group_id) return false;
  return true;
}

function findAdjacentGroups(
  blocks: Block[],
  habits: Habit[]
): AdjacentGroup[] {
  const strengthBlocks = blocks.filter(
    (b) =>
      b.location_type === "slot" &&
      b.day_index !== null &&
      b.time_index !== null &&
      isStrengthTrainingBlock(b, habits)
  );

  if (strengthBlocks.length < 2) return [];

  const visited = new Set<string>();
  const groups: AdjacentGroup[] = [];

  for (const block of strengthBlocks) {
    if (visited.has(block.id)) continue;

    const group: Block[] = [block];
    visited.add(block.id);

    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of strengthBlocks) {
        if (visited.has(candidate.id)) continue;

        for (const groupBlock of group) {
          if (areBlocksAdjacent(candidate, groupBlock)) {
            group.push(candidate);
            visited.add(candidate.id);
            changed = true;
            break;
          }
        }
      }
    }

    if (group.length >= 2) {
      const positions = group.map((b) => ({
        dayIndex: b.day_index!,
        timeIndex: b.time_index!,
      }));
      groups.push({ blocks: group, positions });
    }
  }

  return groups;
}

export async function updateSessionGroups(
  userId: string,
  blocks: Block[],
  habits: Habit[]
): Promise<void> {
  const weekStartDate = getWeekStartDate(new Date());
  const adjacentGroups = findAdjacentGroups(blocks, habits);

  const existingSessions = await database.sessionGroups.getForWeek(
    userId,
    weekStartDate
  );

  const blockIdsInGroups = new Set(
    adjacentGroups.flatMap((g) => g.blocks.map((b) => b.id))
  );

  const orphanedBlocks = blocks.filter(
    (b) => b.session_group_id && !blockIdsInGroups.has(b.id)
  );
  for (const block of orphanedBlocks) {
    await database.blocks.update(block.id, { session_group_id: null });
  }

  const sessionIdToBlocks = new Map<string, Set<string>>();
  for (const session of existingSessions) {
    const sessionBlocks = blocks.filter(
      (b) => b.session_group_id === session.id
    );
    sessionIdToBlocks.set(
      session.id,
      new Set(sessionBlocks.map((b) => b.id))
    );
  }

  const unusedSessionIds = new Set(existingSessions.map((s) => s.id));

  for (const group of adjacentGroups) {
    const blockIds = new Set(group.blocks.map((b) => b.id));

    let matchingSessionId: string | null = null;
    for (const [sessionId, sessionBlockIds] of sessionIdToBlocks.entries()) {
      const intersection = new Set(
        [...blockIds].filter((id) => sessionBlockIds.has(id))
      );
      if (intersection.size > 0) {
        matchingSessionId = sessionId;
        unusedSessionIds.delete(sessionId);
        break;
      }
    }

    if (matchingSessionId) {
      for (const block of group.blocks) {
        if (block.session_group_id !== matchingSessionId) {
          await database.blocks.update(block.id, {
            session_group_id: matchingSessionId,
          });
        }
      }
    } else {
      const sessionNumber = await database.sessionGroups.getNextSessionNumber(
        userId,
        weekStartDate
      );
      const accentColor = getNextColor(existingSessions);

      const newSession = await database.sessionGroups.create(
        userId,
        weekStartDate,
        sessionNumber,
        accentColor
      );

      for (const block of group.blocks) {
        await database.blocks.update(block.id, {
          session_group_id: newSession.id,
        });
      }
    }
  }

  for (const sessionId of unusedSessionIds) {
    const sessionBlocks = blocks.filter(
      (b) => b.session_group_id === sessionId
    );
    if (sessionBlocks.length === 0) {
      await database.sessionGroups.delete(sessionId);
    }
  }
}

export function getSessionDisplayName(session: SessionGroup): string {
  return session.custom_name || `Session ${session.session_number}`;
}

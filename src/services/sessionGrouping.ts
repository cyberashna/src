import { database, Block, SessionGroup, Habit, HabitGroup } from "./database";

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

  const verticallyAdjacent =
    block1.day_index === block2.day_index &&
    Math.abs(block1.time_index - block2.time_index) === 1;

  const horizontallyAdjacent =
    block1.time_index === block2.time_index &&
    Math.abs(block1.day_index - block2.day_index) === 1;

  return verticallyAdjacent || horizontallyAdjacent;
}

function isStrengthTrainingBlock(
  block: Block,
  habits: Habit[],
  habitGroups: HabitGroup[]
): boolean {
  if (!block.is_habit_block || !block.habit_id) {
    return false;
  }

  const habit = habits.find((h) => h.id === block.habit_id);
  if (!habit) {
    console.log(`Block ${block.label}: No habit found for habit_id ${block.habit_id}`);
    return false;
  }

  if (!habit.habit_group_id) {
    console.log(`Block ${block.label}: Habit ${habit.name} has no habit_group_id`);
    return false;
  }

  const group = habitGroups.find((g) => g.id === habit.habit_group_id);
  if (!group) {
    console.log(`Block ${block.label}: No group found for habit_group_id ${habit.habit_group_id}`);
    return false;
  }

  if (group.group_type !== "strength_training") {
    console.log(`Block ${block.label}: Group ${group.name} is type ${group.group_type}, not strength_training`);
    return false;
  }

  console.log(`✓ Block ${block.label}: IS strength training (group: ${group.name})`);
  return true;
}

function findAdjacentGroups(
  blocks: Block[],
  habits: Habit[],
  habitGroups: HabitGroup[]
): AdjacentGroup[] {
  console.log("=== findAdjacentGroups called ===");
  console.log("Total blocks:", blocks.length);
  console.log("Total habits:", habits.length);
  console.log("Total habit groups:", habitGroups.length);
  console.log("Strength training groups:", habitGroups.filter(g => g.group_type === "strength_training"));

  const strengthBlocks = blocks.filter(
    (b) =>
      b.location_type === "slot" &&
      b.day_index !== null &&
      b.time_index !== null &&
      isStrengthTrainingBlock(b, habits, habitGroups)
  );

  console.log("Found strength training blocks:", strengthBlocks.length);
  strengthBlocks.forEach(b => {
    const habit = habits.find(h => h.id === b.habit_id);
    console.log(`Block: ${b.label}, Day: ${b.day_index}, Time: ${b.time_index}, Habit: ${habit?.name}`);
  });

  if (strengthBlocks.length < 2) {
    console.log("Not enough strength blocks to form groups (need at least 2)");
    return [];
  }

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
            console.log(`✓ Adjacent: ${candidate.label} (Day ${candidate.day_index}, Time ${candidate.time_index}) ← → ${groupBlock.label} (Day ${groupBlock.day_index}, Time ${groupBlock.time_index})`);
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
      console.log(`Found adjacent group with ${group.length} blocks:`, group.map(b => b.label));
      groups.push({ blocks: group, positions });
    }
  }

  console.log(`Total adjacent groups found: ${groups.length}`);
  return groups;
}

export async function updateSessionGroups(
  userId: string,
  blocks: Block[],
  habits: Habit[],
  habitGroups: HabitGroup[]
): Promise<void> {
  console.log("=== updateSessionGroups called ===");
  const weekStartDate = getWeekStartDate(new Date());
  console.log("Week start date:", weekStartDate);
  const adjacentGroups = findAdjacentGroups(blocks, habits, habitGroups);
  console.log("Adjacent groups to process:", adjacentGroups.length);

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
      console.log(`Updating existing session ${matchingSessionId} with ${group.blocks.length} blocks`);
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

      console.log(`Creating new session #${sessionNumber} with color ${accentColor} for ${group.blocks.length} blocks`);

      const newSession = await database.sessionGroups.create(
        userId,
        weekStartDate,
        sessionNumber,
        accentColor
      );

      console.log(`Created session with ID: ${newSession.id}`);

      for (const block of group.blocks) {
        console.log(`Assigning block ${block.label} to session ${newSession.id}`);
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

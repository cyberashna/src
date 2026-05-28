import { useState } from "react";
import type { Block } from "../App";

type Priority = { block_id: string | null; priority_rank: number };

interface Props {
  blocks: Block[];
  dailyPriorities: Priority[];
  todayDayIndex: number;
  weekOffset: number;
  onComplete: (blockId: string) => void;
}

function getTimeLabel(timeIndex: number): string {
  const hour = 6 + Math.floor(timeIndex / 2);
  const min = timeIndex % 2 === 0 ? "00" : "30";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "am" : "pm";
  return `${h}:${min}${ampm}`;
}

export default function DailyFocus({ blocks, dailyPriorities, todayDayIndex, weekOffset, onComplete }: Props) {
  const [dismissing, setDismissing] = useState(false);

  if (weekOffset !== 0 || todayDayIndex === -1) return null;

  const todayBlocks = blocks.filter(
    (b) => b.location.type === "slot" && b.location.dayIndex === todayDayIndex && !b.completed
  );

  if (todayBlocks.length === 0) return null;

  // Pick: priority rank 1 first, then earliest time slot
  const priority1Id = dailyPriorities.find((p) => p.priority_rank === 1)?.block_id;
  const focusBlock =
    todayBlocks.find((b) => b.id === priority1Id) ??
    [...todayBlocks].sort((a, b) => {
      const ai = a.location.type === "slot" ? a.location.timeIndex : 999;
      const bi = b.location.type === "slot" ? b.location.timeIndex : 999;
      return ai - bi;
    })[0];

  if (!focusBlock) return null;

  const timeIndex = focusBlock.location.type === "slot" ? focusBlock.location.timeIndex : null;
  const isPriority1 = focusBlock.id === priority1Id;

  function handleDone() {
    setDismissing(true);
    setTimeout(() => onComplete(focusBlock.id), 320);
  }

  return (
    <div className={`daily-focus-card${dismissing ? " daily-focus-dismissing" : ""}`}>
      <div className="daily-focus-eyebrow">
        {isPriority1 ? "Top priority today" : "Up next today"}
      </div>
      <div className="daily-focus-body">
        <div className="daily-focus-label">{focusBlock.label}</div>
        {timeIndex !== null && (
          <div className="daily-focus-time">{getTimeLabel(timeIndex)}</div>
        )}
      </div>
      <button className="daily-focus-done-btn" onClick={handleDone}>
        Mark done
      </button>
    </div>
  );
}

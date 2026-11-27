import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

process.env.TZ = "America/New_York";
const importTs = async (path) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
};
const { countHabitProgress, habitPeriod, localDateKey } = await importTs("../src/services/habitProgress.ts");
const { getWeekStartDateString } = await importTs("../src/utils/dateUtils.ts");
const habit = (id = "walk", frequency = "weekly", parentHabitId) => ({ id, frequency, doneCount: 16, parentHabitId });
const block = (id, week = "2026-10-12", day = 0, habitId = "walk") => ({
  id, habit_id: habitId, completed: true, location_type: "slot",
  week_start_date: week, day_index: day, block_habit_credits: [], block_activity_logs: [],
});
const count = (habits, blocks, date = "2026-10-12") =>
  countHabitProgress(habits, blocks, new Date(date + "T12:00:00"));
const manual = (id, timestamp) => ({
  ...block(id), location_type: "unscheduled", week_start_date: null, day_index: null,
  block_activity_logs: [{ habit_id: "walk", completed_at: timestamp }],
});

test("16 lifetime completions cannot inflate two completions this week", () => {
  const old = Array.from({ length: 16 }, (_, i) => block("old-" + i, "2026-10-05"));
  assert.equal(count([habit()], [...old, block("one"), block("two")]).get("walk"), 2);
  assert.equal(count([habit()], [...old, block("one")], "2026-10-19").get("walk"), 0);
  assert.equal(count([habit()], old, "2026-10-05").get("walk"), 16);
});

test("weekly range ends at Monday, including across daylight saving time", () => {
  const records = [block("sunday", "2026-10-26", 6), block("monday", "2026-11-02", 0)];
  assert.equal(count([habit()], records, "2026-11-01").get("walk"), 1);
  assert.equal(count([habit()], records, "2026-11-02").get("walk"), 1);
});

test("daily goals reset at local midnight, not UTC midnight", () => {
  const records = [manual("late", "2026-10-13T03:59:00Z"), manual("next", "2026-10-13T04:01:00Z")];
  assert.equal(count([habit("walk", "daily")], records, "2026-10-12").get("walk"), 1);
  assert.equal(count([habit("walk", "daily")], records, "2026-10-13").get("walk"), 1);
});

test("monthly progress includes all weeks of the month and resets in the next month", () => {
  const records = [block("sep", "2026-09-28", 2), block("oct1", "2026-09-28", 3),
    block("oct15", "2026-10-12", 3), block("oct31", "2026-10-26", 5), block("nov1", "2026-10-26", 6)];
  assert.equal(count([habit("walk", "monthly")], records, "2026-10-15").get("walk"), 3);
  assert.equal(count([habit("walk", "monthly")], records, "2026-11-01").get("walk"), 1);
});

test("backdated scheduled completions count on their assigned day", () => {
  const record = block("past", "2026-10-05", 1);
  record.block_activity_logs.push({ habit_id: "walk", completed_at: "2026-10-12T18:00:00Z" });
  assert.equal(count([habit()], [record]).get("walk"), 0);
  assert.equal(count([habit()], [record], "2026-10-06").get("walk"), 1);
});

test("direct Done clicks have dated progress and no carryover next week", () => {
  const record = manual("done", "2026-10-12T16:00:00Z");
  assert.equal(count([habit()], [record]).get("walk"), 1);
  assert.equal(count([habit()], [record], "2026-10-19").get("walk"), 0);
});

test("duplicate logs and parent cross-credits count a block once per habit", () => {
  const record = block("one");
  record.block_habit_credits = [{ habit_id: "parent" }, { habit_id: "other-child" }];
  record.block_activity_logs = Array(3).fill({ habit_id: "walk", completed_at: "2026-10-12T16:00:00Z" });
  const habits = [habit("walk", "weekly", "parent"), habit("parent"), habit("other-child", "weekly", "parent")];
  const result = count(habits, [record, record]);
  assert.equal(result.get("walk"), 1);
  assert.equal(result.get("parent"), 1);
  assert.equal(result.get("other-child"), 1);
});

test("unchecked or deleted blocks do not count, even with stale logs", () => {
  const record = manual("undone", "2026-10-12T16:00:00Z");
  assert.equal(count([habit()], [{ ...record, completed: false }]).get("walk"), 0);
  assert.equal(count([habit()], []).get("walk"), 0);
});

test("unknown old manual totals are not guessed into the current period", () => {
  assert.equal(count([habit()], [{ ...block("unknown"), location_type: "unscheduled" }]).get("walk"), 0);
});

test("genuine completions are not capped to the goal, and no-target habits retain their total", () => {
  assert.equal(count([habit()], Array.from({ length: 4 }, (_, i) => block(String(i)))).get("walk"), 4);
  assert.equal(count([habit("walk", "none")], []).get("walk"), 16);
});

test("week keys remain local Mondays east of UTC", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "Asia/Tokyo";
    const key = getWeekStartDateString();
    assert.equal(new Date(key + "T12:00:00").getDay(), 1);
    assert.deepEqual(habitPeriod("weekly", new Date("2026-10-12T00:01:00")), { start: "2026-10-12", end: "2026-10-19" });
    assert.equal(localDateKey(new Date("2026-10-11T15:01:00Z")), "2026-10-12");
  } finally { process.env.TZ = previous; }
});

test("progress history is paginated beyond the backend's default result limit", async () => {
  const records = Array.from({ length: 1201 }, (_, i) => block(String(i)));
  const filters = [];
  const ranges = [];
  const supabase = { from(table) {
    assert.equal(table, "blocks");
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      order() { return query; },
      async range(from, to) { ranges.push([from, to]); return { data: records.slice(from, to + 1), error: null }; },
    };
    return query;
  } };
  const source = readFileSync(new URL("../src/services/database.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)(() => ({ supabase }), exports);
  const loaded = await exports.database.blocks.getHabitProgress("test-user");
  assert.equal(loaded.length, 1201);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
  assert.ok(filters.some(([key, value]) => key === "user_id" && value === "test-user"));
  assert.ok(filters.some(([key, value]) => key === "completed" && value === true));
  assert.ok(!filters.some(([key]) => key === 'is_habit_block'), 'one-off blocks with habit credits must be included');
});

test('one-off grid notes count only when checked and only in their assigned period', () => {
  const oneOff = { ...block('one-off', '2026-11-02', 0, null), block_habit_credits: [{ habit_id: 'walk' }] };
  assert.equal(count([habit()], [{ ...oneOff, completed: false }], '2026-11-02').get('walk'), 0);
  assert.equal(count([habit()], [oneOff], '2026-11-02').get('walk'), 1);
  assert.equal(count([habit()], [oneOff], '2026-11-09').get('walk'), 0);
  assert.equal(count([habit()], [{ ...oneOff, completed: false }], '2026-11-02').get('walk'), 0);
});

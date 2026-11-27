import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const compiled = ts.transpileModule(readFileSync(new URL('../src/services/planningDate.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { planningDate } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
test('date-only plans resolve Mondays and future weeks without borrowing the visible week', () => {
  assert.deepEqual(planningDate('2026-10-27', new Date('2026-10-14T12:00:00')), { weekStartDate: '2026-10-26', dayIndex: 1, weekOffset: 2 });
});
test('Sunday belongs to the preceding Monday, including year boundaries', () => {
  assert.deepEqual(planningDate('2027-01-03', new Date('2027-01-04T12:00:00')), { weekStartDate: '2026-12-28', dayIndex: 6, weekOffset: -1 });
});
test('DST does not shift a selected date or week', () => {
  const previous = process.env.TZ;
  try { process.env.TZ = 'America/New_York'; assert.equal(planningDate('2026-11-02', new Date('2026-10-26T12:00:00')).weekOffset, 1); }
  finally { process.env.TZ = previous; }
});
test('invalid dates fail before saving', () => {
  for (const date of ['', 'bad', '2026-02-30', '2026-13-01']) assert.throws(() => planningDate(date), /valid day/);
});

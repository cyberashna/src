# Habit Care Planner Handoff

Updated November 26, 2026. Prepared for Natasha and the next coding chat.

Habit Care Planner is a calm, forgiving place to capture thoughts, organize them in an Outline, and decide later whether they belong on the calendar or in a routine. The most important current direction is **capture first, Outline as the core, planning without pressure**.

The user requested this handoff while the latest approved capture changes were being implemented. That implementation is paused and incomplete. Preserve all existing work. Do not mistake the interactive preview for finished application functionality.

## Start Here

1. Read this handoff and run `git status --short` before changing anything.
2. Inspect the two unfinished components listed under Current Implementation Boundary. The current TypeScript check fails on their incomplete integration.
3. Continue the approved capture and contextual Move design, using the existing persistence and canonical habit/theme relationships.
4. Test desktop and phone behavior without modifying the user's actual stored data.
5. Prepare a reviewed checkpoint and integration plan. The user wants to merge soon, but no commit, push, or merge was performed during this handoff.

## Repository and Runtime

Repository:

```text
/Users/natashablake/Documents/Codex/2026-05-31/github-plugin-github-openai-curated-read/work/src
```

- Active application: React/Vite in the repository's `src/`, wrapped by Capacitor Android.
- The old `/mobile` React Native project is not the active phone application.
- Branch: `main`.
- Local checkpoint: `93eabc0 Checkpoint Android phone experience`.
- Local branch metadata reports `main` one commit ahead of `origin/main`. No remote fetch was performed for this handoff, so this is not a freshly verified remote comparison.
- Current browser URL: `http://127.0.0.1:5186/`.
- Last recorded Vite command: `env CHOKIDAR_USEPOLLING=true npm run dev -- --host 127.0.0.1 --port 5186 --strictPort`.
- Vite has sometimes served stale transformed modules. Verify the actual served UI when a change does not appear; restart the appropriate server rather than accumulating more ports.
- `dist/` is tracked and already contains generated changes. During verification, use a temporary build directory to avoid unnecessary asset churn.

The working tree is intentionally very dirty. It includes Android changes, large existing App and Outline changes, generated assets, dependencies, new components, services, and tests. Never reset, clean, checkout, discard, or overwrite unrelated changes. A tracked-only diff does not include the substantial untracked work.

## Product Principles

### Capture is central

The user's clearest description:

> A place to rapid capture that is intuitive. Outline that keeps that capture separated by categories (task, note, habit) and then easily dispersed onto the calendar or routine.

- Capturing must not require opening a hierarchy, finding the perfect parent, choosing a time, or completing a large form.
- Ungrouped is a valid destination, not a failure state.
- Make subsequent organization easy at the item itself.
- Allow choosing a destination before capture, but do not make it mandatory.
- Support several captures in a row without closing and reopening a dialog.
- Avoid silently creating placeholder rows such as repeated "New row" entries before the user has entered something meaningful.

### Outline is the structural home

- Themes and Outline should be one coherent experience, not competing stores or separate hierarchies.
- Themes are Outline rows. Groups and subgroups organize material without becoming calendar commitments.
- Do not visually split "collections" from "themes". The user explicitly rejected that distinction.
- Tasks, notes, habits, links, routines, and future plans belong in the same structural home.
- It should be easy to put an item under a group or another appropriate row and immediately understand its parent visually.
- Use familiar names. Do not rename everything to "care items".
- Preserve canonical habit/theme/routine links when moving or converting rows; a visual reorganization must not produce a second disconnected record.

### Planning is optional and forgiving

- Today is the daily command surface.
- Outline is the structural and capture home.
- Plan turns material into deliberate date/time commitments.
- Inbox/Waiting holds loose blocks. The user liked Waiting being sectioned off within a shared chooser rather than becoming another disconnected workflow.
- Soft or loose planning should be genuinely useful, not just an intention hidden in Outline.
- The user especially liked the idea of loose plans appearing as **dotted suggested cards**, with optional commitment later.
- Avoid productivity-shaming, punitive overdue messaging, or artificial urgency.

### Routines are casual checklists

- Do not automatically put routines on the calendar grid.
- The user liked routines as an optional widget.
- Requested improvements: gentle history, essential steps, a timer, and last-used status.
- Workouts can support routines, exercise/history, body focus, and progression.
- Household themes can represent recurring care by room or area with gentle timing and status.

## Visual Direction and Inspirations

- Earlier inspiration: Legend-style outlining and GGC/digital planners.
- Current direction moves away from a dense Workflowy-like tree toward **open theme cards**.
- A family wall-calendar reference appealed to the user: readable day columns, clearly separated tiles, restrained color, and an at-a-glance weekly view.
- The user also referenced `https://kynso.app` and Bullet Daily Planner Journal: `https://apps.apple.com/us/app/bullet-daily-planner-journal/id1537777571`.
- These are inspirations, not templates to copy. Do not invent product comparisons from memory; inspect those products again if a new comparison is needed.
- Keep the working surface practical and calm, not a marketing page or decorative dashboard.
- Use visible, recognizable actions; do not hide all basic functions behind long presses or hover.
- Provide desktop and mobile-appropriate placement, clear selection state, generous touch targets, and readable hierarchy.
- Avoid nested cards. Nested structure inside a theme card should use indentation, headings, and subtle dividers.
- Preserve viewport position and user context when organizing material.

## Decisions the User Explicitly Approved

### Open theme cards

The user chose the first proposal, called **Open theme cards**, and reaffirmed that choice.

Implemented before the latest capture work:

- Top-level themes, groups, and parent branches share an open card appearance.
- No separate Collection/Theme/Group eyebrow labels.
- Card title with child count beneath and a neutral header.
- Direct children grouped into Tasks, Habits, Notes, Links, and Routines where applicable.
- Nested branches stay intact rather than becoming nested cards.
- Add item and Open actions on cards.
- A Jump to selector includes nested branches with their paths, not just themes.
- Ungrouped remains an unframed section, not another stored container.
- Grouping is presentation-only; it must not rewrite stored sibling order or lose associations.

### Capture without unfolding

The user's problem: it is too much work to unfold everything, find the right destination, and then add or move an item.

Approved design:

1. A text-first quick capture area in Outline with Task, Note, and Habit choices.
2. A searchable **Put under...** picker that finds all eligible destinations, even inside collapsed groups.
3. Full paths for disambiguation, plus pinned and recent destinations.
4. Destination optional; default to Ungrouped.
5. Save clears the text but retains the chosen destination for continued capture.
6. Add inside a card or subgroup presets that exact parent without requiring the user to unfold it first.
7. A saved confirmation with Undo, without navigating away.

The user said the first path, choosing a destination before entering the task, was great.

### Contextual movement after capture

The first preview reused the capture picker at the top when the user clicked a saved item's folder. The user rejected the need to look or scroll back up.

Approved correction:

- Clicking an existing item's folder opens Move next to that item on desktop.
- A mobile presentation can use a bottom sheet, respecting safe areas and the keyboard.
- The same search, pinned places, recent places, and paths are available.
- After moving, preserve the current view and scroll context. Do not automatically unfold the destination or navigate to it.
- Show a nearby destination confirmation with Undo.
- In the revised interactive preview, the picker sits directly beneath the selected row and the confirmation replaces its original space.

The user called that revised preview "Perfect" and explicitly authorized implementation.

## Other Requested Work and Useful Concepts

These are important product requirements from the conversation. Many have corresponding code now, but they are not all freshly verified by this handoff.

- Create a task or temporary note directly from a weekly grid slot.
- Long-press or otherwise open a grid tile's actions to turn it into an Outline entry, choose its type, and choose its destination.
- Let a temporary grid item count toward an existing Outline item without saving another permanent row.
- Open a block's attached note directly from a recognizable icon on its grid tile.
- Attach an occurrence-only temporary note to a scheduled instance of a saved Outline item without overwriting the saved note.
- Set a timer for a grid tile to go off in a chosen number of minutes, including temporary notes and saved items.
- Represent reading links/articles with useful titles and thumbnails when planned on the grid.
- Change card type in Outline and from grid-related actions. Make Group suitable for subthemes/headings.
- Expose linked plans and a way to remove them if they prevent conversion to a group. A hidden plan must not leave the user stuck.
- Make deleting/completing finished Outline material easy, with reversible removal where appropriate.
- Make parent-child relationships visually obvious and moving easy through direct controls, searchable destinations, and drag/drop.
- Habit progress must be scoped to its actual goal period. The user previously saw misleading counts such as 16/3.
- Android must respect the Pixel camera cutout and system safe areas.
- Preserve saved Outline content across phone updates. The user previously reported missing outlines and repeated placeholder rows after an update.

## UX Guidance the User Found Useful

The user responded positively to applying established interaction guidance and asked where it came from and what else it suggested.

Relevant references already used in the conversation:

- [Nielsen Norman Group on recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/): inform visible choices, remembered destinations, full paths, and reduced reliance on remembering where an item lives.
- [Nielsen Norman Group on cards](https://www.nngroup.com/articles/cards-component/): inform coherent, scannable group cards.
- [Nielsen Norman Group on common region](https://www.nngroup.com/articles/common-region/): inform visual grouping with a shared boundary rather than more labels or deeper nesting.
- [UC Berkeley card accessibility guidance](https://dap.berkeley.edu/websites/accessibility-guidance-developers/card-ui-component): a reference for accessible card structure and identifiable actions.

Our product-specific applications, not verbatim prescriptions from those sources: optional organization, search across collapsed destinations, pinned/recent places, local Move controls, continuous capture, safe Undo, and category sections inside theme cards.

## Current Implementation Boundary

### What was completed before this interrupted change

The open theme card pass was implemented and verified. The preceding run recorded **229 passing tests** and a successful build. Desktop and narrow mobile layouts were checked, including a 320px width without horizontal overflow. Those results apply to that earlier state, not the newly added drafts below.

Primary files for that completed pass:

```text
src/components/PlanningOutlinerPanel.tsx
src/PlannerShell.css
src/services/outlineModel.ts
tests/outlineControls.test.mjs
tests/outlineModel.test.mjs
```

`outlineCardSections(items, fullItems)` groups direct children for display while preserving nested structure and category order. Full-tree information prevents filtering from changing a parent's identity. Existing planning, Move, selection, Trash, and Undo behavior should be preserved.

### New draft files created immediately before this handoff

```text
src/components/OutlineDestinationPicker.tsx
src/components/OutlineQuickCapture.tsx
```

These files are **not imported or wired into the live app yet**. No new styling or integration was completed for them. No new tests have been added for them.

`OutlineDestinationPicker.tsx` currently drafts:

- Shared searchable destinations using `outlineMoveDestinations`.
- Exclusion of the moving branch and its descendants through existing model logic.
- Ungrouped, Pinned, Recent, and All destinations sections.
- User-scoped device preference storage under `outline-destinations:${userId}`.
- Full-path labels, focus without scrolling, Escape/close handling, and pin actions.

`OutlineQuickCapture.tsx` currently drafts:

- Name-first capture, Task/Note/Habit buttons, parent selection, repeated save, and saved confirmation.
- A callback-based Undo, not implemented in the parent yet.
- Error preservation and a duplicate-submit guard.
- A requested parent/focus interface for Add inside actions.

**Current verified compiler failure**, from `npx tsc --noEmit` during handoff:

```text
src/components/OutlineQuickCapture.tsx(32,60): error TS2353:
Object literal may only specify known properties, and 'parentId'
does not exist in type 'NewPlannerItem'.
```

Do not claim the current branch builds. Resolve the destination contract properly as part of integration, not just by suppressing this error.

### Integration still needed

1. Extend the capture contract to represent an explicit Outline parent ID, including explicit Ungrouped. Distinguish an omitted parent from an explicitly chosen root.
2. Update `addPlannerItem` in `src/App.tsx` to honor that parent using the canonical save path. It currently places by theme and contains partial-save retry/deduplication logic for habits, themes, and routines. Preserve that logic.
3. Validate stale/deleted/trashed destinations at save time. Never silently lose a capture or place it under a missing parent.
4. Preserve collapsed state on capture and contextual moves. Existing `addChild` and `moveOutlineSelection` expand the parent; use deliberate behavior for this new flow without breaking drag/drop and existing reveal flows.
5. Wire quick capture into `PlanningOutlinerPanel`; wire Add inside to preset its parent instead of creating a placeholder row and opening Details.
6. Reuse the destination chooser in the relevant global capture flow, while retaining existing Link, routine, theme, notes, and habit settings capabilities.
7. Implement contextual desktop Move and mobile presentation. `OutlineMovePicker.tsx` currently wraps a `PlannerModal`; it has not been converted.
8. Stop contextual Move from invoking automatic destination reveal. `performOutlineMove`, `saveParentMove`, and `undoLastMove` currently use reveal/show-all behavior. Keep intentional reveal behavior where it remains useful elsewhere.
9. Provide nearby move feedback and Undo. Preserve safe undo under later edits, persistence failure, and concurrent tree changes. Avoid restoring a stale whole-tree snapshot.
10. Implement safe capture Undo. Do not accidentally delete later children, leave orphaned canonical records, or remove linked calendar data without explicit semantics.
11. Style and test all states: keyboard, mobile keyboard, long paths/names, duplicate names, empty search, collapsed branches, repeated capture, invalid parent, failed saves/retry, moving a whole branch, Undo, and account isolation for destination preferences.

## Code Map

- `src/App.tsx`: canonical app orchestration; `addPlannerItem`, `saveOutlineNodes`, capture dialog, planning callbacks, and canonical links.
- `src/components/PlannerShell.tsx`: main navigation, `NewPlannerItem`, `PlannerModal`, `AddPlannerDialog`, planning and routine dialogs.
- `src/components/PlanningOutlinerPanel.tsx`: cards, rows, details, grouping, selection, movement, capture entry points, trash, Undo, and focus behavior.
- `src/components/OutlineMovePicker.tsx`: existing modal destination selection with paths and current location.
- `src/components/OutlineTypePicker.tsx`: type changes and inspection/unlinking of plans.
- `src/services/outlineModel.ts`: active tree, destinations, category filtering, branch movement, reveal, placement-aware Undo, card sections.
- `src/services/planningOutliner.ts`: Outline node schema, creation, persistence, and linked entities.
- `src/PlannerShell.css` and `src/App.css`: active interface styling.
- `src/components/GridOutlineDialog.tsx`, `src/services/gridOutline.ts`, `src/services/gridCapture.ts`: grid/Outline workflows.
- `src/components/WeeklySoftPlan.tsx`, `src/components/WeeklyStack.tsx`, `src/services/softPlanning.ts`, `src/services/softPlanPersistence.ts`: loose planning and stacked weekly views.
- `src/components/RoutineWidget.tsx`, `src/services/routineRuns.ts`: routines.
- `src/components/TileTimers.tsx`, `src/services/tileTimers.ts`, `src/native/tileTimerAlarm.ts`: tile timers.
- `src/components/ReadingLink.tsx`, `src/services/readingLinks.ts`: reading entries.
- `src/services/habitProgress.ts`: period-aware habit progress.
- `ANDROID_NATIVE.md`: Android build/update notes.

`saveOutlineNodes` updates optimistic state and queues persistence. It also updates canonical habit placement when movement changes the associated theme or parent habit. Do not bypass this path with a second Outline store.

## Testing and Preview Assets

Useful commands from the repo:

```sh
git status --short
npx tsc --noEmit
node --test --test-reporter=dot tests/*.test.mjs
npm run build -- --outDir /tmp/habit-care-capture-check
git diff --check
```

Browser fixture, separate from the user's live data:

```text
http://127.0.0.1:5186/tests/fixtures/planner.html?reset&family
```

Additional fixture flags already used: `longOutline`, `groupPlans`, `reading`, `failUndoSave`. Inspect fixture code before relying on exact behaviors. Remove the reset query before testing persistence. Repeated fixture initialization has previously duplicated sample routine rows; do not confuse fixture data with real saved data.

Approved capture preview source:

```text
/Users/natashablake/.codex/visualizations/2026/10/08/01a11d80-486c-7742-8893-00bec19992d4/capture-without-unfolding.html
```

Earlier visual alternatives:

```text
/Users/natashablake/.codex/visualizations/2026/10/08/01a11d80-486c-7742-8893-00bec19992d4/outline-directions.html
```

The capture preview is a local interactive mockup with sample items. It is not connected to production data. Its JavaScript syntax was checked; do not present it as an end-to-end browser-tested app implementation. Reload the full visualize skill before creating or updating an inline visualization.

Last recorded completed card-pass build output: `/tmp/habit-care-open-cards-final`.
Last recorded card-pass screenshots: `/tmp/habit-care-open-cards-desktop.png` and `/tmp/habit-care-open-cards-phone.png`. Temporary outputs may no longer exist; inspect before referring to them as available.

## Android and Release Cautions

- Web changes are not automatically installed on the Pixel. Do not imply that refreshing localhost updates the installed application.
- Prefer updating the existing Android app without uninstalling or clearing its data.
- The user previously encountered duplicate generated Capacitor classes ending in ` 2.class`, including `MockCordovaWebViewImpl` and `WebViewLocalServer$1`. Inspect Android build documentation and actual generated outputs if it recurs; do not remove application data.
- Confirm safe areas, keyboard behavior, notification/timer behavior, and Outline data preservation on the phone.
- No Android installation was performed for the latest open-card/capture changes in this handoff.

## Checkpoint and Merge Readiness

The user's latest integration concern was: "We need to merge soon - a lot of changes have been made."

The work is currently a broad uncommitted set on `main`, not a finished feature branch waiting for a straightforward merge. No branch, commit, push, or merge was created as part of this handoff.

Before proposing an integration action:

1. Inventory tracked and untracked source, tests, native changes, dependency changes, and generated assets.
2. Resolve the known compile error and complete the approved feature or clearly isolate unfinished drafts.
3. Run the full tests/build and inspect desktop/mobile workflows.
4. Review the actual diff, including new files. Do not stage everything blindly, omit required new files, or include secrets/local fixture state.
5. Inspect remote divergence when authorized and available. Do not infer current remote state from stale tracking metadata.
6. Explain whether the next action is a checkpoint commit, feature branch/PR, or integration into main, and confirm the desired scope before publishing.

## Collaboration Preferences

- The user likes seeing interactive design proposals before broad UI changes.
- They give concrete feedback by trying the preview. Use that feedback as the specification.
- They have previously requested pauses between significant changes. Keep work staged and show the result; do not bundle unrelated redesigns without checking.
- Use familiar labels and straightforward explanations of what an action does and where its result appears.
- Preserve working behavior and personal data above visual novelty.
- For this next step, the capture/contextual Move design is already approved. Do not restart the design discussion unless a real implementation tradeoff needs a decision.

## Suggested First Message in the New Chat

> Read `HANDOFF_HABIT_CARE_PLANNER.md` in the Habit Care Planner repository and run git status first. Continue the approved capture-without-unfolding and contextual Move work. Two draft components were added but not integrated, and the current TypeScript error is documented. Preserve all existing changes and data. Complete and verify this feature, then help me prepare a reviewed checkpoint and merge plan. Do not push or discard anything without asking.

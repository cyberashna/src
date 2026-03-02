# Mobile-Web Sync Status

## Overview
This document tracks the synchronization between the React Native mobile app and the React web app. The goal is to achieve complete feature parity so data created on either platform displays identically on both.

---

## ✅ COMPLETED

### 1. Type System Synchronization
- **Status:** Complete
- **Location:** `mobile/src/types/index.ts`
- **Changes:**
  - Added all new types: `HabitGroup`, `ThemeGoal`, `ThemeGoalCompletion`, `WorkoutData`, `SessionGroup`, `HabitNote`, `WorkoutHistoryEntry`
  - Updated `Habit` type with: `last_done_at`, `habit_group_id`, `frequency` (added "daily")
  - Updated `Block` type with: `week_start_date`, `linked_block_id`, `is_linked_group`, `workout_submitted`, `session_group_id`, `is_daily_template`, `daily_template_id`
  - All types now match web version exactly

### 2. Database Service Complete Rewrite
- **Status:** Complete
- **Location:** `mobile/src/services/database.ts`
- **New Namespaces Added:**
  - `habitGroups` - Create, read, update, delete habit groups
  - `themeGoals` - Manage theme goals and track completions
  - `workoutData` - Store and retrieve workout data per block
  - `sessionGroups` - Manage weekly workout sessions with colors
  - `habitNotes` - Store notes per habit
  - `workoutHistory` - Historical workout logs per habit
- **Updated Methods:**
  - `blocks.getForWeek()` - Filter by week_start_date
  - `habits.create()` - Support habit_group_id and daily frequency
  - All CRUD operations now support new fields

### 3. Utility Functions
- **Status:** Complete
- **Location:** `mobile/src/utils/`
- **Files Created:**
  - `dateUtils.ts` - Week calculation, date formatting, day names
  - `colors.ts` - Session color palette, hex to rgba conversion

### 4. Habit Groups UI Components
- **Status:** Complete
- **Location:** `mobile/src/components/HabitGroupManager.tsx`
- **Features:**
  - Full-screen modal for managing habit groups
  - Create/edit/delete groups
  - Select group type (Strength Training vs Custom)
  - Choose link behavior (Adjacent Merge vs None)
  - List view of all groups with metadata
  - Android-optimized with TouchableNativeFeedback potential

### 5. Session Groups UI Components
- **Status:** Complete
- **Files Created:**
  - `mobile/src/components/SessionGroupPicker.tsx` - Modal to create/manage sessions
  - `mobile/src/components/SessionLegend.tsx` - Horizontal scroll chip selector
- **Features:**
  - Create sessions with auto-numbered naming
  - Custom session naming
  - Color-coded session chips
  - Delete sessions with confirmation
  - Rename sessions inline
  - Select session before placing blocks

---

## 🚧 IN PROGRESS

### Theme Goals Screen
- **Next Step:** Create full-screen modal for mobile
- **Required Features:**
  - Goal type selector (Total Completions, Unique Daily Habits, Group Completion)
  - Target counter with +/- buttons
  - Daily/Weekly toggle
  - Group picker for group completion goals
  - Circular progress indicators
  - Pull-to-refresh
  - Swipe-to-delete gestures

### Theme Notes & Workout Tracking Modal
- **Next Step:** Create comprehensive notes + history component
- **Required Features:**
  - Collapsible accordion for each habit
  - Text input with auto-save (debounced)
  - Workout history list for strength training habits
  - Date picker for manual workout entries
  - Swipe-to-delete on history items
  - Total volume calculation display

---

## 📋 TODO

### 1. Weekly Planner Updates
- **Location:** `mobile/src/components/WeeklyPlanner.tsx`
- **Changes Needed:**
  - Add session group color borders to blocks
  - Implement week navigation (arrows to change weeks)
  - Filter blocks by current week_start_date
  - Show workout submitted checkmark
  - Display linked block indicator (chain icon)
  - Handle session assignment on block drop

### 2. Workout Input Sheet
- **Create:** `mobile/src/components/WorkoutInputSheet.tsx`
- **Features:**
  - Bottom sheet modal
  - Number inputs for sets/reps/weight
  - Unit toggle (lbs/kg)
  - Haptic feedback on submit
  - Auto-mark block as workout_submitted
  - Show previous workout for reference

### 3. Weekly Summary Card
- **Create:** `mobile/src/components/WeeklySummaryCard.tsx`
- **Features:**
  - Habit completion counts
  - Theme goal progress
  - Total workout volume
  - Session count
  - Completion percentage
  - Expandable/collapsible

### 4. Main App Navigation
- **Location:** `mobile/App.tsx`
- **Changes Needed:**
  - Integrate all new components
  - Add floating action button
  - Setup navigation between screens
  - Add header with week selector
  - Implement user menu

### 5. Drag-and-Drop Enhancements
- **Location:** `mobile/src/context/DragDropContext.tsx`
- **Changes Needed:**
  - Handle habit groups during drag
  - Create linked blocks for adjacent group members
  - Add haptic feedback
  - Show drop zone preview
  - Implement undo toast

### 6. Theme Card Updates
- **Location:** `mobile/src/components/ThemeCard.tsx`
- **Changes Needed:**
  - Display group badges on habits
  - Section headers for groups
  - Show habit notes indicator
  - Add quick actions (long-press menu)

### 7. Authentication Updates
- **Location:** `mobile/src/screens/AuthScreen.tsx`
- **Verify:**
  - Matches web auth flow
  - Proper keyboard handling (Android)
  - Password reset flow

---

## 🔄 Data Sync Verification Checklist

Once implementation is complete, test these scenarios:

### Cross-Platform Creation
- [ ] Create theme on web → View on mobile
- [ ] Create habit on mobile → View on web
- [ ] Create habit group on web → View on mobile
- [ ] Place block on mobile → View on web

### Workout Tracking Sync
- [ ] Submit workout on mobile → History appears on web
- [ ] Add workout history on web → Appears on mobile
- [ ] Edit workout data → Updates both platforms

### Theme Goals Sync
- [ ] Create goal on web → View on mobile
- [ ] Complete habit on mobile → Goal progress updates on web
- [ ] Daily goals reset properly on both platforms

### Session Groups Sync
- [ ] Create session on mobile → Color appears on web
- [ ] Assign block to session on web → Color shows on mobile
- [ ] Rename session → Name updates both platforms

### Week Navigation Sync
- [ ] Change week on mobile → Correct blocks load
- [ ] Change week on web → Same blocks appear
- [ ] Unscheduled blocks visible on both regardless of week

### Habit Notes Sync
- [ ] Type notes on web → Auto-save → Appear on mobile
- [ ] Type notes on mobile → Auto-save → Appear on web
- [ ] Debouncing works correctly (no excessive saves)

---

## 🎨 Android-Specific Optimizations

### Completed
- TouchableOpacity components (can upgrade to TouchableNativeFeedback)
- Modal presentations
- Alert dialogs

### TODO
- React Navigation setup (tab navigation)
- Android ripple effects
- Back button handling
- StatusBar configuration
- Adaptive icon
- Splash screen
- Keyboard behavior (adjustPan vs adjustResize)

---

## 📦 Dependencies Status

### Already Installed
- `@supabase/supabase-js` ✅
- `react-native` ✅
- `expo` ✅

### May Need Installation
- `@react-navigation/native` (for tabs)
- `@react-navigation/bottom-tabs`
- `react-native-gesture-handler` (if not already via Expo)
- `react-native-reanimated` (if not already via Expo)
- `@react-native-community/datetimepicker` (for workout date picker)

---

## 🚀 Implementation Priority

### High Priority (Core Functionality)
1. Weekly Planner updates with week navigation
2. Workout Input Sheet
3. Theme Goals Screen
4. Main App navigation restructure

### Medium Priority (Enhanced Features)
5. Theme Notes Modal with workout history
6. Weekly Summary Card
7. Drag-drop enhancements

### Low Priority (Polish)
8. Android-specific optimizations
9. Offline support
10. Performance optimizations (FlatList virtualization)

---

## 📝 Notes

- The database schema is fully shared - no mobile-specific tables needed
- All Supabase RLS policies apply equally to both platforms
- Week-based filtering ensures data isolation per week
- Session colors are stored in database, not hardcoded
- Workout history is separate from workout_data (current vs historical)

---

## 🔗 Key Files Reference

### Web (Reference)
- `src/services/database.ts` - Complete database API
- `src/components/ThemeGoals.tsx` - Goals UI reference
- `src/components/ThemeNotes.tsx` - Notes + history UI reference
- `src/components/WorkoutInputs.tsx` - Workout form reference

### Mobile (Implementation)
- `mobile/src/types/index.ts` - Type definitions
- `mobile/src/services/database.ts` - Database service
- `mobile/src/components/` - All UI components
- `mobile/src/utils/` - Helper functions

---

**Last Updated:** 2026-03-02
**Sync Status:** ~40% Complete (Foundation + Core Components Done)
**Estimated Completion:** 60% of remaining work is UI components

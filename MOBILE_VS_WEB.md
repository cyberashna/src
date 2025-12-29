# Web vs Mobile Comparison

This document outlines the differences between the web and mobile versions of the Habit Planner app.

## Architecture

### Web Version
- **Location**: `/project` (root directory)
- **Framework**: React with Vite
- **State Management**: Local state (useState)
- **Storage**: In-memory only (resets on refresh)
- **Styling**: CSS files

### Mobile Version
- **Location**: `/project/mobile`
- **Framework**: React Native with Expo
- **State Management**: Local state + Supabase sync
- **Storage**: Supabase database with real-time sync
- **Styling**: React Native StyleSheet

## Key Differences

### Data Persistence

**Web**:
- Data is stored in component state only
- Resets when you refresh the browser
- No user accounts or authentication

**Mobile**:
- Data is stored in Supabase PostgreSQL database
- Persists across sessions and devices
- Requires user authentication
- Real-time synchronization

### User Interface

**Web**:
- Desktop-optimized layout with two columns
- HTML table for weekly planner
- Native HTML drag-and-drop API
- Mouse-based interactions

**Mobile**:
- Mobile-first responsive design
- Single-column vertical scroll layout
- Touch-based long-press for "dragging"
- Tap-based interactions
- Optimized for smaller screens

### Interaction Model

**Web**:
- Drag habits/blocks with mouse
- Drop directly into time slots
- Double-click to remove/move back
- Checkbox for habit completion

**Mobile**:
- Long-press to select habit/block
- Tap time slot to place
- Tap to toggle completion or remove
- Alert dialogs for confirmations

### Authentication

**Web**:
- No authentication
- Single-user experience
- No data isolation

**Mobile**:
- Email/password authentication via Supabase
- Multi-user with data isolation
- Row Level Security policies
- Sign up/sign in flows

## Feature Parity

Both versions include:
- Theme-based habit organization
- Habit tracking with weekly/monthly targets
- Unscheduled blocks for tasks
- Weekly planner with time slots
- Hourly and bucket view modes
- Habit completion tracking
- Weekly reset functionality

## Running Both Versions

### Web Version
```bash
# From project root
npm install
npm run dev
```
Open http://localhost:5173

### Mobile Version
```bash
# From project/mobile directory
cd mobile
npm install
npm start
```
Scan QR code with Expo Go app

## When to Use Each

### Use Web Version When:
- Quick prototyping or testing
- No need for data persistence
- Desktop/laptop usage
- Single user testing

### Use Mobile Version When:
- Need data to persist
- Multiple users
- Mobile device usage
- Cross-device synchronization needed
- Production deployment

## Migration Path

To migrate from web to mobile:
1. Export data structure from web version
2. Create account in mobile app
3. Manually recreate themes and habits
4. Or build an import feature using the Supabase API

## Future Enhancements

Potential improvements for both versions:
- Recurring habit templates
- Analytics and insights
- Habit streaks
- Notifications/reminders (mobile)
- Social features (share progress)
- Data export/import
- Calendar integration
- Dark mode

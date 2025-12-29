# Habit Planner Mobile - Setup Guide

## Prerequisites

1. Node.js (v16 or higher)
2. npm or yarn
3. Expo CLI (will be installed with dependencies)
4. Expo Go app on your mobile device (download from App Store or Google Play)
5. Supabase account and project

## Step 1: Install Dependencies

Navigate to the mobile directory and install dependencies:

```bash
cd mobile
npm install
```

## Step 2: Configure Supabase

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and add your Supabase credentials:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

   You can find these values in your Supabase project settings under API.

## Step 3: Database Setup

The database tables are already created via the migration. The schema includes:
- `themes` - For organizing habits into categories
- `habits` - For tracking individual habits with targets
- `blocks` - For scheduling habits and tasks in the weekly planner

All tables have Row Level Security enabled for user data isolation.

## Step 4: Run the App

Start the Expo development server:

```bash
npm start
```

This will open Expo DevTools in your browser and show a QR code.

## Step 5: Open on Your Device

### iOS:
1. Open the Camera app
2. Point it at the QR code
3. Tap the notification to open in Expo Go

### Android:
1. Open the Expo Go app
2. Tap "Scan QR Code"
3. Scan the QR code from the terminal

## Step 6: Create an Account

1. When the app opens, tap "Sign Up"
2. Enter your email and password
3. Tap "Sign Up" again
4. Switch back to "Sign In" and log in with your credentials

## Using the App

### Creating Themes
1. Scroll to the bottom of the themes section
2. Enter a theme name (e.g., "Health", "Work", "Personal")
3. Tap "Add"

### Adding Habits
1. Find your theme
2. Tap "Add habit"
3. Enter habit details:
   - Name (e.g., "Morning run")
   - Frequency (weekly/monthly/none)
   - Target (e.g., 3 times per week)
4. Tap "Save habit"

### Scheduling Habits
1. Long-press a habit (hold for 1 second)
2. Tap on a time slot in the weekly planner
3. The habit block will appear in that slot

### Creating Task Blocks
1. Scroll to "Unscheduled blocks"
2. Enter a task name
3. Optionally add a hashtag
4. Tap "Add block"
5. Long-press the block and tap a slot to schedule it

### Tracking Progress
- Tap "Done" on a habit to increment its count
- Tap habit blocks in the planner to toggle completion
- Completion automatically updates the habit count

### Weekly Reset
Tap "New week (reset)" to reset all habit counts for a fresh start.

## Troubleshooting

### Connection Issues
- Make sure your device and computer are on the same network
- Check that your Supabase URL and key are correct in `.env`

### Authentication Errors
- Verify your Supabase project has Email Auth enabled
- Check API settings in Supabase dashboard

### App Not Loading
- Clear Expo cache: `npm start -- --clear`
- Restart the development server
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Building for Production

To build standalone apps:

```bash
# For iOS (requires Apple Developer account)
npm run build:ios

# For Android
npm run build:android
```

Refer to [Expo documentation](https://docs.expo.dev/build/setup/) for detailed build instructions.

## Features

- User authentication with Supabase
- Theme-based habit organization
- Weekly/monthly habit tracking
- Drag-and-drop scheduling (via long-press)
- Hourly or bucket time views
- Real-time data sync
- Offline support with AsyncStorage
- Cross-device synchronization

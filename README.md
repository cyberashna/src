# Habit Planner

A weekly habit planner with Google Calendar integration to help you track and schedule your habits across different life themes.

## Features

### Habit Management
- Organize habits by themes (Household, Creativity, Health, Learning, etc.)
- Set weekly or monthly targets for each habit
- Track completion counts
- Drag and drop habits into your weekly schedule

### Weekly Planner
- Visual weekly calendar grid
- Drag and drop interface for scheduling
- Two view modes:
  - **Hourly**: Traditional hourly time slots (6 AM - 10 PM)
  - **Buckets**: Custom time periods (Morning, Afternoon, Evening, etc.)
- Schedule both habit blocks and generic task blocks

### Google Calendar Integration
- Automatic sync of scheduled blocks to Google Calendar
- Real-time event creation, updates, and deletion
- Select which calendar to sync with
- Toggle sync on/off as needed
- Visual calendar settings modal

### Unscheduled Blocks
- Create generic task blocks with optional hashtags
- Store unscheduled items for later planning
- Drag blocks to schedule them

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- A Supabase account
- A Google Cloud account (for calendar integration)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` file with:
   - Supabase URL and anon key
   - Google Client ID and API key (see [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md))

5. Run the development server:
   ```bash
   npm run dev
   ```

## Google Calendar Setup

To enable Google Calendar integration, follow the detailed setup guide in [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md).

Quick steps:
1. Create a Google Cloud project
2. Enable Google Calendar API
3. Create OAuth 2.0 credentials
4. Add credentials to `.env` file
5. Click the calendar icon (📅) in the app to connect

## Usage

### Creating Habits
1. Themes are pre-created (Household, Creativity, etc.)
2. Click "Add habit" under any theme
3. Enter habit name, frequency (weekly/monthly), and target
4. Click "Save habit"

### Scheduling Habits
1. Find your habit in the left sidebar
2. Drag the habit name onto a time slot in the weekly planner
3. The habit block appears in the schedule
4. Check the box to mark it complete

### Creating Task Blocks
1. In "Unscheduled blocks" section, enter a task name
2. Optionally add a hashtag for categorization
3. Click "Add block"
4. Drag the block to schedule it

### Using Google Calendar Sync
1. Click the calendar icon (📅) in the bottom-right
2. Click "Connect Google Calendar"
3. Sign in with Google and grant permissions
4. Select a calendar from the dropdown
5. Enable "automatic sync"
6. Scheduled blocks will now sync to Google Calendar automatically

### Managing Your Schedule
- **Move blocks**: Drag them to different time slots
- **Remove from schedule**: Double-click regular blocks to unschedule them
- **Delete habit blocks**: Double-click habit blocks to remove them
- **Reset for new week**: Click "New week (reset)" to clear completion counts

## Project Structure

```
src/
├── components/
│   └── CalendarSettings.tsx    # Google Calendar settings modal
├── lib/
│   └── supabase.ts              # Supabase client setup
├── services/
│   ├── googleCalendar.ts        # Google Calendar API integration
│   └── calendarSync.ts          # Sync logic between app and calendar
├── App.tsx                       # Main application component
├── App.css                       # Application styles
└── main.tsx                      # Application entry point
```

## Database Schema

The app uses Supabase with the following tables:

### habit_planner_tables
- User habits, themes, and blocks
- Habit tracking and completion data

### calendar_connections
- Google Calendar connection settings per user
- Refresh tokens and selected calendar info

### calendar_event_mappings
- Mapping between local blocks and Google Calendar events
- Tracks sync status

## Technologies Used

- **Frontend**: React, TypeScript, Vite
- **Database**: Supabase (PostgreSQL)
- **APIs**: Google Calendar API, Google Identity Services
- **Styling**: Custom CSS with responsive design

## Security

- All calendar tokens are stored securely in Supabase
- Row Level Security (RLS) ensures users only access their own data
- Google OAuth 2.0 for secure authentication
- Environment variables for sensitive credentials

## Troubleshooting

### Calendar not syncing
- Check that you've enabled automatic sync in settings
- Verify Google Calendar API is enabled in Google Cloud Console
- Check browser console for error messages

### Build errors
- Ensure all dependencies are installed: `npm install`
- Check that environment variables are set correctly
- Clear node_modules and reinstall if needed

### Database issues
- Verify Supabase credentials in `.env`
- Check that migrations have been applied
- Review Supabase dashboard for table structure

## Future Enhancements

Potential features for future development:
- Two-way sync (import Google Calendar events)
- Multi-week view
- Habit statistics and analytics
- Mobile app (React Native version in `/mobile`)
- Recurring habit templates
- Social sharing features

## License

This project is provided as-is for personal use and learning.

## Support

For detailed Google Calendar setup instructions, see [GOOGLE_CALENDAR_SETUP.md](./GOOGLE_CALENDAR_SETUP.md)

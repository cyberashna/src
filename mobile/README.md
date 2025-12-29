# Habit Planner Mobile

React Native version of the Habit Planner app with Supabase integration.

## Setup

1. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```

2. Create a `.env` file in the mobile directory with your Supabase credentials:
   ```
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Run on your device:
   - Scan the QR code with Expo Go app (iOS/Android)
   - Press `a` for Android emulator
   - Press `i` for iOS simulator

## Features

- Create and manage habit themes
- Track habits with weekly/monthly targets
- Drag and drop scheduling
- Weekly planner with hourly or bucket views
- Real-time data sync with Supabase
- Offline support with local storage

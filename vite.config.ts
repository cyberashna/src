import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      // Native builds load bundled assets, never a previously installed web cache.
      disable: mode === 'android',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Habit Care Planner',
        short_name: 'Planner',
        description: 'A calm habit, routine, workout, and weekly planning app',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'health', 'lifestyle'],
        icons: [
          {
            src: 'icons/app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
          {
            src: 'icons/app-icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Quick Note',
            short_name: 'Note',
            description: 'Capture a quick note to Waiting',
            url: '/?capture=note&destination=waiting&surface=shortcut',
            icons: [
              {
                src: 'icons/shortcut-note.svg',
                sizes: 'any',
                type: 'image/svg+xml',
              },
            ],
          },
          {
            name: 'Waiting',
            short_name: 'Waiting',
            description: 'Open the Waiting shelf',
            url: '/?view=planner&section=waiting',
            icons: [
              {
                src: 'icons/shortcut-waiting.svg',
                sizes: 'any',
                type: 'image/svg+xml',
              },
            ],
          },
          {
            name: 'Workout',
            short_name: 'Workout',
            description: 'Open workout routines and exercise options',
            url: '/?panel=workout',
            icons: [
              {
                src: 'icons/shortcut-workout.svg',
                sizes: 'any',
                type: 'image/svg+xml',
              },
            ],
          },
          {
            name: 'Ambient Mode',
            short_name: 'Ambient',
            description: 'Open the calm routine and next task view',
            url: '/?mode=ambient',
            icons: [
              {
                src: 'icons/shortcut-ambient.svg',
                sizes: 'any',
                type: 'image/svg+xml',
              },
            ],
          },
          {
            name: 'Today',
            short_name: 'Today',
            description: 'Open today',
            url: '/?view=today',
            icons: [
              {
                src: 'icons/shortcut-today.svg',
                sizes: 'any',
                type: 'image/svg+xml',
              },
            ],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/appaixyazhxsjqwvdmiq\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/appaixyazhxsjqwvdmiq\.supabase\.co\/auth\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-auth-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/accounts\.google\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/auth\/v1/, /^\/rest\/v1/],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
}))

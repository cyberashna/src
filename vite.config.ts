import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Habit Planner',
        short_name: 'HabitPlan',
        description: 'Weekly habit and priority planner',
        theme_color: '#2563eb',
        background_color: '#f4f4f8',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
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
})

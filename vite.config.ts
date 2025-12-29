import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_ID__: JSON.stringify(`${new Date().toISOString()}`),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "logo.png", "offline.html"],
      manifest: {
        name: "ScrollLibrary",
        short_name: "ScrollLibrary",
        description: "AI-powered academic, comic, and guided learning library",
        theme_color: "#1e293b",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["books", "education", "productivity"],
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ],
        screenshots: [
          {
            src: "/screenshot-wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide"
          },
          {
            src: "/screenshot-narrow.png",
            sizes: "720x1280",
            type: "image/png",
            form_factor: "narrow"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          // ===== DO NOT CACHE: Auth, Stripe, Generation, Export endpoints =====
          {
            // Auth endpoints - NEVER cache
            urlPattern: /\/auth\/.*/i,
            handler: "NetworkOnly",
          },
          {
            // Stripe endpoints - NEVER cache
            urlPattern: /\/functions\/v1\/create-checkout|\/functions\/v1\/customer-portal|\/functions\/v1\/stripe-webhook|\/functions\/v1\/check-subscription/i,
            handler: "NetworkOnly",
          },
          {
            // Generation endpoints - NEVER cache (require online)
            urlPattern: /\/functions\/v1\/generate-book|\/functions\/v1\/generate-chapter|\/functions\/v1\/generate-cover|\/functions\/v1\/generate-image|\/functions\/v1\/generate-references|\/functions\/v1\/deep-research/i,
            handler: "NetworkOnly",
          },
          {
            // Export endpoints - NEVER cache the function call itself
            urlPattern: /\/functions\/v1\/export-book/i,
            handler: "NetworkOnly",
          },

          // ===== NetworkFirst with short timeout for user-specific data =====
          {
            // User profiles - NetworkFirst with fallback
            urlPattern: /\/rest\/v1\/profiles.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "profiles-cache",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // User library - NetworkFirst with fallback
            urlPattern: /\/rest\/v1\/user_library.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "user-library-cache",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },

          // ===== CacheFirst for reading content (already fetched) =====
          {
            // Books metadata - CacheFirst
            urlPattern: /\/rest\/v1\/books.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "books-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Chapter content - CacheFirst (main offline reading)
            urlPattern: /\/rest\/v1\/chapters.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "chapters-cache",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Audio files (TTS) - CacheFirst
            urlPattern: /\.mp3$|\/functions\/v1\/text-to-speech/i,
            handler: "CacheFirst",
            options: {
              cacheName: "audio-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              rangeRequests: true,
            },
          },
          {
            // Downloaded export files (PDF/EPUB/DOCX) - CacheFirst
            urlPattern: /\.pdf$|\.epub$|\.docx$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "exports-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Images (covers, illustrations) - CacheFirst
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Supabase storage URLs - CacheFirst
            urlPattern: /supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "storage-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },

          // ===== Fonts =====
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts-cache",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
        // Offline fallback
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [
          // Don't fallback for API calls
          /^\/functions\//,
          /^\/rest\//,
          /^\/auth\//,
          /^\/storage\//,
        ],
      },
      devOptions: {
        enabled: false
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

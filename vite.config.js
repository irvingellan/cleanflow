import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const firebaseConfigKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

function messagingWorkerSource(firebaseConfig) {
  return `// Firebase Messaging needs its own worker; the main PWA worker remains network-only.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = typeof event.notification.data?.link === "string" && event.notification.data.link.startsWith("/")
    ? event.notification.data.link
    : "/";

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existingWindow = windows.find((client) => client.url.startsWith(self.location.origin));

    if (existingWindow) {
      await existingWindow.focus();
      return;
    }

    await self.clients.openWindow(link);
  })());
});

importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(firebaseConfig)});

firebase.messaging().onBackgroundMessage((payload) => {
  const data = payload.data || {};

  return self.registration.showNotification(data.title || "CleanFlow", {
    body: data.body || "Operational update",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.eventId || "cleanflow-operational-update",
    data: { link: data.link || "/" },
  });
});
`
}

function rootWorkerSource(buildId) {
  return `const buildId = ${JSON.stringify(buildId)};
const acknowledgedClients = new Set();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEANFLOW_UPDATE_CLIENT_READY" && event.source?.id) {
    acknowledgedClients.add(event.source.id);
  }

  if (event.data?.type === "CLEANFLOW_SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    windows.forEach((client) => {
      client.postMessage({ type: "CLEANFLOW_UPDATE_AVAILABLE", buildId });
    });

    // Older installed builds cannot acknowledge the update message. Reload them once so this
    // update protocol can take over; current builds acknowledge and show their own prompt.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const currentWindows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    await Promise.all(
      currentWindows
        .filter((client) => !acknowledgedClients.has(client.id))
        .map((client) => client.navigate(client.url).catch(() => undefined)),
    );
  })());
});

// Keep authenticated operational data network-only; this worker intentionally does not cache it.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
`
}

function cleanflowServiceWorkers(buildInfo) {
  let source = ''

  return {
    name: 'cleanflow-firebase-messaging-worker',
    configResolved(config) {
      const environment = loadEnv(config.mode, config.root, '')
      const missingConfig = firebaseConfigKeys.filter((key) => !environment[key])

      if (missingConfig.length > 0) {
        throw new Error(`Missing Firebase configuration for messaging worker: ${missingConfig.join(', ')}`)
      }

      const firebaseConfig = {
        apiKey: environment.VITE_FIREBASE_API_KEY,
        authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: environment.VITE_FIREBASE_PROJECT_ID,
        storageBucket: environment.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: environment.VITE_FIREBASE_APP_ID,
      }

      source = messagingWorkerSource(firebaseConfig)
    },
    configureServer(server) {
      server.middlewares.use('/sw.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(rootWorkerSource(buildInfo.buildId))
      })
      server.middlewares.use('/firebase-messaging-sw.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(source)
      })
      server.middlewares.use('/version.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(JSON.stringify(buildInfo))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: rootWorkerSource(buildInfo.buildId),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source,
      })
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(buildInfo),
      })
    },
  }
}

const packageMetadata = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
)

export default defineConfig(({ mode }) => {
  const buildInfo = {
    version: `v${packageMetadata.version}`,
    buildId: process.env.GITHUB_SHA || `${packageMetadata.version}-${new Date().toISOString()}`,
  }

  return {
    define: {
      __CLEANFLOW_BUILD_ID__: JSON.stringify(buildInfo.buildId),
    },
    plugins: ["test", "e2e"].includes(mode)
      ? [react()]
      : [react(), cleanflowServiceWorkers(buildInfo)],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.js",
      include: ["src/**/*.test.{js,jsx}", "functions/src/**/*.test.js"],
    },
  }
})

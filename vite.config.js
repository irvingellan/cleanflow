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

function firebaseMessagingWorker() {
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
      server.middlewares.use('/firebase-messaging-sw.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(source)
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), firebaseMessagingWorker()],
})

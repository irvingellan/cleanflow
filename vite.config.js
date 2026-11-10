import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { assertBuildEnvironment, webPushVapidKey } from './src/environment.js'
import {
  cleanerMessagingConfig, cleanerMessagingWorkerPath, cleanerPushBinding, cleanerPushDisplay, cleanerPushOpenInboxEvent,
  cleanerPushReceiptEvent, isCleanerVapidKey,
} from './src/features/notifications/cleanerPushBinding.js'

const firebaseConfigKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

export function messagingWorkerSource(firebaseConfig) {
  return `// Firebase Messaging needs its own worker; the main PWA worker remains network-only.
self.addEventListener("notificationclick", (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const home = new URL("/", self.location.origin);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const managerWindow = windows.find((client) => {
      const url = new URL(client.url);
      return url.origin === home.origin && url.pathname === home.pathname;
    });
    if (managerWindow) {
      await managerWindow.focus();
      return;
    }
    await self.clients.openWindow(home.href);
  })().catch(() => {}));
});

importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(firebaseConfig)});

firebase.messaging().onBackgroundMessage((payload) => {
  // Notification payloads already get an SDK display. Keep the existing
  // data-only operational path, without displaying the current-device test twice.
  if (payload.notification) return;
  const data = payload.data || {};
  if (data.cleanerBindingId != null) return;

  return self.registration.showNotification(data.title || "CleanFlow", {
    body: data.body || "Operational update",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.eventId || "cleanflow-operational-update",
    data: { link: "/" },
  });
});
`
}

export function cleanerMessagingWorkerSource(firebaseConfig) {
  if (!firebaseConfig) return "// Cleaner push is disabled for this build.\n";
  return `// Isolated Firebase Messaging worker for Cleaner Hub.
const binding = ${cleanerPushBinding.toString()};
const display = ${cleanerPushDisplay.toString()};
const inboxUrl = new URL("/agenda?inbox=1", self.location.origin);
const agendaClients = async () => {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return windows.filter((client) => {
    const url = new URL(client.url);
    return url.origin === inboxUrl.origin && ["/agenda", "/agenda/"].includes(url.pathname);
  });
};

self.addEventListener("notificationclick", (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil((async () => {
    const current = await binding("read");
    if (!current?.bindingId || event.notification.data?.cleanerBindingId !== current.bindingId) return;
    const [agenda] = await agendaClients();
    if ((await binding("read"))?.bindingId !== current.bindingId) return;
    if (agenda) {
      agenda.postMessage({ type: ${JSON.stringify(cleanerPushOpenInboxEvent)} });
      await Promise.resolve().then(() => agenda.focus()).catch(() => undefined);
      await agenda.navigate(inboxUrl.href).catch(() => undefined);
    } else {
      await self.clients.openWindow(inboxUrl.href);
    }
  })().catch(() => {}));
});

// Own the data-only PushEvent on this isolated scope. FCM's default worker
// considers a visible manager tab foreground and otherwise skips display.
self.addEventListener("push", (event) => {
  event.stopImmediatePropagation();
  event.waitUntil((async () => {
    const payload = event.data?.json();
    const current = await binding("read");
    const message = display(payload, current);
    if (!message) return;
    await self.registration.showNotification(message.title, message.options);
    const latest = await binding("read").catch(() => null);
    if (latest?.bindingId !== current.bindingId) {
      const notifications = await self.registration.getNotifications({ tag: message.options.tag });
      for (const notification of notifications) {
        if (notification.data?.cleanerBindingId === current.bindingId) notification.close();
      }
      return;
    }
    for (const agenda of await agendaClients()) {
      agenda.postMessage({ type: ${JSON.stringify(cleanerPushReceiptEvent)} });
    }
  })().catch(() => {}));
});

importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(firebaseConfig)});
// Keep FCM's subscription-change handling. Only this worker handles display.
firebase.messaging();
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

// Intentionally no fetch handler. A network-only respondWith(fetch(event.request))
// adds no caching value and can break Safari/iOS request serialization or navigation.
// Let the browser perform normal networking; authenticated operational data stays uncached.
`
}

function cleanflowServiceWorkers(buildInfo) {
  let source = ''
  let cleanerSource = ''
  const deploymentId = buildInfo.deploymentId || buildInfo.buildId

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
      cleanerSource = cleanerMessagingWorkerSource(
        config.mode !== 'emulator' && isCleanerVapidKey(webPushVapidKey(config.mode, environment))
          ? cleanerMessagingConfig(firebaseConfig, environment.VITE_FIREBASE_CLEANER_MESSAGING_APP_ID) : null,
      )
    },
    configureServer(server) {
      server.middlewares.use('/sw.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(rootWorkerSource(deploymentId))
      })
      server.middlewares.use('/firebase-messaging-sw.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(source)
      })
      server.middlewares.use(cleanerMessagingWorkerPath, (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(cleanerSource)
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
        source: rootWorkerSource(deploymentId),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source,
      })
      this.emitFile({
        type: 'asset',
        fileName: cleanerMessagingWorkerPath.slice(1),
        source: cleanerSource,
      })
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(buildInfo),
      })
    },
  }
}

function startupShell(buildId) {
  const source = readFileSync(new URL('./src/features/startup/startupShell.js', import.meta.url), 'utf8')
  const entryStylesheet = /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="\/assets\/(?:index|main)-[\w-]+\.css")[^>]*>/i
  return {
    name: 'cleanflow-startup-shell',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const agenda = path.basename(context.filename) === 'agenda.html'
        const requiresStyles = entryStylesheet.test(html)
        if (context.bundle && !requiresStyles) throw new Error('CleanFlow entry stylesheet missing')
        return {
          // Download the stylesheet without blocking the HTML fallback's first paint.
          html: html.replace(entryStylesheet, (tag) => tag.replace(/>$/, ' media="print" data-startup-stylesheet>')),
          tags: [{
            tag: 'script',
            attrs: {
              'data-entry': agenda ? 'agenda' : 'manager', 'data-build': buildId,
              ...(requiresStyles ? { 'data-requires-styles': 'true' } : {}),
            },
            children: source,
            injectTo: 'head-prepend',
          }],
        }
      },
    },
  }
}

function cleanerHubHtmlEntry() {
  function rewriteAgenda(server) {
    server.middlewares.use((request, _response, next) => {
      const pathname = request.url?.split('?')[0]
      if (['GET', 'HEAD'].includes(request.method) && ['/agenda', '/agenda/'].includes(pathname)) {
        request.url = '/agenda.html' + request.url.slice(pathname.length)
      }
      next()
    })
  }
  return {
    name: 'cleanflow-cleaner-hub-html-entry',
    configureServer: rewriteAgenda,
    configurePreviewServer: rewriteAgenda,
  }
}

const packageMetadata = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
)

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  let approvedPrivateEmulatorOrigin = "";
  const approvalFile = path.join(process.cwd(), ".private-emulator-origin.json");
  if (mode === "emulator" && existsSync(approvalFile)) {
    const approval = JSON.parse(readFileSync(approvalFile, "utf8"));
    if (approval.environment !== "emulator" || approval.projectId !== "demo-cleanflow") throw new Error("Invalid private emulator approval binding.");
    approvedPrivateEmulatorOrigin = approval.origin;
  }
  const binding = assertBuildEnvironment(mode, environment, { approvedPrivateEmulatorOrigin });
  if (mode === "sandbox") {
    const pilot = environment.VITE_CLEANFLOW_SANDBOX_PUSH_PILOT === "enabled";
    if (pilot && (!isCleanerVapidKey(webPushVapidKey(mode, environment)) || !cleanerMessagingConfig({
      appId: environment.VITE_FIREBASE_APP_ID, messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID,
    }, environment.VITE_FIREBASE_CLEANER_MESSAGING_APP_ID))) {
      throw new Error("Sandbox push pilot requires its public VAPID key and dedicated same-project Web app.");
    }
    // API keys route Firebase Auth independently of projectId. Reject known
    // local production credentials without logging or embedding them in Sandbox.
    for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
      const filename = path.join(process.cwd(), file);
      if (!existsSync(filename)) continue;
      const values = parseEnv(readFileSync(filename, "utf8"));
      if (values.VITE_FIREBASE_PROJECT_ID === "clean-flow-prototipo"
        && (values.VITE_FIREBASE_API_KEY === environment.VITE_FIREBASE_API_KEY
          || (pilot && values.VITE_FIREBASE_VAPID_KEY === webPushVapidKey(mode, environment)))) {
        throw new Error("Sandbox must use its own verified Firebase Web and push configuration.");
      }
    }
  }
  const buildInfo = {
    version: `v${packageMetadata.version}`,
    buildId: process.env.GITHUB_SHA || `${packageMetadata.version}-${new Date().toISOString()}`,
    ...binding,
  }
  if (environment.VITE_NOTIFICATION_INBOX_MODE === 'disabled') {
    buildInfo.deploymentId = `${buildInfo.buildId}-inbox-off`
  } else if ((mode === 'production' || environment.VITE_CLEANFLOW_SANDBOX_PUSH_PILOT === 'enabled')
    && isCleanerVapidKey(webPushVapidKey(mode, environment))
    && cleanerMessagingConfig({
      appId: environment.VITE_FIREBASE_APP_ID,
      messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID,
    }, environment.VITE_FIREBASE_CLEANER_MESSAGING_APP_ID)) {
    buildInfo.deploymentId = `${buildInfo.buildId}-cleaner-push`
  }

  return {
    define: {
      __CLEANFLOW_PRIVATE_EMULATOR_ORIGIN__: JSON.stringify(mode === "emulator" ? approvedPrivateEmulatorOrigin : ""),
      __CLEANFLOW_BUILD_ID__: JSON.stringify(buildInfo.deploymentId || buildInfo.buildId),
    },
    build: {
      rolldownOptions: {
        input: {
          index: path.resolve(import.meta.dirname, 'index.html'),
          agenda: path.resolve(import.meta.dirname, 'agenda.html'),
        },
      },
    },
    plugins: ["test", "e2e"].includes(mode)
      ? [react(), cleanerHubHtmlEntry(), startupShell(buildInfo.deploymentId || buildInfo.buildId)]
      : [react(), cleanerHubHtmlEntry(), startupShell(buildInfo.deploymentId || buildInfo.buildId), cleanflowServiceWorkers(buildInfo)],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.js",
      include: ["src/**/*.test.{js,jsx}", "functions/src/**/*.test.js"],
    },
  }
})

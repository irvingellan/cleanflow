import { defineConfig } from "vite";

// Bare local test harness: no app bootstrap, Firebase config, workers or provider.
export default defineConfig({ server: { host: "127.0.0.1", port: 4207, strictPort: true } });

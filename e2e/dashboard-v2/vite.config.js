import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ envDir:false, cacheDir:"node_modules/.vite-dashboard-v2", plugins:[react()],
  optimizeDeps:{entries:["e2e/dashboard-v2/index.html"]},
  define:{__CLEANFLOW_BUILD_ID__:JSON.stringify("synthetic-dashboard-v2")},
  server:{host:"127.0.0.1",port:4213,strictPort:true} });

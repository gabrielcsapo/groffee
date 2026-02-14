import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { startSshServer } from "./ssh-server.js";
import { backfillIndexes } from "./lib/backfill.js";

serve({ fetch: app.fetch, port: 3001, hostname: "0.0.0.0" }, (info) => {
  console.log(`Groffee server running at http://localhost:${info.port}`);
});

startSshServer();

// Backfill indexes for existing repos (runs in background on startup)
backfillIndexes().catch((err) => console.error("Backfill failed:", err));

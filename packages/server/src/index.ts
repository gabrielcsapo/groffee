import { serve } from "@hono/node-server";
import { app } from "./app.js";

serve({ fetch: app.fetch, port: 3001, hostname: "0.0.0.0" }, (info) => {
  console.log(`Groffee server running at http://localhost:${info.port}`);
});

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const AUTH_DIR = path.join(import.meta.dirname, ".auth");
const STORAGE_STATE = path.join(AUTH_DIR, "alice.json");

async function globalSetup() {
  const baseURL = process.env.BASE_URL || "http://localhost:3000";
  await mkdir(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Login as alice via API
  const response = await context.request.post(`${baseURL}/api/auth/login`, {
    data: { username: "alice", password: "password123" },
  });

  if (!response.ok()) {
    await browser.close();
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }

  // Save cookies to storage state
  await context.storageState({ path: STORAGE_STATE });
  await browser.close();
}

export default globalSetup;

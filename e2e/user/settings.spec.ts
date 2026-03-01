import { test, expect } from "../fixtures";

test.describe("Settings", () => {
  test("shows SSH keys page", async ({ page, snap }) => {
    await page.goto("/settings/keys");
    await page.waitForLoadState("networkidle");
    await snap("settings-ssh-keys");
  });
});

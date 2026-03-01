import { test, expect } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Register page", () => {
  test("shows registration form", async ({ page, snap }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await snap("register-form");
  });
});

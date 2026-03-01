import { test, expect } from "../fixtures";

test.describe("Admin dashboard", () => {
  test("shows admin overview", async ({ page, snap }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await snap("dashboard", { fullPage: true });
  });
});

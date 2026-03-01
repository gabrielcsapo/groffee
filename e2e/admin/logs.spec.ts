import { test, expect } from "../fixtures";

test.describe("Admin logs", () => {
  test("shows structured logs", async ({ page, snap }) => {
    await page.goto("/admin/logs");
    await page.waitForLoadState("networkidle");
    await snap("logs", { fullPage: true });
  });
});

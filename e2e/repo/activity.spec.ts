import { test, expect } from "../fixtures";

test.describe("Activity page", () => {
  test("shows activity charts", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/activity");
    await page.waitForLoadState("networkidle");
    // Give charts a moment to render
    await page.waitForTimeout(1500);
    await snap("activity-charts", { fullPage: true });
  });
});

import { test, expect } from "../fixtures";

test.describe("Global search", () => {
  test("shows search results", async ({ page, snap }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");
    const searchInput = page.locator('input[type="search"], input[placeholder*="earch"]').first();
    await searchInput.fill("mega");
    await searchInput.press("Enter");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await snap("global-results", { fullPage: true });
  });
});

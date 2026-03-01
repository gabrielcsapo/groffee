import { test, expect } from "../fixtures";

test.describe("Repo search", () => {
  test("shows search results within repo", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/search");
    await page.waitForLoadState("networkidle");
    // Type a search query
    const searchInput = page.locator('input[type="search"], input[placeholder*="earch"]').first();
    await searchInput.fill("index");
    await searchInput.press("Enter");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await snap("search-results", { fullPage: true });
  });
});

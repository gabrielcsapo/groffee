import { test, expect } from "../fixtures";

test.describe("File tree browser", () => {
  test("navigates into src directory", async ({ page, snap }) => {
    await page.goto("/alice/mega-app");
    await page.waitForLoadState("networkidle");
    // Click into the src directory
    const srcLink = page.locator('a:has-text("src")').first();
    if (await srcLink.isVisible()) {
      await srcLink.click();
      await page.waitForLoadState("networkidle");
    }
    await snap("tree-src", { fullPage: true });
  });

  test("navigates into nested directory", async ({ page, snap }) => {
    await page.goto("/alice/mega-app");
    await page.waitForLoadState("networkidle");
    // Click into the first directory entry
    const dirLink = page.locator("table tbody tr a").first();
    await dirLink.click();
    await page.waitForLoadState("networkidle");
    await snap("tree-nested", { fullPage: true });
  });
});

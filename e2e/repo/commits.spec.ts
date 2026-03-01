import { test, expect } from "../fixtures";

test.describe("Commits", () => {
  test("shows commit log", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/commits/main");
    await page.waitForLoadState("networkidle");
    await snap("commits-log", { fullPage: true });
  });

  test("shows single commit diff", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/commits/main");
    await page.waitForLoadState("networkidle");
    // Click the first commit
    const commitLink = page.locator('a[href*="/alice/mega-app/commit/"]').first();
    await commitLink.click();
    await page.waitForLoadState("networkidle");
    await snap("commit-diff", { fullPage: true });
  });
});

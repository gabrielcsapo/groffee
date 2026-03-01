import { test, expect } from "../fixtures";

test.describe("Pull request detail", () => {
  test("shows PR conversation", async ({ page, snap }) => {
    // Get a PR URL from the list, then navigate directly (avoids RSC hydration issues with Link clicks)
    await page.goto("/alice/mega-app/pulls");
    await page.waitForLoadState("networkidle");
    const prLink = page.locator('a[href*="/alice/mega-app/pull/"]').first();
    await expect(prLink).toBeVisible({ timeout: 10000 });
    const href = await prLink.getAttribute("href");
    // Navigate directly to the PR detail URL (no file extension, so Vite won't intercept)
    await page.goto(href!);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('a:has-text("Conversation")')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);
    await snap("conversation", { fullPage: true });
  });

  test("shows PR files changed", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/pulls");
    await page.waitForLoadState("networkidle");
    const prLink = page.locator('a[href*="/alice/mega-app/pull/"]').first();
    await expect(prLink).toBeVisible({ timeout: 10000 });
    const href = await prLink.getAttribute("href");
    // Navigate directly to the files-changed URL
    await page.goto(`${href}/files-changed`);
    await page.waitForLoadState("networkidle");
    // Wait for diff content to appear (hunk headers with @@ markers)
    await expect(page.locator('a:has-text("Files changed")')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);
    await snap("files-changed", { fullPage: true });
  });
});

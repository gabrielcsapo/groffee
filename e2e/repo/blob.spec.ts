import { test, expect } from "../fixtures";

test.describe("File viewer", () => {
  test("shows README file", async ({ page, snap }) => {
    // Navigate via UI clicks (Vite intercepts URLs with file extensions)
    await page.goto("/alice/mega-app");
    await page.waitForLoadState("networkidle");
    const readmeLink = page.locator('a:has-text("README.md")');
    await expect(readmeLink).toBeVisible({ timeout: 10000 });
    await readmeLink.click();
    // Wait for blob view to load (the "Back to" link appears on blob pages)
    await expect(page.locator("text=Back to")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    await snap("blob-readme", { fullPage: true });
  });

  test("shows source code with syntax highlighting", async ({ page, snap }) => {
    // Navigate to repo, click into src, then click a file (not directory)
    await page.goto("/alice/mega-app");
    await page.waitForLoadState("networkidle");
    const srcLink = page.locator('a:has-text("src")').first();
    await expect(srcLink).toBeVisible({ timeout: 10000 });
    await srcLink.click();
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10000 });
    // Click a file entry (links to /blob/) rather than a directory (links to /tree/)
    const fileLink = page.locator('table tbody tr a[href*="/blob/"]').first();
    await expect(fileLink).toBeVisible({ timeout: 10000 });
    await fileLink.click();
    await expect(page.locator("text=Back to")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    await snap("blob-syntax-highlight", { fullPage: true });
  });
});

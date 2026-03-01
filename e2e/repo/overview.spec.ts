import { test, expect } from "../fixtures";

test.describe("Repository overview", () => {
  test("shows file tree and README", async ({ page, snap }) => {
    await page.goto("/alice/mega-app");
    await page.waitForLoadState("networkidle");
    // Wait for file tree to load
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await snap("overview", { fullPage: true });
  });

  test("shows clone URL", async ({ page, snap }) => {
    await page.goto("/alice/mega-app");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=HTTPS")).toBeVisible();
    await snap("overview-clone-url");
  });

  test("shows empty repo state", async ({ page, snap }) => {
    await page.goto("/alice/empty-repo");
    await page.waitForLoadState("networkidle");
    await snap("overview-empty");
  });
});

import { test, expect } from "../fixtures";

test.describe("User profile", () => {
  test("shows alice profile with repos", async ({ page, snap }) => {
    await page.goto("/alice");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=mega-app")).toBeVisible();
    await snap("profile-alice", { fullPage: true });
  });

  test("shows bob profile", async ({ page, snap }) => {
    await page.goto("/bob");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=api-server")).toBeVisible();
    await snap("profile-bob", { fullPage: true });
  });
});

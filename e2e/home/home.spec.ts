import { test, expect } from "../fixtures";

test.describe("Home page", () => {
  test("shows public repositories", async ({ page, snap }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=mega-app")).toBeVisible();
    await snap("home-repos", { fullPage: true });
  });
});

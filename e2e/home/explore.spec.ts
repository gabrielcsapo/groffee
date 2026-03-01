import { test, expect } from "../fixtures";

test.describe("Explore page", () => {
  test("lists all public repos", async ({ page, snap }) => {
    await page.goto("/explore");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=mega-app")).toBeVisible();
    await snap("explore-repos", { fullPage: true });
  });
});

import { test, expect } from "./fixtures";

test.describe("Responsive shell", () => {
  for (const route of ["/", "/alice/mega-app", "/alice/mega-app/activity"]) {
    test(`${route} fits the mobile viewport`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("repository navigation remains usable", async ({ page }) => {
    await page.goto("/alice/mega-app", { waitUntil: "domcontentloaded" });
    const repositoryNav = page.getByLabel("Repository sections");
    await expect(repositoryNav).toBeVisible();
    await expect(repositoryNav.locator('a[href="/alice/mega-app/pulls"]')).toBeVisible();
  });
});

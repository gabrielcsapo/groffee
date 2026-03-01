import { test, expect } from "../fixtures";

test.describe("Issue detail", () => {
  test("shows issue with comments", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/issue/1");
    await page.waitForLoadState("networkidle");
    await snap("detail", { fullPage: true });
  });
});

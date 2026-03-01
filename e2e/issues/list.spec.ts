import { test, expect } from "../fixtures";

test.describe("Issue list", () => {
  test("shows open issues", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/issues");
    await page.waitForLoadState("networkidle");
    await snap("list-open", { fullPage: true });
  });
});

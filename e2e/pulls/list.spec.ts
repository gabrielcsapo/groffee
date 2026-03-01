import { test, expect } from "../fixtures";

test.describe("Pull request list", () => {
  test("shows open PRs", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/pulls");
    await page.waitForLoadState("networkidle");
    await snap("list-open", { fullPage: true });
  });
});

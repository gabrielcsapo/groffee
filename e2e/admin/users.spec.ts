import { test, expect } from "../fixtures";

test.describe("Admin users", () => {
  test("shows user management", async ({ page, snap }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    await snap("users", { fullPage: true });
  });
});

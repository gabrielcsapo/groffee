import { test, expect } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login page", () => {
  test("shows login form", async ({ page, snap }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("Sign in");
    await snap("login-form");
  });

  test("shows error on invalid credentials", async ({ page, snap }) => {
    await page.goto("/login");
    await page.fill("#username", "alice");
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');
    await page.waitForSelector("[class*=danger]");
    await snap("login-error");
  });

  test("redirects to home on successful login", async ({ page, snap }) => {
    await page.goto("/login");
    await page.fill("#username", "alice");
    await page.fill("#password", "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
    await snap("login-success");
  });
});

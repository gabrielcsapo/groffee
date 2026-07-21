import { expect, test } from "../fixtures";

test.describe("repository Pages policy", () => {
  test("requires explicit public publishing opt-in", async ({ page, snap }) => {
    await page.goto("/alice/mega-app/settings");
    const publishing = page.getByRole("checkbox", { name: "Publish pipeline deployments" });
    await expect(publishing).toBeVisible();
    await expect(publishing).not.toBeChecked();
    await expect(
      page.getByText("Pages sites are publicly reachable, even when this repository is private."),
    ).toBeVisible();
    await snap("settings-pages-opt-in");

    await page.goto("/alice/mega-app/pages");
    await expect(page.getByRole("heading", { name: "Pages publishing is disabled" })).toBeVisible();
    await expect(
      page.getByText(
        "The repository owner must explicitly enable public Pages publishing in Settings.",
      ),
    ).toBeVisible();
    await snap("pages-disabled");
  });
});

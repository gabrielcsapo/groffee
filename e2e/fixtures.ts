import { test as base, expect } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";

type Fixtures = {
  snap: (
    name: string,
    options?: { fullPage?: boolean },
  ) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  snap: [
    async ({ page }, use, testInfo) => {
      const snapFn = async (
        name: string,
        options?: { fullPage?: boolean },
      ) => {
        // Derive directory from test file path: e2e/repo/overview.spec.ts -> screenshots/repo/
        const testFileRelative = path.relative(
          path.join(process.cwd(), "e2e"),
          testInfo.file,
        );
        const dir = path.dirname(testFileRelative);
        const screenshotDir = path.join(process.cwd(), "screenshots", dir);
        mkdirSync(screenshotDir, { recursive: true });

        await page.screenshot({
          path: path.join(screenshotDir, `${name}.png`),
          fullPage: options?.fullPage ?? false,
          animations: "disabled",
        });
      };

      await use(snapFn);
    },
    { scope: "test" },
  ],
});

export { expect };

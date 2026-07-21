import assert from "node:assert/strict";
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parsePipelineYaml } from "./pipeline-config.js";
import { resolvePipelineWorkspaceInput } from "./pipeline-security.js";

test("pipeline inputs cannot escape the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "groffee-security-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  writeFileSync(join(outside, "secret"), "nope");
  assert.equal(resolvePipelineWorkspaceInput(workspace, "."), realpathSync(workspace));
  symlinkSync(outside, join(workspace, "escaped-link"));

  assert.throws(() => resolvePipelineWorkspaceInput(workspace, "../outside"), /escapes/);
  assert.throws(() => resolvePipelineWorkspaceInput(workspace, "/etc"), /relative/);
  assert.throws(
    () => resolvePipelineWorkspaceInput(workspace, "escaped-link"),
    /outside the workspace/,
  );

  await rm(root, { recursive: true, force: true });
});

test("artifact definitions reject unsafe names and excessive retention", () => {
  const yaml = `
pipelines:
  ci:
    on: { manual: true }
    jobs:
      build:
        name: Build
        image: node:22-slim
        steps:
          - name: Build
            run: echo ok
        artifacts:
          upload:
            - name: ../../escape
              path: dist
              retention_days: 999
`;
  const result = parsePipelineYaml(yaml);
  assert.match(result.error || "", /Invalid string|Too big/);
});

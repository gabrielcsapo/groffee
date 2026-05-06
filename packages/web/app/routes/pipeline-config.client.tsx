"use client";

import { useState } from "react";
import { Link, useRouter } from "react-flight-router/client";
import { commitPipelineConfig, validatePipelineYaml } from "../lib/server/pipelines";

const STARTER_YAML = `pipelines:
  ci:
    on:
      push: true
    jobs:
      build:
        name: Build
        steps:
          - name: Install
            run: npm install
          - name: Test
            run: npm test
`;

export function PipelineConfigEditor({
  owner,
  repo,
  initialYaml,
  initialError,
  hasConfig,
  defaultBranch,
  editPolicy,
}: {
  owner: string;
  repo: string;
  initialYaml: string;
  initialError: string | null;
  hasConfig: boolean;
  defaultBranch: string;
  editPolicy: "direct" | "pull_request";
}) {
  const router = useRouter();
  const [yaml, setYaml] = useState(initialYaml || STARTER_YAML);
  const [validationError, setValidationError] = useState<string | null>(initialError);
  const [validatedOk, setValidatedOk] = useState(false);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState(
    hasConfig ? "Update pipeline config" : "Add pipeline config",
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const dirty = yaml !== initialYaml;

  async function handleValidate() {
    setValidating(true);
    setValidationError(null);
    setValidatedOk(false);
    setSuccessMessage(null);
    const result = await validatePipelineYaml(yaml);
    setValidating(false);
    if (result.ok) {
      setValidatedOk(true);
    } else {
      setValidationError(result.error);
    }
  }

  async function handleCommit() {
    // Re-validate inline before sending so a stale "Validate" doesn't let
    // bad YAML through after the user kept editing.
    setValidating(true);
    const validation = await validatePipelineYaml(yaml);
    setValidating(false);
    if (!validation.ok) {
      setValidationError(validation.error);
      setValidatedOk(false);
      return;
    }
    setValidationError(null);
    setValidatedOk(true);

    setCommitting(true);
    setSuccessMessage(null);
    const result = await commitPipelineConfig(owner, repo, yaml, commitMessage);
    setCommitting(false);
    if ("error" in result && result.error) {
      setValidationError(result.error);
      return;
    }
    if ("prNumber" in result && result.prNumber) {
      setSuccessMessage(`Pull request #${result.prNumber} opened on branch ${result.branchName}.`);
    } else if ("commitOid" in result && result.commitOid) {
      setSuccessMessage(`Committed ${result.commitOid.slice(0, 7)} to ${result.branchName}.`);
    }
    // Best-effort: refresh server state so a subsequent visit sees fresh
    // config without a hard reload.
    try {
      await router.refresh();
    } catch {
      /* router not always available in tests */
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-text-secondary">
            <Link to={`/${owner}/${repo}/pipelines`} className="hover:text-text-primary">
              Pipelines
            </Link>
            <span className="text-text-tertiary">/</span>
            <span className="text-text-primary">Config</span>
          </div>
          <h2 className="text-xl font-semibold text-text-primary">Pipeline configuration</h2>
          <p className="text-sm text-text-secondary mt-1">
            Editing{" "}
            <code className="px-1 py-0.5 bg-surface-secondary rounded text-xs">
              .groffee/pipelines.yml
            </code>{" "}
            on{" "}
            <code className="px-1 py-0.5 bg-surface-secondary rounded text-xs">
              {defaultBranch}
            </code>
            {editPolicy === "pull_request" && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                PR mode
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Validation banner */}
      {validationError && (
        <div className="mb-4 p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-md text-sm text-red-700 dark:text-red-300">
          <div className="font-medium mb-0.5">Validation error</div>
          <div className="font-mono text-xs whitespace-pre-wrap">{validationError}</div>
        </div>
      )}
      {validatedOk && !validationError && (
        <div className="mb-4 p-3 border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-md text-sm text-green-700 dark:text-green-300">
          YAML is valid.
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-md text-sm text-blue-700 dark:text-blue-300">
          {successMessage}
        </div>
      )}

      {/* Editor */}
      <div className="border border-border rounded-lg overflow-hidden mb-4">
        <div className="bg-surface-secondary px-4 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-mono text-text-secondary">.groffee/pipelines.yml</span>
          <span className="text-xs text-text-tertiary">{yaml.split("\n").length} lines</span>
        </div>
        <textarea
          value={yaml}
          onChange={(e) => {
            setYaml(e.target.value);
            // Drop validation state when the document changes — the user
            // needs to re-validate before committing.
            setValidatedOk(false);
            setValidationError(null);
            setSuccessMessage(null);
          }}
          spellCheck={false}
          className="block w-full px-4 py-3 bg-surface-primary text-text-primary font-mono text-sm resize-y focus:outline-none"
          rows={Math.min(Math.max(yaml.split("\n").length + 1, 12), 40)}
        />
      </div>

      {/* Commit message + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs text-text-secondary block mb-1" htmlFor="cfg-commit-msg">
            Commit message
          </label>
          <input
            id="cfg-commit-msg"
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-surface-primary text-text-primary"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleValidate}
            disabled={validating || committing}
            className="px-3 py-1.5 text-sm border border-border rounded-md text-text-secondary hover:text-text-primary hover:border-border-hover disabled:opacity-50"
          >
            {validating ? "Validating…" : "Validate"}
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={committing || validating || !dirty}
            title={!dirty ? "No changes to commit" : undefined}
            className="px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50"
          >
            {committing ? "Committing…" : editPolicy === "pull_request" ? "Open PR" : "Commit"}
          </button>
        </div>
      </div>
    </div>
  );
}

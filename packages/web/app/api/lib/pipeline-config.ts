import { z } from "zod";
import { parse as parseYaml } from "yaml";

// --- Zod Schema for .groffee/pipelines.yml ---

const stepSchema = z.object({
  name: z.string(),
  run: z.string().optional(),
  uses: z.string().optional(),
  with: z.record(z.string(), z.string()).optional(),
  working_directory: z.string().optional(),
});

const artifactUploadSchema = z.object({
  name: z.string(),
  path: z.string(),
  // Optional. When set, the artifact-retention sweeper deletes the artifact
  // (disk dir + DB row) after `createdAt + retention_days * 86400`. Omit to
  // retain forever (or until the run/repo is deleted).
  retention_days: z.number().int().positive().optional(),
});

// Matrix values are restricted to scalar primitives so they can be safely
// stringified into env vars / template substitutions without surprises.
const matrixScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

// Cap matrix size to prevent runaway YAML (e.g. 6×6×6×6 = 1296 cells).
// 50 is generous for reasonable matrix shapes (5 node × 5 os × 2 mode = 50).
const MATRIX_MAX_CELLS = 50;

const matrixSchema = z
  .record(z.string(), z.array(matrixScalarSchema).min(1))
  .refine((rec) => Object.keys(rec).length >= 1, {
    message: "matrix must define at least one dimension",
  })
  .refine(
    (rec) => {
      const product = Object.values(rec).reduce((acc, arr) => acc * arr.length, 1);
      return product <= MATRIX_MAX_CELLS;
    },
    { message: `matrix expansion exceeds ${MATRIX_MAX_CELLS} total cells` },
  );

const jobSchema = z.object({
  name: z.string(),
  image: z.string().optional(),
  needs: z.array(z.string()).optional(),
  timeout: z.number().positive().optional().default(3600),
  env: z.record(z.string(), z.string()).optional(),
  matrix: matrixSchema.optional(),
  steps: z.array(stepSchema).min(1),
  artifacts: z
    .object({
      upload: z.array(artifactUploadSchema).optional(),
    })
    .optional(),
});

const triggerBranchFilter = z.object({
  branches: z.array(z.string()).optional(),
});

const triggerConfig = z.object({
  push: z.union([triggerBranchFilter, z.literal(true)]).optional(),
  pull_request: z.union([triggerBranchFilter, z.literal(true)]).optional(),
  manual: z.literal(true).optional(),
});

const concurrencyConfig = z.object({
  group: z.string(),
  cancel_in_progress: z.boolean().optional().default(false),
});

const pipelineSchema = z.object({
  on: triggerConfig,
  concurrency: concurrencyConfig.optional(),
  env: z.record(z.string(), z.string()).optional(),
  // Run-level timeout in seconds. Used by the queue's per-run timeout and the
  // stuck-run sweeper. Defaults to 60 minutes.
  timeout: z.number().positive().optional().default(3600),
  jobs: z
    .record(z.string(), jobSchema)
    .refine((jobs) => Object.keys(jobs).length > 0, { message: "At least one job is required" }),
});

export const pipelinesFileSchema = z.object({
  pipelines: z
    .record(z.string(), pipelineSchema)
    .refine((p) => Object.keys(p).length > 0, { message: "At least one pipeline is required" }),
});

export type PipelinesConfig = z.infer<typeof pipelinesFileSchema>;
export type PipelineConfig = z.infer<typeof pipelineSchema>;
export type JobConfig = z.infer<typeof jobSchema>;
export type StepConfig = z.infer<typeof stepSchema>;
export type MatrixValues = Record<string, string | number | boolean>;

// --- Parsing ---

export function parsePipelineYaml(yamlContent: string): {
  config?: PipelinesConfig;
  error?: string;
} {
  try {
    const raw = parseYaml(yamlContent);
    const result = pipelinesFileSchema.safeParse(raw);
    if (!result.success) {
      return {
        error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    return { config: result.data };
  } catch (err: unknown) {
    return { error: `YAML parse error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// --- Trigger Matching ---

export function matchesTrigger(
  pipeline: PipelineConfig,
  trigger: "push" | "pull_request" | "manual",
  branchName: string,
): boolean {
  const triggerDef = pipeline.on[trigger];
  if (!triggerDef) return false;
  if (triggerDef === true) return true;
  if ("branches" in triggerDef && triggerDef.branches) {
    return triggerDef.branches.includes(branchName);
  }
  // No branch filter means all branches match
  return true;
}

// --- Job Dependency Resolution ---

export function resolveJobOrder(jobs: Record<string, JobConfig>): string[] {
  const resolved: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }
    visiting.add(name);
    const job = jobs[name];
    if (job?.needs) {
      for (const dep of job.needs) {
        if (!jobs[dep]) {
          throw new Error(`Job "${name}" depends on unknown job "${dep}"`);
        }
        visit(dep);
      }
    }
    visiting.delete(name);
    visited.add(name);
    resolved.push(name);
  }

  for (const name of Object.keys(jobs)) {
    visit(name);
  }

  return resolved;
}

// --- Simple Template Interpolation ---

/**
 * Resolve `${{ key }}` and `${{ namespace.key }}` placeholders.
 *
 * Vars may be a flat string map (the original behavior — concurrency.group
 * substitution etc.) or a nested object whose top-level keys are namespaces
 * (e.g. `{ matrix: { node: 20, os: "debian" } }`). Both shapes can co-exist
 * in the same call. Missing keys collapse to empty string for backward compat.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | number | boolean | Record<string, string | number | boolean>>,
): string {
  return template.replace(/\$\{\{\s*([\w.]+)\s*\}\}/g, (_, expr: string) => {
    const parts = expr.split(".");
    if (parts.length === 1) {
      const v = vars[parts[0]];
      if (v === undefined || v === null) return "";
      if (typeof v === "object") return "";
      return String(v);
    }
    if (parts.length === 2) {
      const [ns, key] = parts;
      const bag = vars[ns];
      if (!bag || typeof bag !== "object") return "";
      const val = (bag as Record<string, string | number | boolean>)[key];
      if (val === undefined || val === null) return "";
      return String(val);
    }
    return "";
  });
}

/**
 * Expand a matrix definition into the cartesian product of its dimensions.
 * Order is deterministic: dimensions are iterated in the order the YAML keys
 * were declared, with the rightmost dimension changing fastest. So:
 *
 *   { node: [18, 20], os: ["debian", "alpine"] }
 *
 * yields:
 *
 *   [{ node: 18, os: "debian" }, { node: 18, os: "alpine" },
 *    { node: 20, os: "debian" }, { node: 20, os: "alpine" }]
 */
export function expandMatrix(
  matrix: Record<string, Array<string | number | boolean>>,
): MatrixValues[] {
  const keys = Object.keys(matrix);
  if (keys.length === 0) return [];
  let acc: MatrixValues[] = [{}];
  for (const k of keys) {
    const next: MatrixValues[] = [];
    for (const row of acc) {
      for (const v of matrix[k]) {
        next.push({ ...row, [k]: v });
      }
    }
    acc = next;
  }
  return acc;
}

/**
 * Format a matrix cell's parameters as a human-readable suffix for the job
 * name. Order matches `expandMatrix` (declared key order).
 *
 *   matrixCellLabel({ node: 20, os: "debian" }) → "node=20, os=debian"
 */
export function matrixCellLabel(values: MatrixValues): string {
  return Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

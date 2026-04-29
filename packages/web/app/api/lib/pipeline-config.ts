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
});

const jobSchema = z.object({
  name: z.string(),
  image: z.string().optional(),
  needs: z.array(z.string()).optional(),
  timeout: z.number().positive().optional().default(3600),
  env: z.record(z.string(), z.string()).optional(),
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

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] || "");
}

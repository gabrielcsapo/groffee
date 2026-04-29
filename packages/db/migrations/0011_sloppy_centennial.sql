CREATE TABLE `pages_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`run_id` text,
	`commit_oid` text NOT NULL,
	`disk_path` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`deployed_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `pipeline_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deployed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pages_deploy_repo_idx` ON `pages_deployments` (`repo_id`);--> statement-breakpoint
CREATE INDEX `pages_deploy_repo_status_idx` ON `pages_deployments` (`repo_id`,`status`);--> statement-breakpoint
CREATE TABLE `pipeline_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`job_id` text NOT NULL,
	`name` text NOT NULL,
	`disk_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `pipeline_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `pipeline_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pipeline_artifacts_run_idx` ON `pipeline_artifacts` (`run_id`);--> statement-breakpoint
CREATE TABLE `pipeline_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`sort_order` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `pipeline_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pipeline_jobs_run_idx` ON `pipeline_jobs` (`run_id`);--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`pipeline_name` text NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`trigger` text NOT NULL,
	`ref` text NOT NULL,
	`commit_oid` text NOT NULL,
	`triggered_by_id` text NOT NULL,
	`config_snapshot` text NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`triggered_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pipeline_runs_repo_idx` ON `pipeline_runs` (`repo_id`);--> statement-breakpoint
CREATE INDEX `pipeline_runs_repo_status_idx` ON `pipeline_runs` (`repo_id`,`status`);--> statement-breakpoint
CREATE INDEX `pipeline_runs_repo_number_idx` ON `pipeline_runs` (`repo_id`,`number`);--> statement-breakpoint
CREATE TABLE `pipeline_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`name` text NOT NULL,
	`command` text,
	`uses` text,
	`with_config` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`exit_code` integer,
	`log_path` text,
	`sort_order` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `pipeline_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pipeline_steps_job_idx` ON `pipeline_steps` (`job_id`);--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`ref` text NOT NULL,
	`config_yaml` text NOT NULL,
	`config_hash` text NOT NULL,
	`parsed_config` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipelines_repo_ref_idx` ON `pipelines` (`repo_id`,`ref`);--> statement-breakpoint
CREATE INDEX `pipelines_repo_idx` ON `pipelines` (`repo_id`);
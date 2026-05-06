CREATE TABLE `repo_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`name` text NOT NULL,
	`ciphertext` blob NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_secrets_repo_name_idx` ON `repo_secrets` (`repo_id`,`name`);--> statement-breakpoint
CREATE INDEX `repo_secrets_repo_idx` ON `repo_secrets` (`repo_id`);--> statement-breakpoint
ALTER TABLE `pipeline_artifacts` ADD `retention_until` integer;--> statement-breakpoint
CREATE INDEX `pipeline_artifacts_retention_idx` ON `pipeline_artifacts` (`retention_until`);
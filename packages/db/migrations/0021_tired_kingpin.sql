CREATE TABLE `deploy_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`read_only` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deploy_keys_repo_idx` ON `deploy_keys` (`repo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `deploy_keys_repo_fingerprint_idx` ON `deploy_keys` (`repo_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `deploy_keys_fingerprint_idx` ON `deploy_keys` (`fingerprint`);
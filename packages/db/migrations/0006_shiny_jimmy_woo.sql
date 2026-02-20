CREATE TABLE `repo_activity_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`cache_key` text NOT NULL,
	`data` text NOT NULL,
	`author_filter` text,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_activity_cache_key_idx` ON `repo_activity_cache` (`repo_id`,`cache_key`,`author_filter`);--> statement-breakpoint
CREATE INDEX `repo_activity_cache_repo_idx` ON `repo_activity_cache` (`repo_id`);--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`request_id` text,
	`user_id` text,
	`source` text,
	`duration` integer,
	`method` text,
	`path` text,
	`status_code` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `system_logs_level_idx` ON `system_logs` (`level`);--> statement-breakpoint
CREATE INDEX `system_logs_created_idx` ON `system_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `system_logs_request_idx` ON `system_logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `system_logs_source_idx` ON `system_logs` (`source`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text,
	`token_hash` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "user_id", "token", "token_hash", "expires_at", "created_at") SELECT "id", "user_id", "token", NULL, "expires_at", "created_at" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sessions_token_hash_idx` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `comments_issue_idx` ON `comments` (`issue_id`);--> statement-breakpoint
CREATE INDEX `comments_pr_idx` ON `comments` (`pull_request_id`);--> statement-breakpoint
CREATE INDEX `git_commits_repo_author_ts_idx` ON `git_commits` (`repo_id`,`author_timestamp`);--> statement-breakpoint
CREATE INDEX `git_commits_repo_author_email_idx` ON `git_commits` (`repo_id`,`author_email`);--> statement-breakpoint
CREATE INDEX `issues_repo_status_idx` ON `issues` (`repo_id`,`status`);--> statement-breakpoint
CREATE INDEX `prs_repo_status_idx` ON `pull_requests` (`repo_id`,`status`);
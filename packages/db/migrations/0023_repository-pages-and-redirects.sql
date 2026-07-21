CREATE TABLE `repository_redirects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`old_name` text NOT NULL,
	`repo_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_redirect_owner_name_idx` ON `repository_redirects` (`owner_id`,`old_name`);--> statement-breakpoint
CREATE INDEX `repo_redirect_repo_idx` ON `repository_redirects` (`repo_id`);--> statement-breakpoint
ALTER TABLE `repositories` ADD `pages_enabled` integer DEFAULT false NOT NULL;
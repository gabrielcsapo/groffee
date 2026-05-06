CREATE TABLE `repo_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`repo_id` text NOT NULL,
	`permission` text DEFAULT 'write' NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`used_at` integer,
	`used_by_id` text,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_invites_token_idx` ON `repo_invites` (`token`);--> statement-breakpoint
CREATE INDEX `repo_invites_repo_idx` ON `repo_invites` (`repo_id`);
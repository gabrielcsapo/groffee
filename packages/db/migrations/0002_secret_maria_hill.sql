CREATE TABLE `repo_collaborators` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permission` text DEFAULT 'write' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collab_repo_user_idx` ON `repo_collaborators` (`repo_id`,`user_id`);
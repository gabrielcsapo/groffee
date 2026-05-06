CREATE TABLE `diff_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`pull_request_id` text NOT NULL,
	`author_id` text NOT NULL,
	`parent_id` text,
	`file_path` text NOT NULL,
	`commit_oid` text NOT NULL,
	`side` text NOT NULL,
	`line_number` integer NOT NULL,
	`body` text NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `diff_comments_pr_file_line_side_idx` ON `diff_comments` (`pull_request_id`,`file_path`,`line_number`,`side`);--> statement-breakpoint
CREATE INDEX `diff_comments_pr_parent_created_idx` ON `diff_comments` (`pull_request_id`,`parent_id`,`created_at`);
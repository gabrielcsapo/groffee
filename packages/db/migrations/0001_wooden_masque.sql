CREATE TABLE `edit_history` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text,
	`pull_request_id` text,
	`comment_id` text,
	`target_type` text NOT NULL,
	`previous_title` text,
	`previous_body` text,
	`edited_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

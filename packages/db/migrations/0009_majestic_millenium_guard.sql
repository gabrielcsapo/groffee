CREATE INDEX `edit_history_issue_idx` ON `edit_history` (`issue_id`);--> statement-breakpoint
CREATE INDEX `edit_history_pr_idx` ON `edit_history` (`pull_request_id`);--> statement-breakpoint
CREATE INDEX `edit_history_comment_idx` ON `edit_history` (`comment_id`);--> statement-breakpoint
CREATE INDEX `ssh_keys_user_id_idx` ON `ssh_keys` (`user_id`);--> statement-breakpoint
CREATE INDEX `ssh_keys_fingerprint_idx` ON `ssh_keys` (`fingerprint`);
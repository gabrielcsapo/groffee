CREATE INDEX `collab_user_idx` ON `repo_collaborators` (`user_id`);--> statement-breakpoint
CREATE INDEX `repos_public_updated_idx` ON `repositories` (`is_public`,`updated_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
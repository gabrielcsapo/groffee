CREATE TABLE `lfs_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`oid` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lfs_objects_repo_oid_idx` ON `lfs_objects` (`repo_id`,`oid`);--> statement-breakpoint
CREATE INDEX `lfs_objects_repo_idx` ON `lfs_objects` (`repo_id`);
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`oid` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `uploads_oid_idx` ON `uploads` (`oid`);--> statement-breakpoint
CREATE INDEX `uploads_user_created_idx` ON `uploads` (`uploaded_by_id`,`created_at`);
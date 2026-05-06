ALTER TABLE `repositories` ADD `disk_usage_bytes` integer;--> statement-breakpoint
ALTER TABLE `repositories` ADD `last_indexed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `disabled` integer DEFAULT false NOT NULL;
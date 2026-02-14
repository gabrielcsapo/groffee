CREATE TABLE `git_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`oid` text NOT NULL,
	`content` text,
	`size` integer NOT NULL,
	`is_binary` integer DEFAULT false NOT NULL,
	`is_truncated` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_blobs_repo_oid_idx` ON `git_blobs` (`repo_id`,`oid`);--> statement-breakpoint
CREATE TABLE `git_commit_ancestry` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`ref_name` text NOT NULL,
	`commit_oid` text NOT NULL,
	`depth` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_ancestry_repo_ref_commit_idx` ON `git_commit_ancestry` (`repo_id`,`ref_name`,`commit_oid`);--> statement-breakpoint
CREATE INDEX `git_ancestry_repo_ref_depth_idx` ON `git_commit_ancestry` (`repo_id`,`ref_name`,`depth`);--> statement-breakpoint
CREATE TABLE `git_commit_files` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`commit_oid` text NOT NULL,
	`file_path` text NOT NULL,
	`change_type` text NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_commit_files_repo_commit_path_idx` ON `git_commit_files` (`repo_id`,`commit_oid`,`file_path`);--> statement-breakpoint
CREATE INDEX `git_commit_files_repo_path_idx` ON `git_commit_files` (`repo_id`,`file_path`);--> statement-breakpoint
CREATE TABLE `git_commits` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`oid` text NOT NULL,
	`message` text NOT NULL,
	`author_name` text NOT NULL,
	`author_email` text NOT NULL,
	`author_timestamp` integer NOT NULL,
	`committer_name` text NOT NULL,
	`committer_email` text NOT NULL,
	`committer_timestamp` integer NOT NULL,
	`parent_oids` text DEFAULT '[]' NOT NULL,
	`tree_oid` text NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_commits_repo_oid_idx` ON `git_commits` (`repo_id`,`oid`);--> statement-breakpoint
CREATE TABLE `git_refs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`commit_oid` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_refs_repo_name_idx` ON `git_refs` (`repo_id`,`name`);--> statement-breakpoint
CREATE TABLE `git_tree_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`root_tree_oid` text NOT NULL,
	`parent_path` text NOT NULL,
	`entry_name` text NOT NULL,
	`entry_path` text NOT NULL,
	`entry_type` text NOT NULL,
	`entry_oid` text NOT NULL,
	`entry_size` integer,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_tree_entry_tree_path_idx` ON `git_tree_entries` (`repo_id`,`root_tree_oid`,`entry_path`);--> statement-breakpoint
CREATE INDEX `git_tree_entry_listing_idx` ON `git_tree_entries` (`repo_id`,`root_tree_oid`,`parent_path`);
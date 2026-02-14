CREATE VIRTUAL TABLE IF NOT EXISTS code_search USING fts5(
  repo_id UNINDEXED,
  blob_oid UNINDEXED,
  file_path,
  content,
  tokenize='porter unicode61'
);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS issue_search USING fts5(
  issue_id UNINDEXED,
  repo_id UNINDEXED,
  title,
  body,
  tokenize='porter unicode61'
);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS pr_search USING fts5(
  pr_id UNINDEXED,
  repo_id UNINDEXED,
  title,
  body,
  tokenize='porter unicode61'
);

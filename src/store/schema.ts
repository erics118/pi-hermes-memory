/**
 * SQLite schema for pi-hermes-memory v0.4
 *
 * Tables:
 * - sessions — Pi session metadata
 * - session_files — indexed JSONL metadata for incremental backfill
 * - messages — all conversation messages
 * - message_fts — FTS5 index for full-text search across messages
 * - memories — extended memory entries (unlimited, searchable)
 * - memory_fts — FTS5 index for memory search
 */

export const SCHEMA_SQL = `
  -- Extension key/value metadata
  CREATE TABLE IF NOT EXISTS extension_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Session metadata
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    cwd TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    message_count INTEGER DEFAULT 0
  );

  -- Indexed session file metadata for cheap incremental backfill
  CREATE TABLE IF NOT EXISTS session_files (
    path TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    size INTEGER NOT NULL,
    mtime_ms INTEGER NOT NULL,
    indexed_at TEXT NOT NULL
  );

  -- All messages from all sessions
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    tool_calls TEXT
  );

  -- FTS5 trigram indexes support substring search for CJK and retain
  -- normal token search for English. Queries shorter than three characters
  -- are not indexed by the trigram tokenizer.
  CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
    content,
    content='messages',
    content_rowid='rowid',
    tokenize='trigram'
  );

  -- Triggers to keep message_fts in sync with messages table
  CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO message_fts(rowid, content) VALUES (new.rowid, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO message_fts(message_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO message_fts(message_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO message_fts(rowid, content) VALUES (new.rowid, new.content);
  END;

  -- Extended memory entries (beyond MEMORY.md limit)
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT,
    target TEXT NOT NULL CHECK (target IN ('memory', 'user', 'failure')),
    category TEXT CHECK (category IN ('failure', 'correction', 'insight', 'preference', 'convention', 'tool-quirk')),
    content TEXT NOT NULL,
    failure_reason TEXT,
    tool_state TEXT,
    corrected_to TEXT,
    created DATE NOT NULL,
    last_referenced DATE NOT NULL
  );

  -- Correction governance: evidence is captured before durable changes are proposed.
  CREATE TABLE IF NOT EXISTS correction_candidates (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    session_id TEXT,
    request_entry_id TEXT,
    assistant_entry_id TEXT,
    correction_entry_id TEXT,
    category TEXT NOT NULL,
    agent_decision TEXT NOT NULL,
    user_feedback TEXT NOT NULL,
    expected_behavior TEXT NOT NULL,
    strength TEXT NOT NULL CHECK (strength IN ('weak', 'strong')),
    source_hash TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'undone')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS correction_grouping_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    candidate_ids_json TEXT NOT NULL,
    patterns_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS correction_proposals (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL,
    grouping_snapshot_id INTEGER REFERENCES correction_grouping_snapshots(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    candidate_ids_json TEXT NOT NULL,
    proof_kind TEXT NOT NULL CHECK (proof_kind IN ('existing_test', 'new_mechanical_eval', 'new_live_eval', 'direct_observation', 'no_additional_proof')),
    proof_reason TEXT NOT NULL,
    eval_json TEXT,
    intervention_json TEXT,
    status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'decided')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS correction_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES correction_proposals(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected', 'deferred', 'already_fixed', 'duplicate')),
    decided_at TEXT NOT NULL,
    decided_by TEXT NOT NULL DEFAULT 'user',
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS correction_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES correction_proposals(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL CHECK (outcome IN ('verified', 'rejected_by_proof')),
    evidence TEXT NOT NULL,
    checked_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reflection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    project TEXT,
    focus TEXT,
    digest TEXT NOT NULL,
    digest_chars INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reflection_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES reflection_runs(id) ON DELETE CASCADE,
    classification TEXT NOT NULL CHECK (classification IN ('correction', 'global_preference', 'project_memory', 'skill', 'structural_change', 'papercut', 'rejected')),
    destination TEXT NOT NULL CHECK (destination IN ('correction_review', 'user_memory', 'memory', 'project_memory', 'skill', 'code_or_test', 'none')),
    summary TEXT NOT NULL,
    evidence TEXT NOT NULL,
    proposed_action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'selected', 'rejected')),
    created_at TEXT NOT NULL,
    selected_at TEXT
  );

  -- FTS5 trigram index for memory substring search
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    content,
    content='memories',
    content_rowid='id',
    tokenize='trigram'
  );

  -- Triggers to keep memory_fts in sync with memories table
  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memory_fts(rowid, content) VALUES (new.id, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.id, old.content);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.id, old.content);
    INSERT INTO memory_fts(rowid, content) VALUES (new.id, new.content);
  END;

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
  CREATE INDEX IF NOT EXISTS idx_memories_target ON memories(target);
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_correction_candidates_status ON correction_candidates(status);
  CREATE INDEX IF NOT EXISTS idx_correction_candidates_project ON correction_candidates(project);
  CREATE INDEX IF NOT EXISTS idx_correction_grouping_snapshots_created ON correction_grouping_snapshots(created_at);
  CREATE INDEX IF NOT EXISTS idx_correction_proposals_pattern ON correction_proposals(pattern_id);
  CREATE INDEX IF NOT EXISTS idx_reflection_runs_created ON reflection_runs(created_at);
  CREATE INDEX IF NOT EXISTS idx_reflection_candidates_run ON reflection_candidates(run_id);
  CREATE INDEX IF NOT EXISTS idx_reflection_candidates_status ON reflection_candidates(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_correction_decisions_one_per_proposal ON correction_decisions(proposal_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_correction_proofs_one_per_proposal ON correction_proofs(proposal_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
  CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_session_files_session_id ON session_files(session_id);
`;

import type { DatabaseManager } from "./db.js";

const MAX_DIGEST_CHARS = 12_000;

export type ReflectionClassification =
  | "correction"
  | "global_preference"
  | "project_memory"
  | "skill"
  | "structural_change"
  | "papercut"
  | "rejected";

export type ReflectionDestination =
  | "correction_review"
  | "user_memory"
  | "memory"
  | "project_memory"
  | "skill"
  | "code_or_test"
  | "none";

export interface ReflectionRunInput {
  sessionId?: string;
  project?: string;
  focus?: string;
  digest: string;
  createdAt?: string;
}

export interface ReflectionRunRecord {
  id: number;
  sessionId: string | null;
  project: string | null;
  focus: string | null;
  digest: string;
  digestChars: number;
  createdAt: string;
}

export interface ReflectionCandidateInput {
  runId: number;
  classification: ReflectionClassification;
  destination: ReflectionDestination;
  summary: string;
  evidence: string;
  proposedAction: string;
  createdAt?: string;
}

export interface ReflectionCandidateRecord {
  id: number;
  runId: number;
  classification: ReflectionClassification;
  destination: ReflectionDestination;
  summary: string;
  evidence: string;
  proposedAction: string;
  status: "proposed" | "selected" | "rejected";
  createdAt: string;
  selectedAt: string | null;
}

export interface SelectReflectionCandidateInput {
  candidateId: number;
  selectedAt?: string;
}

type ReflectionRunRow = {
  id: number;
  session_id: string | null;
  project: string | null;
  focus: string | null;
  digest: string;
  digest_chars: number;
  created_at: string;
};

type ReflectionCandidateRow = {
  id: number;
  run_id: number;
  classification: ReflectionClassification;
  destination: ReflectionDestination;
  summary: string;
  evidence: string;
  proposed_action: string;
  status: "proposed" | "selected" | "rejected";
  created_at: string;
  selected_at: string | null;
};

function normalizeSpaces(value: string): string {
  return value.replace(/[ \t]+/g, " ").trim();
}

function rowToRun(row: ReflectionRunRow): ReflectionRunRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    project: row.project,
    focus: row.focus,
    digest: row.digest,
    digestChars: row.digest_chars,
    createdAt: row.created_at,
  };
}

function rowToCandidate(
  row: ReflectionCandidateRow,
): ReflectionCandidateRecord {
  return {
    id: row.id,
    runId: row.run_id,
    classification: row.classification,
    destination: row.destination,
    summary: row.summary,
    evidence: row.evidence,
    proposedAction: row.proposed_action,
    status: row.status,
    createdAt: row.created_at,
    selectedAt: row.selected_at,
  };
}

export function recordReflectionRun(
  dbManager: DatabaseManager,
  input: ReflectionRunInput,
): ReflectionRunRecord {
  const digest = input.digest.trim();
  if (digest.length > MAX_DIGEST_CHARS) {
    throw new Error(
      `Reflection digest exceeds ${MAX_DIGEST_CHARS} characters.`,
    );
  }
  if (!digest) throw new Error("Reflection digest is required.");

  const db = dbManager.getDb();
  const result = db
    .prepare(
      `
      INSERT INTO reflection_runs (session_id, project, focus, digest, digest_chars, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      input.sessionId ?? null,
      input.project ?? null,
      input.focus ?? null,
      digest,
      digest.length,
      input.createdAt ?? new Date().toISOString(),
    ) as { lastInsertRowid: number | bigint };

  const row = db
    .prepare("SELECT * FROM reflection_runs WHERE id = ?")
    .get(result.lastInsertRowid) as ReflectionRunRow;
  return rowToRun(row);
}

export function recordReflectionCandidate(
  dbManager: DatabaseManager,
  input: ReflectionCandidateInput,
): ReflectionCandidateRecord {
  const db = dbManager.getDb();
  const run = db
    .prepare("SELECT id FROM reflection_runs WHERE id = ?")
    .get(input.runId);
  if (!run) throw new Error(`Reflection run ${input.runId} does not exist.`);

  const result = db
    .prepare(
      `
      INSERT INTO reflection_candidates (
        run_id,
        classification,
        destination,
        summary,
        evidence,
        proposed_action,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      input.runId,
      input.classification,
      input.destination,
      normalizeSpaces(input.summary),
      normalizeSpaces(input.evidence),
      normalizeSpaces(input.proposedAction),
      input.createdAt ?? new Date().toISOString(),
    ) as { lastInsertRowid: number | bigint };

  const row = db
    .prepare("SELECT * FROM reflection_candidates WHERE id = ?")
    .get(result.lastInsertRowid) as ReflectionCandidateRow;
  return rowToCandidate(row);
}

export function listReflectionCandidates(
  dbManager: DatabaseManager,
  runId: number,
): ReflectionCandidateRecord[] {
  const rows = dbManager
    .getDb()
    .prepare(
      `
      SELECT *
      FROM reflection_candidates
      WHERE run_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    )
    .all(runId) as ReflectionCandidateRow[];
  return rows.map(rowToCandidate);
}

export function selectReflectionCandidate(
  dbManager: DatabaseManager,
  input: SelectReflectionCandidateInput,
): ReflectionCandidateRecord {
  const db = dbManager.getDb();
  const result = db
    .prepare(
      `
      UPDATE reflection_candidates
      SET status = 'selected', selected_at = ?
      WHERE id = ? AND status = 'proposed'
    `,
    )
    .run(input.selectedAt ?? new Date().toISOString(), input.candidateId) as {
    changes?: number;
  };
  if ((result.changes ?? 0) !== 1) {
    throw new Error(
      `Reflection candidate ${input.candidateId} is not selectable.`,
    );
  }

  const row = db
    .prepare("SELECT * FROM reflection_candidates WHERE id = ?")
    .get(input.candidateId) as ReflectionCandidateRow;
  return rowToCandidate(row);
}

import { createHash } from "node:crypto";
import type { DatabaseManager } from "./db.js";

export type CorrectionProofKind =
  | "existing_test"
  | "new_mechanical_eval"
  | "new_live_eval"
  | "direct_observation"
  | "no_additional_proof";

export type CorrectionDecision =
  "accepted" | "rejected" | "deferred" | "already_fixed" | "duplicate";

export type CorrectionProofOutcome = "verified" | "rejected_by_proof";

export interface CorrectionCandidateInput {
  project: string;
  sessionId?: string;
  requestEntryId?: string;
  assistantEntryId?: string;
  correctionEntryId?: string;
  category: string;
  agentDecision: string;
  userFeedback: string;
  expectedBehavior: string;
  strength: "weak" | "strong";
  createdAt?: string;
}

export interface CorrectionCandidateRecord {
  id: string;
  project: string;
  sessionId: string | null;
  requestEntryId: string | null;
  assistantEntryId: string | null;
  correctionEntryId: string | null;
  category: string;
  agentDecision: string;
  userFeedback: string;
  expectedBehavior: string;
  strength: "weak" | "strong";
  sourceHash: string;
  evidenceJson: string;
  status: "active" | "undone";
  createdAt: string;
  inserted: boolean;
}

export interface CorrectionGroupingSnapshotInput {
  version: string;
  candidateIds: string[];
  patterns: unknown[];
  createdAt?: string;
}

export interface CorrectionGroupingSnapshotRecord {
  id: number;
  version: string;
  candidateIds: string[];
  patternsJson: string;
  createdAt: string;
}

export interface CorrectionProposalInput {
  id: string;
  patternId: string;
  groupingSnapshotId?: number | null;
  title: string;
  summary: string;
  candidateIds: string[];
  proofKind: CorrectionProofKind;
  proofReason: string;
  eval?: unknown;
  intervention?: unknown;
  createdAt?: string;
}

export interface CorrectionProposalRecord {
  id: string;
  patternId: string;
  groupingSnapshotId: number | null;
  title: string;
  summary: string;
  candidateIds: string[];
  proofKind: CorrectionProofKind;
  proofReason: string;
  evalJson: string | null;
  interventionJson: string | null;
  status: "proposed" | "decided";
  createdAt: string;
}

export interface CorrectionDecisionInput {
  proposalId: string;
  decision: CorrectionDecision;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
}

export interface CorrectionDecisionRecord {
  id: number;
  proposalId: string;
  decision: CorrectionDecision;
  decidedAt: string;
  decidedBy: string;
  note: string | null;
}

export interface CorrectionProofInput {
  proposalId: string;
  outcome: CorrectionProofOutcome;
  evidence: string;
  checkedAt?: string;
}

export interface CorrectionProofRecord {
  id: number;
  proposalId: string;
  outcome: CorrectionProofOutcome;
  evidence: string;
  checkedAt: string;
}

type CandidateRow = {
  id: string;
  project: string;
  session_id: string | null;
  request_entry_id: string | null;
  assistant_entry_id: string | null;
  correction_entry_id: string | null;
  category: string;
  agent_decision: string;
  user_feedback: string;
  expected_behavior: string;
  strength: "weak" | "strong";
  source_hash: string;
  evidence_json: string;
  status: "active" | "undone";
  created_at: string;
};

type GroupingSnapshotRow = {
  id: number;
  version: string;
  candidate_ids_json: string;
  patterns_json: string;
  created_at: string;
};

type ProposalRow = {
  id: string;
  pattern_id: string;
  grouping_snapshot_id: number | null;
  title: string;
  summary: string;
  candidate_ids_json: string;
  proof_kind: CorrectionProofKind;
  proof_reason: string;
  eval_json: string | null;
  intervention_json: string | null;
  status: "proposed" | "decided";
  created_at: string;
};

type DecisionRow = {
  id: number;
  proposal_id: string;
  decision: CorrectionDecision;
  decided_at: string;
  decided_by: string;
  note: string | null;
};

type ProofRow = {
  id: number;
  proposal_id: string;
  outcome: CorrectionProofOutcome;
  evidence: string;
  checked_at: string;
};

function canonicalEvidence(
  input: CorrectionCandidateInput,
): Record<string, string | null> {
  return {
    project: input.project,
    sessionId: input.sessionId ?? null,
    requestEntryId: input.requestEntryId ?? null,
    assistantEntryId: input.assistantEntryId ?? null,
    correctionEntryId: input.correctionEntryId ?? null,
  };
}

function sourceHashFor(input: CorrectionCandidateInput): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalEvidence(input)))
    .digest("hex");
}

function rowToRecord(
  row: CandidateRow,
  inserted: boolean,
): CorrectionCandidateRecord {
  return {
    id: row.id,
    project: row.project,
    sessionId: row.session_id,
    requestEntryId: row.request_entry_id,
    assistantEntryId: row.assistant_entry_id,
    correctionEntryId: row.correction_entry_id,
    category: row.category,
    agentDecision: row.agent_decision,
    userFeedback: row.user_feedback,
    expectedBehavior: row.expected_behavior,
    strength: row.strength,
    sourceHash: row.source_hash,
    evidenceJson: row.evidence_json,
    status: row.status,
    createdAt: row.created_at,
    inserted,
  };
}

function groupingSnapshotRowToRecord(
  row: GroupingSnapshotRow,
): CorrectionGroupingSnapshotRecord {
  return {
    id: row.id,
    version: row.version,
    candidateIds: JSON.parse(row.candidate_ids_json) as string[],
    patternsJson: row.patterns_json,
    createdAt: row.created_at,
  };
}

function proposalRowToRecord(row: ProposalRow): CorrectionProposalRecord {
  return {
    id: row.id,
    patternId: row.pattern_id,
    groupingSnapshotId: row.grouping_snapshot_id,
    title: row.title,
    summary: row.summary,
    candidateIds: JSON.parse(row.candidate_ids_json) as string[],
    proofKind: row.proof_kind,
    proofReason: row.proof_reason,
    evalJson: row.eval_json,
    interventionJson: row.intervention_json,
    status: row.status,
    createdAt: row.created_at,
  };
}

function decisionRowToRecord(row: DecisionRow): CorrectionDecisionRecord {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    decision: row.decision,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    note: row.note,
  };
}

function proofRowToRecord(row: ProofRow): CorrectionProofRecord {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    outcome: row.outcome,
    evidence: row.evidence,
    checkedAt: row.checked_at,
  };
}

export function recordCorrectionCandidate(
  dbManager: DatabaseManager,
  input: CorrectionCandidateInput,
): CorrectionCandidateRecord {
  const db = dbManager.getDb();
  const sourceHash = sourceHashFor(input);
  const id = `candidate_${sourceHash.slice(0, 24)}`;
  const evidenceJson = JSON.stringify(canonicalEvidence(input));
  const createdAt = input.createdAt ?? new Date().toISOString();

  const transaction = db.transaction?.((() => {
    const result = db
      .prepare(
        `
      INSERT OR IGNORE INTO correction_candidates (
        id,
        project,
        session_id,
        request_entry_id,
        assistant_entry_id,
        correction_entry_id,
        category,
        agent_decision,
        user_feedback,
        expected_behavior,
        strength,
        source_hash,
        evidence_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        input.project,
        input.sessionId ?? null,
        input.requestEntryId ?? null,
        input.assistantEntryId ?? null,
        input.correctionEntryId ?? null,
        input.category,
        input.agentDecision,
        input.userFeedback,
        input.expectedBehavior,
        input.strength,
        sourceHash,
        evidenceJson,
        createdAt,
      ) as { changes?: number };

    const row = db
      .prepare(
        `
      SELECT * FROM correction_candidates WHERE id = ?
    `,
      )
      .get(id) as CandidateRow;

    return rowToRecord(row, (result.changes ?? 0) > 0);
  }) as () => CorrectionCandidateRecord);

  if (!transaction) throw new Error("SQLite transactions are unavailable.");
  return transaction();
}

export function listActiveCorrectionCandidates(
  dbManager: DatabaseManager,
): CorrectionCandidateRecord[] {
  const rows = dbManager
    .getDb()
    .prepare(
      `
      SELECT *
      FROM correction_candidates
      WHERE status = 'active'
      ORDER BY created_at ASC, id ASC
    `,
    )
    .all() as CandidateRow[];

  return rows.map((row) => rowToRecord(row, false));
}

export function recordCorrectionGroupingSnapshot(
  dbManager: DatabaseManager,
  input: CorrectionGroupingSnapshotInput,
): CorrectionGroupingSnapshotRecord {
  const db = dbManager.getDb();
  const transaction = db.transaction?.((() => {
    for (const candidateId of input.candidateIds) {
      const row = db
        .prepare(
          "SELECT id FROM correction_candidates WHERE id = ? AND status = 'active'",
        )
        .get(candidateId);
      if (!row)
        throw new Error(`Correction candidate ${candidateId} is not active.`);
    }

    const result = db
      .prepare(
        `
      INSERT INTO correction_grouping_snapshots (version, candidate_ids_json, patterns_json, created_at)
      VALUES (?, ?, ?, ?)
    `,
      )
      .run(
        input.version,
        JSON.stringify(input.candidateIds),
        JSON.stringify(input.patterns),
        input.createdAt ?? new Date().toISOString(),
      ) as { lastInsertRowid: number | bigint };

    const row = db
      .prepare("SELECT * FROM correction_grouping_snapshots WHERE id = ?")
      .get(result.lastInsertRowid) as GroupingSnapshotRow;
    return groupingSnapshotRowToRecord(row);
  }) as () => CorrectionGroupingSnapshotRecord);

  if (!transaction) throw new Error("SQLite transactions are unavailable.");
  return transaction();
}

export function recordCorrectionProposal(
  dbManager: DatabaseManager,
  input: CorrectionProposalInput,
): CorrectionProposalRecord {
  const db = dbManager.getDb();
  const transaction = db.transaction?.((() => {
    for (const candidateId of input.candidateIds) {
      const row = db
        .prepare(
          "SELECT id FROM correction_candidates WHERE id = ? AND status = 'active'",
        )
        .get(candidateId);
      if (!row)
        throw new Error(`Correction candidate ${candidateId} is not active.`);
    }

    db.prepare(
      `
      INSERT INTO correction_proposals (
        id,
        pattern_id,
        grouping_snapshot_id,
        title,
        summary,
        candidate_ids_json,
        proof_kind,
        proof_reason,
        eval_json,
        intervention_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      input.id,
      input.patternId,
      input.groupingSnapshotId ?? null,
      input.title,
      input.summary,
      JSON.stringify(input.candidateIds),
      input.proofKind,
      input.proofReason,
      input.eval === undefined ? null : JSON.stringify(input.eval),
      input.intervention === undefined
        ? null
        : JSON.stringify(input.intervention),
      input.createdAt ?? new Date().toISOString(),
    );

    const row = db
      .prepare("SELECT * FROM correction_proposals WHERE id = ?")
      .get(input.id) as ProposalRow;
    return proposalRowToRecord(row);
  }) as () => CorrectionProposalRecord);

  if (!transaction) throw new Error("SQLite transactions are unavailable.");
  return transaction();
}

export function listOpenCorrectionProposals(
  dbManager: DatabaseManager,
): CorrectionProposalRecord[] {
  const rows = dbManager
    .getDb()
    .prepare(
      `
      SELECT *
      FROM correction_proposals
      WHERE status = 'proposed'
      ORDER BY created_at ASC, id ASC
    `,
    )
    .all() as ProposalRow[];
  return rows.map(proposalRowToRecord);
}

export function decideCorrectionProposal(
  dbManager: DatabaseManager,
  input: CorrectionDecisionInput,
): CorrectionDecisionRecord {
  const db = dbManager.getDb();
  const transaction = db.transaction?.((() => {
    const proposal = db
      .prepare("SELECT id FROM correction_proposals WHERE id = ?")
      .get(input.proposalId);
    if (!proposal)
      throw new Error(
        `Correction proposal ${input.proposalId} does not exist.`,
      );

    const existing = db
      .prepare(
        "SELECT decision FROM correction_decisions WHERE proposal_id = ?",
      )
      .get(input.proposalId) as { decision: string } | undefined;
    if (existing)
      throw new Error(
        `Correction proposal ${input.proposalId} already has a decision.`,
      );

    const result = db
      .prepare(
        `
      INSERT INTO correction_decisions (proposal_id, decision, decided_at, decided_by, note)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(
        input.proposalId,
        input.decision,
        input.decidedAt ?? new Date().toISOString(),
        input.decidedBy ?? "user",
        input.note ?? null,
      ) as { lastInsertRowid: number | bigint };

    db.prepare(
      "UPDATE correction_proposals SET status = 'decided' WHERE id = ?",
    ).run(input.proposalId);

    const row = db
      .prepare("SELECT * FROM correction_decisions WHERE id = ?")
      .get(result.lastInsertRowid) as DecisionRow;
    return decisionRowToRecord(row);
  }) as () => CorrectionDecisionRecord);

  if (!transaction) throw new Error("SQLite transactions are unavailable.");
  return transaction();
}

export function recordCorrectionProof(
  dbManager: DatabaseManager,
  input: CorrectionProofInput,
): CorrectionProofRecord {
  const db = dbManager.getDb();
  const transaction = db.transaction?.((() => {
    const decision = db
      .prepare(
        "SELECT decision FROM correction_decisions WHERE proposal_id = ?",
      )
      .get(input.proposalId) as { decision: CorrectionDecision } | undefined;
    if (!decision || decision.decision !== "accepted") {
      throw new Error(
        `Correction proposal ${input.proposalId} is not accepted.`,
      );
    }

    const existing = db
      .prepare("SELECT id FROM correction_proofs WHERE proposal_id = ?")
      .get(input.proposalId);
    if (existing)
      throw new Error(
        `Correction proposal ${input.proposalId} already has a proof outcome.`,
      );

    const result = db
      .prepare(
        `
      INSERT INTO correction_proofs (proposal_id, outcome, evidence, checked_at)
      VALUES (?, ?, ?, ?)
    `,
      )
      .run(
        input.proposalId,
        input.outcome,
        input.evidence.replace(/\s+/g, " ").trim(),
        input.checkedAt ?? new Date().toISOString(),
      ) as { lastInsertRowid: number | bigint };

    const row = db
      .prepare("SELECT * FROM correction_proofs WHERE id = ?")
      .get(result.lastInsertRowid) as ProofRow;
    return proofRowToRecord(row);
  }) as () => CorrectionProofRecord);

  if (!transaction) throw new Error("SQLite transactions are unavailable.");
  return transaction();
}

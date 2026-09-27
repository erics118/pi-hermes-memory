import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseManager } from "../../src/store/db.js";
import {
  decideCorrectionProposal,
  listActiveCorrectionCandidates,
  listOpenCorrectionProposals,
  recordCorrectionCandidate,
  recordCorrectionGroupingSnapshot,
  recordCorrectionProof,
  recordCorrectionProposal,
} from "../../src/store/correction-governance.js";

const createdAt = "2026-11-22T00:00:00.000Z";

describe("correction governance store", () => {
  let tmpDir = "";
  let dbManager: DatabaseManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "correction-governance-test-"),
    );
    dbManager = new DatabaseManager(tmpDir);
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function candidateInput() {
    return {
      project: "/repo",
      sessionId: "session-1",
      requestEntryId: "request-1",
      assistantEntryId: "assistant-1",
      correctionEntryId: "correction-1",
      category: "scope-control",
      agentDecision: "Edited an unrelated file.",
      userFeedback: "Do not touch unrelated files.",
      expectedBehavior: "Only edit files needed for the request.",
      strength: "strong" as const,
      createdAt,
    };
  }

  it("records one idempotent correction candidate per anchored evidence source", () => {
    const input = candidateInput();

    const first = recordCorrectionCandidate(dbManager, input);
    const second = recordCorrectionCandidate(dbManager, input);
    const active = listActiveCorrectionCandidates(dbManager);

    assert.equal(first.id, second.id);
    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);
    assert.equal(active.length, 1);
    assert.equal(active[0].sourceHash, first.sourceHash);
    assert.match(active[0].sourceHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(JSON.parse(active[0].evidenceJson), {
      project: "/repo",
      sessionId: "session-1",
      requestEntryId: "request-1",
      assistantEntryId: "assistant-1",
      correctionEntryId: "correction-1",
    });
  });

  it("stores grouping snapshots and lists only undecided proposals", () => {
    const candidate = recordCorrectionCandidate(dbManager, candidateInput());
    const snapshot = recordCorrectionGroupingSnapshot(dbManager, {
      version: "correction-grouping-v1",
      candidateIds: [candidate.id],
      patterns: [
        {
          id: "pattern-1",
          title: "Keep edits scoped",
          summary: "The agent edited unrelated files after a narrow request.",
          candidateIds: [candidate.id],
        },
      ],
      createdAt,
    });
    const firstProposal = recordCorrectionProposal(dbManager, {
      id: "proposal-1",
      patternId: "pattern-1",
      groupingSnapshotId: snapshot.id,
      title: "Keep edits scoped",
      summary: "The agent edited unrelated files after a narrow request.",
      candidateIds: [candidate.id],
      proofKind: "existing_test",
      proofReason: "The path-guard regression test covers unrelated writes.",
      createdAt,
    });
    recordCorrectionProposal(dbManager, {
      id: "proposal-2",
      patternId: "pattern-2",
      groupingSnapshotId: snapshot.id,
      title: "Keep comments minimal",
      summary: "The agent over-commented a trivial change.",
      candidateIds: [candidate.id],
      proofKind: "direct_observation",
      proofReason: "Review the changed file.",
      createdAt,
    });
    decideCorrectionProposal(dbManager, {
      proposalId: firstProposal.id,
      decision: "rejected",
      decidedAt: createdAt,
    });

    assert.equal(snapshot.id, 1);
    assert.deepEqual(snapshot.candidateIds, [candidate.id]);
    assert.deepEqual(
      listOpenCorrectionProposals(dbManager).map(({ id }) => id),
      ["proposal-2"],
    );
  });

  it("allows one explicit decision and records proof only after acceptance", () => {
    const candidate = recordCorrectionCandidate(dbManager, candidateInput());
    const proposal = recordCorrectionProposal(dbManager, {
      id: "proposal-1",
      patternId: "pattern-1",
      title: "Keep edits scoped",
      summary: "The agent edited unrelated files after a narrow request.",
      candidateIds: [candidate.id],
      proofKind: "existing_test",
      proofReason: "The path-guard regression test covers unrelated writes.",
      intervention: {
        action: "change",
        owner: "agents",
        scope: "global",
        exactChange: "Clarify not to touch unrelated files.",
      },
      createdAt,
    });

    assert.throws(() => {
      recordCorrectionProof(dbManager, {
        proposalId: proposal.id,
        outcome: "verified",
        evidence: "Proof cannot run before acceptance.",
        checkedAt: createdAt,
      });
    }, /not accepted/);

    const decision = decideCorrectionProposal(dbManager, {
      proposalId: proposal.id,
      decision: "accepted",
      decidedAt: createdAt,
    });

    assert.equal(decision.decision, "accepted");
    assert.throws(() => {
      decideCorrectionProposal(dbManager, {
        proposalId: proposal.id,
        decision: "rejected",
        decidedAt: createdAt,
      });
    }, /already has a decision/);

    const proof = recordCorrectionProof(dbManager, {
      proposalId: proposal.id,
      outcome: "verified",
      evidence: "Existing test passed.",
      checkedAt: createdAt,
    });

    assert.equal(proof.outcome, "verified");
    assert.throws(() => {
      recordCorrectionProof(dbManager, {
        proposalId: proposal.id,
        outcome: "rejected_by_proof",
        evidence: "Second proof must not overwrite the first.",
        checkedAt: createdAt,
      });
    }, /already has a proof outcome/);
  });
});

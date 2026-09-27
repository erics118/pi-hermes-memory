import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { DatabaseManager } from "../store/db.js";
import {
  decideCorrectionProposal,
  listActiveCorrectionCandidates,
  listOpenCorrectionProposals,
  recordCorrectionCandidate,
  recordCorrectionGroupingSnapshot,
  recordCorrectionProof,
  recordCorrectionProposal,
} from "../store/correction-governance.js";

const proofKinds = [
  "existing_test",
  "new_mechanical_eval",
  "new_live_eval",
  "direct_observation",
  "no_additional_proof",
] as const;

const decisions = [
  "accepted",
  "rejected",
  "deferred",
  "already_fixed",
  "duplicate",
] as const;

export function registerCorrectionsCommand(
  pi: Pick<ExtensionAPI, "registerTool" | "registerCommand">,
  dbManager: DatabaseManager,
): void {
  pi.registerTool({
    name: "correction_log",
    label: "Log Correction Candidate",
    description:
      "Record one anchored correction candidate as evidence, without changing durable instructions.",
    parameters: Type.Object({
      project: Type.Optional(Type.String({ minLength: 1 })),
      sessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
      source: Type.Object({
        requestEntryId: Type.Optional(
          Type.String({ minLength: 1, maxLength: 128 }),
        ),
        assistantEntryId: Type.Optional(
          Type.String({ minLength: 1, maxLength: 128 }),
        ),
        correctionEntryId: Type.Optional(
          Type.String({ minLength: 1, maxLength: 128 }),
        ),
      }),
      category: Type.String({ minLength: 1, maxLength: 80 }),
      agentDecision: Type.String({ minLength: 1, maxLength: 1200 }),
      userFeedback: Type.String({ minLength: 1, maxLength: 1200 }),
      expectedBehavior: Type.String({ minLength: 1, maxLength: 1200 }),
      strength: StringEnum(["weak", "strong"] as const),
      createdAt: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    }),
    async execute(_toolCallId, params, _signal, _update, ctx) {
      const candidate = recordCorrectionCandidate(dbManager, {
        project: params.project ?? ctx.cwd ?? "unknown",
        sessionId: params.sessionId,
        requestEntryId: params.source.requestEntryId,
        assistantEntryId: params.source.assistantEntryId,
        correctionEntryId: params.source.correctionEntryId,
        category: params.category,
        agentDecision: params.agentDecision,
        userFeedback: params.userFeedback,
        expectedBehavior: params.expectedBehavior,
        strength: params.strength,
        createdAt: params.createdAt,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Recorded correction candidate ${candidate.id}.`,
          },
        ],
        details: { id: candidate.id, inserted: candidate.inserted },
      };
    },
  });

  pi.registerTool({
    name: "correction_group",
    label: "Save Correction Grouping",
    description: "Save a grouping snapshot over active correction candidates.",
    parameters: Type.Object({
      version: Type.String({ minLength: 1, maxLength: 128 }),
      candidateIds: Type.Array(Type.String({ minLength: 1, maxLength: 128 })),
      patterns: Type.Array(Type.Any()),
      createdAt: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    }),
    async execute(_toolCallId, params) {
      const snapshot = recordCorrectionGroupingSnapshot(dbManager, {
        version: params.version,
        candidateIds: params.candidateIds,
        patterns: params.patterns,
        createdAt: params.createdAt,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Saved correction grouping snapshot ${snapshot.id}.`,
          },
        ],
        details: { id: snapshot.id, candidateIds: snapshot.candidateIds },
      };
    },
  });

  pi.registerTool({
    name: "correction_propose",
    label: "Save Correction Proposal",
    description: "Save an inspected proposal for explicit user decision.",
    parameters: Type.Object({
      id: Type.String({ minLength: 1, maxLength: 128 }),
      patternId: Type.String({ minLength: 1, maxLength: 128 }),
      groupingSnapshotId: Type.Optional(Type.Number()),
      title: Type.String({ minLength: 1, maxLength: 200 }),
      summary: Type.String({ minLength: 1, maxLength: 1200 }),
      candidateIds: Type.Array(Type.String({ minLength: 1, maxLength: 128 })),
      proof: Type.Object({
        kind: StringEnum(proofKinds),
        reason: Type.String({ minLength: 1, maxLength: 1200 }),
      }),
      eval: Type.Optional(Type.Any()),
      intervention: Type.Optional(Type.Any()),
      createdAt: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    }),
    async execute(_toolCallId, params) {
      const proposal = recordCorrectionProposal(dbManager, {
        id: params.id,
        patternId: params.patternId,
        groupingSnapshotId: params.groupingSnapshotId,
        title: params.title,
        summary: params.summary,
        candidateIds: params.candidateIds,
        proofKind: params.proof.kind,
        proofReason: params.proof.reason,
        eval: params.eval,
        intervention: params.intervention,
        createdAt: params.createdAt,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Saved correction proposal ${proposal.id}.`,
          },
        ],
        details: { id: proposal.id, patternId: proposal.patternId },
      };
    },
  });

  pi.registerTool({
    name: "correction_decide",
    label: "Decide Correction Proposal",
    description:
      "Record the user's explicit decision for a correction proposal.",
    parameters: Type.Object({
      proposalId: Type.String({ minLength: 1, maxLength: 128 }),
      decision: StringEnum(decisions),
      decidedAt: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
      note: Type.Optional(Type.String({ minLength: 1, maxLength: 1200 })),
    }),
    async execute(_toolCallId, params) {
      const decision = decideCorrectionProposal(dbManager, {
        proposalId: params.proposalId,
        decision: params.decision,
        decidedAt: params.decidedAt,
        note: params.note,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Recorded ${decision.decision} for ${decision.proposalId}.`,
          },
        ],
        details: {
          proposalId: decision.proposalId,
          decision: decision.decision,
        },
      };
    },
  });

  pi.registerTool({
    name: "correction_outcome",
    label: "Record Correction Proof Outcome",
    description:
      "Record whether an accepted correction proposal passed its proof.",
    parameters: Type.Object({
      proposalId: Type.String({ minLength: 1, maxLength: 128 }),
      outcome: StringEnum(["verified", "rejected_by_proof"] as const),
      evidence: Type.String({ minLength: 1, maxLength: 1200 }),
      checkedAt: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    }),
    async execute(_toolCallId, params) {
      const proof = recordCorrectionProof(dbManager, {
        proposalId: params.proposalId,
        outcome: params.outcome,
        evidence: params.evidence,
        checkedAt: params.checkedAt,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Recorded ${proof.outcome} for ${proof.proposalId}.`,
          },
        ],
        details: { proposalId: proof.proposalId, outcome: proof.outcome },
      };
    },
  });

  pi.registerCommand("corrections", {
    description: "Show correction governance status",
    handler: async (_args, ctx) => {
      const db = dbManager.getDb();
      const candidates = listActiveCorrectionCandidates(dbManager).length;
      const proposals = (
        db
          .prepare("SELECT COUNT(*) AS count FROM correction_proposals")
          .get() as { count: number }
      ).count;
      const openProposals = listOpenCorrectionProposals(dbManager).length;
      const decisions = (
        db
          .prepare("SELECT COUNT(*) AS count FROM correction_decisions")
          .get() as { count: number }
      ).count;
      const proofs = (
        db.prepare("SELECT COUNT(*) AS count FROM correction_proofs").get() as {
          count: number;
        }
      ).count;
      const candidateLabel = candidates === 1 ? "candidate" : "candidates";
      const proposalLabel = proposals === 1 ? "proposal" : "proposals";
      ctx.ui.notify(
        `${candidates} correction ${candidateLabel}; ${openProposals} open of ${proposals} ${proposalLabel}; ${decisions} decisions; ${proofs} proof outcomes.`,
        "info",
      );
    },
  });
}

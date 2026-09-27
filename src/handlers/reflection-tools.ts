import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { DatabaseManager } from "../store/db.js";
import {
  listReflectionCandidates,
  recordReflectionCandidate,
  recordReflectionRun,
  selectReflectionCandidate,
} from "../store/reflection-store.js";

const classifications = [
  "correction",
  "global_preference",
  "project_memory",
  "skill",
  "structural_change",
  "papercut",
  "rejected",
] as const;

const destinations = [
  "correction_review",
  "user_memory",
  "memory",
  "project_memory",
  "skill",
  "code_or_test",
  "none",
] as const;

export function registerReflectionTools(
  pi: Pick<ExtensionAPI, "registerTool" | "registerCommand">,
  dbManager: DatabaseManager,
): void {
  pi.registerTool({
    name: "reflection_record",
    label: "Record Reflection Candidates",
    description:
      "Record a bounded, redacted current-session reflection digest and proposal candidates without applying them.",
    parameters: Type.Object({
      sessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
      project: Type.Optional(Type.String({ minLength: 1 })),
      focus: Type.Optional(Type.String({ minLength: 1, maxLength: 1200 })),
      digest: Type.String({ minLength: 1, maxLength: 12000 }),
      candidates: Type.Array(
        Type.Object({
          classification: StringEnum(classifications),
          destination: StringEnum(destinations),
          summary: Type.String({ minLength: 1, maxLength: 1200 }),
          evidence: Type.String({ minLength: 1, maxLength: 1200 }),
          proposedAction: Type.String({ minLength: 1, maxLength: 1200 }),
        }),
      ),
      createdAt: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    }),
    async execute(_toolCallId, params, _signal, _update, ctx) {
      const run = recordReflectionRun(dbManager, {
        sessionId: params.sessionId,
        project: params.project ?? ctx.cwd,
        focus: params.focus,
        digest: params.digest,
        createdAt: params.createdAt,
      });
      const candidates = params.candidates.map((candidate) =>
        recordReflectionCandidate(dbManager, {
          runId: run.id,
          classification: candidate.classification,
          destination: candidate.destination,
          summary: candidate.summary,
          evidence: candidate.evidence,
          proposedAction: candidate.proposedAction,
          createdAt: params.createdAt,
        }),
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Recorded reflection run ${run.id} with ${candidates.length} candidates.`,
          },
        ],
        details: {
          runId: run.id,
          digestChars: run.digestChars,
          candidateIds: candidates.map((candidate) => candidate.id),
        },
      };
    },
  });

  pi.registerTool({
    name: "reflection_select",
    label: "Select Reflection Candidate",
    description:
      "Mark a reflection candidate as explicitly selected by the user before any durable memory, skill, or correction action.",
    parameters: Type.Object({
      candidateId: Type.Number(),
      selectedAt: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    }),
    async execute(_toolCallId, params) {
      const candidate = selectReflectionCandidate(dbManager, {
        candidateId: params.candidateId,
        selectedAt: params.selectedAt,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Selected reflection candidate ${candidate.id}.`,
          },
        ],
        details: { candidateId: candidate.id, status: candidate.status },
      };
    },
  });

  pi.registerCommand("reflections", {
    description: "Show reflection candidate status",
    handler: async (_args, ctx) => {
      const db = dbManager.getDb();
      const runs = (
        db.prepare("SELECT COUNT(*) AS count FROM reflection_runs").get() as {
          count: number;
        }
      ).count;
      const candidates = (
        db
          .prepare("SELECT COUNT(*) AS count FROM reflection_candidates")
          .get() as { count: number }
      ).count;
      const selected = (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM reflection_candidates WHERE status = 'selected'",
          )
          .get() as { count: number }
      ).count;
      const latestRun = (
        db
          .prepare(
            "SELECT id FROM reflection_runs ORDER BY created_at DESC, id DESC LIMIT 1",
          )
          .get() as { id: number } | undefined
      )?.id;
      const runLabel = runs === 1 ? "run" : "runs";
      const candidateLabel = candidates === 1 ? "candidate" : "candidates";
      const latestCandidates = latestRun
        ? listReflectionCandidates(dbManager, latestRun).length
        : 0;
      ctx.ui.notify(
        `${runs} reflection ${runLabel}; ${selected} selected of ${candidates} ${candidateLabel}; latest run has ${latestCandidates} candidates.`,
        "info",
      );
    },
  });
}

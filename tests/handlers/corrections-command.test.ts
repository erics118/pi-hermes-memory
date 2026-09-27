import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCorrectionsCommand } from "../../src/handlers/corrections-command.js";
import { DatabaseManager } from "../../src/store/db.js";

const at = "2026-11-22T00:00:00.000Z";

describe("registerCorrectionsCommand", () => {
  let tmpDir = "";
  let dbManager: DatabaseManager;
  let tools: Record<string, any>;
  let commands: Record<string, any>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "corrections-command-test-"),
    );
    dbManager = new DatabaseManager(tmpDir);
    tools = {};
    commands = {};
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function register() {
    registerCorrectionsCommand(
      {
        registerTool: (tool: any) => {
          tools[tool.name] = tool;
        },
        registerCommand: (name: string, options: any) => {
          commands[name] = options;
        },
      } as unknown as ExtensionAPI,
      dbManager,
    );
  }

  it("registers governance tools and the corrections command", () => {
    register();

    assert.deepEqual(Object.keys(tools).sort(), [
      "correction_decide",
      "correction_group",
      "correction_log",
      "correction_outcome",
      "correction_propose",
    ]);
    assert.ok(commands.corrections);
  });

  it("records a candidate, proposal, decision, proof, and summary", async () => {
    register();
    const notifications: Array<{ message: string; severity?: string }> = [];
    const ctx = {
      cwd: "/repo",
      ui: {
        notify: (message: string, severity?: string) => {
          notifications.push({ message, severity });
        },
      },
    } as any;

    const candidate = await tools.correction_log.execute(
      "tool-1",
      {
        project: "/repo",
        sessionId: "session-1",
        source: {
          requestEntryId: "request-1",
          assistantEntryId: "assistant-1",
          correctionEntryId: "correction-1",
        },
        category: "scope-control",
        agentDecision: "Edited an unrelated file.",
        userFeedback: "Do not touch unrelated files.",
        expectedBehavior: "Only edit files needed for the request.",
        strength: "strong",
        createdAt: at,
      },
      undefined,
      undefined,
      ctx,
    );

    const candidateId = candidate.details.id;
    assert.match(candidateId, /^candidate_/);

    const snapshot = await tools.correction_group.execute(
      "tool-2",
      {
        version: "correction-grouping-v1",
        candidateIds: [candidateId],
        patterns: [
          {
            id: "pattern-1",
            title: "Keep edits scoped",
            summary: "The agent edited unrelated files after a narrow request.",
            candidateIds: [candidateId],
          },
        ],
        createdAt: at,
      },
      undefined,
      undefined,
      ctx,
    );

    await tools.correction_propose.execute(
      "tool-3",
      {
        id: "proposal-1",
        patternId: "pattern-1",
        groupingSnapshotId: snapshot.details.id,
        title: "Keep edits scoped",
        summary: "The agent edited unrelated files after a narrow request.",
        candidateIds: [candidateId],
        proof: {
          kind: "existing_test",
          reason: "The path-guard regression test covers unrelated writes.",
        },
        intervention: {
          action: "change",
          owner: "agents",
          scope: "global",
          exactChange: "Clarify not to touch unrelated files.",
        },
        createdAt: at,
      },
      undefined,
      undefined,
      ctx,
    );

    await tools.correction_decide.execute(
      "tool-4",
      { proposalId: "proposal-1", decision: "accepted", decidedAt: at },
      undefined,
      undefined,
      ctx,
    );
    await tools.correction_outcome.execute(
      "tool-5",
      {
        proposalId: "proposal-1",
        outcome: "verified",
        evidence: "Existing test passed.",
        checkedAt: at,
      },
      undefined,
      undefined,
      ctx,
    );

    await commands.corrections.handler("", ctx);

    assert.ok(
      notifications.some(({ message }) =>
        message.includes("1 correction candidate"),
      ),
    );
    assert.ok(
      notifications.some(({ message }) => message.includes("1 proposal")),
    );
  });
});

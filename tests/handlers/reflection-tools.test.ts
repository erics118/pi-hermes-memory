import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerReflectionTools } from "../../src/handlers/reflection-tools.js";
import { DatabaseManager } from "../../src/store/db.js";

const at = "2026-11-22T00:00:00.000Z";

describe("registerReflectionTools", () => {
  let tmpDir = "";
  let dbManager: DatabaseManager;
  let tools: Record<string, any>;
  let commands: Record<string, any>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reflection-tools-test-"));
    dbManager = new DatabaseManager(tmpDir);
    tools = {};
    commands = {};
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function register() {
    registerReflectionTools(
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

  it("registers reflection tools and command", () => {
    register();

    assert.deepEqual(Object.keys(tools).sort(), [
      "reflection_record",
      "reflection_select",
    ]);
    assert.ok(commands.reflections);
  });

  it("records a bounded digest, proposed candidates, selection, and summary", async () => {
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

    const recorded = await tools.reflection_record.execute(
      "tool-1",
      {
        sessionId: "session-1",
        project: "/repo",
        focus: "scope control",
        digest: "User corrected the agent about unrelated file edits.",
        candidates: [
          {
            classification: "correction",
            destination: "correction_review",
            summary: "Do not edit unrelated files.",
            evidence: "User corrected the agent after unrelated edits.",
            proposedAction: "Open a correction review candidate.",
          },
        ],
        createdAt: at,
      },
      undefined,
      undefined,
      ctx,
    );

    assert.equal(recorded.details.candidateIds.length, 1);
    assert.equal(recorded.details.digestChars, 52);

    await tools.reflection_select.execute(
      "tool-2",
      { candidateId: recorded.details.candidateIds[0], selectedAt: at },
      undefined,
      undefined,
      ctx,
    );

    await commands.reflections.handler("", ctx);

    assert.ok(
      notifications.some(({ message }) =>
        message.includes("1 reflection run; 1 selected of 1 candidate"),
      ),
    );
  });
});

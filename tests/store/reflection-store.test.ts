import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseManager } from "../../src/store/db.js";
import {
  listReflectionCandidates,
  recordReflectionCandidate,
  recordReflectionRun,
  selectReflectionCandidate,
} from "../../src/store/reflection-store.js";

const createdAt = "2026-11-22T00:00:00.000Z";

describe("reflection store", () => {
  let tmpDir = "";
  let dbManager: DatabaseManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reflection-store-test-"));
    dbManager = new DatabaseManager(tmpDir);
  });

  afterEach(() => {
    dbManager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores a bounded redacted digest and requires explicit candidate selection", () => {
    const run = recordReflectionRun(dbManager, {
      sessionId: "session-1",
      project: "/repo",
      focus: "corrections",
      digest: "User corrected the agent about unrelated file edits.",
      createdAt,
    });
    const candidate = recordReflectionCandidate(dbManager, {
      runId: run.id,
      classification: "correction",
      destination: "correction_review",
      summary: "Do not edit unrelated files during narrow requests.",
      evidence: "User said not to touch unrelated files.",
      proposedAction: "Open a correction candidate for review.",
      createdAt,
    });

    assert.equal(run.digestChars, 52);
    assert.equal(candidate.status, "proposed");
    assert.deepEqual(
      listReflectionCandidates(dbManager, run.id).map(({ id }) => id),
      [candidate.id],
    );
    assert.equal(
      selectReflectionCandidate(dbManager, {
        candidateId: candidate.id,
        selectedAt: createdAt,
      }).status,
      "selected",
    );
  });

  it("rejects unbounded reflection digests", () => {
    assert.throws(() => {
      recordReflectionRun(dbManager, {
        sessionId: "session-1",
        project: "/repo",
        digest: "x".repeat(12001),
        createdAt,
      });
    }, /digest exceeds 12000 characters/);
  });
});

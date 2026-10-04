import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The real binary, not the *Main functions: the action word has to survive the
 * dispatcher. `suppress`, `pools` and `accounts` once received the arguments
 * with the action already dropped, so `blaster accounts list` printed usage.
 * Unit tests that call the *Main functions directly could not see that.
 */
const bin = join(__dirname, "..", "bin", "blaster.mjs");

function run(args: string[]) {
  const cwd = mkdtempSync(join(tmpdir(), "blaster-cli-"));
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", timeout: 60_000 });
}

describe("blaster dispatch passes the action through", () => {
  it("accounts reports the action it was given", () => {
    const result = run(["accounts", "bogus"]);
    expect(result.stderr).toContain('unknown action "bogus"');
  });

  it("accounts with a real action gets as far as needing a session", () => {
    const result = run(["accounts", "list"]);
    expect(result.stderr).not.toContain("unknown action");
    expect(result.stderr).toMatch(/no signed-in API|no live session/);
  });

  it("suppress and pools get as far as needing a session too", () => {
    for (const args of [["suppress", "list"], ["pools", "list"]]) {
      const result = run(args);
      expect(result.stderr, args.join(" ")).not.toContain("unknown action");
      expect(result.stderr, args.join(" ")).toMatch(/no signed-in API|no live session|Run "blaster login"/);
    }
  });
});

describe("the sequence and enrollments commands the lifecycle relies on", () => {
  it("sequence cancel and status reach their handlers (they asked for an id)", () => {
    for (const action of ["cancel", "status"]) {
      const result = run(["sequence", action]);
      expect(result.stderr, action).toContain("a sequence id is required");
    }
  });

  it("enrollments cancel, pause and resume reach their handlers", () => {
    for (const action of ["cancel", "pause", "resume"]) {
      const result = run(["enrollments", action]);
      expect(result.stderr, action).toContain("an enrollment id is required");
    }
  });
});

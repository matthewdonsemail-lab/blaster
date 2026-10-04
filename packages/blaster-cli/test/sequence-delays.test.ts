import { describe, expect, it } from "vitest";
import { parseDelayHours, parseStepsFlag } from "../src/cli/sequence.ts";

describe("parseDelayHours", () => {
  it("reads units, with a bare number as hours", () => {
    expect(parseDelayHours("30s")).toBeCloseTo(30 / 3600, 10);
    expect(parseDelayHours("5m")).toBeCloseTo(5 / 60, 10);
    expect(parseDelayHours("2h")).toBe(2);
    expect(parseDelayHours("1d")).toBe(24);
    expect(parseDelayHours("48")).toBe(48);
    expect(parseDelayHours(0.5)).toBe(0.5);
  });

  it("refuses a typo instead of treating it as zero", () => {
    for (const bad of ["", "abc", "-1", "30x", "1.2.3"]) expect(parseDelayHours(bad)).toBeNull();
    expect(parseDelayHours(-1)).toBeNull();
    expect(parseDelayHours(Number.NaN)).toBeNull();
  });
});

describe("parseStepsFlag", () => {
  it("builds steps with unit delays", () => {
    const result = parseStepsFlag('[{"text":"one"},{"text":"two","delay":"30s"},{"text":"three","delayHours":2}]');
    expect(result).toEqual({
      steps: [
        { text: "one", delayHours: 0, isStop: false },
        { text: "two", delayHours: 30 / 3600, isStop: false },
        { text: "three", delayHours: 2, isStop: false },
      ],
    });
  });

  it("allows a stop step with no text", () => {
    expect(parseStepsFlag('[{"text":"hi"},{"isStop":true}]')).toEqual({
      steps: [
        { text: "hi", delayHours: 0, isStop: false },
        { text: "", delayHours: 0, isStop: true },
      ],
    });
  });

  it("returns a message for bad input", () => {
    expect(parseStepsFlag("nope")).toEqual({ error: "--steps must be a JSON array" });
    expect(parseStepsFlag("[]")).toEqual({ error: "--steps must be a non-empty JSON array" });
    expect(parseStepsFlag('[{"delay":"1h"}]')).toEqual({ error: "step 1: text is required" });
    expect(parseStepsFlag('[{"text":"x","delay":"soon"}]')).toEqual({
      error: "step 1: delay must be like 30s, 5m, 2h, 1d or a number of hours",
    });
  });
});

import type { SequenceStepDraft } from "./builder.ts";

/**
 * A wait as an operator or agent writes it: `30s`, `5m`, `2h`, `1d`, or a bare
 * number of hours. Steps store hours, so a 30-second step is 30 / 3600 hours.
 * Returns null for anything else, so a typo is refused instead of becoming a zero
 * wait. Shared by the CLI and the MCP tool so they cannot disagree.
 */
export function parseDelayHours(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? input : null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([smhd]?)\s*$/i.exec(input);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] || "h").toLowerCase();
  const perHour = { s: 1 / 3600, m: 1 / 60, h: 1, d: 24 }[unit as "s" | "m" | "h" | "d"];
  return value * perHour;
}

/**
 * Steps from a list of `{ text, delay?, delayHours?, isStop? }`. `delay` takes the
 * units above; `delayHours` is a plain number. A problem is returned as a message,
 * never thrown, so the caller can report it.
 */
export function parseStepList(parsed: unknown): { steps: SequenceStepDraft[] } | { error: string } {
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: "steps must be a non-empty array" };
  const steps: SequenceStepDraft[] = [];
  for (const [index, item] of parsed.entries()) {
    const row = item as { text?: unknown; delay?: unknown; delayHours?: unknown; isStop?: unknown };
    const label = `step ${index + 1}`;
    if (!row || typeof row !== "object") return { error: `${label}: expected an object` };
    const isStop = row.isStop === true;
    if (!isStop && (typeof row.text !== "string" || row.text.trim() === "")) {
      return { error: `${label}: text is required` };
    }
    const rawDelay = row.delay ?? row.delayHours ?? 0;
    const delayHours = typeof rawDelay === "string" || typeof rawDelay === "number" ? parseDelayHours(rawDelay) : null;
    if (delayHours === null) return { error: `${label}: delay must be like 30s, 5m, 2h, 1d or a number of hours` };
    steps.push({ text: typeof row.text === "string" ? row.text : "", delayHours, isStop });
  }
  return { steps };
}

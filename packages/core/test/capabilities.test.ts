import { describe, expect, it } from "vitest";
import { CAPABILITY_REGISTRY, createBlasterApiClient } from "../src/index.ts";

describe("CAPABILITY_REGISTRY parity and contract tests", () => {
  it("defines unique IDs for every capability", () => {
    const ids = new Set<string>();
    for (const cap of CAPABILITY_REGISTRY) {
      expect(ids.has(cap.id), `Duplicate capability ID: ${cap.id}`).toBe(false);
      ids.add(cap.id);
    }
    expect(ids.size).toBeGreaterThanOrEqual(30);
  });

  it("follows standard naming conventions for identifiers", () => {
    const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;
    for (const cap of CAPABILITY_REGISTRY) {
      expect(cap.id).toMatch(/^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$/);
      expect(cap.resource).toMatch(/^[a-zA-Z0-9]+$/);
      expect(cap.operation, `Operation name ${cap.operation} should be camelCase`).toMatch(camelCaseRegex);
      expect(typeof cap.title).toBe("string");
      expect(cap.title.length).toBeGreaterThan(0);
      expect(typeof cap.description).toBe("string");
      expect(cap.description.length).toBeGreaterThan(0);
    }
  });

  it("validates HTTP mappings follow resource-oriented conventions", () => {
    for (const cap of CAPABILITY_REGISTRY) {
      if (cap.mappings.http) {
        const [method, path] = cap.mappings.http.split(" ");
        expect(["GET", "POST", "PUT", "PATCH", "DELETE"]).toContain(method);
        expect(path?.startsWith("/api/")).toBe(true);
      }
    }
  });

  it("validates MCP tool mappings follow blaster_<tool> naming", () => {
    for (const cap of CAPABILITY_REGISTRY) {
      if (cap.mappings.mcp) {
        expect(cap.mappings.mcp).toMatch(/^blaster_[a-z0-9_]+$/);
      }
    }
  });

  it("verifies every client mapping exists on BlasterApiClient", () => {
    const dummyClient = createBlasterApiClient({
      baseUrl: "http://localhost:4180",
      accessToken: "test-token",
    });

    for (const cap of CAPABILITY_REGISTRY) {
      if (cap.mappings.client) {
        const method = cap.mappings.client as keyof typeof dummyClient;
        expect(
          typeof dummyClient[method],
          `Capability ${cap.id} maps client method ${cap.mappings.client}, but it is not implemented on BlasterApiClient`,
        ).toBe("function");
      }
    }
  });

  it("ensures mutating flag matches HTTP method semantics", () => {
    for (const cap of CAPABILITY_REGISTRY) {
      if (cap.mappings.http) {
        const [method] = cap.mappings.http.split(" ");
        if (method === "GET") {
          expect(cap.mutating, `GET route for ${cap.id} should not be marked mutating`).toBe(false);
        } else if (method === "POST" || method === "PUT" || method === "DELETE") {
          // Note: validate/preview are POST routes that calculate without mutating
          if (cap.id.endsWith(".validate") || cap.id.endsWith(".preview") || cap.id.endsWith(".search")) {
            expect(cap.mutating).toBe(false);
          } else {
            expect(cap.mutating, `${method} route for ${cap.id} should be marked mutating`).toBe(true);
          }
        }
      }
    }
  });
});

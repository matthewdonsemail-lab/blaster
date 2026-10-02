/**
 * Capability registry types.
 *
 * Defines the contract for cross-surface capability parity and explicit
 * mappings across Convex, Hono HTTP, shared client, CLI, and MCP.
 */

export type SurfaceKind = "convex" | "http" | "client" | "cli" | "mcp";

export interface CapabilitySurfaceMappings {
  /** Convex function address, e.g. 'api.pool.queries.listPools'. */
  convex?: string;
  /** HTTP route, e.g. 'GET /api/pools'. */
  http?: string;
  /** Core BlasterApiClient method name, e.g. 'listPools'. */
  client?: string;
  /** CLI command or invocation, e.g. 'blaster pools list'. */
  cli?: string;
  /** MCP tool name, e.g. 'blaster_list_pools'. */
  mcp?: string;
}

export interface CapabilityDefinition {
  /** Stable identifier, e.g. 'pools.list'. */
  id: string;
  /** Domain resource name, e.g. 'pools', 'sequences', 'conversations'. */
  resource: string;
  /** Canonical operation name in camelCase, e.g. 'listPools'. */
  operation: string;
  /** Human-readable title. */
  title: string;
  /** Canonical domain meaning and behavior. */
  description: string;
  /** Whether the operation mutates state. */
  mutating: boolean;
  /** Surfaced intended by design. Omission means deliberately not exposed. */
  intendedSurfaces: readonly SurfaceKind[];
  /** Explicit implementation mappings across surfaces. */
  mappings: CapabilitySurfaceMappings;
}

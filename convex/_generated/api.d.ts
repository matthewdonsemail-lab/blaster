/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `node scripts/convex-codegen.mjs`.
 * @module
 */

import type * as blaster_mutations from "../blaster/mutations.js";
import type * as blaster_queries from "../blaster/queries.js";
import type * as conversations_model from "../conversations/model.js";
import type * as conversations_mutations from "../conversations/mutations.js";
import type * as conversations_queries from "../conversations/queries.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as http_blaster from "../http/blaster.js";
import type * as http_conversations from "../http/conversations.js";
import type * as http_pool from "../http/pool.js";
import type * as http_sequence from "../http/sequence.js";
import type * as http_suppressions from "../http/suppressions.js";
import type * as phoneNumbers_actions from "../phoneNumbers/actions.js";
import type * as phoneNumbers_compliance from "../phoneNumbers/compliance.js";
import type * as phoneNumbers_model from "../phoneNumbers/model.js";
import type * as phoneNumbers_mutations from "../phoneNumbers/mutations.js";
import type * as phoneNumbers_queries from "../phoneNumbers/queries.js";
import type * as pool_helpers from "../pool/helpers.js";
import type * as pool_index from "../pool/index.js";
import type * as pool_model from "../pool/model.js";
import type * as pool_mutations from "../pool/mutations.js";
import type * as pool_queries from "../pool/queries.js";
import type * as pool_types from "../pool/types.js";
import type * as pool_utils from "../pool/utils.js";
import type * as rateLimit from "../rateLimit.js";
import type * as schema from "../schema.js";
import type * as schema_conversations from "../schema/conversations.js";
import type * as schema_discovery from "../schema/discovery.js";
import type * as schema_messaging from "../schema/messaging.js";
import type * as schema_phone from "../schema/phone.js";
import type * as schema_pool from "../schema/pool.js";
import type * as schema_sequences from "../schema/sequences.js";
import type * as schema_suppressions from "../schema/suppressions.js";
import type * as sequence_actions from "../sequence/actions.js";
import type * as sequence_drafts from "../sequence/drafts.js";
import type * as sequence_enrollment from "../sequence/enrollment.js";
import type * as sequence_helpers from "../sequence/helpers.js";
import type * as sequence_index from "../sequence/index.js";
import type * as sequence_model from "../sequence/model.js";
import type * as sequence_mutations from "../sequence/mutations.js";
import type * as sequence_queries from "../sequence/queries.js";
import type * as sequence_report from "../sequence/report.js";
import type * as sequence_types from "../sequence/types.js";
import type * as sequence_utils from "../sequence/utils.js";
import type * as suppressions_index from "../suppressions/index.js";
import type * as suppressions_model from "../suppressions/model.js";
import type * as suppressions_mutations from "../suppressions/mutations.js";
import type * as suppressions_types from "../suppressions/types.js";
import type * as telnyxAccounts_model from "../telnyxAccounts/model.js";
import type * as telnyxAccounts_mutations from "../telnyxAccounts/mutations.js";
import type * as telnyxAccounts_queries from "../telnyxAccounts/queries.js";
import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "blaster/mutations": typeof blaster_mutations;
  "blaster/queries": typeof blaster_queries;
  "conversations/model": typeof conversations_model;
  "conversations/mutations": typeof conversations_mutations;
  "conversations/queries": typeof conversations_queries;
  "crons": typeof crons;
  "http": typeof http;
  "http/blaster": typeof http_blaster;
  "http/conversations": typeof http_conversations;
  "http/pool": typeof http_pool;
  "http/sequence": typeof http_sequence;
  "http/suppressions": typeof http_suppressions;
  "phoneNumbers/actions": typeof phoneNumbers_actions;
  "phoneNumbers/compliance": typeof phoneNumbers_compliance;
  "phoneNumbers/model": typeof phoneNumbers_model;
  "phoneNumbers/mutations": typeof phoneNumbers_mutations;
  "phoneNumbers/queries": typeof phoneNumbers_queries;
  "pool/helpers": typeof pool_helpers;
  "pool/index": typeof pool_index;
  "pool/model": typeof pool_model;
  "pool/mutations": typeof pool_mutations;
  "pool/queries": typeof pool_queries;
  "pool/types": typeof pool_types;
  "pool/utils": typeof pool_utils;
  "rateLimit": typeof rateLimit;
  "schema": typeof schema;
  "schema/conversations": typeof schema_conversations;
  "schema/discovery": typeof schema_discovery;
  "schema/messaging": typeof schema_messaging;
  "schema/phone": typeof schema_phone;
  "schema/pool": typeof schema_pool;
  "schema/sequences": typeof schema_sequences;
  "schema/suppressions": typeof schema_suppressions;
  "sequence/actions": typeof sequence_actions;
  "sequence/drafts": typeof sequence_drafts;
  "sequence/enrollment": typeof sequence_enrollment;
  "sequence/helpers": typeof sequence_helpers;
  "sequence/index": typeof sequence_index;
  "sequence/model": typeof sequence_model;
  "sequence/mutations": typeof sequence_mutations;
  "sequence/queries": typeof sequence_queries;
  "sequence/report": typeof sequence_report;
  "sequence/types": typeof sequence_types;
  "sequence/utils": typeof sequence_utils;
  "suppressions/index": typeof suppressions_index;
  "suppressions/model": typeof suppressions_model;
  "suppressions/mutations": typeof suppressions_mutations;
  "suppressions/types": typeof suppressions_types;
  "telnyxAccounts/model": typeof telnyxAccounts_model;
  "telnyxAccounts/mutations": typeof telnyxAccounts_mutations;
  "telnyxAccounts/queries": typeof telnyxAccounts_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};

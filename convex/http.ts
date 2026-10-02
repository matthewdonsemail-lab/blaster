import { httpRouter } from "convex/server";
import { registerBlasterRoutes } from "./http/blaster.js";
import { registerPoolRoutes } from "./http/pool.js";
import { registerSequenceRoutes } from "./http/sequence.js";
import { registerSuppressionRoutes } from "./http/suppressions.js";
import { registerConversationRoutes } from "./http/conversations.js";

/**
 * Blaster's read-only HTTP routes.
 *
 * This file registers route groups and handles nothing itself; each domain's
 * routes live in http/<domain>.ts. See docs/convex-naming-conventions.md
 * (rule R7).
 */
const http = httpRouter();

registerBlasterRoutes(http);
registerPoolRoutes(http);
registerSequenceRoutes(http);
registerSuppressionRoutes(http);
registerConversationRoutes(http);

export default http;

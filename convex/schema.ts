import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  numbers: defineTable({
    value: v.number(),
  }),

  mcp_sessions: defineTable({
    sessionId: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  }).index("by_session_id", ["sessionId"]),

  mcp_messages: defineTable({
    sessionId: v.string(),
    message: v.any(), // JSON-RPC message can be any valid JSON
    createdAt: v.number(),
    processed: v.boolean(),
  }).index("by_session", ["sessionId", "processed"]),
});

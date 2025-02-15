import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const now = Date.now();
    await ctx.db.insert("mcp_sessions", {
      sessionId,
      createdAt: now,
      lastSeenAt: now,
    });
  },
});

export const insertMessage = mutation({
  args: { sessionId: v.string(), message: v.any() },
  handler: async (ctx, { sessionId, message }) => {
    // Verify session exists
    const session = await ctx.db
      .query("mcp_sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Insert message
    await ctx.db.insert("mcp_messages", {
      sessionId,
      message,
      createdAt: Date.now(),
      processed: false,
    });
  },
});

export const getUnprocessedMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("mcp_messages")
      .withIndex("by_session", (q) =>
        q.eq("sessionId", sessionId).eq("processed", false),
      )
      .collect();
  },
});

export const markMessagesProcessed = mutation({
  args: { messageIds: v.array(v.id("mcp_messages")) },
  handler: async (ctx, { messageIds }) => {
    for (const id of messageIds) {
      await ctx.db.patch(id, { processed: true });
    }
  },
});

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import * as mcp from "./mcp";
import { ConvexTransport, createServer } from "../mcp/server.js";

const http = httpRouter();

// Echo endpoint (keeping our existing endpoint)
http.route({
  path: "/echo",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/plain",
      },
    });
  }),
});

// SSE endpoint for MCP server
http.route({
  path: "/sse",
  method: "GET",
  handler: httpAction(async (ctx, request) => {

    const server = createServer();
    const transport = new ConvexTransport(ctx, request);
    console.log("Created transport with sessionId:", transport.sessionId);
    await server.connect(transport);

    // Return the SSE response
    return transport.getResponse();
  }),
});

// Messages endpoint for MCP server
http.route({
  path: "/messages",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const body = await request.text();

    console.log("POST /messages request:", {
      url: url.toString(),
      params: Object.fromEntries(url.searchParams.entries()),
      body,
    });

    if (!sessionId) {
      return new Response("Missing sessionId parameter", { status: 400 });
    }

    try {
      const message = JSON.parse(body);
      await ctx.runMutation(api.mcp.insertMessage, {
        sessionId,
        message,
      });
      return new Response(null, { status: 202 });
    } catch (error) {
      console.error("Error handling message:", error);
      return new Response(
        error instanceof Error ? error.message : "Unknown error",
        { status: 500 },
      );
    }
  }),
});

export default http;

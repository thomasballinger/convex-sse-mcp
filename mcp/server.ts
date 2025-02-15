import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ActionCtx } from "../convex/_generated/server";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

// Helper function to generate UUID using Web Crypto API
function generateUUID() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  array[6] = (array[6] & 0x0f) | 0x40; // Version 4
  array[8] = (array[8] & 0x3f) | 0x80; // Variant 1

  const hex = Array.from(array, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createServer() {
  const server = new McpServer({
    name: "convex-mcp",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
  });

  // A simple resource that returns static data
  server.resource(
    "config",
    "https://majestic-marlin-672.convex.site/config/app",
    {
      description: "Application configuration",
      contentType: "text/plain",
    },
    async (uri: { href: string }) => ({
      contents: [
        {
          uri: uri.href,
          text: "App configuration here",
        },
      ],
    }),
  );

  // A tool that calculates BMI
  server.tool(
    "calculate-bmi",
    {
      weightKg: z.number(),
      heightM: z.number(),
    },
    async (args: { weightKg: number; heightM: number }) => ({
      content: [
        {
          type: "text",
          text: String(args.weightKg / (args.heightM * args.heightM)),
        },
      ],
    }),
  );

  // A prompt template for code review
  server.prompt(
    "review-code",
    {
      code: z.string(),
    },
    (args: { code: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please review this code:\n\n${args.code}`,
          },
        },
      ],
    }),
  );

  return server;
}

// Custom transport for Convex HTTP endpoints
export class ConvexTransport implements Transport {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private stream: ReadableStream<Uint8Array>;
  private _sessionId: string;
  private ctx: ActionCtx;
  private request: Request;
  isConnected = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(ctx: ActionCtx, request: Request) {
    this.ctx = ctx;
    this.request = request;
    this._sessionId = generateUUID();
    this.stream = new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.isConnected = false;
        this.onclose?.();
      },
    });
  }

  async start(): Promise<void> {
    if (this.isConnected) {
      throw new Error(
        "ConvexTransport already started! If using Server class, note that connect() calls start() automatically.",
      );
    }
    await this.ctx.runMutation(api.mcp.createSession, {
      sessionId: this._sessionId,
    });

    // Send the initial endpoint event
    const endpoint = "/messages";
    this.controller?.enqueue(
      this.encoder.encode(
        `event: endpoint\ndata: ${encodeURI(endpoint)}?sessionId=${this._sessionId}\n\n`,
      ),
    );

    this.isConnected = true;

    const pollMessages = async () => {
      console.log("Starting message polling for session:", this.sessionId);
      while (this.isConnected) {
        const messages = await this.ctx.runQuery(
          api.mcp.getUnprocessedMessages,
          {
            sessionId: this.sessionId,
          },
        );

        if (messages.length > 0) {
          const messageIds = messages.map(
            (m: { _id: Id<"mcp_messages"> }) => m._id,
          );
          for (const message of messages) {
            console.log("forwarding message to server:", message.message);
            this.onmessage?.(message.message);
          }
          await this.ctx.runMutation(api.mcp.markMessagesProcessed, {
            messageIds,
          });
        }

        // Wait 1 second before next poll
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log("Polling stopped for session:", this.sessionId);
      this.close();
    };

    // Start polling in the background
    pollMessages().catch((error) => {
      console.error("Error polling messages:", error);
      this.onerror?.(error);
    });
  }

  async close(): Promise<void> {
    this.controller?.close();
    this.isConnected = false;
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error("Not connected");
    }

    this.controller?.enqueue(
      this.encoder.encode(
        `event: message\ndata: ${JSON.stringify(message)}\n\n`,
      ),
    );
  }

  getResponse() {
    return new Response(this.stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Session-Id": this._sessionId,
      },
    });
  }

  async handleMessage(message: unknown): Promise<void> {
    try {
      // In a real implementation, we'd validate this is a proper JSON-RPC message
      const parsedMessage = message as JSONRPCMessage;
      this.onmessage?.(parsedMessage);
    } catch (error) {
      this.onerror?.(error as Error);
      throw error;
    }
  }

  get sessionId(): string {
    return this._sessionId;
  }
}

// Helper to create and connect a server with transport
export async function createServerWithTransport(
  ctx: ActionCtx,
  request: Request,
) {
  const transport = new ConvexTransport(ctx, request);
  const server = createServer();
  await server.connect(transport);
  return transport;
}

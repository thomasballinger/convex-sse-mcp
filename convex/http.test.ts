import { expect, test } from "vitest";
import * as dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const CONVEX_URL = process.env.CONVEX_SITE_URL;

if (!CONVEX_URL) {
  throw new Error(
    "Missing CONVEX_URL environment variable. Please add it to .env.local",
  );
}

test("echo endpoint returns the request body", async () => {
  const testMessage = "Hello, Convex!";
  const response = await fetch(`${CONVEX_URL}/echo`, {
    method: "POST",
    body: testMessage,
  });

  // Log headers using forEach
  const headerList: string[] = [];
  response.headers.forEach((value, key) => {
    headerList.push(`${key}: ${value}`);
  });
  console.log("Response headers:", headerList);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/plain");

  const responseText = await response.text();
  expect(responseText).toBe(testMessage);
});

test(
  "MCP client can connect and interact with server",
  { timeout: 10000 },
  async () => {
    console.log("Starting MCP client test");

    // Create a client with SSE transport pointing to our endpoints
    const sseUrl = new URL("/sse", CONVEX_URL);
    console.log("Connecting to SSE endpoint:", sseUrl.toString());

    const transport = new SSEClientTransport(sseUrl);
    const client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      },
    );

    // Connect to the server
    await client.connect(transport);
    console.log("Client connected");

    try {
      // List resources
      const resources = await client.listResources();
      console.log("Available resources:", resources);

      // Try to read our config resource
      const config = await client.readResource({
        uri: "https://majestic-marlin-672.convex.site/config/app",
      });
      console.log("Config resource:", config);

      // Try out the BMI calculator tool
      const bmiResult = await client.callTool({
        name: "calculate-bmi",
        arguments: {
          weightKg: 70,
          heightM: 1.75,
        },
      });
      console.log("BMI calculation result:", bmiResult);

      // Clean up
      await client.close();
    } catch (error) {
      await client.close();
      throw error;
    }
  },
);

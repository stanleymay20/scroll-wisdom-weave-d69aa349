import {
  adminOriginGuard,
  withAdminOriginAllowList,
} from "./admin-cors.ts";

const ALLOWED = ["https://scrolllibrary.org", "https://admin.example.com/"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("allowed admin preflight reflects the exact origin and never wildcard", () => {
  const req = new Request("https://edge.example/admin", {
    method: "OPTIONS",
    headers: { Origin: "https://admin.example.com" },
  });
  const response = adminOriginGuard(req, ALLOWED);
  assert(response, "expected preflight response");
  assert(response.status === 204, `expected 204, got ${response.status}`);
  assert(response.headers.get("Access-Control-Allow-Origin") === "https://admin.example.com", "exact origin not reflected");
  assert(response.headers.get("Access-Control-Allow-Origin") !== "*", "wildcard origin leaked");
  assert(response.headers.get("Vary")?.includes("Origin"), "Vary: Origin missing");
});

Deno.test("disallowed admin preflight is rejected without CORS grant", async () => {
  const req = new Request("https://edge.example/admin", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example" },
  });
  const response = adminOriginGuard(req, ALLOWED);
  assert(response, "expected rejection");
  assert(response.status === 403, `expected 403, got ${response.status}`);
  assert(response.headers.get("Access-Control-Allow-Origin") === null, "disallowed origin was granted");
  const body = await response.json();
  assert(body.code === "origin_forbidden", "wrong rejection code");
});

Deno.test("disallowed admin POST is rejected before endpoint side effects", () => {
  const req = new Request("https://edge.example/admin", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
  });
  const response = adminOriginGuard(req, ALLOWED);
  assert(response, "expected rejection");
  assert(response.status === 403, `expected 403, got ${response.status}`);
});

Deno.test("allowed admin response replaces inherited wildcard with exact origin", async () => {
  const req = new Request("https://edge.example/admin", {
    method: "POST",
    headers: { Origin: "https://admin.example.com/" },
  });
  const original = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
  const response = withAdminOriginAllowList(req, original, ALLOWED);
  assert(response.headers.get("Access-Control-Allow-Origin") === "https://admin.example.com", "allowed origin not reflected");
  assert(response.headers.get("Access-Control-Allow-Origin") !== "*", "wildcard origin leaked");
  assert((await response.json()).ok === true, "response body changed");
});

Deno.test("disallowed admin response strips inherited wildcard", () => {
  const req = new Request("https://edge.example/admin", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
  });
  const original = new Response("nope", {
    status: 403,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
  const response = withAdminOriginAllowList(req, original, ALLOWED);
  assert(response.headers.get("Access-Control-Allow-Origin") === null, "disallowed origin survived response wrapping");
});

Deno.test("server-to-server admin requests without Origin remain callable without CORS grant", () => {
  const req = new Request("https://edge.example/admin", { method: "POST" });
  assert(adminOriginGuard(req, ALLOWED) === null, "server-to-server request was blocked");
  const response = withAdminOriginAllowList(req, new Response("ok"), ALLOWED);
  assert(response.headers.get("Access-Control-Allow-Origin") === null, "server-to-server response received browser CORS grant");
});

import { describe, it, expect } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";

import {
  sanitizeTelemetryUrl,
  scrubBreadcrumb,
  scrubEvent,
  stripQueryAndFragment,
} from "@/lib/errorTracking";

// The scrubbers are the whole privacy contract of this module: once Sentry has
// an event it is out of our hands. Assert the guarantee rather than trust it.

describe("sanitizeTelemetryUrl", () => {
  it("drops the query string and fragment from an absolute URL", () => {
    expect(sanitizeTelemetryUrl("https://app.test/reader/42?token=secret#p3"))
      .toBe("https://app.test/reader/42");
  });

  it("resolves a relative value against the origin and still drops the query", () => {
    // new URL(value, base) succeeds for almost any string, so this is the path
    // a relative request URL actually takes; the catch below it is defensive.
    expect(sanitizeTelemetryUrl("/api/books?access_token=secret"))
      .toBe(`${window.location.origin}/api/books`);
  });
});

describe("stripQueryAndFragment", () => {
  it("keeps a relative path relative", () => {
    expect(stripQueryAndFragment("/reader/42?token=secret")).toBe("/reader/42");
    expect(stripQueryAndFragment("/reader/42#chapter-3")).toBe("/reader/42");
  });

  it("leaves a clean path untouched", () => {
    expect(stripQueryAndFragment("/library")).toBe("/library");
  });
});

describe("scrubEvent", () => {
  it("removes user identity, cookies and the request body", () => {
    const event = {
      user: { id: "user-1", email: "buyer@example.test" },
      request: {
        url: "https://app.test/checkout?session=cs_live_123",
        cookies: { sb_auth: "token" },
        data: { card: "4242424242424242" },
        headers: { Authorization: "Bearer secret", "X-Api-Key": "k", "User-Agent": "ua" },
      },
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request?.url).toBe("https://app.test/checkout");
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.headers).toEqual({ "User-Agent": "ua" });

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain("buyer@example.test");
    expect(serialized).not.toContain("cs_live_123");
    expect(serialized).not.toContain("4242424242424242");
    expect(serialized).not.toContain("Bearer secret");
  });

  it("tolerates an event with no request", () => {
    const event = { message: "boom" } as unknown as ErrorEvent;
    expect(() => scrubEvent(event)).not.toThrow();
  });
});

describe("scrubBreadcrumb", () => {
  it("strips the query from a fetch breadcrumb URL", () => {
    const crumb = {
      category: "fetch",
      data: { url: "https://app.test/api/books?access_token=secret", status_code: 500 },
    } as Breadcrumb;

    expect(scrubBreadcrumb(crumb).data?.url).toBe("https://app.test/api/books");
    expect(scrubBreadcrumb(crumb).data?.status_code).toBe(500);
  });

  it("strips the query from navigation from/to, which beforeSend never sees", () => {
    // Sentry builds history breadcrumbs as `path + search + hash`, so a route
    // carrying a reset token or an email would otherwise be shipped verbatim.
    const crumb = {
      category: "navigation",
      data: {
        from: "/login?email=buyer%40example.test",
        to: "/reset-password?token=rt_live_abc#step2",
      },
    } as Breadcrumb;

    const scrubbed = scrubBreadcrumb(crumb);

    expect(scrubbed.data?.from).toBe("/login");
    expect(scrubbed.data?.to).toBe("/reset-password");

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain("buyer");
    expect(serialized).not.toContain("rt_live_abc");
    expect(serialized).not.toContain("step2");
  });

  it("keeps navigation paths relative rather than rewriting them absolute", () => {
    const crumb = { category: "navigation", data: { to: "/library?q=x" } } as Breadcrumb;
    expect(scrubBreadcrumb(crumb).data?.to).toBe("/library");
  });

  it("tolerates a breadcrumb with no data", () => {
    const crumb = { category: "console", message: "hi" } as Breadcrumb;
    expect(() => scrubBreadcrumb(crumb)).not.toThrow();
  });
});

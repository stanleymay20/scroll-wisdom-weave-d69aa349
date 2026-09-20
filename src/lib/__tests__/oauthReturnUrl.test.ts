// Pins the open-redirect contract for OAuth return URLs.
// A failure here means a third-party site could weaponise our Connect flow
// to phish through scrolllibrary.org.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { safeReturnUrl } from "../../../supabase/functions/_shared/oauth-return-url";

const ORIGINAL_ENV: Record<string, string | undefined> = {
  APP_PUBLIC_URL: undefined,
  ALLOWED_RETURN_ORIGINS: undefined,
};

type TestDeno = {
  env: {
    _inner: Record<string, string>;
    get: (key: string) => string | undefined;
  };
};

type TestGlobal = typeof globalThis & { Deno?: TestDeno };
const testGlobal = globalThis as TestGlobal;

function setEnv(values: Partial<Record<string, string | undefined>>) {
  const deno = testGlobal.Deno;
  if (!deno) throw new Error("Deno test shim is not initialized");
  for (const [k, v] of Object.entries(values)) {
    if (v == null) delete deno.env._inner[k];
    else deno.env._inner[k] = v;
  }
}

// Shim Deno.env so the helper can read APP_PUBLIC_URL under vitest.
beforeEach(() => {
  const store: Record<string, string> = {};
  testGlobal.Deno = {
    env: {
      _inner: store,
      get(k: string) { return store[k]; },
    },
  };
  // Default app origin used across all tests.
  store["APP_PUBLIC_URL"] = "https://scrolllibrary.org";
});

afterEach(() => {
  delete testGlobal.Deno;
});

describe("safeReturnUrl — accepts same-origin", () => {
  it("accepts the canonical app URL", () => {
    expect(safeReturnUrl("https://scrolllibrary.org/account/intelligence"))
      .toBe("https://scrolllibrary.org/account/intelligence");
  });

  it("accepts paths under the canonical origin with query params", () => {
    expect(safeReturnUrl("https://scrolllibrary.org/book/abc?step=2"))
      .toContain("scrolllibrary.org");
  });

  it("accepts a site-relative path", () => {
    expect(safeReturnUrl("/account/intelligence")).toBe("/account/intelligence");
    expect(safeReturnUrl("/book/abc/publish?tab=connect")).toBe("/book/abc/publish?tab=connect");
  });

  it("accepts an additional origin when ALLOWED_RETURN_ORIGINS is configured", () => {
    setEnv({ ALLOWED_RETURN_ORIGINS: "https://preview.scrolllibrary.org,https://staging.scrolllibrary.org" });
    expect(safeReturnUrl("https://preview.scrolllibrary.org/x")).toContain("preview.scrolllibrary.org");
    expect(safeReturnUrl("https://staging.scrolllibrary.org/x")).toContain("staging.scrolllibrary.org");
  });
});

describe("safeReturnUrl — rejects open-redirect primitives", () => {
  it("rejects a different origin", () => {
    expect(safeReturnUrl("https://evil.com/")).toBeNull();
    expect(safeReturnUrl("https://scrolllibrary.org.evil.com/")).toBeNull();
  });

  it("rejects scheme-relative URLs (would resolve to attacker host in a browser)", () => {
    expect(safeReturnUrl("//evil.com/x")).toBeNull();
  });

  it("rejects javascript:/data:/file: schemes", () => {
    expect(safeReturnUrl("javascript:alert(1)")).toBeNull();
    expect(safeReturnUrl("data:text/html,<script>x</script>")).toBeNull();
    expect(safeReturnUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects malformed strings", () => {
    expect(safeReturnUrl("not a url")).toBeNull();
    expect(safeReturnUrl("")).toBeNull();
    expect(safeReturnUrl(null)).toBeNull();
    expect(safeReturnUrl(undefined)).toBeNull();
    expect(safeReturnUrl(42)).toBeNull();
  });

  it("rejects URLs over the max length", () => {
    const huge = "https://scrolllibrary.org/" + "a".repeat(600);
    expect(safeReturnUrl(huge)).toBeNull();
  });

  it("rejects when no allow-list is configured at all", () => {
    setEnv({ ...ORIGINAL_ENV });
    expect(safeReturnUrl("https://scrolllibrary.org/x")).toBeNull();
    // Relative paths still work because they're definitionally same-origin.
    expect(safeReturnUrl("/account")).toBe("/account");
  });
});

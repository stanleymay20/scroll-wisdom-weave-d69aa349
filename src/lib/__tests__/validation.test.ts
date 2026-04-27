import { describe, it, expect } from "vitest";
import {
  sanitizeString,
  sanitizeUrl,
  emailSchema,
  passwordSchema,
  VALIDATION_LIMITS,
} from "@/lib/validation";

describe("validation", () => {
  describe("sanitizeString", () => {
    it("trims whitespace and encodes HTML entities", () => {
      expect(sanitizeString("  <script>alert('x')</script>  ")).toBe(
        "&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;",
      );
    });

    it("strips null bytes", () => {
      expect(sanitizeString("hello\0world")).toBe("helloworld");
    });

    it("returns empty string for non-string input", () => {
      // @ts-expect-error testing runtime safety
      expect(sanitizeString(null)).toBe("");
      // @ts-expect-error testing runtime safety
      expect(sanitizeString(undefined)).toBe("");
    });

    it("encodes ampersands first to avoid double-encoding", () => {
      expect(sanitizeString("Tom & Jerry")).toBe("Tom &amp; Jerry");
    });
  });

  describe("sanitizeUrl", () => {
    it("accepts https URLs", () => {
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com/");
    });

    it("accepts http URLs", () => {
      expect(sanitizeUrl("http://example.com/path")).toBe("http://example.com/path");
    });

    it("rejects javascript: protocol", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    });

    it("rejects data: URIs", () => {
      expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    });

    it("rejects malformed input", () => {
      expect(sanitizeUrl("not a url")).toBeNull();
      expect(sanitizeUrl("")).toBeNull();
    });
  });

  describe("emailSchema", () => {
    it("accepts a valid email and lowercases it", () => {
      const result = emailSchema.parse("Foo@Example.COM");
      expect(result).toBe("foo@example.com");
    });

    it("rejects empty string", () => {
      expect(() => emailSchema.parse("")).toThrow();
    });

    it("rejects invalid format", () => {
      expect(() => emailSchema.parse("not-an-email")).toThrow();
    });

    it("rejects emails over the length limit", () => {
      const huge = "a".repeat(VALIDATION_LIMITS.EMAIL_MAX) + "@x.com";
      expect(() => emailSchema.parse(huge)).toThrow();
    });
  });

  describe("passwordSchema", () => {
    it("accepts a 6+ character password", () => {
      expect(passwordSchema.parse("hunter2")).toBe("hunter2");
    });

    it("rejects a 5-character password", () => {
      expect(() => passwordSchema.parse("short")).toThrow();
    });

    it("rejects a 129+ character password", () => {
      expect(() => passwordSchema.parse("x".repeat(129))).toThrow();
    });
  });
});

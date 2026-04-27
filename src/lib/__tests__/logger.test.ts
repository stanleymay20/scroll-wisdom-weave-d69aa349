import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger, setTraceId, getTraceId, configureLogger } from "@/lib/logger";

describe("logger", () => {
  beforeEach(() => {
    configureLogger({ minLevel: "debug", enableConsole: true });
  });

  describe("createLogger", () => {
    it("emits a log entry at the given level", () => {
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      const log = createLogger("Test");
      log.info("hello", { foo: "bar" });
      expect(spy).toHaveBeenCalledOnce();
      const [output] = spy.mock.calls[0] as [string];
      expect(output).toMatch(/\[INFO\]/);
      expect(output).toMatch(/\[Test\]/);
      expect(output).toMatch(/hello/);
      spy.mockRestore();
    });

    it("respects minLevel filtering", () => {
      configureLogger({ minLevel: "warn" });
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const log = createLogger("Test");
      log.debug("filtered out");
      expect(debugSpy).not.toHaveBeenCalled();
      debugSpy.mockRestore();
    });

    it("masks sensitive fields in data payloads", () => {
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      const log = createLogger("Test");
      log.info("auth", { password: "secret123", username: "alice" });
      const [, data] = spy.mock.calls[0] as [string, Record<string, unknown>];
      expect(data.password).toBe("[REDACTED]");
      expect(data.username).toBe("alice");
      spy.mockRestore();
    });

    it("masks nested sensitive fields", () => {
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      const log = createLogger("Test");
      log.info("nested", { user: { token: "abc", name: "alice" } });
      const [, data] = spy.mock.calls[0] as [string, { user: { token: string; name: string } }];
      expect(data.user.token).toBe("[REDACTED]");
      expect(data.user.name).toBe("alice");
      spy.mockRestore();
    });

    it("truncates long string values", () => {
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      const log = createLogger("Test");
      const huge = "x".repeat(500);
      log.info("big", { blob: huge });
      const [, data] = spy.mock.calls[0] as [string, { blob: string }];
      expect(data.blob.length).toBeLessThan(huge.length);
      expect(data.blob).toMatch(/\[truncated\]$/);
      spy.mockRestore();
    });
  });

  describe("trace IDs", () => {
    it("generates a fresh trace ID when called with no argument", () => {
      const before = getTraceId();
      const next = setTraceId();
      expect(next).not.toBe(before);
      expect(getTraceId()).toBe(next);
    });

    it("uses the provided id when one is given", () => {
      const id = setTraceId("custom-trace-id");
      expect(id).toBe("custom-trace-id");
      expect(getTraceId()).toBe("custom-trace-id");
    });
  });

  describe("timing helpers", () => {
    it("times a successful async operation", async () => {
      const log = createLogger("Test");
      const result = await log.time("op", async () => 42);
      expect(result).toBe(42);
    });

    it("re-throws and logs when the async operation fails", async () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const log = createLogger("Test");
      await expect(log.time("op", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("times a sync operation and re-throws on failure", () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const log = createLogger("Test");
      expect(log.timeSync("ok", () => 7)).toBe(7);
      expect(() => log.timeSync("fail", () => { throw new Error("x"); })).toThrow("x");
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});

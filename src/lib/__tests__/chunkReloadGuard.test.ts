import { describe, it, expect, vi, beforeEach } from "vitest";
import { installChunkReloadGuard } from "@/lib/chunkReloadGuard";

describe("chunkReloadGuard", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("triggers a reload on a recognized chunk error", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    installChunkReloadGuard();

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Failed to fetch dynamically imported module: /assets/foo.js",
      }),
    );

    expect(reload).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("sl_chunk_reload_attempted")).toBe("1");
  });

  it("does not reload twice (loop guard)", () => {
    sessionStorage.setItem("sl_chunk_reload_attempted", "1");
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    installChunkReloadGuard();

    window.dispatchEvent(
      new ErrorEvent("error", { message: "Loading chunk 42 failed" }),
    );

    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores unrelated errors", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    installChunkReloadGuard();

    window.dispatchEvent(
      new ErrorEvent("error", { message: "TypeError: x is undefined" }),
    );

    expect(reload).not.toHaveBeenCalled();
  });

  it("triggers reload on unhandled rejection with chunk error", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    installChunkReloadGuard();

    const reason = new Error("Importing a module script failed");
    window.dispatchEvent(
      new (class extends Event {
        reason = reason;
        constructor() { super("unhandledrejection"); }
      })(),
    );

    expect(reload).toHaveBeenCalledOnce();
  });
});

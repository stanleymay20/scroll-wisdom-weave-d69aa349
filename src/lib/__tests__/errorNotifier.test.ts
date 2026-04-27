import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sonner BEFORE importing the module under test
vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from "sonner";
import { notifyError, notifySuccess, withErrorNotification } from "@/lib/errorNotifier";

describe("errorNotifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("classification", () => {
    it("classifies 401 / unauthorized as auth error", () => {
      notifyError(new Error("401 unauthorized"));
      expect(toast.error).toHaveBeenCalledWith(
        "Authentication Error",
        expect.objectContaining({
          description: expect.stringContaining("session has expired"),
        }),
      );
    });

    it("classifies rate limit as warning", () => {
      notifyError(new Error("429 rate limit exceeded"));
      expect(toast.warning).toHaveBeenCalledWith(
        "Connection Issue",
        expect.objectContaining({
          description: expect.stringContaining("Too many requests"),
        }),
      );
    });

    it("classifies 500 as a server error", () => {
      notifyError(new Error("500 internal server error"));
      expect(toast.error).toHaveBeenCalledWith(
        "Connection Issue",
        expect.objectContaining({
          description: expect.stringContaining("our end"),
        }),
      );
    });

    it("classifies network/offline failures", () => {
      notifyError(new Error("Failed to fetch"));
      expect(toast.warning).toHaveBeenCalledWith(
        "Connection Issue",
        expect.objectContaining({ description: expect.stringContaining("Network") }),
      );
    });

    it("classifies timeout errors", () => {
      notifyError(new Error("Request timed out"));
      expect(toast.warning).toHaveBeenCalledWith(
        "Connection Issue",
        expect.objectContaining({ description: expect.stringContaining("timed out") }),
      );
    });

    it("falls back to unknown for unrecognized errors", () => {
      notifyError(new Error("something weird happened"));
      expect(toast.error).toHaveBeenCalledWith(
        "Something Went Wrong",
        expect.any(Object),
      );
    });

    it("respects silent option (no toast)", () => {
      notifyError(new Error("401"), { silent: true });
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it("uses custom title and description overrides", () => {
      notifyError(new Error("boom"), { title: "Custom Title", description: "Custom desc" });
      expect(toast.error).toHaveBeenCalledWith(
        "Custom Title",
        expect.objectContaining({ description: "Custom desc" }),
      );
    });

    it("attaches retry action when provided", () => {
      const retry = vi.fn();
      notifyError(new Error("500"), { retry });
      const call = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].action).toEqual({ label: "Retry", onClick: retry });
    });
  });

  describe("notifySuccess", () => {
    it("forwards to toast.success", () => {
      notifySuccess("Saved", "Profile updated");
      expect(toast.success).toHaveBeenCalledWith("Saved", expect.objectContaining({
        description: "Profile updated",
      }));
    });
  });

  describe("withErrorNotification", () => {
    it("returns the result on success", async () => {
      const result = await withErrorNotification(async () => "ok");
      expect(result).toBe("ok");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("notifies and returns null on failure", async () => {
      const result = await withErrorNotification(async () => {
        throw new Error("500 server error");
      });
      expect(result).toBeNull();
      expect(toast.error).toHaveBeenCalled();
    });

    it("emits success message when provided", async () => {
      await withErrorNotification(async () => 1, { successMessage: "Done!" });
      expect(toast.success).toHaveBeenCalledWith("Done!", expect.any(Object));
    });
  });
});

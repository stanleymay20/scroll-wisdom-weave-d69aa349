import { describe, expect, it } from "vitest";
import { verifyReleaseIdentity } from "../../../scripts/verify-release-identity.mjs";

const SHA = "2159c602b871e8a1c7afb4f2029a7900a464da4b";
const FINGERPRINT = "sha256:138c27b1af4038094b4e55662dc32e5eb466f34ae81a7d259b0ecdc0ab21fab6";
const expected = {
  releaseSha: SHA,
  sourceFingerprint: FINGERPRINT,
  sourceFingerprintFiles: 1177,
};

const base = {
  schemaVersion: 1,
  commit: SHA,
  commitSource: "RELEASE_COMMIT_SHA",
  buildTime: "2026-10-04T14:41:39.493Z",
  sourceFingerprint: FINGERPRINT,
  sourceFingerprintFiles: 1177,
};

describe("verifyReleaseIdentity", () => {
  it("accepts an exact commit and fingerprint match", () => {
    expect(verifyReleaseIdentity(base, expected)).toEqual({
      ok: true,
      errors: [],
      provenance: "commit + fingerprint",
    });
  });

  it("accepts hosted builds that omit Git metadata only when the deterministic source identity matches", () => {
    expect(
      verifyReleaseIdentity(
        { ...base, commit: null, commitSource: "unavailable" },
        expected,
      ),
    ).toEqual({ ok: true, errors: [], provenance: "source fingerprint" });
  });

  it("rejects a missing commit when the manifest claims another commit source", () => {
    const result = verifyReleaseIdentity(
      { ...base, commit: null, commitSource: "git" },
      expected,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("commitSource=unavailable");
  });

  it("rejects the wrong commit even when the source fingerprint matches", () => {
    const result = verifyReleaseIdentity(
      { ...base, commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      expected,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("different commit");
  });

  it("rejects source fingerprint or file-count drift", () => {
    const fingerprint = verifyReleaseIdentity(
      { ...base, sourceFingerprint: "sha256:wrong" },
      expected,
    );
    expect(fingerprint.ok).toBe(false);
    expect(fingerprint.errors.join(" ")).toContain("fingerprint mismatch");

    const count = verifyReleaseIdentity(
      { ...base, sourceFingerprintFiles: 1178 },
      expected,
    );
    expect(count.ok).toBe(false);
    expect(count.errors.join(" ")).toContain("file count mismatch");
  });

  it("rejects an invalid build timestamp", () => {
    const result = verifyReleaseIdentity({ ...base, buildTime: "not-a-date" }, expected);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("valid buildTime");
  });
});

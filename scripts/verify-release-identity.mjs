import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Verify that a hosted production release was built from the intended source.
 *
 * Hosted builders may intentionally omit Git metadata. In that case we accept
 * commit=null only when the builder explicitly reports commitSource=unavailable
 * and the deterministic production-source fingerprint + file count match the
 * intended release exactly. A present commit must always equal releaseSha.
 */
export function verifyReleaseIdentity(live, expected) {
  const errors = [];

  if (!live || typeof live !== "object" || Array.isArray(live)) {
    return { ok: false, errors: ["Production release identity is not a JSON object."], provenance: null };
  }

  if (live.sourceFingerprint !== expected.sourceFingerprint) {
    errors.push(
      `Production source fingerprint mismatch. expected=${expected.sourceFingerprint} actual=${live.sourceFingerprint ?? "missing"}`,
    );
  }

  if (Number(live.sourceFingerprintFiles) !== Number(expected.sourceFingerprintFiles)) {
    errors.push(
      `Production source fingerprint file count mismatch. expected=${expected.sourceFingerprintFiles} actual=${live.sourceFingerprintFiles ?? "missing"}`,
    );
  }

  if (live.commit == null) {
    if (live.commitSource !== "unavailable") {
      errors.push(
        `Production omitted commit but commitSource is ${live.commitSource ?? "missing"}; null commit is accepted only when commitSource=unavailable.`,
      );
    }
  } else if (live.commit !== expected.releaseSha) {
    errors.push(`Production names a different commit. expected=${expected.releaseSha} actual=${live.commit}`);
  }

  if (!live.buildTime || Number.isNaN(Date.parse(live.buildTime))) {
    errors.push("Production release.json has no valid buildTime.");
  }

  return {
    ok: errors.length === 0,
    errors,
    provenance: live.commit ? "commit + fingerprint" : "source fingerprint",
  };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function main() {
  const file = process.argv[2] ?? "live-release.json";
  const live = JSON.parse(readFileSync(file, "utf8"));
  const expected = {
    releaseSha: requiredEnv("RELEASE_SHA"),
    sourceFingerprint: requiredEnv("EXPECTED_FINGERPRINT"),
    sourceFingerprintFiles: Number(requiredEnv("EXPECTED_FILE_COUNT")),
  };

  const result = verifyReleaseIdentity(live, expected);
  if (!result.ok) {
    for (const error of result.errors) console.error(`::error::${error}`);
    process.exit(1);
  }

  console.log(`Production source matches release ${expected.releaseSha} via ${result.provenance}.`);
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) main();

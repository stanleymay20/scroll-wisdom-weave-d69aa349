export type SourceFingerprint = {
  algorithm: "sha256";
  version: 1;
  value: string;
  files: number;
};

export const PRODUCTION_SOURCE_ENTRIES: string[];

export function computeSourceFingerprint(
  root?: string,
  entries?: string[],
): SourceFingerprint;

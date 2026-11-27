export function assertNativeAppId(appId: string): void;
export function resolveNativeBetaEnvironment(env: Record<string, string | undefined>, webProjectId: string | undefined): { projectId: string; url: string; key: string };
export function nativeAssetDigest(assets: Array<[string, Uint8Array]>): string;
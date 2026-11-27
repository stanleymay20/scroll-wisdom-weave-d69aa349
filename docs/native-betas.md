# ScrollLibrary native betas — preparation, not a release

## Current inspection and blockers

- Inspected source HEAD: `5b0d5a07659f2a1dc058f3e943c8b8284ccb6cfb`; clean before this request. GitHub main parity was not independently verified; no production release is authorized.
- No `android/` or `ios/` native targets, store metadata, signing files, or confirmed store ID existed in this checkout.
- Existing identity remains `app.lovable.8a3582c02c2b49a9957f5eb218b15058`. Its final segment starts with a digit; Capacitor rejects it for Android/Java. Both `bunx cap add android` and `bunx cap add ios` returned exit 1 before generating a target. Owner confirmation of a valid identity is required; this preparation deliberately does not invent or silently replace it.
- No Java/JDK, Android SDK, Gradle, or Xcode is installed in this Linux sandbox. No debug APK, simulator `.app`, device IPA, TestFlight build or store submission was produced.
- The available Cloud identity does not prove an independently isolated Test deployment. No native build may fall back to the normal web backend. Supply a verified, distinct Test endpoint/project and its public publishable key before building.
- Local target generation, native sync, compilation and real native sign-in remain blocked. Workflow has been added, not dispatched or proven successful.

## Preparation delivered

- Capacitor core, Android, iOS and CLI pinned to **8.6.3**; CLI development-only; Bun lock regenerated.
- `capacitor.config.ts` uses **local packaged assets**, no preview `server.url`, `cleartext: false`, and `allowMixedContent: false`.
- Separate `vite.native.config.ts` reuses the existing web configuration but writes **`dist-native.local/`**. Ordinary `dist/`, web release commands, auth client, backend, commercial flags and web hosting are unchanged.
- Native builds require an explicit isolated Test environment, refuse the normal web project, and reject private/service-role keys. Test-only asset hashes and identity are checked before sync.
- Manual **Native betas (manual, Test only)** workflow creates fresh targets only when absent, builds debug Android and unsigned iOS simulator artifacts, and exports source SHA plus SHA-256 evidence. It never publishes, deploys a backend, signs a release, or submits to stores. Existing owner targets are not replaced.
- Capacitor's iOS SPM range is changed to the installed **exact** version after sync; unexpected package shape/version fails closed. Android template uses Gradle **8.14.3**, AGP **8.13.0**, API **36**, minimum Android API **24**. iOS minimum is **15**.
- `.local` output directories are already ignored by the managed repository rules. Do not commit generated assets, local SDK paths, build caches or signing material. Platform templates include their own ignore rules when generated.

## Owner prerequisites

1. Confirm a valid native identity, checking any existing Apple/Google store listing first. Changing this identity requires a separate approved source change because preservation was requested.
2. Configure the GitHub environment **`native-beta-test`** with approval protection, these two variables and one protected secret (none are created by this request):
   - `MOBILE_TEST_PROJECT_ID`: independently verified Test project identity.
   - `MOBILE_TEST_BACKEND_URL`: matching HTTPS Test endpoint.
   - `MOBILE_TEST_PUBLISHABLE_KEY`: Test **public/anon** key only, never a private/service-role key.
3. Verify the Test backend accepts the native origins (`capacitor://localhost` on iOS, `https://localhost` on Android) for the required functions. Existing server contracts are unchanged. Do not loosen production CORS or auth redirects.
4. Local tools: Node **22+**, Bun **1.2.23**, JDK **21**, Android SDK API **36** / build tools **36.0.0**; for Apple, a Mac with **Xcode 26** and an installed iOS simulator runtime. CI uses Ubuntu 24.04 and macOS 26; runner/tool availability is an external prerequisite.

## Exact local commands (after blockers are resolved)

Set the three Test values privately in your shell, and `MOBILE_TEST_BACKEND_CONFIRMED=true`; do not paste credentials into chat or commit `.env` files.

```sh
bun install --frozen-lockfile
bun run test -- src/lib/__tests__/nativeBetaConfig.test.ts src/lib/__tests__/nativeBuildConfig.test.ts src/lib/__tests__/supabaseBuildConfig.test.ts
bun run native:preflight
bun run native:build
bun scripts/native-targets.ts android
bun scripts/verify-native-assets.mjs
bunx --no-install cap sync android
```

From `android/`:

```sh
./gradlew --no-daemon clean assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

On a Mac, from the project root:

```sh
bun scripts/native-targets.ts ios
bun scripts/verify-native-assets.mjs
bunx --no-install cap sync ios
bun scripts/pin-native-ios.mjs
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath native-artifacts.local/ios \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO clean build
xcrun simctl install booted native-artifacts.local/ios/Build/Products/Debug-iphonesimulator/App.app
```

For both targets already generated: `bun run native:sync` verifies assets, syncs, and automatically re-pins Apple SPM before Xcode compilation. After any native-capability change, first update your local checkout from the connected repository, then run `bun run native:build` and `npx cap sync` (and the Apple pin command when using plain `npx cap sync`).

## Manual artifact workflow

After reviewing/merging the source, open GitHub Actions → **Native betas (manual, Test only)** → **Run workflow**, select the reviewed source, and check the Test-only confirmation. Each job checks out the exact dispatch SHA. Unmet identity/configuration requirements intentionally fail preflight without producing artifacts.

- Android artifact: `scrolllibrary-android-debug-<SHA>` contains a debug-signed APK (standard disposable debug key, not a release key). Install with `adb install -r scrolllibrary-debug.apk` or enable installation from the trusted downloaded artifact on a test Android phone.
- Apple artifact: `scrolllibrary-ios-simulator-<SHA>` contains an unsigned simulator app ZIP. Unzip and install in a booted simulator with `xcrun simctl install booted App.app`. It **cannot install on an iPhone**; a physical-device beta requires owner-managed Apple signing and is outside this unsigned preparation.
- These are clean builds with pinned direct tool/platform versions, not a claim of byte-identical APKs (ephemeral debug signing and build timestamps differ). No caches or dependency updates are used by the workflow.

## Auth and functional acceptance still required

Email/password uses the existing client and device-local session storage. No second client or RLS bypass was added. A real Test account must exercise login, cold restart/session restore, refresh, logout and protected routes before distributing betas.

Current signup, magic link and password recovery derive return URLs from `window.location.origin`. That becomes a native local origin; no deep-link receiver, universal/app links, or Test auth return allowlist was found/configured. Those email-return journeys are **not qualified**, and must not be presented as working native flows. Do not alter Live settings to make beta links work.

Microphone/native voice permissions, purchase redirects, exported-file downloads, keyboard/safe-area behavior, and Reader playback also need device acceptance; no native plugin capability or payment readiness is claimed. The existing plugin configuration names are not installed plugins.

Read the [Lovable blog](https://lovable.dev/blog) guidance on Capacitor/native mobile development before device distribution; signing and store submission are separate owner-controlled steps.

## Verification results

| Command / check | Actual result |
| --- | --- |
| `bun add --exact @capacitor/core@8.6.3 @capacitor/android@8.6.3 @capacitor/ios@8.6.3` then `bun add --dev --exact @capacitor/cli@8.6.3` | Exit 0; matching packages installed; lock regenerated with sandbox Bun 1.4.4. |
| `/tmp/native-beta-tools/bun-linux-x64/bun --version` | `1.2.23`, downloaded pinned official Bun release for compatibility verification. |
| `/tmp/native-beta-tools/bun-linux-x64/bun install --frozen-lockfile`, working directory `/tmp/native-beta-clean-install` containing only `package.json` and `bun.lock` | Exit 0; **1001 packages installed**, no project `.env`, no lock modification. Proves clean installation in this sandbox with project-pinned Bun; GitHub runner execution is still unverified. |
| `bun run test -- src/lib/__tests__/nativeBetaConfig.test.ts src/lib/__tests__/nativeBuildConfig.test.ts src/lib/__tests__/supabaseBuildConfig.test.ts` | Exit 0; **14 tests passed / 3 files**. Includes real Vite configuration resolution in an isolated Node subprocess, not a web/native compilation or backend request. |
| `bunx --no-install eslint capacitor.config.ts vite.native.config.ts scripts/native-preflight.ts scripts/native-targets.ts scripts/native-beta-config.mjs scripts/pin-native-ios.mjs scripts/verify-native-assets.mjs src/lib/__tests__/nativeBetaConfig.test.ts` and later lint including `src/lib/__tests__/nativeBuildConfig.test.ts` | Exit 0; no diagnostics. Existing ESLint configuration enforces TS rules; no full-project lint claim. |
| `nix shell nixpkgs#actionlint -c actionlint .github/workflows/native-beta.yml` | Exit 0; workflow syntax, expression and shell checks passed. |
| `git diff --check` | Exit 0. |
| Automatic preview web build | Latest observed build entry **2026-11-27T01:18:51Z: build OK**; no Publish. Normal web build scripts/config are unchanged. No manual full build/typecheck was executed. |
| `bunx cap add android` / `bunx cap add ios` | Each exit 1: invalid existing app ID, before target generation. |
| `bun run native:preflight` | Exit 1, expected fail-closed: invalid existing app ID. |
| `bun run native:sync` | Exit 1, expected fail-closed: explicit isolated Test backend confirmation missing; `cap sync` never executed. |
| `bun run native:build`, Gradle APK build, `xcodebuild` simulator build, real native login | **Not executed / blocked**, not passed. No packaged beta assets or installable artifacts exist. |

Changed source: `package.json`, `bun.lock`, `capacitor.config.ts`, `vite.native.config.ts`, `.github/workflows/native-beta.yml`, `scripts/native-beta-config.mjs`, its `.d.mts` declaration, `scripts/native-preflight.ts`, `scripts/native-targets.ts`, `scripts/verify-native-assets.mjs`, `scripts/pin-native-ios.mjs`, the two native test files, `AGENTS.md`, `roadmap.md`, and this report.

No Live backend requests that mutate state, settings changes, secret writes, database migrations, function deployment, production source switch, Publish, store submission or release signing occurred. No background workflow was launched. Generated native outputs are **blocked**, not promised to finish after this turn.
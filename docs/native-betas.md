# ScrollLibrary native betas — current preview status

## Identity and actual outputs

- Owner-approved **`org.scrolllibrary.beta`** is a reversible beta-only identifier; no store registration or production identity decision was made.
- Both **`android/`** and **`ios/`** targets were generated with Capacitor **8.6.3**. Android application ID/namespace and both iOS build configurations use the beta identifier.
- `bun run native:fixture && bun run native:targets && bun run native:sync:fixture` completed successfully (exit 0). Both copied bundles were checked. The iOS SPM package is pinned to exact **8.6.3** after sync; plist parses with no insecure ATS overrides.
- Actual Android output: **`android/app/build/outputs/apk/debug/app-debug.apk`**, **4,121,065 bytes**. It contains only **OFFLINE COMPILE FIXTURE — NOT DISTRIBUTABLE**, not the ScrollLibrary application. No backend, credentials, sign-in, books, payments or app functionality are included. Fixture CSP denies all network connections.
- APK ZIP integrity and packaged beta ID, fixture marker, secure transport and asset hashes were verified; `apksigner verify` passed. SHA-256: `d85fa5dfd3488ba9ce1746b8a414b3093768e39fd1a34e85eb209709f36dd402`.
- No iOS simulator binary was built: this environment is Linux without Xcode. Both native targets are present, but iOS compilation requires a Mac/Xcode runner.

## Existing Test configuration checked

Checked the shell variable presence, `.env` and native-specific environment-file locations, project secret-name inventory, and linked Cloud identity. Existing **web** endpoint/key configuration is present and matches the normal committed web project; native-specific Test settings were not found in these accessible locations. This does **not** establish that no Test backend exists externally, nor prove that the shared web endpoint is isolated Test. GitHub environment values are not inspectable here.

A real native app build still requires an independently verified Test endpoint/project, its public publishable key, and explicit `MOBILE_TEST_BACKEND_CONFIRMED=true`. No web/Live fallback, backend configuration change or secret write was used.

## Verification commands and results

- Fresh folder containing only current `package.json` and `bun.lock`: `/tmp/native-beta-tools/bun-linux-x64/bun install --cwd /tmp/native-beta-followup-install --frozen-lockfile` — **exit 0**, Bun **1.2.23**, **1001 packages** installed without loading project `.env`.
- `bun run test -- src/lib/__tests__/nativeBetaConfig.test.ts src/lib/__tests__/nativeBuildConfig.test.ts src/lib/__tests__/supabaseBuildConfig.test.ts` — **15 tests passed / 3 files**.
- Changed-file ESLint and `actionlint .github/workflows/native-beta.yml` — **exit 0**.
- Temporary tooling installed using `nix shell nixpkgs#jdk21` plus Android command-line tools, API **36**, build tools **36.0.0**. No system/production configuration changed. Gradle wrapper **8.14.3**, AGP **8.13.0**, JDK **21**.
- From `android/`, with `ANDROID_HOME=/tmp/native-beta-android/sdk`, `ANDROID_SDK_ROOT` matching and `GRADLE_USER_HOME=/tmp/native-beta-android/gradle`: `nix shell nixpkgs#jdk21 -c ./gradlew --no-daemon clean assembleDebug --console=plain` — **BUILD SUCCESSFUL**, 57 seconds, **98 tasks**, actual fixture APK produced.
- Same environment: `./gradlew --no-daemon testDebugUnitTest compileDebugAndroidTestJavaWithJavac --console=plain` — **BUILD SUCCESSFUL**, 12 seconds. **One native unit test passed**; device instrumentation test **compiled only**, not executed. Template tests were corrected to the approved beta identity.
- Default real-Test `bun run native:sync` remains fail-closed without verified Test settings; fixture sync is opt-in and the real-Test path rejects fixture identities.
- No emulator/device startup, real native sign-in, iOS compilation, hosted workflow execution or distributable beta qualification is claimed.

## Repeat offline compilation

```sh
bun install --frozen-lockfile
bun run native:fixture
bun run native:targets
bun run native:sync:fixture
```

Then from `android/`, with your Android SDK and JDK 21 configured:

```sh
./gradlew --no-daemon clean testDebugUnitTest assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

This installs a **packaging fixture**, not an app beta. It must not be sent to beta users as ScrollLibrary.

## External prerequisites and manual builds

The existing manual workflow **Native betas (manual, Test or offline fixture)** now has separate `offline-compile-fixture` (default) and `test-app` modes; artifact filenames and metadata distinguish them. It was validated, **not dispatched**. Offline iOS compilation needs GitHub Actions environment approval/access to its **macOS 26 / Xcode 26** runner, or a local Mac with Xcode 26 and simulator runtime. Apple simulator artifacts are unsigned and cannot be installed on an iPhone.

For a real Test app, configure the protected `native-beta-test` environment with `MOBILE_TEST_PROJECT_ID`, `MOBILE_TEST_BACKEND_URL`, and `MOBILE_TEST_PUBLISHABLE_KEY` (public/anon only). Verify native-origin access, email-return/deep-link handling and real-account login/restore/logout before distribution. Device voice, downloads, Reader playback and payment return paths remain unqualified. Physical iPhone installation requires separate owner-managed Apple signing; no signing credentials or store submission were used.

After future native capability changes, first update your local checkout from the connected repository, then rebuild native web assets and run `npx cap sync`; follow with `bun scripts/pin-native-ios.mjs` for plain sync, or use `bun run native:sync` for automatic pinning.

Normal web build/release configuration and Live backend/settings/flags remain unchanged; no Publish, deployment, store registration or release signing occurred. Read the [Lovable blog](https://lovable.dev/blog) mobile/Capacitor guidance before device distribution.

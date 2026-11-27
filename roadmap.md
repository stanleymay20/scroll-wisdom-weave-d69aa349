# Native beta preparation

- [x] Inspect identity, auth, native targets and tooling.
- [x] Pin Capacitor and secure the local-asset configuration.
- [x] Add manual unsigned beta build automation and isolation checks.
- [x] Verify clean dependency installation, configuration, tests, workflow and preview build; document results.
- [x] Generate both native targets using approved reversible beta ID and verify explicit offline-fixture sync.
- [x] Build and inspect actual Android debug fixture APK using temporary tooling; verify native unit test and device-test compilation.
- [x] Check authorized accessible Test settings; add clearly separated offline-fixture and real-Test workflow modes.
- [ ] Build iOS simulator artifact — needs external macOS/Xcode 26 runner or local Mac; manual workflow is ready but not dispatched.
- [ ] Package real Test app assets — needs independently verified Test configuration; existing web settings do not prove isolation.
- [ ] Native auth/device acceptance — blocked by artifacts and Test accounts; email-return journeys also require qualified native return handling.
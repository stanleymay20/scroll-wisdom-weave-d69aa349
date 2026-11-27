# Native beta architecture

- Keep Capacitor on one exact version across core, CLI and platforms, with CLI development-only, so native templates and runtime remain compatible.
- Native beta packaging uses a separate ignored `.local` asset directory and explicitly verified Test backend variables; a separately flagged network-free, non-distributable compile fixture is allowed for toolchain checks, but ordinary Test sync rejects it so beta preparation cannot silently target Live or ship a fixture.
- Native artifact automation is manual-only and produces debug Android and unsigned iOS simulator artifacts; normal web release automation remains independent.
# Native beta architecture

- Keep Capacitor on one exact version across core, CLI and platforms, with CLI development-only, so native templates and runtime remain compatible.
- Native beta packaging uses a separate ignored `.local` asset directory and explicitly verified Test backend variables; never fall back to the web production endpoint, so beta preparation cannot silently target Live.
- Native artifact automation is manual-only and produces debug Android and unsigned iOS simulator artifacts; normal web release automation remains independent.
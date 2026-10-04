# Quality release rule

The existence of quality code is not release evidence.

A quality claim may be activated only when:

1. the governing code/docs are merged to the exact release head;
2. exact-head CI passes;
3. the Lovable-controlled production deployment contains the required migrations/functions/configuration;
4. production smoke confirms the gates operate against real persisted data;
5. empirical qualification evidence exists when the claim is about repeated near-10 generation quality.

If any layer is unproven, the claim remains fail-closed.

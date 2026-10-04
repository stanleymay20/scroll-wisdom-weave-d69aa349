# Quality claim activation gate

Customer-facing quality claims are feature flags in substance even when they are implemented as copy.

Before stronger copy is enabled, release review must identify:

- exact claim;
- exact tier/model route it applies to;
- exact empirical evidence supporting it;
- expiration/requalification trigger when model, prompt, generation pipeline or certification rubric materially changes.

A material provider/model/prompt change invalidates inherited empirical qualification until a regression qualification run passes.

# Standard Text qualification evidence

This directory stores completed empirical qualification evidence for the Standard Text generation mode.

Do not add synthetic or placeholder passing reviews. A review file is admissible only when it refers to a real generated full-book sample from `docs/release/standard-text-qualification-corpus.json` and records the current manuscript scope hash plus the real machine and human-review evidence.

Use `docs/release/standard-text-human-review-template.json` as the starting shape.

Qualification remains fail-closed until the required number of complete books and independent human-reviewed passing samples meet the thresholds in `docs/release/standard-text-qualification-corpus.json` and `docs/release/SCROLLLIBRARY_CONTENT_QUALITY_STANDARD.md`.

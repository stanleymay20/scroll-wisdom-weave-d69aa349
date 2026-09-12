# ScrollLibrary Repository Lineage

This document records the repository-family evidence used to identify `scroll-wisdom-weave-d69aa349` as the maintained ScrollLibrary lineage while preserving the historical snapshots that preceded it.

## Canonical repository

`stanleymay20/scroll-wisdom-weave-d69aa349`

This is the maintained ScrollLibrary repository. It contains the current publication, reader, security, migration, CI, ISBN provenance, EPUB validation and GA-readiness lineage. New development should target this repository unless a controlled handoff explicitly states otherwise.

## Exact ancestry evidence

The consolidation decision is based on exact Git commit reachability, not repository names or file similarity.

### `scroll-wisdom-weave`

- `24a637557197fd296a103b986b88e5930d3b830c` — chapter evidence retrieval / ScrollVision integration.
- That exact commit is directly reachable from the canonical repository.
- Status: **historical snapshot / superseded for development / safe archive candidate**.

### `scroll-wisdom-weave-94f4588f`

- `635c04a56544dbe6e73ec45c3111caf4cb3df154` — institutional Instant Mastery audit fixes and expanded Bloom-level assessment flow.
- That exact commit is directly reachable from the canonical repository.
- Status: **historical snapshot / superseded for development / safe archive candidate**.

### `scroll-wisdom-weave-ffcd64d1`

- `7e75e379b07736458c2151c48dcbe09ca16b36d3` — Sell wizard book-query/RLS/retry/index repair.
- That exact commit is directly reachable from the canonical repository.
- Status: **historical snapshot / superseded for development / safe archive candidate**.

### `scroll-wisdom-weave-370c9253`

- `4faad571aad65fa2f38765014c46c9dbcd0f7e8c` — June product/security merge covering Shopify publishing/reconnect, sell-safety and OAuth hardening.
- `a21c6cfc65cf296d2f7cce4d020ab645cc155462` — OAuth open-redirect closure, safer Shopify state storage and forensic logging.
- Both exact commits are directly reachable from the canonical repository.
- Status: **historical snapshot / superseded for development / safe archive candidate**.

## Later snapshot-only commits

The generated sibling repositories received later repository-hygiene commits removing tracked environment files. Those commits are useful evidence of local cleanup but do not represent a divergent ScrollLibrary product lineage. They do not displace the canonical repository or justify merging snapshot tips back into it.

## Consolidation rule

Do not delete historical repositories merely to reduce repository count.

Before any archive action:

1. retain their Git history and superseded README notice;
2. preserve any repository-specific issues, PR discussions or external references that still matter;
3. do not merge later hygiene-only snapshot commits into the canonical product history unless independently justified;
4. do not rename or restructure the canonical repository while controlled publication, migration, CI or release work depends on its current identity.

## Current family decision

- `scroll-wisdom-weave-d69aa349` — **FLAGSHIP / CANONICAL / LINEAGE RESOLVED**.
- `scroll-wisdom-weave` — **HISTORICAL SNAPSHOT / SUPERSEDED / SAFE ARCHIVE CANDIDATE**.
- `scroll-wisdom-weave-94f4588f` — **HISTORICAL SNAPSHOT / SUPERSEDED / SAFE ARCHIVE CANDIDATE**.
- `scroll-wisdom-weave-ffcd64d1` — **HISTORICAL SNAPSHOT / SUPERSEDED / SAFE ARCHIVE CANDIDATE**.
- `scroll-wisdom-weave-370c9253` — **HISTORICAL SNAPSHOT / SUPERSEDED / SAFE ARCHIVE CANDIDATE**.

`LINEAGE RESOLVED` describes repository identity only. It does not by itself mean the canonical repository is production-verified; quality, security and release verification remain governed by permanent CI and controlled release evidence.
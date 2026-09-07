# ScrollUniversity UI/UX benchmark and adoption record

Reviewed: 2026-09-07

## Decision

ScrollUniversity uses its existing React/Vite/Tailwind/shadcn stack and adopts design patterns rather than transplanting a third-party application.

The selected reference architecture is:

1. **Public landing and visual composition:** `shadcnstore/shadcn-dashboard-landing-template`
2. **Authenticated administration/workspace patterns:** `satnaing/shadcn-admin`
3. **Learning-product interaction reference only:** `learnhouse/learnhouse`
4. **Secondary marketing-section reference:** `leoMirandaa/shadcn-landing-page`

The product keeps its own academic information architecture, authorization model, database contracts and institutional/legal boundaries.

## Why this combination

### shadcnstore/shadcn-dashboard-landing-template

- Strong fit with the current frontend: React/Vite, TypeScript, Tailwind and shadcn/ui.
- Combines public landing-page and dashboard patterns in one visual system.
- MIT licensed at review time.
- Appropriate source for composition ideas such as hero structure, responsive cards, section rhythm, navigation and CTA hierarchy.

Repository: https://github.com/shadcnstore/shadcn-dashboard-landing-template

### satnaing/shadcn-admin

- Mature shadcn/Vite administration interface.
- Strong patterns for data-heavy workspaces, navigation, responsive tables, forms, settings and role-oriented information architecture.
- MIT licensed at review time.
- Used as an interaction/design reference for the authenticated ScrollUniversity experience.

Repository: https://github.com/satnaing/shadcn-admin

### learnhouse/learnhouse

- Mature open-source learning platform and useful benchmark for course discovery, learning navigation, author workflows and learner progression.
- AGPL-3.0 at review time.
- **Reference only. No LearnHouse source code is copied into ScrollUniversity.** This avoids introducing AGPL obligations into the ScrollUniversity codebase through source transplantation.

Repository: https://github.com/learnhouse/learnhouse

### leoMirandaa/shadcn-landing-page

- Useful secondary source of landing-page section ideas.
- React/TypeScript/Tailwind/shadcn and MIT licensed at review time.
- Older maintenance activity than the primary references, so it is not the principal foundation.

Repository: https://github.com/leoMirandaa/shadcn-landing-page

## ScrollUniversity-specific UX rules

The final UI must not become a generic SaaS dashboard. It must reflect academic responsibilities and student cognitive load.

### Public experience

- Canonical public route: `/university/about`.
- Lead with the learning outcome: **Learn deeply. Build mastery. Prove what you know.**
- Explain the complete academic loop: curriculum → teaching → evidence → records → progression.
- Keep illustrative interface metrics explicitly labelled as illustrative; do not present synthetic values as live institutional data.
- Separate product capability from accreditation/legal authority.
- University identity and records are institutional; a student subscription is only an entitlement.

### Authenticated workspace

- Canonical protected route: `/university`.
- Give each role a calm entry point before exposing operational detail.
- Student priority: courses, learning, assignments, progress, grades, transcript and advising.
- Lecturer priority: teaching, learners, course materials, assessment, grading, attendance and outcomes.
- Academic-admin priority: programmes, curriculum, terms, people, records, governance and integrations.
- Avoid exposing administrative surfaces to roles that do not need them.
- Preserve direct links to the existing operational workspaces during incremental UI modernization.

## Accessibility and trust requirements

- Keyboard-visible focus on interactive cards and navigation.
- Semantic heading hierarchy and labelled navigation.
- Responsive behavior must work without hover.
- Marketing examples must be labelled as examples/illustrative data.
- No accreditation, degree-awarding or transferable-credit claim without actual institutional authority.
- No production or scalability claim without matching release evidence.

## Implementation record

The first adoption pass introduced:

- `src/components/university/UniversityLanding.tsx`
- `src/components/university/UniversityWorkspaceHome.tsx`
- public route `/university/about`
- protected workspace route `/university`
- role-aware workspace navigation into existing University capabilities
- Playwright smoke assertions that the public landing remains public and the workspace remains protected

No third-party application source was copied wholesale. The implementation is native to the ScrollLibrary/ScrollUniversity component system.

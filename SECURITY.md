# Security Policy

ScrollLibrary handles payments, creator earnings, and private manuscripts. We take
reports seriously and we would rather hear about a problem early than read about it
later.

## Reporting a vulnerability

Email **security@scrolllibrary.org** with:

- what the issue is and where (URL, endpoint, or file path),
- the steps or request needed to reproduce it,
- what an attacker could achieve with it,
- anything you need from us to confirm the fix.

Please report privately first. Do not open a public issue, a pull request, or a
discussion describing an unfixed vulnerability.

If you do not receive an acknowledgement within 5 business days, resend — a silent
inbox is a bug on our side, not a reason to disclose publicly.

## What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | 5 business days |
| Initial assessment and severity | 10 business days |
| Fix or documented mitigation for critical and high findings | 30 days |
| Coordinated public disclosure | By agreement, after a fix ships |

We will tell you if we disagree that a report is a vulnerability, and why. We are
happy to credit you when a fix ships; tell us how you would like to be named, or
that you would prefer not to be.

## Scope

In scope:

- The ScrollLibrary web application and its authentication flows.
- Supabase Edge Functions under `supabase/functions/`, including payment,
  entitlement, publication-certification, and administrative endpoints.
- Database authorization: row-level security policies, `SECURITY DEFINER`
  functions, and role grants under `supabase/migrations/`.
- Publication trust state — anything that lets a client manufacture a readiness,
  certification, or entitlement result that the server did not attest.

Out of scope:

- Vulnerabilities in Supabase, Stripe, or other third-party platforms. Report
  those to the vendor; tell us if we are misconfiguring them.
- Findings that require a compromised device, a self-XSS, or physical access.
- Missing hardening headers or best-practice warnings with no demonstrated impact.
- Automated scanner output submitted without a working reproduction.
- Denial of service, volumetric load testing, or spam of any kind.

## Testing rules

Test only against accounts you control. Do not access, modify, or exfiltrate other
users' manuscripts, purchases, or personal data — if a proof of concept would
require that, stop and describe the path instead; we will reproduce it ourselves.
Do not run load or denial-of-service tests against production.

We will not pursue legal action against researchers who follow this policy, act in
good faith, and give us reasonable time to fix an issue before disclosing it.

We do not currently operate a paid bug bounty.

## Handling of secrets

If you find a credential committed to this repository, report it as a
vulnerability and do not use it. CI runs a secret scan (`bun run audit:secrets`)
on every pull request, but scanners miss things.

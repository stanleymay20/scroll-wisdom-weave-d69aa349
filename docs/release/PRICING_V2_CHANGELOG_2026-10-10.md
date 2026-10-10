# Pricing v2 — 2026-10-10

Status: implementation candidate. No production billing flags are changed by this branch.

## Locked self-serve subscription list prices

- Free: $0.
- Creator: $19/month or $190/year.
- Pro: $69/month or $690/year.
- Teams: $199/month or $1,990/year.

The Pro list price remains $69. A future acquisition promotion may use a lower introductory price only if a matching Stripe price and clear renewal disclosure are provisioned; the UI must never advertise a price that checkout does not charge.

## Marketplace fee ladder

For future ScrollLibrary-facilitated marketplace transactions:

- Free: 10%.
- Creator: 7%.
- Pro: 5%.
- Teams: 3%.

The fee applies only where ScrollLibrary processes/facilitates the customer sale. External-channel royalties from KDP, Ingram, bookstores and other off-platform channels do not incur an additional ScrollLibrary marketplace commission.

Historical ledger entries retain their stored fee snapshot.

## Publishing and usage

Publishing services remain separate from subscriptions:

- Single Edition: $49.
- Print + Digital: $89.
- Complete Edition: $129.
- Assisted Publishing Launch: $399, still operationally gated.

Current usage add-on prices remain unchanged. Current server authority still grants one-time usage packs to the UTC calendar month of purchase; this branch does not pretend those packs are non-expiring.

## Follow-on billing-engine work

A durable purchased-credit wallet requires a separate reservation/refund-safe ledger so exact purchased balances can survive month boundaries without corrupting concurrent quota refunds. That work must land before customer copy can promise non-expiring purchased packs.

Advanced research should likewise get a separately metered quota only after its real provider calls and COGS boundary are inventoried and server-enforced.

## Safety

This change does not enable subscription checkout, marketplace payments, marketplace payouts, Teams checkout, publishing-service billing, or print fulfillment. Existing GA gates remain authoritative.

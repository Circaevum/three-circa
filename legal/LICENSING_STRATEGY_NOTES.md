# Licensing Strategy Notes (Open-Core)

Last updated: 2026-04-25

This document summarizes practical licensing choices for a Circaevum open-core model.

Not legal advice.

## Goal

Balance:

- Broad ecosystem adoption.
- Brand protection and attribution consistency.
- Commercial monetization (enterprise and white-label).

## Option A: Apache-2.0 core + commercial add-ons

Pros:

- Lowest friction for enterprise adoption.
- Strong patent grant language.
- Easy partner integration.

Cons:

- Competitors can ship proprietary forks.
- Attribution overlay is primarily contract/trademark-driven, not code-license-driven.

Best when:

- Moat is product execution, cloud operations, distribution, and brand.

## Option B: MPL-2.0 core + commercial add-ons

Pros:

- File-level copyleft encourages core improvements to remain open.
- Still commercially acceptable for many enterprises.
- Cleaner "middle" between AGPL and permissive licensing.

Cons:

- Slightly higher legal review overhead than Apache.
- Still requires trademark/contract structure for strict attribution overlays.

Best when:

- You want reciprocity on core files while preserving commercial flexibility.

## Option C: AGPL core + commercial exceptions

Pros:

- Strong reciprocity, including network-use context.
- Discourages closed SaaS forks.

Cons:

- Higher enterprise/legal friction.
- Can reduce adoption in procurement-heavy environments.

Best when:

- Core openness protection is more important than frictionless adoption.

## Recommended open-core mechanics

1. Keep core in a clearly separated repository/package boundary.
2. Publish clear trademark and attribution policies.
3. Offer commercial white-label waivers via contract.
4. Use contributor agreements if future relicensing flexibility is desired.
5. Keep third-party notices and vendor licenses current.

## Near-term founder checklist

- Confirm intended core license direction (Apache vs MPL vs AGPL).
- File/confirm trademark applications and usage policy.
- Standardize attribution overlay language in product UI.
- Prepare commercial order form with white-label addendum.
- Review all documents with IP/open-source counsel.

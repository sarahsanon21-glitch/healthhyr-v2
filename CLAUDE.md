# HealthHyr v2 rules

- Brand-new app. Do not copy code or styling from the legacy app (tag legacy-v1).
- Design: palette in docs/COLORS.md, Manrope for headings, DM Sans for body. No text under 12px. Lime is a fill only, never text on light backgrounds.
- All colors, fonts and spacing live in one tokens file. No raw hex values in components.
- Whole-file rewrites only. Run tests before every commit.
- No fake data, no sample listings, no "verified" or "background checked" claims.
- Stripe test keys only while building. Never use live keys in development.
- Prices: Pay Per Post $2.50 (30 days). Hiring Pro $39.99/month is shown as "Coming soon" at launch.
- Seekers are visible to employers only if they opt in (default off).
- Every plan limit is enforced on the server, never only in the UI.
- Work one step at a time. Plan first, stop for approval before writing code.

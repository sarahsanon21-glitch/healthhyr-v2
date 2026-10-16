# HealthHyr Employer Pricing and Billing Spec (V2) — PARTIAL

> ⚠️ **SUPERSEDED on 2026-10-15 by `docs/BILLING_SPEC.md`.**
>
> Kept as the transmission record: this is the owner's V2 text exactly as it
> arrived, including where it was truncated. The restored copy below was
> recovered from commit `25632a6` after the working file was overwritten by
> the proposed ending rather than appended to.
>
> The final, assembled spec is `docs/BILLING_SPEC.md`. Use that one.

---

Update HealthHyr's employer pricing and implement the billing rules and features below. Work within the existing application and preserve its design, authentication, employer profiles, and job seeker experience.

Replace the previous employer plans with these two options. All prices are in USD.

## 1. PAY PER POST — $2.50 per job

- One payment publishes one job listing for 30 days.
- Employers can edit the listing without paying again during that period.
- Include applications, applicant profiles, and basic listing statistics.
- Employers can access applicants to their own listings.
- Republishing an expired listing requires another payment.
- CTA: "Post a Job — $2.50".

## 2. HEALTHHYR HIRING PRO — $39.99 per month

Include:

- Up to 30 new job publications per monthly billing period.
- Each published job remains active for 30 days.
- Search the opt-in HealthHyr candidate directory.
- Filter candidates by location, distance when supported, healthcare role, certifications, availability, and preferred shifts.
- Send up to 50 invitations to apply per billing period.
- Receive in-app alerts when newly available candidates match an active job.
- Add an "Urgent Hiring" label with a visible start date and work schedule.
- Feature up to 3 listings per billing period for 7 days each, capped at the listing expiration date.
- Manage applications through New, Shortlisted, Interview, Hired, and Rejected stages.
- Allow up to 3 employer team members total, including the account owner.
- Show real listing views, application counts, and invitation responses.
- CTA: "Subscribe — $39.99/month".

## PRICING PAGE

Create a responsive two-card comparison with clear prices, limits, and benefits. Highlight Hiring Pro as "Recommended".

Suggested headline: "Find the right care professionals for your team."

Suggested Pro description: "Find available candidates, invite them to apply, and manage hiring in one place."

Clearly display:

- Pay per post: one-time payment, no subscription.
- Hiring Pro: recurring monthly billing, cancel anytime.
- At $2.50 each, 16 individual posts cost $40.
- Features do not guarantee applications or hires.

## CANDIDATE DIRECTORY AND PRIVACY

Only show candidates who explicitly opt in to employer discovery.

Let job seekers manage:

- Profile visibility.
- Available now status.
- Roles and certifications.
- Preferred shifts and weekly availability.
- Work locations and preferred travel distance.

Never expose home addresses, private documents, or contact details without appropriate consent. Do not describe certifications as verified unless an actual verification process exists.

Candidate suggestions must use job-related criteria such as role, location, certifications, and availability. Explain the matching criteria briefly. Use only real platform data.

## BILLING AND ENTITLEMENTS

Use the existing payment provider and billing architecture. If Stripe is already integrated, extend it.

- Verify payment server-side before publishing paid listings.
- Use verified webhooks and idempotent processing.
- Enforce plan limits on the backend, including team

<!-- ==================================================================
     TEXT CUT OFF HERE. The remainder of the original spec did not
     reach the assistant. Owner: append the rest below this line.
     ================================================================== -->

---

## Decisions — answered 2026-10-15

1. **Quota reset.** The 30 publications / 50 invitations / 3 featured listings
   **reset at each renewal. No rollover.** Implemented as per-period rows in
   `employer_billing_periods`, so a renewal inserts a new row rather than
   mutating counters — which also leaves an auditable history.
2. **Lapsed subscription.** Already-published jobs run to their own
   `expires_at`; Featured listings already running keep their `featured_until`.
   **Blocked on lapse:** new publications, candidate directory, invitations,
   new Featured.
3. **Teams are NOT in the first release.** B9 and migration 014 stay queued.
   **The pricing page must not advertise team members until they ship.**

## Launch sequencing — decided 2026-10-15

**Pay Per Post ships first (B1-B4). Hiring Pro is not sold until B5, B6 and B7
are live.** Until then the pricing page shows Pro as "Coming soon" with no
checkout button.

**The pricing page must only list features that actually exist.** At Pay Per
Post launch that means "basic listing statistics" can only mean application
counts — real view tracking does not land until B8 (migration 012), so views
must not be listed until then.

### Two commits before B1
Both are corrections to things that are untrue today, and both are whole-file
rewrites:

- **(a)** Remove the false claims in `ForEmployers.jsx` — "every job seeker is
  verified", "profile verification process", "all professionals
  background-checked", "5,000+ Verified Employers" — and replace them with
  statements that are true today.
- **(b)** Fix the dashboard "Shortlisted" tile, which counts `under_review`
  rather than `shortlisted`. V2 drops "Reviewed" from the employer pipeline,
  so the tile is both mislabelled and about to be orphaned.

## Still missing

The `BILLING AND ENTITLEMENTS` section still breaks after "including team",
and any section following it is absent. The owner will append the remainder
below the cut-off marker above. **`docs/BILLING_SPEC.md` is not rewritten
until that arrives.**

Open items the remaining text may still need to settle:

- Mid-cycle upgrade from Pay Per Post to Hiring Pro — proration, and whether
  already-paid individual posts carry over.
- Failed-renewal retry/dunning behaviour (distinct from the lapse rules in
  decision 2, which cover the end state rather than the retry window).
- Admin billing requirements — V1 had a section; V2 may restate or change it.
- Whether "distance when supported" is in scope for the first release; it
  needs geocoding the app does not currently have.

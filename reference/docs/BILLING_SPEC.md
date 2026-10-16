# HealthHyr Employer Pricing and Billing Spec (V2)

**Supersedes the V1 model** ($3.50 one-day post / $14 seven-day pack / $79.99 unlimited), which was never implemented and had no paying customers. See `docs/BILLING_ARCHITECTURE_REVIEW.md` for the audit this was written against.

Update HealthHyr's employer pricing and implement the billing rules and features below. Work within the existing application and preserve its design, authentication, employer profiles, and job seeker experience.

Replace the previous employer plans with these two options. All prices are in USD.

---

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
- Show real listing views, application counts, and invitation responses.
- CTA: "Subscribe — $39.99/month".

**Deferred from the first release:** employer team members (up to 3 total, including the account owner). Not built, and **must not be advertised on the pricing page until it ships**.

---

## 3. PRICING PAGE

Responsive two-card comparison with clear prices, limits, and benefits. Hiring Pro highlighted as "Recommended".

Headline: "Find the right care professionals for your team."
Pro description: "Find available candidates, invite them to apply, and manage hiring in one place."

Display clearly:

- Pay per post: one-time payment, no subscription.
- Hiring Pro: recurring monthly billing, cancel anytime.
- At $2.50 each, 16 individual posts cost $40.
- Features do not guarantee applications or hires.

**The page may only list features that actually exist at that moment.** Specifically:

- Until B8 ships real view tracking, "basic listing statistics" means **application counts only**. Listing views must not be named.
- Team members must not appear until B9 ships.
- While Hiring Pro is pre-launch, the card shows **"Coming soon" with no checkout button**, and the "16 posts cost $40" comparison is withheld until Pro is actually purchasable.

---

## 4. CANDIDATE DIRECTORY AND PRIVACY

Only show candidates who **explicitly opt in** to employer discovery. Opt-in defaults to off; no migration or backfill may opt anyone in.

Let job seekers manage:

- Profile visibility.
- Available now status.
- Roles and certifications.
- Preferred shifts and weekly availability.
- Work locations and preferred travel distance.

Never expose home addresses, private documents, or contact details without appropriate consent.

**Do not describe certifications as verified unless an actual verification process exists.** No such process exists today, so no surface may claim candidates, credentials or employers are verified or background-checked.

Candidate suggestions must use job-related criteria such as role, location, certifications, and availability. Explain the matching criteria briefly. Use only real platform data.

**Ordering constraint:** the seeker opt-in and visibility controls must be live in production before any directory surface ships.

---

## 5. BILLING AND ENTITLEMENTS

Use the existing payment provider and billing architecture. Stripe is already integrated; extend it.

- Verify payment server-side before publishing paid listings.
- Use verified webhooks and idempotent processing.
- Enforce plan limits on the backend, including publication quota, invitation quota, featured quota, and — once teams ship — team member count. The UI may show limits, but the server is the only source of truth.

### Quotas (reset each billing period, no rollover)

- Hiring Pro: 30 publications, 50 invitations, 3 featured listings per billing period.
- A new `employer_billing_periods` row is created at each renewal; counters are never reset by UPDATE.
- Quota consumption must be atomic, via a single Postgres function. A double click or concurrent requests must never spend the same quota twice.
- Drafts are free. A quota unit is consumed only when a listing actually publishes.

### Entitlements

- Entitlement is resolved server-side from verified payment records (`job_payments`, `subscriptions`).
- The checkout success page never grants anything. Only a verified webhook does.
- Pay Per Post: one verified payment publishes exactly one listing for 30 days. Editing during that window is free. Republishing after expiry requires a new payment.

### Webhooks

- Verify the Stripe signature on every event. Process each event ID once, idempotently, via `webhook_events`.
- Handle: `checkout.session.completed`, `invoice.paid` (renewal — opens a new billing period), `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, and disputes.
- Unknown event types are logged and acknowledged, never fatal.
- A handler failure must release its idempotency record and return a non-2xx so Stripe retries. Returning 200 on failure loses the event permanently.

### Lapse, failure, cancellation

- Cancelling keeps Hiring Pro active until the end of the paid period (cancel at period end, via the billing portal).
- When a subscription lapses or payment fails past Stripe's retries: already-published jobs run to their own `expires_at`; running Featured keeps its `featured_until`. **Blocked:** new publications, directory search, invitations, new Featured.
- A job awaiting payment when the subscription lapses stays a draft and can be published later via Pay Per Post.
- Retry and dunning behaviour follows the Stripe billing settings. That is dashboard configuration, not application code, and must be confirmed separately.

### Refunds

- A refunded Pay Per Post payment closes that listing. Applicant data stays visible to the employer.
- A refunded or disputed Hiring Pro payment ends the billing period. Quota already consumed is not restored, and listings already published run to their own `expires_at`.

### Billing history and visibility

- Employers see their own payment history, from `billing_transactions`. Stripe sends receipts.
- Admin gets a read-only view of payments and subscriptions. No admin action may bypass quota enforcement or silently alter a Stripe record.

### Environments

- Development and tests use **Stripe test-mode keys only**. Production keeps live keys. **Nothing may charge a real card during development.**
- Price IDs come from environment variables, never hardcoded, and are environment-specific — a test price ID fails against a live key and vice versa.

---

## 6. REQUIRED TESTS

- Each limit (30 publications / 50 invitations / 3 featured) is enforced on the backend, **including at the exact boundary**. Team size joins this list when teams ship.
- Concurrent publish requests cannot exceed quota.
- Webhook replay does not double-grant. A forged or unsigned webhook is rejected.
- A success-page visit without a webhook grants nothing.
- Lapse behaviour matches the rules above.
- Drafts consume no quota.
- A seeker who has not opted in never appears in the directory.

---

## 7. CLAIMS

The pricing page and product copy must not promise applications or hires, and must only list features that actually exist.

This applies retroactively: existing copy claiming job seekers are verified, credentials are checked, or professionals are background-checked must be corrected before the candidate directory ships, because no verification process exists.

---

## 8. LAUNCH SEQUENCING

**Pay Per Post ships first.** Hiring Pro is not sold until the directory, invitations and Featured are live. Until then the pricing page shows Pro as "Coming soon" with no checkout.

Build order and migrations are in `docs/BILLING_ARCHITECTURE_REVIEW.md`.

---

## 9. OPEN — NOT YET SPECIFIED

These are unresolved and are **not** in the first release unless answered:

1. **Mid-cycle upgrade** from Pay Per Post to Hiring Pro — proration, and whether already-paid individual posts carry over.
2. **"Distance when supported"** — requires geocoding the app does not have. `worker_profiles` and `jobs` store city/county/state/zip as strings, with no coordinates. Scope undecided.
3. **What counts as a listing view** — unique visitor, session, or raw impression; and whether the employer's own views are excluded.
4. **What counts as an invitation response** — whether an invited candidate applying is the response signal, or a distinct accept/decline.

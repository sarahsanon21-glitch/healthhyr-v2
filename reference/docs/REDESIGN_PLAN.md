# Frontend Redesign — Audit and Plan

**Written for: Sarah, before any redesign code.** Branch `redesign`, cut from `admin-control-center` at `15be24f` so the billing and bug-fix work carries over.

Backend, database and authentication are untouched throughout.

---

## Step 1 — Design audit

Measured across `frontend/src`, not estimated.

### The styling surface

| | Count |
|---|---|
| `.jsx`/`.js` files scanned | 60 |
| Files using inline `style={{` | **37** |
| Files using `className` | **39** |
| **Files using both** | **29** |
| Files with a per-file `<style>` block | **19** (22 blocks) |
| Total inline style objects | **2,227** |
| Total `className` attributes | 1,281 |

**The app is built three different ways at once**, and 29 of 60 files mix two of them in the same component. That is the single biggest obstacle to a consistent look — not any individual page.

### Colour

**115 distinct hex values.** The top of the distribution is coherent and effectively *is* the brand:

| Hex | Uses | Role in practice |
|---|---|---|
| `#2563eb` | 339 | Primary blue |
| `#e2e8f0` | 214 | Card border |
| `#0f172a` | 206 | Heading text |
| `#94a3b8` | 171 | Muted text |
| `#64748b` | 165 | Body text |
| `#f8fafc` | 88 | Page background |
| `#eff6ff` | 84 | Primary tint |
| `#059669` / `#15803d` / `#16a34a` | 140 | **Three greens doing one job** |
| `#374151` | 102 | A grey from a different ramp than the slate used elsewhere |

The tail is the problem: roughly 90 colours used a handful of times each, including near-duplicates (`#fff` 25 × and `#ffffff` 19 ×) and one-off greys.

### Typography

- **Three different font-family strings**: `system-ui, -apple-system, sans-serif` (9), `system-ui, sans-serif` (8), and bare `sans-serif` (8). No web font.
- **25 distinct font sizes** from 9px to 52px. 13px (290) and 12px (170) carry most of the UI.
- **5 weights**: 700 (261) and 800 (186) dominate; 500, 600, 900 appear too.

### Spacing and shape

- **22 distinct border radii**, including both `10` and `'10px'`, `8` and `'8px'` — the same value typed two ways.
- Padding and gap are ad-hoc per component; there is no scale.

### Repeated patterns, uncaptured

| Pattern | Occurrences |
|---|---|
| Card: `border: '1px solid #e2e8f0'` + white + radius + soft shadow | **102** |
| Primary button: `backgroundColor: '#2563eb'` | **59** |
| Status pill: tinted bg + darker fg + `borderRadius: 999` | ~40 |
| Section header: 11px, weight 700-800, uppercase, letter-spacing | ~30 |

None of these is a component. Each is retyped.

### Two token systems already exist, and neither is used

This is the finding that matters most for Step 2.

- `tailwind.config.js` defines `brandBlue`, `brandGreen`, `brandGray`. **Zero uses anywhere in the codebase.**
- `src/styles/mobile.css` defines fourteen `--hh-*` CSS variables. **Zero uses in any `.jsx` file** — they are referenced only inside `mobile.css` itself.

Tokens have been introduced twice and adopted zero times. Any proposal that just adds a third set will meet the same fate unless something makes the raw hex harder to reach than the token.

### Visually inconsistent pages

The split is clean enough to name:

**Tailwind-first, internally consistent** — `ResumeBuilder` (0 inline / 144 class), `JobSearch` (1/160), `Messages` (3/114), `ApplicantProfileView` (1/94), `MobileJobDetail` (8/90), `Subscription` (1/73), `SubscriptionSuccess` (0/69), `JobDetail` (0/49), `MobileHome` (0/43), `ManageJobs` (0/22), `Applicants` (0/16), `ApplicationTracking` (0/22).

**Inline-only** — `Login` (6/0), `Register` (28/0), `Contact` (20/0), `ForgotPassword` (17/0), `ResetPassword` (10/0), `TermsModal` (43/0).

**Mixed, the worst offenders** — `SeekerProfileSetup` (268/21), `PostJob` (195/19), `ForEmployers` (190/25), `SeekerViewProfile` (158/12), `EmployerDashboard` (150/15), `FindJobsPublic` (133/16), `RegisterEmployer` (132/12), `Welcome` (132/2), `SeekerDashboard` (127/13), `AboutUs` (119/23), employer `Settings` (114/4), `Resources` (106/16).

**The billing flow spans all three.** `PostJob` is mixed, `ManageJobs` is Tailwind-first, employer `Settings` is mixed, `Subscription` is Tailwind-first. An employer moving through post → manage → billing crosses three styling idioms in four screens.

---

## Step 2 — Proposed design system

### Where tokens live, so a colour change is one edit

One file: **`src/styles/tokens.css`**, holding channel triplets on `:root`.

```css
:root {
  --brand:        37 99 235;    /* #2563eb */
  --brand-hover:  29 78 216;
  --brand-soft:  239 246 255;
  --surface:     255 255 255;
  --page:        248 250 252;
  --border:      226 232 240;
  --text:         15 23 42;
  --text-muted:   71 85 105;
  --text-subtle: 148 163 184;
  --success:       5 150 105;
  --warning:     217 119 6;
  --danger:      220 38 38;
  --info:         37 99 235;
}
```

`tailwind.config.js` then references them, never literals:

```js
colors: {
  brand: {
    DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
    hover:   'rgb(var(--brand-hover) / <alpha-value>)',
    soft:    'rgb(var(--brand-soft) / <alpha-value>)',
  },
  // …
}
```

Channel triplets rather than `#hex` strings are the reason this works: `<alpha-value>` lets `bg-brand/10` keep functioning, so there is never a reason to drop back to raw CSS for a tint. Changing the brand blue is **one line in `tokens.css`**, and it also gives dark mode later for free by redefining the same names under a `[data-theme]` selector.

**Adoption is the hard part, not definition.** Two previous token sets went unused. Three things change that:

1. **Delete the alternatives.** Remove `brandBlue`/`brandGreen`/`brandGray` from the config and fold `--hh-*` into the new set, so there is exactly one vocabulary.
2. **Base components, not utilities.** If `<Button variant="primary">` exists, nobody retypes `backgroundColor: '#2563eb'` 59 times.
3. **A CI check** that fails on a raw hex in `.jsx` outside `tokens.css`. Cheap to write, and it is the only thing that actually prevents drift. Worth adding even before the rebuild starts.

### Scales

| | Now | Proposed |
|---|---|---|
| Colour | 115 hex | ~16 tokens |
| Font size | 25 sizes | 7 steps: 12 / 13 / 14 / 16 / 20 / 24 / 32 |
| Weight | 5 | 3: 400 / 600 / 800 |
| Radius | 22 | 4: `sm` 8 / `md` 12 / `lg` 16 / `full` 999 |
| Spacing | ad-hoc | Tailwind's default 4px scale, unchanged |
| Font | 3 strings | 1, declared once in `tokens.css` |

Shadows: two only — `sm` for cards, `md` for overlays. Currently each card re-types `0 1px 3px rgba(0,0,0,0.04)`.

### Base components — `src/components/ui/`

| Component | Replaces | Variants |
|---|---|---|
| `Button` | 59 hand-rolled primaries | primary / secondary / ghost / danger · sm, md · loading, disabled, full-width |
| `Card` | 102 repeats of the border recipe | default / interactive, optional header and footer |
| `Field` | per-page label+input+error markup | text, email, password, select, textarea, checkbox — label, hint, error, required |
| `Tab` | ManageJobs filter tabs, Settings categories | underline / pill, with counts |
| `Badge` | ~40 status pills | neutral / success / warning / danger / info / brand |
| `Modal` | `TermsModal`'s shell | sm / md / lg, scroll-locked, Escape and scrim close, focus trap |
| `Table` | the one real `<table>` in EmployerDashboard | header from an array, empty / loading / error states, responsive card fallback |

Two more worth adding while building these, because both are already needed and missing:

- **`Toast` + host.** `ToastNotification.jsx` exists and **nothing imports it**; destructive confirmations currently use `window.confirm`.
- **`ConfirmDialog`.** Also replaces `window.confirm`, and the admin spec requires type-to-confirm for destructive actions.

`EmployerGateNotice` already follows this shape and folds in as a `ui/` component with no behaviour change.

### Accessibility, since every component is being rewritten anyway

Baseline to hold: 4.5:1 contrast on body text (`#94a3b8` on white is **2.9:1** and fails today, used 171 times), visible focus rings, real `<label>` association in `Field`, `aria-live` on Toast, focus trap and restore in Modal, and a minimum 44px touch target on mobile controls.

---

## Step 3 — Rebuild order

### The sequencing problem worth naming first

The approved billing plan already rewrites `PostJob`, `ManageJobs`, employer `Settings`, `ForEmployers` and the pricing page. The redesign wants to rewrite the same files. **Done in the wrong order, each gets written twice** — once to work with the new billing model, once to look right.

So: **the design system lands first as pure foundation, then each billing commit writes its page once, in the new system.**

### Layer 0 — foundation (blocks nothing, changes no page)

| | Contents |
|---|---|
| **L0.1** | `tokens.css`, `tailwind.config.js` rewritten to reference it, `brandBlue`/`brandGreen`/`brandGray` removed, fonts unified |
| **L0.2** | `ui/`: Button, Card, Field, Tab, Badge, Modal, Table, Toast + host, ConfirmDialog |
| **L0.3** | The raw-hex lint check |

Nothing visual changes. Every existing page keeps working because nothing imports `ui/` yet.

### Layer 1 — billing screens, interleaved with the billing build

Each of these is **one** rewrite doing both jobs:

| Redesign | Billing commit it rides with |
|---|---|
| Pricing page (new) | B10a |
| `PostJob` | B2 — publish flow |
| `ManageJobs` | B2 — lifecycle and status |
| Employer `Settings` → billing tab | B4 |
| `Subscription` / `SubscriptionSuccess` | B4 |
| `EmployerDashboard` | after B3, once entitlement display is real |

**Exception — `ForEmployers.jsx` gets written twice, deliberately.** Billing commit A1 removes the untrue verification claims, and that is a correctness fix that should not wait behind a redesign. The redesign rewrites it again later. One wasted rewrite is the right trade.

### Layer 2 — public pages
`Welcome`, `ForEmployers` (second pass), `AboutUs`, `Resources`, `FindJobsPublic`, `Contact`, `AccountType`, `Navbar`, footer.

### Layer 3 — auth
`Login`, `Register`, `RegisterSeeker`, `RegisterEmployer`, `ForgotPassword`, `ResetPassword`, `TermsModal`. Small, inline-only, high visibility — fast wins once `Field` and `Button` exist.

### Layer 4 — seeker
`SeekerDashboard`, `SeekerProfileSetup` (the largest file at 1,376 lines), `SeekerViewProfile`, `JobSearch`, `JobDetail`, `ApplicationTracking`, `ResumeBuilder`, seeker `Settings`, `MobileHome`, `MobileJobDetail`, `MobileJobCard`, `BottomTabBar`, `SeekerHeader`.

**Seeker `Settings` moves earlier** if billing B1 ships first — B1 adds the privacy and availability controls there, and that screen should be written once.

### Layer 5 — admin
Built new against `ui/` from the start. No rewrite, because none of it exists yet.

---

## Step 4 — Keep versus rewrite

### Keep as-is — no styling, pure logic

`utils/api.js` · `utils/employerFetch.js` · `context/AuthContext.jsx` · `context/LanguageContext.jsx` · `hooks/useIsMobile.js` · `hooks/useAutoLogout.js` · `hooks/usePushNotifications.js` · `usLocationData.js` · `components/ProtectedRoute.jsx` · `components/AutoTranslate.jsx`

`App.jsx` keeps its structure; it needs route additions and `NO_NAVBAR_PATHS` entries, not a redesign.

### Rewrite whole — high inline-style count

The twelve mixed files, in descending order of inline styles: `SeekerProfileSetup` (268) · `PostJob` (195) · `ForEmployers` (190) · `SeekerViewProfile` (158) · `EmployerDashboard` (150) · `FindJobsPublic` (133) · `RegisterEmployer` (132) · `Welcome` (132) · `SeekerDashboard` (127) · `AboutUs` (119) · employer `Settings` (114) · `Resources` (106).

Plus the inline-only auth set: `Register` · `Contact` · `ForgotPassword` · `ResetPassword` · `Login` · `AccountType` · `SplashScreen` · `LanguageSwitcher`.

### Rewrite, but mostly class swaps

Already Tailwind-first, so the work is replacing literal palette classes with tokens: `JobSearch` · `Messages` · `ResumeBuilder` · `ApplicantProfileView` · `MobileJobDetail` · `Subscription` · `SubscriptionSuccess` · `JobDetail` · `MobileHome` · `ManageJobs` · `Applicants` · `ApplicationTracking` · `Navbar` · `NotificationBell` · `SeekerHeader` · `MobileJobCard` · `BottomTabBar`.

### Promote into `ui/`

`TermsModal` → `Modal` (it is the only working modal shell; keep the pattern, drop the hardcoded content) · `ToastNotification` → `Toast` (currently dead code) · `EmployerGateNotice` → `ui/` unchanged.

### Delete

The 22 per-file `<style>` blocks, once their media queries move to Tailwind responsive prefixes. `styles/global.css` legacy helper classes (`.desktop-nav`, `.hero-grid`, `.three-col`) are barely referenced — confirm per class, then remove. `styles/mobile.css` is absorbed into tokens plus component classes.

---

## L0.1 — tokens, fonts, foundation

Derived from `docs/design/preview/index.html`, read from disk. The preview is
a visual reference; the values below are extracted from it, not copied out of
it.

### What the preview actually contains

| | Found |
|---|---|
| `:root` tokens | 6 — `--ink #123e38`, `--green #145b4e`, `--lime #d6ed9b`, `--paper #f7f8f3`, `--muted #677a74`, `--line #dfe6de` |
| Distinct hex values | 34 |
| Border radii | 14 distinct; `12px` dominant, then `50%`, `8px`, `5px`, `14px` |
| Shadows | **exactly 2**, both ink-tinted |
| Font sizes | 19 distinct, 9px–47px |
| Font weights | 600, 700, 800 |
| Fonts | one CSS `@import` of DM Sans 400/500/600/700 + Manrope 400/500/600/700/800 |
| External images | 1 Unsplash hotlink |

### Seven places the preview and the rules disagree

Each changes how the result looks, so none is applied silently.

1. **Muted text.** Preview `--muted: #677a74` measures **4.27:1** on paper and
   **fails** AA body. The decision `#566A63` measures **5.41:1** and passes.
   **Decision wins**; muted text goes slightly darker than the preview.
2. **Text below 12px.** The preview uses 9px (×2), 10px (×9) and 11px (×5) —
   16 occurrences. The rule is no text under 12px, body 14px. **Rule wins**,
   so captions and labels get larger and the preview's density loosens.
3. **Font loading.** The preview uses a CSS `@import`, which is
   render-blocking. **Self-host woff2 + `<link rel="preload">` + `font-display: swap`.**
4. **Weights loaded.** The preview imports 9 family/weight combinations and
   uses 3. Proposed: **DM Sans 400 / 600 / 700, Manrope 700 / 800** — five
   files. Manrope 400/500 and DM Sans 500 are dropped unless a heading needs
   them; confirm before I cut them.
5. **The hero image.** `images.unsplash.com/photo-1573497620053…` is
   hotlinked. Replaced with a locally served, optimised asset once a licensed
   photo exists; a neutral placeholder in the meantime.
6. **Green sprawl.** The preview has **eight** olive/lime greens
   (`#93b45a`, `#749047`, `#7c962c`, `#7b9b48`, `#6b8b47`, `#6d954b`,
   `#668d3e`, `#718b54`) and **seven** near-identical pale tints
   (`#edf4e2`, `#f0f5e8`, `#eef3e8`, `#e8eedb`, `#f0f3e9`, `#f0f3eb`,
   `#f2f5ee`). The token set collapses each group to one, otherwise the
   redesign reproduces the problem it exists to fix.
7. **Off-grid spacing.** `9`, `13`, `15`, `23`, `25`, `30`px are not on a 4px
   grid. Proposed snapping: 9→8, 13→12, 15→16, 23→24, 25→24, 30→32. Visible
   but small; say if any should stay exact.

### `frontend/src/styles/tokens.css` — the single source

Channel triplets so `<alpha-value>` keeps working and no component needs raw
CSS for a tint.

```css
:root {
  /* brand */
  --ink:          18 62 56;     /* #123E38  11.10:1 on paper */
  --green:        20 91 78;     /* #145B4E   7.46:1 on paper — primary */
  --lime:        214 237 155;   /* #D6ED9B   fill only, dark text on it */
  --olive:       107 139 71;    /* #6B8B47   3.64:1 — text >= 24px ONLY */

  /* surface */
  --paper:       247 248 243;   /* page */
  --surface:     255 255 255;   /* cards */
  --line:        223 230 222;   /* borders */
  --accent-soft: 237 244 226;   /* the 7 pale greens, collapsed */

  /* text */
  --text:         18 62 56;     /* = ink */
  --text-muted:   86 106 99;    /* #566A63  5.41:1 — overrides preview */

  /* category chips, the only non-green accents in the preview */
  --cat-blue-bg:  237 242 250;  --cat-blue-fg:   76 105 146;
  --cat-clay-bg:  246 239 236;  --cat-clay-fg:  173 120 106;

  /* shadows — ink-tinted, straight from the preview */
  --shadow-sm: 0 15px 20px rgb(18 62 56 / 0.07);
  --shadow-lg: 0 15px 45px rgb(23 62 52 / 0.10);
}
```

`tailwind.config.js` references these and holds **no literals**:

```js
colors: {
  ink:     'rgb(var(--ink) / <alpha-value>)',
  green:   'rgb(var(--green) / <alpha-value>)',
  lime:    'rgb(var(--lime) / <alpha-value>)',
  paper:   'rgb(var(--paper) / <alpha-value>)',
  // …
}
```

### Scales

| | Value |
|---|---|
| Radius | `xs 4` · `sm 8` · `md 12` · `lg 16` · `xl 20` · `full 9999` · `50%` for avatars |
| Shadow | `sm`, `lg` — the preview's two, unchanged |
| Spacing | 4px grid: 4 8 12 16 20 24 32 48 64 |
| Type | `xs 12` · `sm 13` · `base 14` · `md 16` · `lg 20` · `xl 24` · `2xl 32` · `3xl 48` |
| Weight | 400 body · 600 medium · 700 bold · 800 display |
| Family | Manrope headings · DM Sans body |

`xs` is 12px because the rule floors it there; the preview's 9–11px text maps
up to 12px, and body text is 14px rather than the 13px the preview leans on.

### Old hex to token mapping — every value in the preview

All 34 distinct hex values in `docs/design/preview/index.html`, and where each
one went. Review this: the collapses are the judgement calls.

| Preview hex | Uses | Token | Note |
|---|---|---|---|
| `#123e38` | 1 | `--ink` | unchanged |
| `#145b4e` | 1 | `--green` | unchanged |
| `#d6ed9b` | 1 | `--lime` | unchanged |
| `#f7f8f3` | 1 | `--paper` | unchanged |
| `#dfe6de` | 1 | `--line` | unchanged |
| `#677a74` | 1 | `--text-muted` → **`#566A63`** | **darkened**; preview value is 4.27:1 and fails AA body |

**The eight olive/lime greens, collapsed to two:**

| Preview hex | Token | Note |
|---|---|---|
| `#6b8b47` | `--olive` | kept as the canonical olive; text ≥24px only |
| `#749047` | **`--logo-hyr`** | **kept separate** — the "Hyr" half of the wordmark |
| `#93b45a` | `--olive` | collapsed |
| `#7c962c` | `--olive` | collapsed |
| `#7b9b48` | `--olive` | collapsed |
| `#6d954b` | `--olive` | collapsed |
| `#668d3e` | `--olive` | collapsed |
| `#718b54` | `--olive` | collapsed |

**The seven pale tints, collapsed to one:**

| Preview hex | Token |
|---|---|
| `#edf4e2` | `--accent-soft` (canonical) |
| `#f0f5e8` · `#eef3e8` · `#e8eedb` · `#f0f3e9` · `#f0f3eb` · `#f2f5ee` | `--accent-soft` |

**Kept distinct — the two non-green accents:**

| Preview hex | Token | Note |
|---|---|---|
| `#edf2fa` / `#4c6992` | `--cat-blue-bg` / `--cat-blue-fg` | category chip |
| `#f6efec` / `#ad786a` | `--cat-clay-bg` / `--cat-clay-fg` | category chip |

**Greys and alpha values:**

| Preview hex | Token | Note |
|---|---|---|
| `#536d5d` · `#7e8b7f` · `#688d7e` | `--text-muted` | three muted greens, one job |
| `#b4c2b8` · `#c3d4ca` | `--line` | two border greys, one job |
| `#ffffffea` | `--surface-veil` at 92% | sticky header |
| `#123e3880` | `--scrim` at 50% | modal backdrop |
| `#173e341a` | `--shadow-lg` | ink-tinted, 10% |
| `#123e3812` | `--shadow-sm` | ink-tinted, 7% |

**34 hex → 16 tokens.** `#749047` survives as its own token per your decision.

### Font weights — verified against the preview

Checked before finalising, as asked. The preview sets weight through the
`font:` shorthand, which a naive `font-weight:` grep misses entirely:

| Family | Weight | Where |
|---|---|---|
| Manrope | 600 | `h1` (clamp 42-65px), `h2` (32px) |
| Manrope | 700 | `h3` (18px), `.amount` (47px) |
| Manrope | 800 | `.logo` (26px), `.eyebrow`, `.company` |
| DM Sans | 400 | `body` (15px), `.amount span` (12px) |
| DM Sans | 600 | `.btn`, `.image-label`, `.audiences span`, `summary` |
| DM Sans | 700 | `.text-link`, `.job-footer button`, `.ribbon`, `.search-top .active` |

Your Manrope 600/700/800 + DM Sans 400/600/700 is exactly right.

**But it is four files, not six.** Both families are served as *variable*
fonts: one file per subset covers the whole weight range. Downloading latin
and latin-ext for each gives:

| File | Size |
|---|---|
| `dm-sans-latin.woff2` | 36.9 KB |
| `dm-sans-latin-ext.woff2` | 18.2 KB |
| `manrope-latin.woff2` | 24.8 KB |
| `manrope-latin-ext.woff2` | 15.1 KB |
| **Total** | **95 KB** |

Dropped: cyrillic, cyrillic-ext, greek and vietnamese. English, Spanish,
French and Haitian Creole all sit within latin + latin-ext.

Only the two latin files are preloaded. latin-ext loads on demand when an
accented character outside latin actually appears, so most page views never
fetch it.

### An eighth preview/rule difference

Body text in the preview is **15px**; the rule sets body at 14px. The
`base` step is 14px. Small, but it compounds with the 12px floor to make the
rebuilt pages slightly less dense than the preview.

### Files L0.1 touches

All whole-file rewrites. No page is restyled, nothing imports the tokens yet,
so no control can move and the inventory count cannot change.

| File | Change |
|---|---|
| `frontend/src/styles/tokens.css` | **new** — the block above |
| `frontend/tailwind.config.js` | rewritten — references tokens, drops the unused `brandBlue`/`brandGreen`/`brandGray` |
| `frontend/src/index.css` | rewritten — imports tokens, sets base font and colours |
| `frontend/index.html` | rewritten — `<link rel="preload">` for the five woff2 files |
| `frontend/public/fonts/*.woff2` | **new** — self-hosted Manrope + DM Sans |
| `frontend/public/img/hero-placeholder.*` | **new** — replaces the Unsplash hotlink |

Not touched: `mobile.css` and `global.css` stay until the layers that consume
them are rewritten, so nothing breaks mid-migration. Their `--hh-*` variables
are superseded but left in place until their last consumer is gone.

### Verification for L0.1

- `npm run build` clean.
- `python docs/button-inventory-count.py` — **must be unchanged**: 352 / 413 /
  56 / 12. L0.1 touches no component, so any movement is a bug.
- Backend suite before and after, 82 passing.
- Fonts load with no layout shift, and no render-blocking request in the
  network panel.
- Contrast spot-checks against the measured table above.

### Measured contrast, for the record

| Foreground | On | Ratio | AA body | AA large |
|---|---|---|---|---|
| `#123E38` ink | paper | **11.10** | pass | pass |
| `#145B4E` green | paper | **7.46** | pass | pass |
| `#566A63` muted *(decision)* | paper | **5.41** | pass | pass |
| `#677A74` muted *(preview)* | paper | **4.27** | **fail** | pass |
| `#6B8B47` olive | paper | **3.64** | **fail** | pass |
| `#123E38` ink | lime | **9.28** | pass | pass |
| white | green | **7.97** | pass | pass |

Supersedes my earlier estimate of 3.1:1 for `#6B8B47`; measured, it is 3.64:1.
The conclusion is unchanged — 24px and above only.

### Deferred out of L0.1, as agreed

- **`SavedJobs.jsx`** is not touched by the redesign. A separate small commit
  after L0 will show real saved jobs from `saved_jobs` and remove the false
  "maintained locally within the active session scope" copy — proposed for
  approval first.
- **`employer/Settings.jsx`** keeps its hidden Team section exactly as is.

## Control preservation — hard rule

**Every button, link and form action that exists today must survive the
redesign with the same label, the same handler and the same behaviour.
Restyle only.** Nothing may be removed, merged, renamed or hidden without
explicit approval. If a new `ui/` component cannot express an existing
control, stop and ask rather than approximating.

### The baseline is reproducible — verified

`docs/button-inventory-before.csv` holds the per-file baseline. I reproduced
it from source to confirm the control can actually be enforced:

**54 of 54 files match exactly. All four totals identical.**

| | Baseline | Reproduced |
|---|---|---|
| Buttons | 352 | 352 |
| OnClick | 413 | 413 |
| Links | 56 | 56 |
| Submit | 12 | 12 |

The counting rules, now pinned:

| Column | Matches |
|---|---|
| `Buttons` | `<button` (case-insensitive) |
| `OnClick` | `onClick` |
| `Links` | `<Link` **or** `<a ` — React Router links and raw anchors together |
| `Submit` | `onSubmit` |

`Links` was the only ambiguity: counting `<Link` alone gives 53, because
`App.jsx` has two raw `<a href>` in the footer and `Messages.jsx` has one.
Counting both reproduces 56 exactly.

The baseline covers 54 files; six more exist (`utils/`, `hooks/`,
`usLocationData.js`) and all score zero on every column, so their absence
changes nothing.

### Process per page

1. **Before restyling**, write `docs/button-inventory/<page>.md` listing every
   button, link and form submit: visible label, what it does, handler name.
2. **Restyle** as a whole-file rewrite.
3. **After**, re-derive the inventory from the new file and diff it against
   the pre-written one. Report every difference, including ones that look
   harmless.
4. **Re-run the count.** A lower number in any column is a failure, not a
   judgement call.

### Two ways the count can mislead, and how they are handled

**A control can move between columns without disappearing.** Converting
`<a href="/contact">` to `<Link to="/contact">` keeps `Links` stable, but
converting it to `<button onClick={() => navigate('/contact')}>` moves one
from `Links` to `Buttons` and `OnClick`. The per-column total would look
wrong while nothing was actually lost. **Rule: the per-page markdown
inventory is authoritative for intent; the CSV count is the tripwire.** Any
cross-column movement is reported explicitly rather than netted off.

**The count cannot see a disabled or unreachable control.** A button rendered
behind a condition that is never true still counts. The markdown inventory
records reachability, so a control that silently stops being rendered is
caught by the diff even when the number holds.

### Known pre-existing discrepancies

Two controls in the baseline are already broken. They are recorded so the
redesign is not blamed for them, and neither is fixed as part of a restyle:

- **`SavedJobs.jsx` scores 0/0/0/0** and is a 12-line stub. It fetches
  nothing and always renders "No saved bookmarks found", while claiming
  bookmarks are "maintained locally within the active session scope". Saved
  jobs in fact persist in the database — `saved_jobs`, with a working
  `POST /api/seeker/save-job/:jobId` toggle that `JobSearch` already reads via
  `isSaved`. So the feature works and its own page denies it. Fixing this
  **adds** controls, which the count permits. Flagged under the honesty rule
  as well, since the copy misdescribes where data is stored.
- **`employer/Settings.jsx` counts 22 buttons**, but the Team & Permissions
  category is commented out (`8a06210`), so some are unreachable today. The
  markup is intact and the controls still count. When teams ship, the
  category is restored rather than rebuilt.

## Risks

1. **Bundle size.** `App.jsx` has no lazy loading and `vite.config.js` has no chunking, so everything ships in one bundle that is also baked into the Capacitor iOS binary. Worth adding `React.lazy` during L0 rather than after.
2. **No frontend tests.** The backend suite (82 tests) does not cover any of this, so `npm run build` plus manual checking is the only gate. A visual regression tool would be the real answer; out of scope unless you want it.
3. **Capacitor.** The iOS app ships `dist/`, so every layer needs a Capacitor sync and a device check, not just a browser check.
4. **`AutoTranslate` walks and rewrites DOM text nodes.** Changing markup structure can change what it translates. Worth a check after each layer.
5. **Translation coverage.** `LanguageContext` translates visible strings at runtime; new copy needs the same treatment.

---

## Verification

Per your rule, the backend suite runs before and after every commit — **82 passing at the time of writing**. It cannot catch frontend regressions, so each layer also needs:

- `npm run build` clean
- The affected flows walked manually in a browser
- A Capacitor sync and device check for anything in the seeker or mobile layers
- Contrast checked against the 4.5:1 baseline for any new colour pairing

## Open questions

1. **Is the brand blue `#2563eb` staying?** The whole token set keys off it. If a new palette is coming, L0.1 should wait for it — otherwise the tokens get defined twice.
2. **A web font, or stay on system fonts?** System is faster and currently inconsistent only by accident. A real typeface is the single biggest visual change available.
3. **Dark mode now or never?** Channel-triplet tokens make it nearly free *if* decided before L0.2; retrofitting after every component is written is much more expensive.
4. **Is the raw-hex lint check wanted?** It is what stops this happening a third time, but it will fail the build on every un-migrated file until the layers are done — so it may need to start as a warning.

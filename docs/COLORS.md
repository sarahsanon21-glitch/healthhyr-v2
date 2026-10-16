# HealthHyr color palette

| Role | Hex | Use |
|---|---|---|
| Ink (text, dark green) | #123E38 | Headings, body text |
| Primary green | #145B4E | Buttons, links, logo mark, success states |
| Lime | #D6ED9B | Fill only (badges, highlights), always with dark text |
| Paper (page background) | #F7F8F3 | Page background |
| Surface (white) | #FFFFFF | Cards, inputs, modals |
| Line | #DFE6DE | Borders, dividers |
| Olive (brand accent) | #749047 | "Hyr" in the logo, large headings only (24px or bigger) |
| Muted text | #566A63 | Secondary text |
| Danger | #B42318 | Errors, destructive actions. Text or border on Paper/Surface, or Surface text on a Danger fill. Pair with an icon or label, never color alone. |

Success states reuse Primary green (no separate success color).

Rules: no text smaller than 12px. Lime is never used as text color on a light background.

## Contrast (WCAG 2.x, computed)

Minimum for normal text is 4.5:1. Large text (24px+, or 18.66px+ bold) needs 3:1.

| Text | Background | Ratio | Allowed for |
|---|---|---|---|
| Ink | Paper | 11.10 | All text |
| Ink | Surface | 11.85 | All text |
| Ink | Lime | 9.28 | All text (the only text color allowed on Lime) |
| Primary | Paper | 7.46 | All text, links |
| Primary | Surface | 7.97 | All text, links |
| Surface | Primary | 7.97 | Button labels |
| Muted | Paper | 5.41 | All text |
| Muted | Surface | 5.77 | All text |
| Danger | Paper | 6.16 | All text |
| Danger | Surface | 6.57 | All text |
| Surface | Danger | 6.57 | Destructive button labels |
| Olive | Paper | 3.38 | Large headings only (fails 4.5:1) |
| Olive | Surface | 3.61 | Large headings only (fails 4.5:1) |

Not allowed: Muted on Lime (4.52, too close to the limit), any text color other than Ink on Lime, Olive for body or small text.

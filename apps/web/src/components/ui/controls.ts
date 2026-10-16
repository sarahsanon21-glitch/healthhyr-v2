// Shared look for text-like form controls (Input, Textarea, Select).
// The border is Muted, not Line: Line is only 1.27:1 against Surface and fails the 3:1 needed
// for the boundary of a form control (docs/COLORS.md). The error state is driven by aria-invalid,
// so the visual state and the accessibility state cannot disagree.
export const controlClasses =
  'block w-full min-h-10 rounded-md border border-muted bg-surface px-3 text-base text-ink placeholder:text-muted aria-invalid:border-2 aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted';

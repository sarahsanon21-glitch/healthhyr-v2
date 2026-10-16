/** After a failed submit, moves keyboard focus to the first field with an error so it is not missed. */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  const invalid = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
  invalid?.focus();
}

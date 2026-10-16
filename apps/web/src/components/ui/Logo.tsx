export type LogoSize = '2xl' | '3xl' | '4xl';

// Olive is allowed only for large text (24px and up). The size type has no smaller options,
// and there is deliberately no className prop that could shrink it.
const sizes: Record<LogoSize, string> = {
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
};

export function Logo({ size = '2xl' }: { size?: LogoSize }) {
  return (
    <span className={`font-heading font-extrabold text-ink ${sizes[size]}`}>
      Health<span className="text-olive">Hyr</span>
    </span>
  );
}

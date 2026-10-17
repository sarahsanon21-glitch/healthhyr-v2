import Image from 'next/image';

export type LogoSize = '2xl' | '3xl' | '4xl';

// The logo is the owner's artwork (assets/brand/healthhyr-logo.png), served from this site's own
// public folder. This is the compact version: the symbol and the name, without the tagline line that
// cannot be read at header size. Its width and height match the file, so the page does not jump
// while it loads.
const SRC = '/brand/healthhyr-logo-compact.png';
const WIDTH = 676;
const HEIGHT = 192;

// Heights in the spacing scale. Each is at least 40px, where the lettering is still easy to read.
const heights: Record<LogoSize, string> = {
  '2xl': 'h-10',
  '3xl': 'h-12',
  '4xl': 'h-16',
};

export interface LogoProps {
  size?: LogoSize;
  /**
   * Set when the logo sits on a dark green surface. The logo's dark blue lettering has no contrast
   * on dark green, so it is shown on a white plate (the logo itself is never recolored).
   */
  onDark?: boolean;
}

export function Logo({ size = '2xl', onDark = false }: LogoProps) {
  const image = <Image src={SRC} alt="HealthHyr" width={WIDTH} height={HEIGHT} unoptimized className={`${heights[size]} w-auto`} />;
  if (!onDark) return image;
  return <span className="inline-flex rounded-md bg-surface px-3 py-2">{image}</span>;
}

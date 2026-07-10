import type { CSSProperties } from 'react';
import { siMercadopago, siSpotify, siWhatsapp, type SimpleIcon } from 'simple-icons';

const BRAND_ICONS = {
  mercadoPago: siMercadopago,
  spotify: siSpotify,
  whatsapp: siWhatsapp,
} satisfies Record<string, SimpleIcon>;

export type BrandIconName = keyof typeof BRAND_ICONS;

interface BrandIconProps {
  name: BrandIconName;
  className?: string;
  decorative?: boolean;
  title?: string;
}

type BrandIconStyle = CSSProperties & {
  '--baraja-brand-icon-color': string;
};

export function BrandIcon({
  name,
  className = '',
  decorative = true,
  title,
}: BrandIconProps) {
  const icon = BRAND_ICONS[name];
  const label = title ?? icon.title;
  const style: BrandIconStyle = {
    '--baraja-brand-icon-color': `#${icon.hex}`,
  };
  const classNames = ['baraja-brand-icon', className].filter(Boolean).join(' ');

  return (
    <svg
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      className={classNames}
      focusable="false"
      role={decorative ? undefined : 'img'}
      style={style}
      viewBox="0 0 24 24"
    >
      {decorative ? null : <title>{label}</title>}
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}

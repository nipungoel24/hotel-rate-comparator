import type { SVGProps } from 'react';

// Static stand-in for `morphicons/react` in the jsdom test environment.
// The real MorphIcon animation runs in the browser and is covered by the
// Playwright suite; component tests assert accessible labels and state,
// not spring physics. The ESM-only package is mapped here instead of being
// transformed.
export function MorphIcon({
  label,
  ...props
}: SVGProps<SVGSVGElement> & {
  icon?: unknown;
  label?: string;
  reducedMotion?: 'never' | 'user' | 'always';
  size?: number | string;
}) {
  return (
    <svg
      data-testid="morph-icon"
      {...(label !== undefined ? { 'aria-label': label, role: 'img' } : {})}
      aria-hidden={label === undefined || undefined}
      {...props}
    />
  );
}

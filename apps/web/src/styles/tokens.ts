/**
 * BookLeaf design tokens — the single source for colours, radii and typography.
 * Mirrored as CSS variables in globals.css (@theme) for Tailwind and mapped onto the
 * Ant Design theme in theme.ts, so both systems render the same brand.
 *
 * Palette sampled from bookleafpub.in: logo / "Publish My Book" pink #FF4975, the light
 * pink hero wash (#FFE8ED → #FFD4DA), body text #5E5E5E and heading ink #272729.
 * White text on #FF4975 is 3.2:1, so text-level pink (links, selected states) uses the
 * deeper brand-700 (#D6295A, 4.9:1 on white) to stay WCAG AA compliant.
 */
export const tokens = {
  color: {
    brand: {
      50: '#FFF5F7',
      100: '#FFE8ED',
      200: '#FFD4DA',
      300: '#FFB4BD',
      400: '#FF7294',
      500: '#FF4975',
      600: '#F03A68',
      700: '#D6295A',
      800: '#A81E45',
      900: '#6E1430',
    },
    /** Secondary accent: the indigo of the site's active navigation link. */
    accent: { 500: '#4342B9', 50: '#EEEEFA' },
    page: '#FFF7F9',
    surface: '#FFFFFF',
    surfaceMuted: '#FFFAFB',
    border: '#F3DEE3',
    divider: '#F8EBEF',
    ink: '#272729',
    inkMuted: '#5E5E5E',
    inkSubtle: '#8E8A8C',
    success: '#2E7D4F',
    warning: '#B7791F',
    danger: '#C62828',
    info: '#4342B9',
    note: '#FFF8E6',
    noteBorder: '#F2D59B',
  },
  radius: { sm: 6, md: 8, lg: 12, pill: 999 },
  font: {
    sans: 'var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    display: 'var(--font-lato), var(--font-inter), ui-sans-serif, system-ui, sans-serif',
  },
  layout: { sidebar: 248, sidebarCollapsed: 72, header: 60 },
} as const;

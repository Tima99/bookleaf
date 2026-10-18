import type { Metadata, Viewport } from 'next';
import { Inter, Lato } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
// Lato for headings — close to the rounded sans used on bookleafpub.in.
const lato = Lato({
  subsets: ['latin'],
  variable: '--font-lato',
  display: 'swap',
  weight: ['700', '900'],
});

export const viewport: Viewport = { themeColor: '#FF4975' };

export const metadata: Metadata = {
  title: { default: 'BookLeaf Support', template: '%s · BookLeaf Support' },
  description: 'BookLeaf Publishing author support and communication portal',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lato.variable}`}>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body>
          before React hydrates. This ignores only <body>'s own attributes, not its children. */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

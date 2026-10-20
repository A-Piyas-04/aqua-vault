import type { Metadata, Viewport } from 'next';
import { Baloo_Da_2, Hind_Siliguri } from 'next/font/google';
import './globals.css';

// Both fonts carry Bengali glyphs; next/font downloads them at build time and serves them
// from this site, so nothing is requested from Google while playing.
const hind = Hind_Siliguri({ subsets: ['bengali', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-hind', display: 'swap' });
const baloo = Baloo_Da_2({ subsets: ['bengali', 'latin'], weight: ['600', '700'], variable: '--font-baloo', display: 'swap' });

export const metadata: Metadata = {
  title: 'aqua-vault: draw canals, revive a village',
  description:
    'A cozy Bangladesh-inspired water ecosystem game. Guide monsoon rain through hand-dug canals to rice paddies, waterwheels, clean water, fish ponds and wetlands.',
  applicationName: 'aqua-vault',
  openGraph: {
    title: 'aqua-vault',
    description: 'Draw a little canal. Watch a whole village come alive.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1F6F80',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hind.variable} ${baloo.variable}`}>
      <body>{children}</body>
    </html>
  );
}

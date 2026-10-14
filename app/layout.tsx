import type { Metadata, Viewport } from 'next';
import './globals.css';

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
  themeColor: '#237E90',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

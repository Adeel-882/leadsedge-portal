import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { themeBootstrap } from '@/lib/theme';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: 'Leadsedge Portal',
  icons: {
    icon: [{ url: '/favicon.svg?v=leadsedge-red-1', type: 'image/svg+xml', sizes: 'any' }],
    shortcut: '/favicon.svg?v=leadsedge-red-1',
  },
  description: 'A focused client delivery portal for lead assignment, feedback, and conversation.',
  openGraph: {
    title: 'Leadsedge Portal',
    description: 'Client delivery, task conversations, and lead feedback in one secure workspace.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Leadsedge Portal' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Leadsedge Portal',
    description: 'Client delivery, task conversations, and lead feedback in one secure workspace.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="light" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head><body className={`${geist.variable} antialiased`}><a className="skip-link" href="#main-content">Skip to content</a><div id="main-content">{children}</div></body></html>;
}

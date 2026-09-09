import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://teachmap-ai.vercel.app'),
  title: 'TeachMap AI',
  description:
    'TeachMap AI asks students to teach first, probes their reasoning, and turns hidden misconceptions into a visual mastery map.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: ['/favicon.svg'],
  },
  openGraph: {
    title: 'TeachMap AI',
    description:
      'Teach what you know. Discover what you do not with an AI-powered misconception map.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TeachMap AI',
    description:
      'Teach what you know. Discover what you do not with an AI-powered misconception map.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

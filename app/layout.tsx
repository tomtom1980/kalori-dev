import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Newsreader } from 'next/font/google';

import { MotionProvider } from '@/lib/motion/MotionProvider';
import { SwRegister } from '@/components/pwa/sw-register';

import './globals.css';

const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Kalori',
  description: 'AI-first calorie & nutrition tracker.',
  // Task 5.1.2: link the PWA manifest. Next.js emits the <link rel="manifest" />
  // automatically when this metadata field is set.
  manifest: '/manifest.json',
  // Apple touch icon points at the 192 PWA icon so iOS Add-to-Home-Screen has
  // a non-blurry surface to draw from.
  appleWebApp: {
    capable: true,
    title: 'Kalori',
    statusBarStyle: 'black-translucent',
  },
};

// Task 5.1.2: theme color must match the manifest's theme_color so iOS /
// Android paint the status bar in the same warm-near-black that the masthead
// uses on first paint (no flash of white).
export const viewport: Viewport = {
  themeColor: '#0E0A08',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {/*
         * Bug 3 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — wraps
         * the entire app in `LazyMotion + domAnimation + strict` so
         * every consumer is forced through `m.*` (4.6 KB initial)
         * instead of `motion.*` (~32 KB). MotionProvider is a thin
         * 'use client' boundary — children are still RSC.
         * Reference: Planning/ui-design.md §2.6 line 219.
         */}
        <MotionProvider>{children}</MotionProvider>
        {/* Task 5.1.2 — service worker registration. Mounted once, returns null,
            registers post-hydration via useEffect. Skipped in development. */}
        <SwRegister />
      </body>
    </html>
  );
}

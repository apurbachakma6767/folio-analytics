import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'Folio vault analytics',
  description: 'Collateral, spends, repayments, and monthly active users across live and previous Folio vaults.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} scheme-dark`}>
      <body className="font-sans">
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-[#10b981] focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-[14px] focus-visible:font-semibold focus-visible:text-[#04210f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5f5f7]"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from 'next';

import { fontVariables } from '@/lib/font';
import { cn } from '@/lib/utils';

import './globals.css';

export const metadata: Metadata = {
  title: 'FRM Weekly Commercial Review',
  description: 'FRM commercial performance weekly report'
};

/** Standalone report viewer: always light + N+P (sky) theme — matches PNG/PDF export. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background overflow-hidden overscroll-none font-sans antialiased theme-default',
          fontVariables
        )}
      >
        {children}
      </body>
    </html>
  );
}

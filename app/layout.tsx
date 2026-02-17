import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

import { ErrorBoundary } from '@/components/error';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Swaggbot - API Assistant',
  description: 'Transform Swagger/OpenAPI documentation into conversational interfaces',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}

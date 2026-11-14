import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { I18nProvider } from '../lib/i18n';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Platform Bot Discord',
  description: 'No-code builder untuk bot Discord',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}

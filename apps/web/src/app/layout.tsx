import type { Metadata } from 'next';
import { I18nProvider } from '../lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'Platform Bot Discord',
  description: 'No-code builder untuk bot Discord',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}

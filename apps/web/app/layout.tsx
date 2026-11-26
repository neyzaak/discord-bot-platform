import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bot Caches — Dashboard',
  description: 'Dashboard bot Discord',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

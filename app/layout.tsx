import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Videogram — Answers worth watching',
  description:
    'Turn your questions into short educational videos. Create, edit, and export slides with a natural voiceover.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

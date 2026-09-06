import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Videogram — Video chat',
  description:
    'A conversation in video. Ask a question, watch a narrated answer, and keep the conversation going.',
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

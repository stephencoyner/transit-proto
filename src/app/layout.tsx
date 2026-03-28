import 'mapbox-gl/dist/mapbox-gl.css';
import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import { Playfair_Display } from 'next/font/google';
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Transit Proto",
  description: "King County Metro transit visualization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={playfair.variable}>
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import { Merriweather } from 'next/font/google';
import "./globals.css";

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['300', '400', '700', '900'],
  style: ['normal', 'italic'],
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
    <html lang="en" className={merriweather.variable}>
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
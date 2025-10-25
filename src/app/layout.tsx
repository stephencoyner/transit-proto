import 'mapbox-gl/dist/mapbox-gl.css';
import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
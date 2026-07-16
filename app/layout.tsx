import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "King Research — Market & Company CRM",
  description: "Attio-style research CRM for company and market briefs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

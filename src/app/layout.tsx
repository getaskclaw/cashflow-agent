import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cashflow Agent — Reply-aware collections",
  description:
    "Connect Stripe and let an AI agent read your customer threads, draft the follow-up that actually gets you paid, and track every invoice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

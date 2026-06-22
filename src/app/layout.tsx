import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaxAssist — Sales Tax & VAT for SaaS",
  description:
    "Automatically calculate sales tax and VAT for your SaaS transactions. Connect Stripe, see your tax liability instantly.",
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

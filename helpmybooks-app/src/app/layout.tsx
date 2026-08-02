import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HelpMyBooks — AI reconciliation questions for Australian bookkeepers",
  description:
    "Stop chasing clients for transaction answers. HelpMyBooks asks simple Who/What/Why questions by SMS or email, collects receipts, and returns clean, AI-scored answers to your reconciliation queue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

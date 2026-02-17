import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Footer } from "@/app/components/Footer";
import { PostHogProvider } from "@/app/components/analytics/PostHogProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Receptionist – Never Miss a Booking",
  description: "AI-powered receptionist for salons, barbers, spas, and handymen. $29/mo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PostHogProvider>
          {children}
          <Footer />
        </PostHogProvider>
      </body>
    </html>
  );
}

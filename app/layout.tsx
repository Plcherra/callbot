import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { Footer } from "@/app/components/Footer";
import { PostHogProvider } from "@/app/components/analytics/PostHogProvider";
import { TooltipProvider } from "@/app/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Receptionist – Never Miss a Booking",
  description: "AI-powered receptionist for salons, barbers, spas, and handymen. From $69/mo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TooltipProvider>
          <PostHogProvider>
            {children}
            <Footer />
            <Toaster richColors position="top-center" />
          </PostHogProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}

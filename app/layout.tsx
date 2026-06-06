import type { Metadata } from "next";
import { Orbitron, Inter } from "next/font/google";
import "./globals.css";
import PrivyProviderWrapper from "@/components/providers/PrivyProviderWrapper";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/toast-provider";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RCADE | Web3 Gaming Platform",
  description: "Modern responsive Web3 arcade gaming platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${orbitron.variable} ${inter.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-bg-void text-foreground font-sans relative overflow-x-hidden">
        {/* Pure black base */}
        <div className="fixed inset-0 z-[-2]" style={{ background: '#010101' }} />
        {/* Subtle mint warmth at corners — arcade cabinet glow */}
        <div className="fixed inset-0 z-[-1] pointer-events-none" style={{
          background: `radial-gradient(ellipse 60% 40% at 50% 100%, rgba(169,221,211,0.06) 0%, transparent 70%)`
        }} />
        
        <PrivyProviderWrapper>
          <Navbar />
          <Toaster />
          <main className="flex-grow flex flex-col relative z-0 pt-[60px]">
            {children}
          </main>
          <Footer />
        </PrivyProviderWrapper>
      </body>
    </html>
  );
}


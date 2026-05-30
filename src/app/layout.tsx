import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { PromotionProvider } from "@/context/PromotionContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Eshop LineOA",
  description: "ร้านค้าออนไลน์ผ่าน Line OA",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={inter.className}>
        <AuthProvider>
          <PromotionProvider>
            <CartProvider>
              {children}
            </CartProvider>
          </PromotionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

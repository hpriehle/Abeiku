import { Cormorant_Garamond, Inter } from "next/font/google";
import { CurrencyProvider } from "../components/CurrencyContext";
import "./widget.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  robots: "noindex, nofollow",
};

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${cormorant.variable} ${inter.variable}`}>
      <CurrencyProvider>{children}</CurrencyProvider>
    </div>
  );
}

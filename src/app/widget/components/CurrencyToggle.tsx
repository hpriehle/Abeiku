"use client";

import { cn } from "./cn";
import { useCurrency } from "./CurrencyContext";

interface CurrencyToggleProps {
  variant?: "light" | "dark";
}

export function CurrencyToggle({ variant = "light" }: CurrencyToggleProps) {
  const { currency, toggleCurrency } = useCurrency();
  const isDark = variant === "dark";

  return (
    <button
      onClick={toggleCurrency}
      className={cn(
        "inline-flex items-center rounded-full font-body text-[11px] font-medium uppercase tracking-widest transition-colors duration-300",
        isDark
          ? "border border-cream/20 text-cream/70 hover:border-cream/40"
          : "border border-gray-light hover:border-green/40"
      )}
      aria-label={`Switch currency to ${currency === "USD" ? "GHS" : "USD"}`}
    >
      <span
        className={cn(
          "px-2.5 py-1 transition-colors duration-200",
          currency === "USD"
            ? isDark
              ? "text-cream"
              : "text-green"
            : isDark
              ? "text-cream/40"
              : "text-gray"
        )}
      >
        USD
      </span>
      <span
        className={cn(
          "h-3 w-px",
          isDark ? "bg-cream/20" : "bg-gray-light"
        )}
      />
      <span
        className={cn(
          "px-2.5 py-1 transition-colors duration-200",
          currency === "GHS"
            ? isDark
              ? "text-cream"
              : "text-green"
            : isDark
              ? "text-cream/40"
              : "text-gray"
        )}
      >
        GHS
      </span>
    </button>
  );
}

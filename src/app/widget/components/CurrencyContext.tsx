"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Currency = "USD" | "GHS";

interface CurrencyContextValue {
  currency: Currency;
  toggleCurrency: () => void;
  formatPrice: (amount: number) => string;
}

const FALLBACK_RATE = 15.5;
const CACHE_KEY = "abeiku_ghs_rate";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "GHS",
  toggleCurrency: () => {},
  formatPrice: (amount) => `GH₵${amount}`,
});

interface CurrencyProviderProps {
  baseCurrency?: Currency;
  children: React.ReactNode;
}

export function CurrencyProvider({
  baseCurrency = "USD",
  children,
}: CurrencyProviderProps) {
  const [currency, setCurrency] = useState<Currency>(baseCurrency);
  const [rate, setRate] = useState(FALLBACK_RATE);

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);

    if (cached) {
      const { rate: cachedRate, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        setRate(cachedRate);
        return;
      }
    }

    fetch("https://open.er-api.com/v6/latest/USD")
      .then((res) => res.json())
      .then((data) => {
        if (data.rates?.GHS) {
          setRate(data.rates.GHS);
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ rate: data.rates.GHS, timestamp: Date.now() })
          );
        }
      })
      .catch(() => {
        // Use fallback rate silently
      });
  }, []);

  const toggleCurrency = useCallback(() => {
    setCurrency((prev) => (prev === "USD" ? "GHS" : "USD"));
  }, []);

  const formatPrice = useCallback(
    (amount: number) => {
      if (currency === baseCurrency) {
        // Display in the hotel's native currency — no conversion
        return baseCurrency === "GHS"
          ? `GH₵${amount.toLocaleString()}`
          : `$${amount.toLocaleString()}`;
      }
      // Convert to the other currency
      if (currency === "USD") {
        // Base is GHS, display USD → divide by rate
        const converted = Math.round(amount / rate);
        return `$${converted.toLocaleString()}`;
      }
      // Base is USD, display GHS → multiply by rate
      const converted = Math.round(amount * rate);
      return `GH₵${converted.toLocaleString()}`;
    },
    [currency, baseCurrency, rate]
  );

  return (
    <CurrencyContext.Provider value={{ currency, toggleCurrency, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

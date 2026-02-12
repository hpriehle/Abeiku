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
  formatPrice: (usdAmount: number) => string;
}

const FALLBACK_RATE = 15.5;
const CACHE_KEY = "abeiku_ghs_rate";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  toggleCurrency: () => {},
  formatPrice: (usd) => `$${usd}`,
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("USD");
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
    (usdAmount: number) => {
      if (currency === "USD") {
        return `$${usdAmount}`;
      }
      const converted = Math.round(usdAmount * rate);
      return `GH₵${converted}`;
    },
    [currency, rate]
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

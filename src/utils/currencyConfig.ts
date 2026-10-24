import { useState, useEffect } from 'react';

export type CurrencyCode = 'INR' | 'USD' | 'EUR';

export const currencySymbols: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
};

// Global config object (can be modified by settings)
export const currencyConfig = {
  activeCurrency: (localStorage.getItem('app_currency') as CurrencyCode) || 'INR'
};

export function setCurrency(code: CurrencyCode) {
  currencyConfig.activeCurrency = code;
  localStorage.setItem('app_currency', code);
  // Fire a custom event to re-render components listening for currency changes
  window.dispatchEvent(new Event('currency-change'));
}

export function formatCurrency(amount: number, options?: Intl.NumberFormatOptions): string {
  const code = currencyConfig.activeCurrency;
  const symbol = currencySymbols[code];
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  
  // Format the number using standard locale formatting
  const formattedNumber = amount.toLocaleString(locale, options);
  
  return `${symbol}${formattedNumber}`;
}

export function useCurrency() {
  const [currency, setCurrencyState] = useState(currencyConfig.activeCurrency);

  useEffect(() => {
    const handleCurrencyChange = () => {
      setCurrencyState(currencyConfig.activeCurrency);
    };

    window.addEventListener('currency-change', handleCurrencyChange);
    return () => window.removeEventListener('currency-change', handleCurrencyChange);
  }, []);

  return {
    currencyCode: currency,
    symbol: currencySymbols[currency],
    formatCurrency
  };
}

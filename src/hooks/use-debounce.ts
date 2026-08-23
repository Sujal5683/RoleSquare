import { useEffect, useState } from "react";

/**
 * Debounces a value by the given delay in milliseconds.
 * Returns the debounced value — only updates after the user stops changing it.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

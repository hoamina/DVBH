import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    // Ca "change" tren MediaQueryList lan "resize" tren window: mot so trinh duyet/
    // moi truong (vd. resize qua CDP automation) khong luon phat "change" dang tin cay.
    const recompute = () => setMatches(window.matchMedia(query).matches);
    mql.addEventListener("change", recompute);
    window.addEventListener("resize", recompute);
    recompute();
    return () => {
      mql.removeEventListener("change", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

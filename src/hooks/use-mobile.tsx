import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * CONTRACT 4: Instant mobile detection
 * 
 * Returns mobile state IMMEDIATELY on first render to prevent
 * desktop-to-mobile layout shift which violates performance contracts.
 */
export function useIsMobile() {
  // INSTANT: Detect mobile synchronously on first render
  const getIsMobile = () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
  
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // Re-check on mount in case SSR value differs
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

import "@testing-library/jest-dom";
import { vi } from "vitest";

// matchMedia polyfill (jsdom doesn't ship one)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// IntersectionObserver polyfill
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "";
  thresholds = [];
}
(globalThis as any).IntersectionObserver = IO;

// ResizeObserver polyfill
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = RO;

// Silence noisy logs in tests unless overridden
vi.spyOn(console, "debug").mockImplementation(() => {});

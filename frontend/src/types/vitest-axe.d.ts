import "vitest";

// Augment vitest's expect with the jest-axe matcher (jest-axe ships jest-namespace types only).
declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

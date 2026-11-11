// RNTL 14 augments `@jest/expect`, but with Jest 30 the `expect` imported from
// `@jest/globals` takes its matcher types from the `expect` package. Augment that
// module too so `toBeDisabled()`, `toBeEnabled()`, etc. type-check in tests.
import type { JestNativeMatchers } from '@testing-library/react-native/dist/matchers/types';

declare module 'expect' {
  // Must repeat the original type parameters exactly for declaration merging.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void>, T = unknown> extends JestNativeMatchers<R> {}
}

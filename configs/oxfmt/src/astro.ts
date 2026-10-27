import type { OxfmtConfig } from 'oxfmt';

/** Format `.astro` components through `prettier-plugin-astro`, which needs the project's `@astrojs/compiler-rs` package. */
export const ASTRO = { astro: true } satisfies OxfmtConfig;

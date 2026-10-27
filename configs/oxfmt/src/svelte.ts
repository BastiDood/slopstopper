import type { OxfmtConfig } from 'oxfmt';

/**
 * Format `.svelte` components through `prettier-plugin-svelte`, which needs the project's `svelte` package. Attributes
 * whose value is a same-named expression use the `{name}` shorthand.
 */
export const SVELTE = { svelte: { allowShorthand: true } } satisfies OxfmtConfig;

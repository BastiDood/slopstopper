# `@bastidood/eslint-config-tanstack-query`

TanStack Query entries for `@bastidood/eslint-config`, including the rules of `@tanstack/eslint-plugin-query`.

## Installation

```sh
pnpm add --save-dev @bastidood/eslint-config @bastidood/eslint-config-svelte @bastidood/eslint-config-tanstack-query eslint svelte typescript
```

## Configuration

```ts
// eslint.config.ts
import { compose } from '@bastidood/eslint-config';
import { SVELTE } from '@bastidood/eslint-config-svelte';
import { TANSTACK_SVELTE_QUERY } from '@bastidood/eslint-config-tanstack-query/svelte';
import { CORE } from '@bastidood/eslint-config/core';
import { TANSTACK_QUERY } from '@bastidood/eslint-config/tanstack/query';
import { defineConfig } from 'eslint/config';

export default defineConfig({
	files: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,svelte}'],
	extends: compose(CORE, SVELTE, TANSTACK_QUERY, TANSTACK_SVELTE_QUERY),
});
```

Keep these presets in one `compose()` call so their `no-restricted-*` lists are combined. The Svelte parser supplies the template nodes that `TANSTACK_SVELTE_QUERY` checks.

If you also lint Astro, add `ignores: ['**/*.astro/**']` to this block to exclude Astro's virtual scripts. Import `ASTRO` from `@bastidood/eslint-config-astro` and add a separate block with `files: ['**/*.astro', '**/*.astro/*.{js,ts}']` and `extends: compose(ASTRO)`.

## Entry Points

| Entry point                                      | Contents                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bastidood/eslint-config-tanstack-query/svelte` | Enables `exhaustive-deps`, `infinite-query-property-order`, and `no-void-query-fn` from `@tanstack/eslint-plugin-query`; bans `useQueryClient`, destructuring query results, inline `queryFn` in `createQuery`, and `use:enhance` with `onsubmit` |

## Limitations

- Rules are not configurable.
- `exhaustive-deps` does not check the top-level script of `.svelte` components.

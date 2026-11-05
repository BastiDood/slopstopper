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

export default defineConfig(
	{ files: ['**/*.ts'] },
	compose(CORE, SVELTE, TANSTACK_QUERY, TANSTACK_SVELTE_QUERY),
);
```

List `TANSTACK_SVELTE_QUERY` after `SVELTE`, whose parser its template selectors need.

## Entry Points

| Entry point                                      | Contents                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bastidood/eslint-config-tanstack-query/svelte` | Enables `exhaustive-deps`, `infinite-query-property-order`, and `no-void-query-fn` from `@tanstack/eslint-plugin-query`; bans `useQueryClient`, destructuring query results, inline `queryFn` in `createQuery`, and `use:enhance` with `onsubmit` |

## Limitations

- Rules are not configurable.
- `exhaustive-deps` does not check the top-level script of `.svelte` components.

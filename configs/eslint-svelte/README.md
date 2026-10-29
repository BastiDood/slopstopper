# `@bastidood/eslint-config-svelte`

Svelte entries for `@bastidood/eslint-config`.

## Installation

```sh
pnpm add --save-dev @bastidood/eslint-config @bastidood/eslint-config-svelte eslint svelte typescript
```

## Configuration

```ts
// eslint.config.ts
import { compose } from '@bastidood/eslint-config';
import { SVELTE } from '@bastidood/eslint-config-svelte';
import { CORE } from '@bastidood/eslint-config/core';
import { defineConfig } from 'eslint/config';

export default defineConfig({ files: ['**/*.ts'] }, compose(CORE, SVELTE));
```

List `SVELTE` after `CORE`.

## Entry Points

| Entry point                                             | Contents                                            |
| ------------------------------------------------------- | --------------------------------------------------- |
| `@bastidood/eslint-config-svelte`                       | Svelte rules and type-aware parsing; bans `$effect` |
| `@bastidood/eslint-config-svelte/tanstack-svelte-query` | Bans `useQueryClient`                               |

## Limitations

- Requires Svelte 5.
- Rules are not configurable.
- Covers `.svelte`, `.svelte.js`, and `.svelte.ts` files. List your other files yourself.
- SvelteKit's inferred route props are invisible to ESLint due to differences between `eslint-plugin-svelte` and `svelte-check`. Annotate them (e.g., `const { params }: PageProps = $props()` via `./$types`) or turn off the respective `@typescript-eslint/no-unsafe-*` rules for route files in your own configuration.

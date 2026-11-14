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

export default defineConfig({
	files: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,svelte}'],
	extends: compose(CORE, SVELTE),
});
```

Compose `SVELTE` after `CORE` so its parser handles `.svelte`, `.svelte.js`, and `.svelte.ts` files. The single call shares `.svelte` parser extension metadata across the block.

If you also lint Astro, add `ignores: ['**/*.astro/**']` to this block to exclude Astro's virtual scripts. Import `ASTRO` from `@bastidood/eslint-config-astro` and add a separate block with `files: ['**/*.astro', '**/*.astro/*.{js,ts}']` and `extends: compose(ASTRO)`.

## Entry Points

| Entry point                                      | Contents                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `@bastidood/eslint-config-svelte`                | Svelte rules and type-aware parsing; bans `$effect`                                                           |
| `@bastidood/eslint-config-svelte/tanstack/table` | Reserved for Svelte Table rules; compose with `TANSTACK_TABLE` from `@bastidood/eslint-config/tanstack/table` |

## Limitations

- Requires Svelte 5.
- Rules are not configurable.
- SvelteKit's inferred route props are invisible to ESLint due to differences between `eslint-plugin-svelte` and `svelte-check`. Annotate them (e.g., `const { params }: PageProps = $props()` via `./$types`) or turn off the respective `@typescript-eslint/no-unsafe-*` rules for route files in your own configuration.

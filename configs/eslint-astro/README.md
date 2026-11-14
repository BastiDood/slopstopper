# `@bastidood/eslint-config-astro`

Astro entry for `@bastidood/eslint-config`.

## Installation

```sh
pnpm add --save-dev @bastidood/eslint-config @bastidood/eslint-config-astro eslint typescript
```

## Configuration

```ts
// eslint.config.ts
import { compose } from '@bastidood/eslint-config';
import { ASTRO } from '@bastidood/eslint-config-astro';
import { CORE } from '@bastidood/eslint-config/core';
import { defineConfig } from 'eslint/config';

export default defineConfig(
	{
		files: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
		ignores: ['**/*.astro/**'],
		extends: compose(CORE),
	},
	{
		files: ['**/*.astro', '**/*.astro/*.{js,ts}'],
		extends: compose(ASTRO),
	},
);
```

The local `ignores` keeps `CORE`'s type-aware rules off virtual script paths such as `page.astro/0_1.ts`. The Astro block handles templates and those scripts. Add presets to the `compose()` call for the files where they belong.

To skip generated directories across the whole project, add `globalIgnores(['.astro/', 'dist/'])` from `eslint/config` as a separate `defineConfig()` argument.

## Limitations

- Rules are not configurable.

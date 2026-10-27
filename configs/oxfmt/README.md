# `@bastidood/oxfmt-config`

Shared Oxfmt formatting style: four-column tabs, single quotes, 100 columns, and sorted imports.

## Installation

```sh
pnpm add --save-dev @bastidood/oxfmt-config oxfmt
```

## Configuration

```ts
// oxfmt.config.ts
import { compose } from '@bastidood/oxfmt-config';
import { CORE } from '@bastidood/oxfmt-config/core';
import { SVELTE } from '@bastidood/oxfmt-config/svelte';
import { defineConfig } from 'oxfmt';

export default defineConfig(
	compose(CORE, SVELTE, {
		ignorePatterns: ['build'],
		sortTailwindcss: { stylesheet: './src/app.css', functions: ['cn'] },
	}),
);
```

Later arguments win. `ignorePatterns` and `overrides` are concatenated.

## Entry Points

| Entry point                      | Contents                    |
| -------------------------------- | --------------------------- |
| `@bastidood/oxfmt-config`        | `compose`                   |
| `@bastidood/oxfmt-config/core`   | The shared style            |
| `@bastidood/oxfmt-config/svelte` | Svelte component formatting |
| `@bastidood/oxfmt-config/astro`  | Astro component formatting  |

## Limitations

- The style is not configurable. Supply only project-specific options, such as ignore patterns and Tailwind CSS sorting.
- The Svelte entry requires `svelte`. The Astro entry requires `@astrojs/compiler-rs`.
- TypeScript configuration files require Node.js 22.18 or later.

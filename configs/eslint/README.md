# `@bastidood/eslint-config`

ESLint port of `@bastidood/oxlint-config` for projects that Oxlint cannot lint, such as Svelte and Astro.

## Installation

```sh
pnpm add --save-dev @bastidood/eslint-config eslint typescript
```

## Configuration

```ts
// eslint.config.ts
import { compose } from '@bastidood/eslint-config';
import { CORE } from '@bastidood/eslint-config/core';
import { defineConfig } from 'eslint/config';

export default defineConfig({
	files: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
	extends: compose(CORE),
});
```

List `CORE` first in `compose()` and include other presets that apply to the same files in that call. This combines their `no-restricted-*` lists.

If you also lint Astro, add `ignores: ['**/*.astro/**']` to this block to exclude Astro's virtual scripts. Import `ASTRO` from `@bastidood/eslint-config-astro` and add a separate block with `files: ['**/*.astro', '**/*.astro/*.{js,ts}']` and `extends: compose(ASTRO)`.

## Entry Points

| Entry point                               | Contents                                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bastidood/eslint-config`                | `compose`                                                                                                                                                                                                                                       |
| `@bastidood/eslint-config/core`           | ESLint core, `import`, `jsdoc`, `promise`, `@typescript-eslint`, and `unicorn` rules                                                                                                                                                            |
| `@bastidood/eslint-config/node`           | Node.js rules                                                                                                                                                                                                                                   |
| `@bastidood/eslint-config/vitest`         | Vitest rules                                                                                                                                                                                                                                    |
| `@bastidood/eslint-config/tanstack/query` | Enables the slopstopper TanStack Query rules: `prefer-query-key-context`, `no-defaulted-query-key`, `no-standalone-mutate-async`, and `no-mutate-callback-cache-update`                                                                         |
| `@bastidood/eslint-config/tanstack/table` | Enables the slopstopper TanStack Table rules: `prefer-table-atoms`, `require-table-state-pairs`, `no-render-scoped-table-schema`, and `require-exclusive-indeterminate`; bans `stockFeatures` and reading column templates outside `FlexRender` |

## Limitations

- Prefer `@bastidood/oxlint-config` wherever Oxlint can run.
- Rules are not configurable. Supply only project-specific settings, such as `files` and globals.
- `typescript-eslint` supports TypeScript up to 6.0. On TypeScript 7, alias `typescript` to `@typescript/typescript6`.
- Requires ESLint 10.
- Run ESLint from the directory that contains `tsconfig.json` or a parent directory. Type-aware rules search for `tsconfig.json` only up to the working directory.

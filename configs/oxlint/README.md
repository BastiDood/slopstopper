# `@bastidood/oxlint-config`

Strict, type-aware Oxlint configuration for TypeScript projects.

## Installation

```sh
pnpm add --save-dev @bastidood/oxlint-config @bastidood/eslint-plugin-slopstopper oxlint oxlint-plugin-eslint oxlint-tsgolint
```

## Configuration

```ts
// oxlint.config.ts
import { compose } from '@bastidood/oxlint-config';
import { CORE } from '@bastidood/oxlint-config/core';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [compose(CORE)],
	env: { node: true },
});
```

Combine entry points with `compose`, not `extends`, so that `no-restricted-*` lists are concatenated instead of replaced. `CORE` turns on type-aware linting and fails on warnings.

## Entry Points

| Entry point                                     | Contents                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bastidood/oxlint-config`                      | `compose`                                                                                                                                                                                                                                       |
| `@bastidood/oxlint-config/core`                 | ESLint core, `import`, `jsdoc`, `oxc`, `promise`, `typescript`, and `unicorn` rules                                                                                                                                                             |
| `@bastidood/oxlint-config/node`                 | Node.js rules                                                                                                                                                                                                                                   |
| `@bastidood/oxlint-config/react`                | React rules; bans effect hooks                                                                                                                                                                                                                  |
| `@bastidood/oxlint-config/react/compiler`       | Turns off memoization rules made obsolete by the React Compiler; compose after `REACT`                                                                                                                                                          |
| `@bastidood/oxlint-config/react/tanstack/table` | Reserved for React Table rules; compose with `TANSTACK_TABLE`                                                                                                                                                                                   |
| `@bastidood/oxlint-config/jsx-a11y`             | JSX accessibility rules                                                                                                                                                                                                                         |
| `@bastidood/oxlint-config/tanstack/query`       | Enables the slopstopper TanStack Query rules: `prefer-query-key-context`, `no-defaulted-query-key`, `no-standalone-mutate-async`, and `no-mutate-callback-cache-update`                                                                         |
| `@bastidood/oxlint-config/tanstack/table`       | Enables the slopstopper TanStack Table rules: `prefer-table-atoms`, `require-table-state-pairs`, `no-render-scoped-table-schema`, and `require-exclusive-indeterminate`; bans `stockFeatures` and reading column templates outside `FlexRender` |
| `@bastidood/oxlint-config/next`                 | Next.js rules                                                                                                                                                                                                                                   |
| `@bastidood/oxlint-config/vitest`               | Vitest rules                                                                                                                                                                                                                                    |

## Limitations

- JavaScript-only projects are not supported.
- Rules are not configurable. Supply only project-specific settings: environments, globals, ignore patterns, and overrides.
- TypeScript configuration files require Node.js 22.18 or later.
- Svelte and Astro files are not linted. Use `@bastidood/eslint-config` for those.

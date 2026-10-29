# `@bastidood/oxlint-config`

Strict, type-aware Oxlint configuration for TypeScript projects.

## Installation

```sh
pnpm add --save-dev @bastidood/oxlint-config oxlint oxlint-plugin-eslint oxlint-tsgolint
```

## Configuration

```ts
// oxlint.config.ts
import { compose } from '@bastidood/oxlint-config';
import { CORE } from '@bastidood/oxlint-config/core';
import { PROMISE } from '@bastidood/oxlint-config/promise';
import { UNICORN } from '@bastidood/oxlint-config/unicorn';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [compose(CORE, UNICORN, PROMISE)],
	env: { node: true },
});
```

Combine entry points with `compose`, not `extends`, so that `no-restricted-*` lists are concatenated instead of replaced. `CORE` turns on type-aware linting and fails on warnings.

## Entry Points

| Entry point                                     | Contents                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `@bastidood/oxlint-config`                      | `compose`                                                                              |
| `@bastidood/oxlint-config/core`                 | ESLint core, `import`, `oxc`, and `typescript` rules                                   |
| `@bastidood/oxlint-config/node`                 | Node.js rules                                                                          |
| `@bastidood/oxlint-config/unicorn`              | `unicorn` rules                                                                        |
| `@bastidood/oxlint-config/promise`              | `promise` rules                                                                        |
| `@bastidood/oxlint-config/react`                | React rules; bans effect hooks                                                         |
| `@bastidood/oxlint-config/react-compiler`       | Turns off memoization rules made obsolete by the React Compiler; compose after `REACT` |
| `@bastidood/oxlint-config/jsx-a11y`             | JSX accessibility rules                                                                |
| `@bastidood/oxlint-config/tanstack-react-query` | Bans `useQueryClient`                                                                  |
| `@bastidood/oxlint-config/next`                 | Next.js rules                                                                          |
| `@bastidood/oxlint-config/vitest`               | Vitest rules                                                                           |
| `@bastidood/oxlint-config/jsdoc`                | JSDoc rules for documentation that TypeScript does not cover                           |

## Limitations

- JavaScript-only projects are not supported.
- Rules are not configurable. Supply only project-specific settings: environments, globals, ignore patterns, and overrides.
- TypeScript configuration files require Node.js 22.18 or later.
- Svelte and Astro files are not linted. Use `@bastidood/eslint-config` for those.

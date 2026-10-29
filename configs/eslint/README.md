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
import { PROMISE } from '@bastidood/eslint-config/promise';
import { UNICORN } from '@bastidood/eslint-config/unicorn';
import { defineConfig } from 'eslint/config';

export default defineConfig({ files: ['**/*.ts'] }, compose(CORE, UNICORN, PROMISE));
```

List `CORE` first.

## Entry Points

| Entry point                        | Contents                                                     |
| ---------------------------------- | ------------------------------------------------------------ |
| `@bastidood/eslint-config`         | `compose`                                                    |
| `@bastidood/eslint-config/core`    | ESLint core, `import`, and `@typescript-eslint` rules        |
| `@bastidood/eslint-config/unicorn` | `unicorn` rules                                              |
| `@bastidood/eslint-config/promise` | `promise` rules                                              |
| `@bastidood/eslint-config/node`    | Node.js rules                                                |
| `@bastidood/eslint-config/vitest`  | Vitest rules                                                 |
| `@bastidood/eslint-config/jsdoc`   | JSDoc rules for documentation that TypeScript does not cover |

## Limitations

- Prefer `@bastidood/oxlint-config` wherever Oxlint can run.
- Rules are not configurable. Supply only project-specific settings, such as `files` and globals.
- No `files` are set. ESLint lints only JavaScript files unless you list others.
- `typescript-eslint` supports TypeScript up to 6.0. On TypeScript 7, alias `typescript` to `@typescript/typescript6`.
- Requires ESLint 10.
- Run ESLint from the directory that contains `tsconfig.json` or a parent directory. Type-aware rules search for `tsconfig.json` only up to the working directory.

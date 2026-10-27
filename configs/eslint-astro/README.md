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

export default defineConfig({ files: ['**/*.ts'] }, compose(CORE, ASTRO));
```

List `ASTRO` after `CORE`.

## Limitations

- Rules are not configurable.
- Covers `.astro` files. List your other files yourself.

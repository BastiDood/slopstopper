# `@bastidood/oxlint-config-tanstack-query`

TanStack Query entries for `@bastidood/oxlint-config`, including the rules of `@tanstack/eslint-plugin-query`.

## Installation

```sh
pnpm add --save-dev @bastidood/oxlint-config-tanstack-query eslint typescript
```

The plugin loads `eslint` and `typescript` at runtime, so both must be installed even though Oxlint runs the rules.

## Configuration

```ts
// oxlint.config.ts
import { compose } from '@bastidood/oxlint-config';
import { TANSTACK_REACT_QUERY } from '@bastidood/oxlint-config-tanstack-query/react';
import { CORE } from '@bastidood/oxlint-config/core';
import { REACT } from '@bastidood/oxlint-config/react';
import { TANSTACK_QUERY } from '@bastidood/oxlint-config/tanstack/query';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [compose(CORE, REACT, TANSTACK_QUERY, TANSTACK_REACT_QUERY)],
});
```

## Entry Points

| Entry point                                     | Contents                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bastidood/oxlint-config-tanstack-query/react` | Enables `@tanstack/eslint-plugin-query` except `no-void-query-fn`, which needs type information; bans `useQueryClient` and keeping the whole `useMutation` result |

## Limitations

- Rules are not configurable.
- `no-void-query-fn` is off because Oxlint does not give type information to JS plugins.

# `@bastidood/eslint-plugin-slopstopper`

Custom lint rules against sloppy code. One plugin runs in both Oxlint (as a JS plugin) and ESLint.

## Installation

```sh
pnpm add --save-dev @bastidood/eslint-plugin-slopstopper
```

`@bastidood/oxlint-config/core` and `@bastidood/eslint-config/core` enable these rules. Install the plugin next to them.

## Rules

Rules marked as derived from `anti-slop` are vendored from [`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop) under the MIT License. [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) lists them with the license text.

| Rule                                                                                             | Reports                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`stepdown-order`](./src/rules/stepdown-order/README.md)                                         | A function or method declared above a function or statement in the same scope that uses it; autofixes the order                                                                                               |
| [`no-private-modifier`](./src/rules/no-private-modifier/README.md)                               | The TypeScript `private` modifier; autofixes to `#private` members                                                                                                                                            |
| [`handle-or-rethrow`](./src/rules/handle-or-rethrow/README.md)                                   | A `catch` that swallows the error, logs and rethrows it, or leaves it unbound                                                                                                                                 |
| [`needless-type-intersection`](./src/rules/needless-type-intersection/README.md)                 | A type alias of object intersections that can be an `interface ... extends`                                                                                                                                   |
| [`no-inferrable-return-type`](./src/rules/no-inferrable-return-type/README.md)                   | An explicit return type that TypeScript can infer; suggests removing it                                                                                                                                       |
| [`no-type-predicates`](./src/rules/no-type-predicates/README.md)                                 | `is` and `asserts` type predicates, which TypeScript does not check                                                                                                                                           |
| [`no-positional-scalars`](./src/rules/no-positional-scalars/README.md)                           | Too many positional parameters of one scalar kind (two `boolean`s or three of another kind by default)                                                                                                        |
| [`no-multiple-optional-parameters`](./src/rules/no-multiple-optional-parameters/README.md)       | Two or more optional parameters                                                                                                                                                                               |
| [`prefer-switch`](./src/rules/prefer-switch/README.md)                                           | An `if` chain of two or more `===` comparisons against the same value                                                                                                                                         |
| [`no-equality-chain`](./src/rules/no-equality-chain/README.md)                                   | An `\|\|` chain of two or more `===` comparisons against the same value that no `prefer-switch` chain claims                                                                                                  |
| [`prefer-de-morgan`](./src/rules/prefer-de-morgan/README.md)                                     | A logical chain that De Morgan's law rewrites with fewer negations, where another rule then removes the outer `!`; autofixes the rewrite                                                                      |
| [`no-negated-group`](./src/rules/no-negated-group/README.md)                                     | A `!` applied to an `&&` or `\|\|` group, outside the positions that `prefer-de-morgan` owns; autofixes with De Morgan's law                                                                                  |
| [`no-negated-quantifier-callback`](./src/rules/no-negated-quantifier-callback/README.md)         | A `.some` or `.every` callback that returns `!p`; rewrites to the dual quantifier with one `!` outside the call, autofixed where types prove the standard method                                              |
| [`merge-exclusive-branches`](./src/rules/merge-exclusive-branches/README.md)                     | Two adjacent `if` statements whose tests split on one condition and its negation; autofixes the merge into one `if`-`else` where safe                                                                         |
| [`prefer-typeof-undefined`](./src/rules/prefer-typeof-undefined/README.md)                       | A `===` or `!==` comparison against `undefined` or `void 0`; autofixes to `typeof x === 'undefined'`                                                                                                          |
| [`no-temporary-access`](./src/rules/no-temporary-access/README.md)                               | A field read off the unnamed result of a call, as in `f().x`; autofixes to a `const` destructuring where safe                                                                                                 |
| [`no-plain-template-literal`](./src/rules/no-plain-template-literal/README.md)                   | An untagged template literal without expressions on one line; autofixes to a quoted string                                                                                                                    |
| [`no-alias-object-type`](./src/rules/no-alias-object-type/README.md)                             | An object type literal nested in a type alias, other than the alias's whole type or a `needless-type-intersection` report                                                                                     |
| [`prefer-class-over-factory`](./src/rules/prefer-class-over-factory/README.md)                   | A module-level function whose every return is an object literal with a function-valued member                                                                                                                 |
| [`prefer-prefix-increment`](./src/rules/prefer-prefix-increment/README.md)                       | `x += 1`, `x -= 1`, or a postfix update whose value is discarded; autofixes to `++x` or `--x` where `x` is proven to be a number                                                                              |
| [`prefer-while-true`](./src/rules/prefer-while-true/README.md)                                   | A `for (;;)` loop; autofixes to `while (true)`                                                                                                                                                                |
| [`destructure-on-sight`](./src/rules/destructure-on-sight/README.md)                             | A parameter or `const` whose every use reads a static property off it; suggests destructuring it at the binding                                                                                               |
| [`no-array-filter-map`](./src/rules/no-array-filter-map/README.md)                               | A `.filter(…).map(…)` or `.map(…).filter(…)` chain on a known array, which walks the elements twice (derived from [anti-slop](./THIRD-PARTY-NOTICES.md))                                                      |
| [`no-reduce-accumulator-copy`](./src/rules/no-reduce-accumulator-copy/README.md)                 | A copy of the `.reduce` accumulator with `Object.assign`, `Array.from`, or an array copy method on every step (derived from [anti-slop](./THIRD-PARTY-NOTICES.md))                                            |
| [`no-conditional-empty-object-spread`](./src/rules/no-conditional-empty-object-spread/README.md) | An object spread of a conditional with an empty object branch, as in `...(c ? { v } : {})` (derived from [anti-slop](./THIRD-PARTY-NOTICES.md))                                                               |
| [`no-known-value-widening`](./src/rules/no-known-value-widening/README.md)                       | An explicit type or assertion that discards the known type of a value, such as `unknown`, `object`, or an open dictionary; suggests `satisfies` for `as` (derived from [anti-slop](./THIRD-PARTY-NOTICES.md)) |
| [`no-unknown-returns`](./src/rules/no-unknown-returns/README.md)                                 | An explicit return type that resolves to `unknown` or `Promise<unknown>` (derived from [anti-slop](./THIRD-PARTY-NOTICES.md))                                                                                 |
| [`no-unknown-type-aliases`](./src/rules/no-unknown-type-aliases/README.md)                       | A type alias that resolves to `unknown` (derived from [anti-slop](./THIRD-PARTY-NOTICES.md))                                                                                                                  |
| [`no-unsafe-dictionary-type`](./src/rules/no-unsafe-dictionary-type/README.md)                   | A dictionary type whose value type is `unknown`, `any`, `object`, `{}`, or a union or alias that holds one (derived from [anti-slop](./THIRD-PARTY-NOTICES.md))                                               |
| [`no-untyped-empty-initializer`](./src/rules/no-untyped-empty-initializer/README.md)             | A binding without an annotation that has no initializer or starts as `[]`, `{}`, or `null`, a `new Map()`, `new WeakMap()`, or `new Set()` without type arguments, or an assertion on an empty literal        |

## Compatibility

- Every rule uses the ESLint rule API, so the same rule runs in Oxlint and ESLint.
- The plugin is typed for Oxlint. In ESLint, use the rules through `@bastidood/eslint-config`, which registers the plugin for you.
- Rules check syntax only by default. Where a rule benefits from type information, it uses it when the linter provides TypeScript's program (typescript-eslint's `parserServices`), and falls back to syntax otherwise. Oxlint's JS plugins do not provide type information, so the same code can pass Oxlint and still fail ESLint with typescript-eslint.

## Configuration

`no-positional-scalars` reports a signature once any scalar kind reaches its threshold of positional parameters. The defaults are `{ boolean: 2, string: 3, number: 3, bigint: 3, symbol: 3 }`; each threshold is at least `2`:

```ts
{ 'slopstopper/no-positional-scalars': ['error', { string: 2 }] }
```

## Limitations

- Apart from the `no-positional-scalars` thresholds, rules are not configurable.

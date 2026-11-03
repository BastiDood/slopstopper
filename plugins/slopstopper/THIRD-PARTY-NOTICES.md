# Third-Party Notices

`@bastidood/eslint-plugin-slopstopper` includes code derived from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at commit [`13909c9e`](https://github.com/dmmulroy/anti-slop/tree/13909c9e), which is distributed under the MIT License below. The tables below list every derived file by its path in this package.

## Derived Rules

| File                                                         | Upstream source                                        |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| `src/rules/no-array-filter-map/index.ts`                     | `src/rules/no-array-filter-map.ts`                     |
| `src/rules/no-array-filter-map/index.spec.ts`                | `src/rules/no-array-filter-map.test.ts`                |
| `src/rules/no-reduce-accumulator-copy/index.ts`              | `src/rules/no-reduce-accumulator-copy.ts`              |
| `src/rules/no-reduce-accumulator-copy/index.spec.ts`         | `src/rules/no-reduce-accumulator-copy.test.ts`         |
| `src/rules/no-conditional-empty-object-spread/index.ts`      | `src/rules/no-conditional-empty-object-spread.ts`      |
| `src/rules/no-conditional-empty-object-spread/index.spec.ts` | `src/rules/no-conditional-empty-object-spread.test.ts` |
| `src/rules/no-known-value-widening/index.ts`                 | `src/rules/no-known-value-widening.ts`                 |
| `src/rules/no-known-value-widening/index.spec.ts`            | `src/rules/no-known-value-widening.test.ts`            |
| `src/rules/no-unknown-returns/index.ts`                      | `src/rules/no-unknown-returns.ts`                      |
| `src/rules/no-unknown-returns/index.spec.ts`                 | `src/rules/no-unknown-returns.test.ts`                 |
| `src/rules/no-unknown-type-aliases/index.ts`                 | `src/rules/no-unknown-type-aliases.ts`                 |
| `src/rules/no-unknown-type-aliases/index.spec.ts`            | `src/rules/no-unknown-type-aliases.test.ts`            |
| `src/rules/no-unsafe-dictionary-type/index.ts`               | `src/rules/no-unsafe-dictionary-type.ts`               |
| `src/rules/no-unsafe-dictionary-type/index.spec.ts`          | `src/rules/no-unsafe-dictionary-type.test.ts`          |

## Derived Helpers

| File                                                    | Upstream source                       |
| ------------------------------------------------------- | ------------------------------------- |
| `src/ast/known-arrays.ts`                               | `src/shared/array-method.ts`          |
| `src/ast/type-aliases.ts`                               | `src/shared/type-alias-resolution.ts` |
| `src/ast/dictionary-types.ts`                           | `src/shared/dictionary-types.ts`      |
| `src/rules/no-known-value-widening/widening-targets.ts` | `src/shared/dictionary-types.ts`      |

## License

```text
MIT License

Copyright (c) 2026 Dillon Mulroy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

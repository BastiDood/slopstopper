# `slopstopper/no-reduce-accumulator-copy`

Reports a copy of the accumulator inside the callback of `.reduce` or `.reduceRight`, which copies a growing value on every step and makes the reduction quadratic. Copies are `Object.assign({}, ..., acc, ...)` with the global `Object`, `Array.from(acc)` with the global `Array`, and `acc.concat`, `acc.slice`, `acc.toSpliced`, `acc.toSorted`, `acc.toReversed`, or `acc.with` on an array accumulator. The accumulator is an array when the initial value is a known array (see [`no-array-filter-map`](../no-array-filter-map/README.md)), or, with type information, when the type checker resolves the copy method to the standard one of `Array` or `ReadonlyArray`. The accumulator also matches through `const` aliases and TypeScript assertions.

## Examples

Incorrect:

```ts
const byId = items.reduce((acc, item) => Object.assign({}, acc, { [item.id]: item }), {});
const all = groups.reduce((acc, group) => acc.concat(group), []);
const sorted = items.reduce((acc, item) => acc.toSpliced(rank(acc, item), 0, item), []);
```

Correct:

```ts
const byId = items.reduce((acc, item) => {
	acc[item.id] = item;
	return acc;
}, {});
const all = groups.reduce((acc, group) => {
	acc.push(...group);
	return acc;
}, []);
const sorted = items.reduce((acc, item) => {
	acc.splice(rank(acc, item), 0, item);
	return acc;
}, []);
```

## No Autofix

The rule reports without a rewrite. Mutating the accumulator in place changes behavior when the initial value is shared, such as a module-level constant or a parameter, so the author must start from a fresh initial value. The message names the in-place method to call instead.

## Limitations

- Spreads of the accumulator, as in `[...acc, item]` or `{ ...acc, item }`, are left to `oxc/no-accumulating-spread`.
- A copy inside a nested function in the callback is not reported.
- A copy through an alias that is not a `const`, or through a property of the accumulator, is not reported.
- Without type information, an array copy method is not reported when the initial value is missing or has no local array evidence.

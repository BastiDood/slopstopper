# `slopstopper/no-array-filter-map`

Reports `xs.filter(f).map(g)` and `xs.map(f).filter(g)` on an array, which builds an intermediate array and walks the elements twice. The receiver counts as an array when it is an array literal, a `map`, `filter`, `flatMap`, `slice`, `concat`, `toSorted`, `toReversed`, or `toSpliced` call on a known array, a never-reassigned binding annotated as an array or tuple type, `Array<T>`, or `ReadonlyArray<T>`, or a `const` initialized with a known array. With type information, the receiver also counts when the type checker resolves the inner method to the standard one of `Array` or `ReadonlyArray`. Iterator helper pipelines are lazy already and stay unreported.

Do the work in one pass instead: a single loop or a single `.flatMap`, or lazy iterator helpers (`.values()`) where the runtime supports them.

## Examples

Incorrect:

```ts
const emails = users.filter(user => user.active).map(user => user.email);
const names = [...ids].map(lookup).filter(Boolean);
```

Correct:

```ts
const emails = users.flatMap(user => (user.active ? [user.email] : []));

const names = [];
for (const id of ids) {
	const name = lookup(id);
	if (name) names.push(name);
}

// Where the runtime supports iterator helpers (ES2025):
for (const email of users
	.values()
	.filter(user => user.active)
	.map(user => user.email))
	notify(email);
```

## No Autofix

The rule reports without a rewrite. Iterator helpers pass neither the index nor the array to the callbacks, ignore a `thisArg`, run the two callbacks interleaved per element instead of one pass after the other, and need an ES2025 runtime. Merging the callbacks into one `.flatMap` needs a decision that only the author can make.

## Limitations

- Without type information, a receiver without local array evidence is not reported, such as a call result or an unannotated parameter.
- Typed arrays and other array-like receivers are not reported.
- Pairs other than `filter` with `map`, such as `map` with `map`, are not reported.

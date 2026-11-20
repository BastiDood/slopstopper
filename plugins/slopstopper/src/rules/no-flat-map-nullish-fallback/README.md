# `slopstopper/no-flat-map-nullish-fallback`

Reports a `.flatMap` callback that returns `<value> ?? []`, as in `xs.flatMap(x => x?.y ?? [])`. The empty array fallback hides that a value is missing: the callback flattens present arrays and silently drops absent ones.

Construct the result explicitly instead. Choose the form by what the callback does:

- **It only collects values into one result:** use `.reduce`. Push each present value in an `if` that checks for the missing one, then return the accumulator. Pass the element type as the generic, as in `.reduce<Summary[]>(…, [])`, so that the empty initial array does not infer `never[]`.
- **It has other side effects or builds several results:** use a `for…of` loop. A `.reduce` callback should do nothing but fill its one accumulator.
- **It maps each element to at most one value:** an explicit ternary that returns `[]` for the missing value also works.

The callback's return counts as an arrow function's expression body or the argument of a `return` statement, seen through TypeScript assertions. Any `.flatMap` call counts, whatever its receiver, including iterator helpers.

## Examples

Incorrect:

```ts
const summaries = runs.flatMap(({ baseline }) => baseline?.summary ?? []);
const names = items.flatMap(item => {
	return lookup(item) ?? [];
});
```

Correct:

```ts
const summaries = runs.reduce<Summary[]>((found, { baseline }) => {
	if (typeof baseline !== 'undefined') found.push(...baseline.summary);
	return found;
}, []);

// A loop for a callback that builds several results.
const names: string[] = [];
const missing: Item[] = [];
for (const item of items) {
	const name = lookup(item);
	if (typeof name === 'undefined') missing.push(item);
	else names.push(name);
}

// The explicit ternary form that `no-array-filter-map` recommends.
const emails = users.flatMap(user => (user.active ? [user.email] : []));
```

## No Autofix

The rule reports without a rewrite. The author must choose between a `.reduce`, a `for…of` loop, and an explicit ternary. Each needs a presence check that matches the type of the value.

## Limitations

- An `||` fallback, as in `xs.flatMap(x => x.items || [])`, is left to [`no-non-boolean-logical`](../no-non-boolean-logical/README.md).
- A fallback nested inside the returned value, as in `xs.flatMap(x => [x.items ?? []])`, or in a branch of a returned conditional is not reported.
- A callback passed by reference, as in `xs.flatMap(itemsOf)`, is not reported.

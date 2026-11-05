# `slopstopper/prefer-query-key-context`

Reports a value that the inline `queryFn` of a TanStack Query captures from its closure while the sibling `queryKey` holds it too. TanStack Query passes the key to `queryFn` in the query function context, so reading the value from there keeps the fetch in step with the cache entry that the key names. The rule checks every object literal with a `queryKey` property and a `queryFn` property whose value is an inline function, such as the options of `queryOptions`, `useQuery`, or Svelte's `createQuery(() => ({ ... }))`.

Inside `queryFn`, the rule looks at each value read that resolves outside of `queryFn` and reports it when it reads:

- a variable that the key reads, or a static member path of one: a key that holds `filters.status` reports `filters.status`, and a key that holds `filters` reports every read of `filters`;
- the key binding itself when the key is a name, as in `queryKey[1]` or `queryKey.at(1)`;
- a `.queryKey` member of a captured object, as in `opts.queryKey` or `jobQueries.detail(id).queryKey`;
- a call with the same tokens and bindings as a key that is a call, such as a repeated key factory call `keys.detail(id)`.

Each offending expression is reported once, at the outermost match, so a repeated `keys.detail(id)` does not report `id` again. The rule uses scope analysis, so the context parameter of `queryFn` and its destructuring, the locals of `queryFn`, and any binding that shadows a captured name are never reported. Captures and module values that the key does not hold are not reported either.

## Examples

Incorrect:

```ts
const job = (id: string) =>
	queryOptions({
		queryKey: ['job', id],
		queryFn: () => fetchJob(id),
	});

const detail = (id: string) =>
	queryOptions({
		queryKey: keys.detail(id),
		queryFn: () => fetchJob(keys.detail(id)[1]),
	});
```

Correct:

```ts
const job = (id: string) =>
	queryOptions({
		queryKey: ['job', id],
		queryFn: ({ queryKey: [, jobId] }) => fetchJob(jobId),
	});

const detail = (id: string) =>
	queryOptions({
		queryKey: keys.detail(id),
		queryFn: ({ queryKey }) => fetchJob(queryKey[1]),
	});
```

## No Autofix

The rule reports without a rewrite. Where a value sits in the key, and how to read it back from the query function context, depends on the shape of the key, which the rule cannot prove from a closure capture.

## Limitations

- A `queryFn` that is not an inline function, such as `queryFn: fetchJob`, is not checked.
- A key that holds a value only through a binding, as in `const queryKey = ['job', id]` with `queryKey` in the options, does not make `id` a key value.
- A member path in the key counts only when every access in it is a static member read, so a callee such as `keys.detail` in `keys.detail(id)`, a method call such as `filters.status.toString()`, and a dynamic read such as `items[i]` add no path. The bindings inside them, such as `id` and `i`, still count.
- A value that the key reads inside a function nested in the key does not count, and neither does a global that no declaration binds.
- A read through `this`, as in `this.queryKey` or `this.id`, is not reported.

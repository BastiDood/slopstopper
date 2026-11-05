# `slopstopper/no-defaulted-query-key`

Reports a defaulted value in the `queryKey` of a TanStack Query. A defaulted key shares its cache entry with the real value that equals the default, so a query for an absent value reads and writes the cache entry of a present one. Keep the absent value in the key and disable the query with `skipToken` instead.

The rule checks the value of every `queryKey` property in an object literal, including the arguments of key factory calls in it, and reports:

- a `??` or `||` expression anywhere in the key;
- a name in the key whose only definition has a default value, as a parameter such as `page = 1` or a destructured binding such as `{ status = 'open' }` does, or that is a `const` initialized with a `??` or `||` expression, directly or through `const` aliases.

A name inside a reported `??` or `||` expression is not reported again.

## Examples

Incorrect:

```ts
const jobs = (status?: Status) =>
	queryOptions({
		queryKey: ['jobs', status ?? 'open'],
		queryFn: ({ queryKey: [, status] }) => listJobs(status),
	});

const page = (page = 1) =>
	queryOptions({
		queryKey: ['jobs', page],
		queryFn: ({ queryKey: [, page] }) => listJobs(page),
	});
```

Correct:

```ts
const jobs = (status?: Status) =>
	queryOptions({
		queryKey: ['jobs', status],
		queryFn:
			typeof status === 'undefined' ? skipToken : ({ queryKey: [, status] }) => listJobs(status),
	});
```

## No Autofix

The rule reports without a rewrite. Removing the default changes the key, and the query needs `skipToken` or another way to handle the absent value, which only the author can decide.

## Limitations

- A default inside a function nested in the key, such as `ids.map(id => id ?? 0)`, is not reported.
- A `let` or `var` initialized with a `??` or `||` expression is not reported, and neither is a name that gets its default from a function call or a property read.
- A `?:` conditional that picks a fallback value, as in `id === undefined ? 0 : id`, is not reported.

# `slopstopper/no-mutate-callback-cache-update`

Reports a `QueryClient` cache update inside the per-call callbacks of a TanStack Query `mutate` call. TanStack Query does not run the callbacks passed to `mutate` when the component unmounts before the mutation finishes, or when a later call of the same mutation replaces this one. A cache update there can silently not run and leave stale data. The callbacks of the mutation definition always run, so cache updates belong there, and the callbacks of `mutate` keep only UI consequences such as closing a dialog.

A cache update is a member call of `invalidateQueries`, `refetchQueries`, `resetQueries`, `removeQueries`, `cancelQueries`, `setQueryData`, or `setQueriesData`, anywhere inside the object literal that is the second argument of a call to `mutate`, including nested functions and blocks. The callee is `mutate` when it is any of these:

- A member named `mutate`, on any object, such as `mutation.mutate` on a result of `createMutation`, which Svelte keeps whole.
- An identifier bound to the `mutate` field of a `useMutation` or `createMutation` result under any local name, as in `const { mutate: save } = useMutation(options)`, or a `const` alias of one. The factory is imported from any `@tanstack/*-query` package under any local name, or is a global that no declaration binds.
- An identifier named `mutate` that the rule cannot trace, such as a prop or a field of a custom hook.

Cache updates in the options of `useMutation` or `createMutation` are not reported.

## Examples

Incorrect:

```ts
const { mutate } = useMutation({ mutationFn: saveTodo });
mutate(todo, {
	onSuccess: () => {
		queryClient.invalidateQueries({ queryKey: ['todos'] });
		close();
	},
});
```

Correct:

```ts
const { mutate } = useMutation({
	mutationFn: saveTodo,
	onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
});
mutate(todo, { onSuccess: close });
```

## No Autofix

The rule reports without a rewrite. Moving the update needs the mutation definition, which can live in another module and can serve several calls.

## Limitations

- An identifier bound by a `let` or `var`, a nested pattern, or a namespace import such as `Query.useMutation` is traced only by its name.
- Callbacks that are not an object literal in place, such as `mutate(input, callbacks)`, are not inspected.
- A cache update through a computed or aliased method, such as `const { invalidateQueries } = queryClient`, is not reported.

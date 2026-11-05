# `slopstopper/no-standalone-mutate-async`

Reports a use of a TanStack Query mutation's `mutateAsync`, as a reference or a call, in favor of `mutate` with its callbacks. `mutate` handles the outcome in `onSuccess`, `onError`, and `onSettled`, and never rejects, while an awaited `mutateAsync` needs its own error handling and keeps running code after the component unmounts. `mutateAsync` remains the tool for concurrent mutations, so a use inside a `Promise` combinator is exempt.

A use is any of these:

- A member named `mutateAsync`, on any object, such as `mutation.mutateAsync` on a result of `createMutation`, which Svelte keeps whole.
- An identifier bound to the `mutateAsync` field of a `useMutation` or `createMutation` result under any local name, as in `const { mutateAsync: save } = useMutation(options)`, or a `const` alias of one. The factory is imported from any `@tanstack/*-query` package under any local name, or is a global that no declaration binds.
- An identifier named `mutateAsync` that the rule cannot trace, such as a prop or a field of a custom hook.

The destructuring pattern is no use, and neither is the initializer of a `const` alias, whose own uses are reported.

A use is exempt when it runs concurrently: its call is an element of an array literal, or a callback of `xs.map` returns its call or is the reference itself, and that array literal or `map` call is the only argument of `Promise.all`, `Promise.allSettled`, `Promise.race`, or `Promise.any` on the global `Promise`.

## Examples

Incorrect:

```ts
const { mutateAsync } = useMutation({ mutationFn: saveTodo });
async function submit(todo: Todo) {
	await mutateAsync(todo);
	close();
}

const mutation = createMutation(() => ({ mutationFn: saveTodo }));
await mutation.mutateAsync(todo);
```

Correct:

```ts
const { mutate } = useMutation({ mutationFn: saveTodo });
function submit(todo: Todo) {
	mutate(todo, { onSuccess: close });
}

// Concurrent mutations.
const { mutateAsync } = useMutation({ mutationFn: saveTodo });
await Promise.all(todos.map(todo => mutateAsync(todo)));
await Promise.allSettled([mutateAsync(first), mutateAsync(second)]);
```

## No Autofix

The rule reports without a rewrite. Replacing `mutateAsync` with `mutate` moves the code that follows the `await` into callbacks and drops the error handling around it, which is a restructuring that the author must do.

## Limitations

- An identifier bound by a `let` or `var`, a nested pattern, or a namespace import such as `Query.useMutation` is traced only by its name.
- A concurrent call that is wrapped, as in `Promise.all([track(mutateAsync(a))])` or `items.map(async item => await mutateAsync(item))`, is reported.
- A use inside a combinator that other code builds, such as an array that a variable holds, is reported.

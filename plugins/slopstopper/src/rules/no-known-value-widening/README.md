# `slopstopper/no-known-value-widening`

Reports a value whose type the code already knows that flows into an explicit type that discards it. A value has a known type when it is an object, array, function, or class literal, a `new` expression, a literal, a template literal, or a unary expression, directly or through `const` bindings. The explicit type discards it when it is `unknown`, `object`, an anonymous object type, an object type with an index signature, a mapped type, or a global `Record` with a `string`, `number`, `symbol`, or `PropertyKey` key, seen through global `Readonly`, `Partial`, `Required`, and `NonNullable`. A same-file alias names a contract, so it discards the type only when it resolves to `unknown`, `object`, or such a dictionary.

The rule checks variable and class property annotations, assignments to an annotated variable, return types, and type assertions. An empty object literal may start a dictionary. It also reports a value with a known type, or a binding or call with an informative type, that a call passes to the `unknown` parameter of a same-file type guard, which only re-checks it.

## Examples

Incorrect:

```ts
const commands: Record<string, Command> = { start: startCommand };
const config = { retries: 3 } as object;
function create(): unknown {
	return { id: 1 };
}

function isString(value: unknown): value is string {
	return typeof value === 'string';
}
isString('known');
```

Correct:

```ts
const commands = { start: startCommand } satisfies Record<string, Command>;
const handlers: Record<string, Handler> = {};
const labels: Record<Diet, string> = { vegan: 'V', omnivore: 'O' };

interface Commands {
	readonly start: Command;
}
const named: Commands = { start: startCommand };
```

## Suggestion

An `as` assertion gets a suggestion that replaces `as` with `satisfies`, which keeps the runtime value and checks it against the type. The suggestion is no autofix, because later code may rely on the asserted type, such as adding keys to a dictionary. An angle-bracket assertion and every other report have no rewrite.

## Limitations

- Aliases, interfaces, and functions declared in other files are not resolved.
- A value that only type information knows, such as a call result, is not reported, except as an argument of a type guard.
- A destructuring declaration is not reported.
- A type assertion on an empty literal, `[]`, `{}`, or `null`, is left to `no-untyped-empty-initializer`, because `satisfies` would keep its empty type.

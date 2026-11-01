# `slopstopper/no-type-predicates`

Reports type predicates (`x is T`, `this is T`) and assertion signatures (`asserts x`, `asserts x is T`, `asserts this`). TypeScript does not check that a function's body proves its predicate or throws when its assertion fails, so the annotation can lie.

Let TypeScript infer the predicate instead: TypeScript 5.5+ infers type predicates from bodies such as `x => x !== null`. TypeScript never infers `asserts` signatures, so return the parsed value instead of asserting it.

## Examples

Incorrect:

```ts
function isString(x: unknown): x is string {
	return typeof x === 'string';
}
function assertString(x: unknown): asserts x is string {
	if (typeof x !== 'string') throw new Error();
}
type Guard = (x: unknown) => x is string;
```

Correct:

```ts
// TypeScript infers `x is number` from the body.
const isDefined = (x: number | null) => x !== null;

function isString(x: unknown): boolean {
	return typeof x === 'string';
}
```

## Limitations

- The rule has no exemptions. It reports every return type position, including overloads, `declare` functions, function types, method signatures, and call signatures.

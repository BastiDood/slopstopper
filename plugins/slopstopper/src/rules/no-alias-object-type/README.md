# `slopstopper/no-alias-object-type`

Reports an object type literal anywhere inside the type of a type alias: in union members, `| null`, intersections, function parameters and returns, generic arguments, tuple elements, and mapped type values. Declare the object shape as a named `interface` and reference it: named interfaces give readable errors and declarations.

A literal nested inside a reported literal is not reported again.

## Examples

Incorrect:

```ts
type Result = { ok: true; value: string } | { ok: false; error: Error };
type Maybe = { a: 1 } | null;
type Handler = (event: { type: string }) => void;
type Box<T> = T & { value: T };
type Pending = Promise<{ id: string }>;
```

Correct:

```ts
interface Success {
	ok: true;
	value: string;
}
interface Failure {
	ok: false;
	error: Error;
}
type Result = Success | Failure;

// An empty object type has no useful interface to replace it.
type Name = string & {};

// A mapped type is not an object type literal.
type Partial<T> = { [K in keyof T]?: T[K] };
```

## Ownership

- An alias whose whole type is one literal, as in `type X = { a: 1 }`, is left to `typescript/consistent-type-definitions`.
- An intersection that [`needless-type-intersection`](../needless-type-intersection/README.md) reports, as in `type X = Base & { a: 1 }`, is left to that rule.

## Limitations

- The rule has no fix, because the new interface needs a name.
- Only type aliases are checked. Literals in type parameter constraints and defaults, variable annotations, and parameter types are not reported.

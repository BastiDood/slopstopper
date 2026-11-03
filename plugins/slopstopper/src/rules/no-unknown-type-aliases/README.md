# `slopstopper/no-unknown-type-aliases`

Reports a type alias whose type resolves to `unknown`, which hides behind a name that the value is still unchecked. The type resolves to `unknown` when it is `unknown`, a union that holds `unknown` (which absorbs the other members), or a reference to a same-file alias or generic alias instance that resolves to `unknown`. References follow the scope of each name, so a type parameter, a mapped type key, or an `infer` binding shadows an alias of the same name.

## Examples

Incorrect:

```ts
type Payload = unknown;
type Input = string | unknown;
type Identity<T> = T;
type Response = Identity<unknown>;
```

Correct:

```ts
type Payload = { readonly id: string };
type Box<T> = { readonly value: T };
type Response = Box<unknown>;

function parse(input: unknown): Payload {
	// ...
}
```

## No Autofix

The rule reports without a rewrite. Each use of the alias needs a decision: write `unknown` where the value is still unchecked, or the checked type where the code has already validated it.

## Limitations

- Aliases and interfaces declared in other files are not resolved.
- Conditional, mapped, and indexed access types are not evaluated.

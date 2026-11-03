# `slopstopper/no-unknown-returns`

Reports an explicit return type that resolves to `unknown`, which hands every caller a value to check that the function could have checked once. The return type resolves to `unknown` when it is `unknown`, a union that holds `unknown`, a global `Promise` or `PromiseLike` of such a type, or a reference to a same-file alias or generic alias instance that resolves to one of these. The rule checks functions, methods, overloads, `declare` functions, and function, constructor, call, construct, and method signatures.

## Examples

Incorrect:

```ts
function load(): unknown {
	return JSON.parse(text);
}
type Loader = () => Promise<unknown>;
type Result = string | unknown;
declare function read(): Result;
```

Correct:

```ts
function load(): User {
	return parseUser(JSON.parse(text));
}
type Loader = () => Promise<User>;

// `unknown` nested in a field stays visible to the caller.
function fail(): { cause: unknown } {
	// ...
}
```

## No Autofix

The rule reports without a rewrite. The fix moves validation into the function, which only the author can write.

## Limitations

- Aliases declared in other files are not resolved, and neither is a local type named `Promise`.
- An inferred return type of `unknown` is not reported.

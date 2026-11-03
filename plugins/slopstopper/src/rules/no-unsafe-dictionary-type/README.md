# `slopstopper/no-unsafe-dictionary-type`

Reports a dictionary type whose value type promises nothing about its values. A dictionary type is a global `Record<K, V>`, an object type with an index signature, or a mapped type. Its value type promises nothing when it is `unknown`, `any`, `object`, an empty object type (one whose every member, if any, is an optional `never` property, or a same-file interface like it), a union with such a member, or an intersection whose every member is one or one of which is `any`. Global `Readonly`, `Partial`, `Required`, `NonNullable`, `Pick`, and `Omit` and same-file aliases and their type arguments are seen through, and a local type with one of these names shadows the global.

Only the outermost dictionary type reports. A type parameter constraint, as in `T extends Record<string, unknown>`, is exempt, and a plain reference to an unsafe alias outside type alias declarations is left to the report on the alias.

## Examples

Incorrect:

```ts
type Metadata = Record<string, unknown>;
type Handlers = { [event: string]: any };
interface Escape {}
type Registry = Record<string, Escape>;
type Index<T> = Record<string, T>;
type Payloads = Index<unknown>;
```

Correct:

```ts
type Metadata = Record<string, JsonValue>;
type Handlers = { [event: string]: Handler };
type Registry = Record<string, { readonly payload: unknown }>;
type Cache = Map<string, unknown>;

function merge<T extends Record<string, unknown>>(target: T, source: Partial<T>) {
	// ...
}
```

## No Autofix

The rule reports without a rewrite. Only the author knows the concrete value type, and untrusted data needs a parser before it enters the dictionary.

## Limitations

- Aliases and interfaces declared in other files are not resolved.
- `Map`, `WeakMap`, and other dictionary classes are not reported.

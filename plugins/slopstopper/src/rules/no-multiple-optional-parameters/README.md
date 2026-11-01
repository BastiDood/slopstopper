# `slopstopper/no-multiple-optional-parameters`

Reports a signature with two or more optional parameters. Group them into one `options: Partial<Options>` parameter so that callers name each value instead of padding positions with `undefined`.

## Examples

Incorrect:

```ts
function f(a?: number, b?: string) {}
function g(a = 1, b = 2) {}
interface A {
	m(a?: number, b?: number): void;
}
```

Correct:

```ts
function f(a: number, options: Partial<Options> = {}) {}
function g(a?: number, ...rest: number[]) {}
```

## Limitations

- A parameter is optional when it has a `?` or a default value, including destructured parameters and constructor parameter properties. Rest parameters do not count.
- The rule checks every signature kind: functions, methods, overloads, `declare` functions, function types, method signatures, call signatures, and construct signatures. Callbacks are not exempt.

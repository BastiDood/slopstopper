# `slopstopper/no-positional-scalars`

Reports a signature that takes too many positional parameters of one scalar kind (`boolean`, `string`, `number`, `bigint`, or `symbol`). Callers can swap same-kind values without a type error, so pass them in one object parameter where each value is named. Parameters of different kinds cannot be swapped silently, so `(name: string, age: number)` is fine.

## Examples

Incorrect:

```ts
function f(a: boolean, b: boolean) {}
function g(a: string, b: string, c: string) {}
function h(a = true, b = false) {}
type F = (a: boolean, b: boolean) => void;
```

Correct:

```ts
function f(from: string, to: string, count: number, enabled: boolean) {}
function g({ a, b }: { a: boolean; b: boolean }) {}

// The callee dictates the signature of callbacks.
items.reduce((a: boolean, b: boolean) => a);
```

How parameters count:

- Literal and template literal types count toward their base kind (`'x'` and `` `id-${string}` `` are strings).
- An unannotated parameter counts by its literal default value (`a = true` is a boolean).
- A union counts toward every scalar kind it contains, ignoring `null` and `undefined`. A union with any non-scalar member does not count.
- The `this` parameter, destructured parameters, and rest parameters do not count.

## Options

The rule reports a signature once any kind reaches its threshold. The defaults are `{ boolean: 2, string: 3, number: 3, bigint: 3, symbol: 3 }`: two booleans (the boolean trap) or three of any other kind. Each threshold is an integer of at least `2`, and unset kinds keep their defaults.

```ts
{ 'slopstopper/no-positional-scalars': ['error', { string: 2 }] }
```

## Type Information

With typescript-eslint type information, the rule resolves type references to their scalar kinds, so `type Id = string; function f(a: Id, b: Id, c: Id) {}` is reported. A parameter that the syntax does not classify as scalar, such as `Id` or an unannotated parameter with a non-literal default value, counts by its resolved type under the same rules: each union member assignable to a scalar kind counts toward it, `null` and `undefined` count toward none, and any other member makes the parameter non-scalar. Intersections such as a branded `string & { brand: 'Id' }` are non-scalar, because callers cannot swap differently branded values. `any`, `unknown`, and `never` never count.

## Limitations

- Without type information, type references such as `Id` in `type Id = string` are never scalars.
- Functions passed directly as arguments to a call or `new`, and functions in JSX attributes (`onChange={(a, b) => {}}`), are exempt because the callee dictates their signature.
- Exported APIs are not exempt.

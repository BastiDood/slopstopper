# `slopstopper/no-inferrable-return-type`

Reports an explicit return type annotation on a function with a body, because TypeScript already infers the return type from the body. Consistency checks are left to `tsc`.

An annotation stays allowed when it carries information that inference cannot:

- `never` on a function whose own body has no `return`, so `tsc` verifies that the function cannot complete.
- A function with two or more value-returning `return` statements, where the annotation constrains the union.
- A recursive function, by its own name, the variable it initializes, or `this.<method>` through any static key (`m`, `'m'`, `['m']`, `#m`), which `tsc` cannot infer.
- A type predicate or `asserts` signature, which [`no-type-predicates`](../no-type-predicates/README.md) reports instead.

## Examples

Incorrect:

```ts
function f(): number {
	return 1;
}
const g = (): never => fail();
class A {
	m(): number {
		return this.n();
	}
}
```

Correct:

```ts
function f() {
	return 1;
}
function fail(): never {
	throw new Error();
}
function pick(x: boolean): number | string {
	if (x) return 1;
	return 'a';
}
function fact(n: number): number {
	return n <= 1 ? 1 : n * fact(n - 1);
}
declare function h(): number;
```

## Autofix

The rule offers a suggestion, not an autofix, because removing the annotation can change the inferred public type. The suggestion removes the annotation and the whitespace before its colon.

## Type Information

With typescript-eslint type information, the rule resolves dynamic computed keys for recursion, such as `[KEY]` with `const KEY = 'walk'`, so a method that calls itself through `this.walk()` keeps its annotation.

## Limitations

- Without type information, a method with a dynamic computed key (such as `[KEY]`) is not matched against `this.<method>` calls, so its annotation is reported even when it recurses.
- A bare `return` does not count as a value-returning branch. Returns inside nested functions do not count toward the outer function.
- Only `this` inside the method itself or arrow functions within it counts for recursion. A nested `function` rebinds `this`.
- Overload signatures and `declare` functions have no body and are not checked.

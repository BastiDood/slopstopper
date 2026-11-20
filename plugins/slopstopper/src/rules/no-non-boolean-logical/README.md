# `slopstopper/no-non-boolean-logical`

Reports an `&&` or `||` whose value is used and whose right operand is no boolean, as in `const extra = c && { v }`, `{open && <Panel />}`, or `const items = list || []`.

Such an expression yields one operand or the other. Its value mixes a boolean with something else, such as `false | { v }`. Use `&&` and `||` only between booleans. Choose the value in an `if` statement or with a conditional expression. For a nullish default, use `??`.

Only the right operand is checked. [`typescript/strict-boolean-expressions`](https://typescript-eslint.io/rules/strict-boolean-expressions/) checks the left one. It also checks the right operand where only the truthiness of the expression is read. Those positions are not reported:

- The test of an `if`, a loop, or a conditional.
- The operand of `!`.
- The left operand of another `&&` or `||`.
- The return of an array predicate callback. That callback is the first argument of `filter`, `find`, `findIndex`, `findLast`, `findLastIndex`, `some`, or `every`.

These positions follow other rules:

- An expression statement such as `ready && run()` is not reported. `no-unused-expressions` reports it.
- A concise arrow body returns its value. So `() => open && close()` is reported with type information. Write an `if` statement in a block body instead.
- An `&&=` or `||=` assigns its value. It is reported as a statement too, as in `options.items ||= []`. Use `??=` for a nullish default. Where only its truthiness is read, as in `if ((box.items ||= []))`, it is left to `typescript/strict-boolean-expressions`.
- A `??` is not checked.

With type information, a right operand counts as a boolean when its type is assignable to `boolean`. That accepts `true`, `false`, `boolean`, `never`, and `any`.

Without type information, as in Oxlint, only an operand that is visibly no boolean is reported:

- An object, array, string, number, bigint, regular expression, `null`, or template literal.
- A function or class.
- JSX.
- A `new`, update, or `import()` expression.
- The global `undefined`.
- A unary operator other than `!` and `delete`, or an arithmetic or bitwise operator.
- A conditional whose branch is visibly no boolean, or a `??` whose fallback is.

## Examples

Incorrect:

```tsx
const extra = verbose && { trace: true };
const request = { url, ...(verbose && { trace: true }) };
const view = <div>{open && <Panel />}</div>;
const items = list || [];
const name = given || 'anonymous';
options.items ||= [];
```

Correct:

```tsx
const request: Request = { url };
if (verbose) request.trace = true;

const view = <div>{open ? <Panel /> : null}</div>;
const items = list ?? [];
const name = given ?? 'anonymous';
options.items ??= [];
const visible = ready && !hidden;
```

## No Autofix

The rule reports without a rewrite. `a && b` equals `a ? b : a`, which keeps the mixed value. `a || b` differs from `a ?? b` when `a` is a falsy value that is not nullish, such as `''` or `0`. The author must choose the value that the code needs.

## Limitations

- Without type information, an operand that can be a boolean is not reported, as in `c && value` or `c && read()`.
- Without type information, a predicate callback is recognized by its method name alone. So `query.filter(() => c && 'x')` is not reported for a `query` that is no array.
- An argument of an assertion function, as in `assert(c && label)`, draws this rule and `typescript/strict-boolean-expressions`. The public type checker API does not show which parameter a signature asserts.

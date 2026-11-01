# `slopstopper/prefer-typeof-undefined`

Reports a `===` or `!==` comparison against `undefined` in favor of `typeof x === 'undefined'`, so that every absence check reads the same. `undefined` counts when it is the global `undefined` or `void` of a literal, as in `void 0`.

## Examples

Incorrect:

```ts
const a = x === undefined;
const b = undefined !== user.name;
const c = x === void 0;
```

Correct:

```ts
const a = typeof x === 'undefined';
const b = typeof user.name !== 'undefined';
const c = typeof x === 'undefined';

// `eqeqeq` owns loose equality, which also matches `null`.
const d = x == undefined;
```

## Autofix

The fix rewrites `x === undefined` to `typeof x === 'undefined'` and keeps the operator. `typeof` goes on the left when the operands are reversed, and the operand gets parentheses when it binds looser than `typeof`, as in `typeof (a ?? b)`. The operand is evaluated once either way.

The two forms differ only for an undeclared identifier, where the plain comparison throws and TypeScript already rejects the code, so the fix preserves behavior. The rule reports without fixing when a comment outside the operand would be dropped.

## Limitations

- `==` and `!=` are not reported.
- A local binding named `undefined` is not reported.

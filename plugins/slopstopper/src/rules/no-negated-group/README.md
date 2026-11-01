# `slopstopper/no-negated-group`

Reports a `!` applied to an `&&` or `||` group, as in `!(a && b)` or `!(a || b)`. Distributing the negation over the operands with De Morgan's law reads better. When the condition guards a block, inverting it into an early return often reads best.

The rule leaves to [`prefer-de-morgan`](../prefer-de-morgan/README.md) the `!(...)` that is the whole test of a ternary or of an `if` whose `else` is no `else if`, where `no-negated-condition` swaps the branches instead, and a negated `||` chain of `===` comparisons of one value against literals or constants, as in `!(x === 1 || x === 2)`, which [`no-equality-chain`](../no-equality-chain/README.md) extracts into a named function.

## Examples

Incorrect:

```ts
if (!(a && b)) {
	run();
}

const v = !(a || b) && c;
```

Correct:

```ts
if (!a || !b) {
	run();
}

const v = !a && !b && c;

// `no-negated-condition` swaps the branches.
if (!(a && b)) {
} else {
}

// `no-equality-chain` extracts the chain into a named function.
const w = !(x === 1 || x === 2);
```

## Autofix

The fix removes the `!` and the group's parentheses, swaps `&&` and `||`, and negates each operand in place:

- `!x` becomes `x` where only the truthiness of the result is read: the test of an `if`, a loop, or a ternary, or the operand of `!`, directly or through `&&` and `||` chains. Elsewhere, `!x` becomes `!!x`, which `no-implicit-coercion` then rewrites to `Boolean(x)`.
- `!==`, `!=`, `===`, and `==` become `===`, `==`, `!==`, and `!=`.
- Any other operand gets a `!`, outside its own parentheses, or with added parentheses when it binds looser than `!`, as in `!(x < 1)`.

A nested group with the same operator joins the chain, as in `!(a && (b && c))` → `!a || (!b || !c)`. A nested group with the other operator becomes a negated group of its own, which the next pass distributes. The result gets parentheses when its parent binds tighter, as in `!(a && b) && c` → `(!a || !b) && c`.

The rewrite keeps the operand order, so it evaluates the same operands and short-circuits at the same point. Every operand of the result is a `boolean` or is read only for its truthiness, so the result stays the same. The rule reports without fixing when a comment outside the group would be dropped.

## Limitations

- `??` groups are not reported, because `??` has no De Morgan dual.

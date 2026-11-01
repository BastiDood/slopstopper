# `slopstopper/prefer-de-morgan`

Reports an `&&` or `||` chain whose negated operands outnumber what De Morgan's law leaves behind. A negated operand is `!x`, `a !== b`, or `a != b`. The rewrite `!a && !b && c` → `!(a || b || !c)` leaves one outer `!` plus one negation per positive operand, and the rule reports when that count is strictly smaller.

## Positions

A bare `!(...)` reads no better than the negated operands, so the rule reports only where another rule removes the outer `!` afterwards:

- The whole test of an `if` with an `else` that is no `else if`. `no-negated-condition` then swaps the branches of `if (!(...)) {} else {}`.
- The whole test of a ternary. `no-negated-condition` then swaps the branches of `!(...) ? a : b`.
- An `&&` chain of `!==` comparisons of one value against literals or constants, anywhere. Constants count as in `no-equality-chain`, including its type-aware tier ([Case Comparands](../no-equality-chain/README.md#case-comparands)). The rewrite `x !== 1 && x !== 2` → `!(x === 1 || x === 2)` holds a positive chain that [`no-equality-chain`](../no-equality-chain/README.md) then extracts into a named function, as in `!isSmall(x)`.

Guards without `else`, `if` tests followed by `else if`, loop conditions, values, returns, arguments, and chains nested in other chains are not reported. Parentheses around the whole test do not matter.

[`no-negated-group`](../no-negated-group/README.md) distributes every other `!(...)` over its group, but leaves alone the `!(...)` that is the whole test of an `if`-`else` or a ternary and the negated `===` run of one value that this rule produces.

## Examples

Incorrect:

```ts
if (!a && !b) {
} else {
}

const v = !a || !b || !c || d ? 1 : 2;

const w = x !== 1 && x !== 2;
```

Correct:

```ts
if (a || b) {
} else {
}

const v = a && b && c && !d ? 2 : 1;

const w = !isSmall(x);

// Two negations either way.
const u = !a && !b && c ? 1 : 2;

// No `else` swaps the branches.
if (!a && !b) {
}
```

## Autofix

The fix wraps the chain in `!(...)`, swaps `&&` and `||`, and negates each operand in place:

- `!x` becomes `x`, so `!!x` becomes `!x`.
- `!==`, `!=`, `===`, and `==` become `===`, `==`, `!==`, and `!=`.
- Any other operand gets a `!`, outside its own parentheses, or with added parentheses when it binds looser than `!`, as in `!(x < 1)`.

Comments, grouping parentheses, and line breaks survive. The rewrite keeps the operand order, so it evaluates the same operands and short-circuits at the same point.

The rewrite produces a `boolean`, where `!a && p` can return `p` itself. In every reported position the result stays the same: a test reads only the truthiness of the chain, and a chain of `!==` comparisons already produces a `boolean`.

## Limitations

- Only nesting with the same operator joins a chain. `!a && (!b || !c)` holds two chains, and the rule judges each one on its own.
- `??` chains are not reported.

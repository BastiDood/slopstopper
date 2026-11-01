# `slopstopper/prefer-switch`

Reports an `if`/`else if` chain of two or more branches that compare the same value with `===` against two or more distinct case values, which reads better as a `switch` statement. Like `unicorn/prefer-switch`, the rule counts branches, and a branch may group comparisons with `||`. A branch `x === A && <rest>` also names case `A`, and its body checks the rest. Leave out `default` when the chain has no final `else`. Case values are the comparands that [`no-equality-chain`](../no-equality-chain/README.md#case-comparands) accepts, so comparisons against `null`, `undefined`, or other references do not count.

Adjacent `if` statements in one statement list form a chain too, as long as every consequent except the last always exits: a `return`, `throw`, `continue`, or `break`, alone or as the last statement of its block. A trailing guard `if (x !== A) <exit>` or `if (x !== A || <rest>) <exit>` counts as one more case `A`: the code after it is that case's body, and the guard's exit becomes `default`. The complement `if (x !== A)` of a last case `x === A` becomes `default` too. When a branch checks a rest, neither a trailing guard nor a complement becomes `default`, because it would also have to run when the rest fails.

This rule owns every such decision on two or more distinct values; a split on one value belongs to [`merge-exclusive-branches`](../merge-exclusive-branches/README.md), and `||` tests inside the decision are not reported by [`no-equality-chain`](../no-equality-chain/README.md).

## Examples

Incorrect:

```ts
if (x === 1) {
} else if (x === 2 || x === 3) {
}

if (this.kind === 'a') {
} else if (this.kind === 'b') {
}

if (node.type === 'Identifier') return visitIdentifier(node);
if (node.type !== 'MemberExpression') return null;
return visitMember(node);
```

Correct:

```ts
switch (x) {
	case 1:
		break;
	case 2:
	case 3:
		break;
}

switch (node.type) {
	case 'Identifier':
		return visitIdentifier(node);
	case 'MemberExpression':
		return visitMember(node);
	default:
		return null;
}

// Comparisons against different values.
if (x === 1) {
} else if (y === 2) {
}

// An unlabeled `break` would target the new `switch`.
for (;;) {
	if (x === 1) {
		break;
	} else if (x === 2) {
	}
}
```

## Autofix

The fix replaces the chain with `switch (<discriminant>) { … }`, laid out the way `oxfmt` formats it:

- Each `||` alternative becomes a stacked `case`, and the consequent becomes the case body.
- A branch `if (x === A && <rest>) <consequent>` becomes `case A` with the body `if (<rest>) <consequent>`. When the rest fails, no later test can hold for the same value, so control leaves the chain, which is what the `break` after the body does.
- A block body loses its braces, unless it declares a `let`, `const`, `class`, `function`, or type, which keeps them for its own scope.
- A body that always exits gets no `break`. Every other case body ends with `break;`.
- The final `else` becomes `default`. In an early-exit sequence without one, the code after the chain stays after the `switch`.
- A trailing guard `if (x !== A || <rest>) <exit>` becomes `case A` and `default`. The body of `case A` is `if (<rest>) <exit>` followed by every later statement of the list, and `default` holds the exit.
- A chain that starts at an `else if` becomes `else { switch … }`.

The fix applies only when nothing can change the discriminant between the tests: a variable that is never reassigned, `this`, or a member chain with static keys. Between two tests, only the comparisons against case comparands and the rests of earlier branches run, because every earlier branch exits or sits in an `else`.

There is no rewrite when a chain with a final `else` has a branch that checks a rest, because the `else` would also have to run when that rest fails. Restructure such a chain by hand. There is also no rewrite when parentheses group a branch's case comparison with its rest, when a comment would be dropped, when a chain that starts at an `else if` continues past it, or when a declaration after a trailing guard is read outside the code that moves.

## Suggestion

The rewrite becomes a suggestion when the discriminant may change: a variable that is reassigned, or a global or import. It is also a suggestion for a complement, `if (x === A) a(); if (x !== A) b();`, because `a()` runs before `x !== A` is tested and can change `x`. Apply the suggestion when nothing changes the discriminant; otherwise suppress the diagnostic.

## Limitations

- Chains whose branches hold an unlabeled `break` are skipped, because the `break` would target the new `switch` instead of the enclosing loop. A labeled `break`, a `continue`, or a `break` whose loop sits inside the branch is fine.
- The compared value must be an identifier, `this`, `super.name`, or a member chain with static keys (`node.type`, `a[0]`, `this.#k`). Calls and dynamic keys such as `a[k]` are not compared.
- Only `===` counts. `==` and an `if` nested inside an `else` block do not form a chain.
- An `&&` test counts only when its leading operand is one case comparison. `(x === A || x === B) && <rest>` and an `||` alternative `x === A && <rest>` do not form a chain.
- A rest runs before the next test, so a rest that changes a member chain discriminant, such as `node.type`, can change which case holds.
- Only the leading run of matching branches counts. A chain can start at a later `else if`, and one chain can hold several runs on different values.
- In a sequence, only `return`, `throw`, `continue`, and `break` exit. A consequent that exits through an `if`/`else` whose branches all exit, or through a call that never returns, ends the chain.
- Only a guard whose test starts with `x !== A` counts, and only as the last case.
- A getter, or a case comparand that is a call (with type information), can still read a different value at each test.
- When the discriminant's type is a large union, the fixed `switch` reports under `typescript/switch-exhaustiveness-check` until it handles every member or justifies its `default`.

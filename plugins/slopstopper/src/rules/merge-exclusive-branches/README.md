# `slopstopper/merge-exclusive-branches`

Reports two adjacent `if` statements without `else` whose tests cannot both be true because they split on one condition `C`. One test holds `C` and the other holds its negation, each as the whole test or as a top-level `&&` operand. A negation is `!C`, or `x !== A` for `x === A` and `x != A` for `x == A`. One `if (C) { … } else { … }` states the split as one decision. This rule owns every such split except one that completes a [`prefer-switch`](../prefer-switch/README.md) decision on two or more distinct values, as in `if (x === B) return; if (x === A) a(); if (x !== A) b();`.

Conditions match structurally: identifiers, `this`, member chains with static keys, `undefined`, and literals. Calls never match, because they can return a different value each time.

## Examples

Incorrect:

```ts
if (isThrowing && isRecorded) report('logAndRethrow');
if (!isThrowing && !isReferenced) report('swallowed');

if (kind !== 'leaf') visit(children);
if (kind === 'leaf') emit(value);
```

Correct:

```ts
if (isThrowing) {
	if (isRecorded) report('logAndRethrow');
} else if (!isReferenced) {
	report('swallowed');
}

if (kind === 'leaf') {
	emit(value);
} else {
	visit(children);
}
```

## Autofix

The fix applies only when the merge keeps the behavior:

- Nothing can change `C` between the two tests. Every variable that `C` reads has one local declaration and no write besides its initialization, such as a `const`, or a `let` or parameter that is never reassigned. Imports do not count, because the exporting module can change them. This holds for `!C` and for comparisons alike. When `C` also reads members, such as `this.ready` or `a.b`, the first `if` must run no code that can write:
  - Every operand that its test evaluates after `C` reads only identifiers, literals, `this`, and members with static keys, combined with unary operators except `delete`, binary, logical, and conditional operators, template literals, optional chains, parentheses, and TypeScript assertions.
  - Its consequent always exits, so that the second test never runs after it, or holds only blocks, empty statements, expression statements, and `const` declarations of identifiers, with such expressions only.
  - Anything else, such as a call, `new`, `import()`, a tagged template, an assignment, `++` or `--`, `await`, `yield`, a function, or a class, gets the suggestion instead.
- `C` and its negation are the first operands of their tests, with no parentheses grouping them with the next operand, so the merge skips no operand that the original tests evaluate before the split.
- No comment lies in the text that the merge drops, such as next to `C` or before the consequent.

The fix writes `if (C) <branch> else <branch>`, with the branch of the test that holds `C` first, so the result has no negated condition. A branch is the consequent alone when its test is only the split, and `if (<rest>) <consequent>` otherwise. The first branch gets braces unless it is a block already, so that the `else` binds to the outer `if`. The second branch follows as `else <consequent>` or `else if (<rest>) <consequent>`. Each consequent keeps its text, and comments between the two statements stay before the `else`.

## When the First Branch May Change the Condition

Otherwise the report says that the first branch may change `C`, and the rule offers a suggestion instead of a fix. The suggestion declares `const <name> = C;` on its own line before the first `if` and merges on `<name>`, so both branches see the value from before the first branch ran. The name is the member's property name, as in `const ready = this.ready;`. Identifiers and comparisons get no suggestion, and neither does a name that a binding in scope or a global read in scope already uses.

When the first branch is meant to change the condition, so that both branches can run, suppress the report with a reason:

```ts
// oxlint-disable-next-line slopstopper/merge-exclusive-branches -- `init` sets `ready`, so the second branch runs after it.
if (!this.ready) this.init();
if (this.ready) this.start();
```

## Limitations

- Only two adjacent `if` statements count. In a run of three, the first two are reported, and the merged `if` then has an `else`, so the third is not.
- The allowed syntax still runs getters, proxy traps, and implicit conversions, such as `toString` in a template literal. One that changes `C` is not detected.
- Comparisons match only with the same operand order, so `x === 1` and `1 !== x` do not split. Relational operators such as `<` and `>=` do not split, because `NaN` fails both.

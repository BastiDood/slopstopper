# `slopstopper/prefer-early-return`

Reports an `if` without `else` in a statement list whose branch exits, where the code after it could be shorter or simpler. It reports three shapes:

- `if (c) return a;` followed by `return b;` reads as one `return c ? a : b;`. A pair of `throw` statements reads as one `throw c ? a : b;`.
- A boolean literal on one side of a `return` pair reads as an `||` or `&&` chain instead, as in `return c || d;`.
- A block branch that spans at least two lines more than the exit after it reads better inverted. The shorter exit then runs first. The longer branch then runs without nesting.

An exit is a `return`, `throw`, `continue`, or `break` at the end of the branch and of the statements after it. With type information, a call that returns `never`, as in `fail()` or `await neverResolves()`, exits too. Without it, a call is no exit.

`no-else-return` already turns an `if`-`else` of two returns into the first shape. `unicorn/prefer-ternary` covers an `if`-`else` that this rule leaves alone.

## Examples

Incorrect:

```ts
function label(node: Node) {
	if (node.type === 'Program') return 'program';
	return 'block';
}

function isLiteral(type: Type) {
	if (type.isUnion()) return false;
	return typeof type.value !== 'undefined';
}

function keyOf(key: Key, services: Services | null) {
	if (services !== null) {
		const type = typeAtLocation(services, key);
		const value = type?.value;
		return typeof value === 'string' ? `.${value}` : null;
	}
	return null;
}
```

Correct:

```ts
function label(node: Node) {
	return node.type === 'Program' ? 'program' : 'block';
}

function isLiteral(type: Type) {
	return !type.isUnion() && typeof type.value !== 'undefined';
}

function keyOf(key: Key, services: Services | null) {
	if (services === null) return null;
	const type = typeAtLocation(services, key);
	const value = type?.value;
	return typeof value === 'string' ? `.${value}` : null;
}
```

## Fixes

The ternary is a fix. It keeps the evaluation order and every exit:

- A test that reads better negated is inverted. The two values swap. That covers `!x`, `a !== b`, and an `&&` or `||` chain whose negated operands outnumber what De Morgan's law leaves behind. The result then draws neither `no-negated-condition` nor `prefer-de-morgan`.
- A test or value that binds more loosely than the conditional keeps its parentheses.

The inversion is a fix too:

- The test is negated. The negation distributes over an `&&` or `||` chain, as `no-negated-group` asks.
- The statements after the branch move into the `if`. A single statement on one line needs no block. Its guard ends in a semicolon, so that the next statement cannot continue it.
- The statements of the branch follow the `if` one level less indented. A line in the text of a template literal keeps its indentation, which is part of the string.

The inversion has no fix in these cases:

- A name that the branch declares is bound at the `if`. Moving the declaration out of the block would redeclare the name or shadow a binding that the code around it reads.
- A declaration in the statements after the branch is read outside them, as when the branch calls a function that they declare. The declaration would move into the new block, where the branch cannot see it.
- The guard would end in a call that returns `never`. TypeScript narrows after such a call only when the function has an explicit type annotation. So the branch could lose a narrowing that the block gave it.

The chain is a suggestion, not a fix. `c ? true : d` equals `c || d` only when `c` is a boolean. Apply the suggestion when the test is a boolean, as `typescript/strict-boolean-expressions` requires. Otherwise, suppress the diagnostic.

No rewrite drops a comment. A comment between the parts of the rewritten code leaves the report without a fix.

## Limitations

- A pair that would nest a ternary, as in `if (c) return d ? 1 : 2; return 3;` or `if (a ? b : c) return 1; return 2;`, is left alone, as `no-nested-ternary` asks.
- A pair of two boolean literals is left to `no-unneeded-ternary`.
- An exit counts only at the end of the branch and of the statements after it. A branch that ends in a nested `if` that exits on both sides is not reported.
- The lengths compare source lines, not statements.

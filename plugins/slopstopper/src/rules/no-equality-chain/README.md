# `slopstopper/no-equality-chain`

Reports an `||` chain of two or more `===` comparisons against the same value, wherever the chain appears: a `return`, a variable, an argument, or a test. The chain reads better as a `switch` in its own function whose fall-through cases return `true`.

## Examples

Incorrect:

```ts
const vowel = c === 'a' || c === 'e' || c === 'i';

if (node.type === 'Identifier' || node.type === 'ThisExpression') {
}
```

Correct:

```ts
function isVowel(c: string) {
	switch (c) {
		case 'a':
		case 'e':
		case 'i':
			return true;
		default:
			return false;
	}
}

const vowel = isVowel(c);
```

## Case Comparands

A comparison counts when one side is a value that a `switch` case can name:

- A string, number, boolean, or bigint literal, a template literal without expressions, or a negated number.
- An identifier bound to a same-file `const` whose initializer is such a literal, also through `as const` or `satisfies`.
- A member `E.A` of a same-file `enum E`.
- A member `K.A` of a same-file `const K` object literal, optionally `as const`, whose property `A` is such a literal.

Comparisons against `null`, `undefined`, or other references guard or narrow a value instead of naming a case, so `x === null || x === y` is not reported. Neither is `x === A || y === A`, which compares two values against one constant.

## Type Information

With typescript-eslint type information, a comparand also counts when its type is a single literal type: a string, number, or bigint literal, `true`, `false`, or an enum member. This covers imported and declared constants, as in `declare const A: 'a'`. Unions such as `boolean` or a whole enum, `any`, `unknown`, and `never` do not count.

## Negated Chains

The rule does not report `c !== 'a' && c !== 'e'`. [`prefer-de-morgan`](../prefer-de-morgan/README.md) first rewrites it to `!(c === 'a' || c === 'e')`, and this rule then reports the positive chain inside, which becomes `!isVowel(c)`.

## Limitations

- Without type information, imported constants never count as case comparands. A `let` variable counts only through the type tier, when its type is a single literal type.
- The rule has no autofix.
- Only `===` counts. `==` comparisons and `&&` chains are not reported.
- The compared value must be an identifier, `this`, `super.name`, or a member chain with static keys, as in [`prefer-switch`](../prefer-switch/README.md). Calls and dynamic keys such as `a[k]` are not compared.
- Only contiguous runs count. An operand that does not fit ends the run, and the next comparison can start a new one, so one chain can hold several runs on different values. Each run is reported once, and nested `||` chains count as one chain.
- The test of an `if` in a decision that [`prefer-switch`](../prefer-switch/README.md) owns is left to that rule, also when `prefer-switch` skips the decision because of an unlabeled `break`.

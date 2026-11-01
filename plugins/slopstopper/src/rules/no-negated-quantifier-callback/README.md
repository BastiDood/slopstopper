# `slopstopper/no-negated-quantifier-callback`

Reports a `.some` or `.every` call whose callback returns a `!` negation, which negates once per element. De Morgan's law moves the negation outside the call, where it runs once:

- `xs.every(x => !p)` becomes `!xs.some(x => p)`.
- `xs.some(x => !p)` becomes `!xs.every(x => p)`.
- `!xs.some(x => !p)` becomes `xs.every(x => p)`, and `!xs.every(x => !p)` becomes `xs.some(x => p)`, which drops both negations.

The callback is an arrow with an expression body, or a function or arrow whose block body is a single `return !…;`.

For `Array`, `ReadonlyArray`, tuples, typed arrays, and the iterator helpers, each rewrite is an exact identity: both forms visit the same elements, stop at the same element, and return a `boolean`. Both quantifiers read only the truthiness of the callback's result, so the `!` goes away without a `!!` in its place.

[`no-negated-condition`](https://eslint.org/docs/latest/rules/no-negated-condition) then swaps the branches when the new `!xs.some(…)` is the whole test of an `if` with an `else` or of a ternary. The swapped test holds no negated callback, so the two rules settle. [`no-negated-group`](../no-negated-group/README.md) does not apply, because the `!` negates a call, not a group.

## Examples

Incorrect:

```ts
const allMissing = keys.every(key => !map.has(key));

const anyEmpty = lists.some(function (list) {
	return !list.length;
});

if (!items.some(item => !item.done)) finish();
```

Correct:

```ts
const allMissing = !keys.some(key => map.has(key));

const anyEmpty = !lists.every(function (list) {
	return list.length;
});

if (items.every(item => item.done)) finish();

// The callback reads the index.
const v = xs.every((x, i) => !p(x, i));
```

## Autofix

The rewrite swaps the method name, removes the callback's `!`, and adds or removes the `!` before the call. A `!` before a call that is the object of a member access, the callee of a call or `new`, a tag, or the left operand of `**` gets parentheses, as in `(!xs.some(x => p)).toString()`.

The fix applies only with typescript-eslint type information, when every declaration of the called method belongs to `Array`, `ReadonlyArray`, a typed array such as `Uint8Array`, or `IteratorObject` in TypeScript's default library. A union receiver qualifies when every member does.

There is no rewrite when a comment between the outer `!` and the call would be dropped.

## Suggestion

A user-defined `some` or `every` method can mean something else, so the rewrite is a suggestion without type information, or when the method is declared outside the default library, as on a subclass that overrides it or an `any` receiver. Apply the suggestion when the method is the standard one; otherwise suppress the diagnostic.

## Limitations

- A callback with a second or third parameter, such as the index or the array, a rest parameter, a `thisArg` argument, an `async` or generator callback, and a callback with a type predicate return type are not reported.
- An optional call such as `xs?.some(…)` or `a?.xs.some(…)` is not reported, because a `!` outside the call would turn a short-circuited `undefined` into `true`.
- Only a callback that returns `!p` counts. `x => x !== y` and other negated comparisons do not.
- A method name in brackets, such as `xs['some'](…)`, is not reported.
- When TypeScript infers a type predicate from the callback, `.every` narrows the receiver and the rewrite does not, so code that relies on that narrowing stops type-checking.

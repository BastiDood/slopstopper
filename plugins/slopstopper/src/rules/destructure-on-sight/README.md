# `slopstopper/destructure-on-sight`

Reports a binding whose every use reads a static property off it, as in `x.p`, in favor of destructuring it where it is bound. The binding is a function parameter, with or without a type annotation or a default value, or the identifier of a `const` declarator.

Any other use takes the value whole and exempts the binding: passing, returning, assigning, spreading, or comparing it, `in`, `instanceof`, and `typeof`, a method call `x.m()` that needs `this`, a member write, update, or `delete`, an optional read `x?.p`, which would throw when destructured from a nullish value, a computed read `x[k]`, and any use from a nested function, which would capture a snapshot instead of reading the property live.

A read that narrows, such as `x.type === 'a'`, usually narrows a union whose other properties only some members have, so destructuring them would not type-check. A read counts as narrowing when it is an operand of `===`, `!==`, `==`, `!=`, or `in`, a `switch` discriminant, or the operand of `typeof`. Without type information, a narrowing read exempts the binding.

## Examples

Incorrect:

```ts
function area(size: Size) {
	return size.width * size.height;
}
const user = load();
greet(user.name);
```

Correct:

```ts
function area({ width, height }: Size) {
	return width * height;
}
const { name } = load();
greet(name);

// `user` is used whole.
const user = load();
save(user);
greet(user.name);
```

## Autofix

The rule offers a suggestion, not an autofix. Destructuring reads each property once, at the binding, while `x.p` reads it at each use. If the object is a `Proxy` or has getters or properties that change between the binding and its reads, the two differ, so suppress the diagnostic.

The suggestion replaces the binding name with a pattern of the read properties in the order of their first read, keeps any type annotation and default value, and replaces every `x.p` with `p`. A bare arrow parameter gets parentheses.

A binding whose only read is `length` keeps its name in an alias, so `const trimmed = line.trimStart()` and `trimmed.length` become `const { length: trimmedLength } = line.trimStart()` and `trimmedLength`.

Two or more parameters of one function that each read only the same property are reported together, on the first of them. The suggestion destructures the property out of each under the parameter's own name, so `(left, right) => left.position - right.position` becomes `({ position: left }, { position: right }) => left - right`.

The rule reports without a suggestion when a property name is a reserved word, when a name would clash with or shadow another binding or a global that the code reads, when a comment inside a read would be dropped, or when the function body has a `'use strict'` directive, which forbids a destructured parameter.

## Type Information

With typescript-eslint type information, the rule reports a binding exactly when every read property exists on every member of the binding's type, whether or not a read narrows. A narrowing read of a type that is no union, such as `x.type === 'a'` on `{ type: 'a' | 'b'; b: number }`, is reported, and a read of a property that only some union members have is not.

## Limitations

- `let` and `var` bindings, reassigned parameters, optional parameters, rest parameters, parameter properties, exported `const` declarations, and existing patterns are not reported.
- A private member read `x.#p` counts as a whole use.

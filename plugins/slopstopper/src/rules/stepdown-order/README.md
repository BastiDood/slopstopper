# `slopstopper/stepdown-order`

Reports a function declared above code in the same scope that uses it. Callers and the statements that use a helper come first and the helper follows below them, so a file reads top-down from high-level code to low-level details (the stepdown rule).

In a statement list (a module, a function body, a block, a static block, or a namespace), every statement counts as a user of the function declarations in that list. In a class body, every member counts as a user of the methods that it reaches through `this.name` or `ClassName.name`. Recursion and mutual recursion impose no order.

## Examples

Incorrect:

```ts
function helper() {}
function caller() {
	helper();
}

function indexCategories() {
	return new Map();
}
const CATEGORY_INDEX = indexCategories();

class Box {
	step() {}
	run() {
		this.step();
	}
}
```

Correct:

```ts
function caller() {
	helper();
}
function helper() {}

const CATEGORY_INDEX = indexCategories();
function indexCategories() {
	return new Map();
}

class Box {
	run() {
		this.step();
	}
	step() {}
}
```

An export list or `export default helper` uses the functions it names, so they go below it:

```ts
export { helper };
function helper() {}
```

## Autofix

The fix reorders function declarations (and class methods) in newspaper order: each helper moves just below its last user, depth-first in the order of first use. Every other statement or class member keeps its relative order, which is safe because function declarations are hoisted. A cycle of mutually recursive functions moves as one block in its original order.

```ts
// Before
function d() {}
function other() {}
function c() {}
function b() {
	d();
}
function a() {
	b();
	c();
}

// After
function other() {}
function a() {
	b();
	c();
}
function b() {
	d();
}
function d() {}
function c() {}
```

A function moves together with its overload signatures, its `export` or `export default` wrapper, the comments directly above it (without a blank line in between), and the comments that start on its last line.

The rule reports without fixing when:

- A comment shares a line with tokens on both sides, so it belongs to neither neighbor.
- Two function declarations in the scope share a name, or overload signatures are not directly above their implementation.
- A namespace or a block in a sloppy-mode script would move a function across a statement that is not a function declaration. Both still let functions move across other functions.
- A class body has a decorator, a computed method key, two methods with the same key (other than a getter and setter pair), or a member without a trailing semicolon next to a moved member.

## Limitations

- Only function declarations and class methods are helpers. Functions assigned to variables (`const helper = () => {}`), getters, and setters are users only.
- Only value references count. Type positions such as `typeof helper` or `ReturnType<typeof helper>` do not.
- In a class, only non-computed `this.name` and `ClassName.name` accesses count. `this['name']` and `this` inside a nested non-arrow function or nested class do not.
- Each scope is fixed independently. Nested scopes can need more than one fix pass to settle.

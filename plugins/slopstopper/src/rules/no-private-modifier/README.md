# `slopstopper/no-private-modifier`

Reports the TypeScript `private` modifier on class members in favor of ECMAScript `#private` members. `private` only exists at compile time, while `#private` is enforced at runtime.

Private constructors are allowed because they have no `#private` equivalent. Constructor parameter properties (`constructor(private x: number)`) are not reported; `typescript/parameter-properties` covers them.

## Examples

Incorrect:

```ts
class A {
	private x = 1;
	private static readonly y = 2;
	private run() {
		return this.x + A.y;
	}
}
```

Correct:

```ts
class A {
	#x = 1;
	static readonly #y = 2;
	#run() {
		return this.#x + A.#y;
	}
}
```

## Autofix

The fix renames the member to `#name` and rewrites every `this.name` inside the class body, plus `ClassName.name` for static members. It handles fields, `accessor` fields, methods with overloads, getter and setter pairs, and `this` inside arrow functions. It splits `this` destructuring into separate reads:

```ts
// Before
const { x, y } = this;

// After
const { y } = this;
const x = this.#x;
```

Decorated members are fixed too, because the rule assumes ECMAScript decorators, which accept `#private` members.

The rule reports without fixing when a reference cannot be proven to target the class's own member:

- Access through another object, such as `other.x` or `super.x`.
- Computed or string-keyed access, such as `this['x']`, `'x' in value`, or `A['x']` in a type.
- A computed access with a non-literal key, such as `this[k]`, cancels the fix for the whole class.
- Optional access `this?.x`. `this?.#x` is a syntax error (TS18030), and dropping the `?.` changes behavior: an unbound call leaves `this` undefined, so `this?.x` yields `undefined` where `this.#x` throws.
- `delete this.x`, because deleting a private name is a syntax error.
- A rebound `this`: a nested `function`, a `this` parameter, a nested class, or a computed key.
- Destructuring from `this` with defaults, rest elements, nested patterns, type annotations, multiple declarators, or assignment instead of declaration.
- A conflicting `#name`, a nested class member with the same name, or a constructor parameter property with the same name.
- A static and an instance member with the same name, overloads or accessor pairs that are not all private, `declare` fields, and ambient declarations (`declare class`, `declare namespace`, `.d.ts` files).
- A private member with a string-literal or computed key, which has no `#name` spelling.

## Limitations

- References outside the class body, such as `new A().x`, are not rewritten.

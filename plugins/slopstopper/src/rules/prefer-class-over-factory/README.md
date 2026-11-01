# `slopstopper/prefer-class-over-factory`

Reports a module-level factory: a function declaration, or a `const` initialized with a function or arrow function, at the top level of the module or in an `export`, whose every `return` with a value (or arrow expression body) is an object literal with at least one method, accessor, or function-valued property. Turn the factory into a class whose constructor takes its parameters, so the shape and its state have a name.

## Examples

Incorrect:

```ts
export function counter(start: number) {
	let count = start;
	return {
		increment() {
			count += 1;
		},
		get value() {
			return count;
		},
	};
}

const reader = (path: string) => ({ read: () => readFileSync(path) });
```

Correct:

```ts
export class Counter {
	#count: number;

	constructor(start: number) {
		this.#count = start;
	}

	increment() {
		this.#count += 1;
	}

	get value() {
		return this.#count;
	}
}

// Only data members.
function span(range: Range, text: string) {
	return { range, text };
}

// A framework hook is a method, not a module-level function.
export const RULE = defineRule({
	create(context) {
		return { Program() {} };
	},
});
```

## Limitations

- The rule has no fix, because the class needs a name.
- Nested functions, callbacks, methods, and `let` or `var` declarations are not checked.
- A function with any other value return, such as `null` or a variable, is not reported.
- React hooks return objects of closures by design, as in `useX()` returning `{ value, setValue }`. A React preset may need to turn the rule off.

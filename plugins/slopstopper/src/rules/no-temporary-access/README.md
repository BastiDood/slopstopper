# `slopstopper/no-temporary-access`

Reports a field read off the unnamed result of a call or `new` expression, such as `f().x`, `f()[k]`, `f()?.x`, `f().#x`, or `new X().y`. Bind the result to a `const` first: the binding gives the result an explicit lifetime, so later code reuses it instead of calling the function again.

A method call reads no field, so `f().g()`, `name.trim().toLowerCase()`, and ``f().raw`x` `` are not reported. A field read that receives a method call is allowed too, so `f().x.y()` and `expect(x).not.toThrow()` are not reported, while `f().x.y` is. An assignment target, as in `f().x = 1`, is reported like a read.

## Examples

Incorrect:

```ts
for (const ref of thing.references().reference) use(ref);

const size = Object.keys(map).length;
```

Correct:

```ts
const { reference } = thing.references();
for (const ref of reference) use(ref);

const { length: size } = Object.keys(map);
```

## Autofix

The fix applies when the read is the whole of one of these positions, so that the call runs exactly once and first in its statement:

- The initializer of the only declarator of a `const` declaration without a type annotation. The fix destructures the result in place: `const x = f().y` becomes `const { y: x } = f()`, and `const y = f().y` becomes `const { y } = f()`.
- The iterable of a `for…of` statement, the argument of a `return` or `throw` statement, or the test of an `if` statement. The fix declares `const { y } = f();` on its own line before the statement, at its indentation, and replaces the read with `y`. The statement must sit directly in a block or the program, so not in a `switch` case, a label, an `else if`, or a braceless body. The name must not be a reserved word, must not resolve in the scope that the declaration joins or in the statement's own scope, such as a `for…of` variable, and must not name a global that code in that scope reads. Two fixes in one pass never declare the same name in one scope.

In both cases the field must have a static name that is an ASCII identifier, as in `.y` or `['y']`, and no comment may lie in the text that the fix drops. Destructuring reads the field once, through the same getter, and throws on `null` and `undefined` exactly like the read, so the fix preserves behavior.

Everywhere else the rule reports without a fix, and the message names the refactor:

- In a `while` or `do…while` condition, or the condition or update of a `for` loop, the call runs on every iteration: bind the result inside a `while (true)` loop body and `break` on the condition.
- On the right side of `&&`, `||`, `??`, or their assignment forms such as `??=`, in a conditional branch, or in a default value, the call runs only sometimes: bind the result inside the branch where the call runs.
- In an arrow function's expression body: turn the body into a block and bind the result there.
- In an optional read, as in `f()?.x`: bind `f()` to a `const`, then check it for `undefined`.
- Anywhere else, such as a private name, a computed key, a name clash, or a `let` declaration: bind `f()` to a `const` first.

The message shows the call text with whitespace runs collapsed, cut to 40 characters with a trailing `…`.

## Limitations

- Only calls and `new` expressions count. A field read off `await f()` or off a parenthesized optional chain, as in `(a?.f()).x`, is not reported.
- The fix inserts the declaration after any comment above the statement, so a `disable-next-line` directive there then applies to the declaration instead.
- The context search stops at the innermost function or class body, so a read in a computed class member key gets the plain binding message.

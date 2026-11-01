# `slopstopper/handle-or-rethrow`

Reports a `catch` clause that neither handles nor rethrows the caught error. It follows the OpenTelemetry exception recording guidance: the boundary that owns a failure records it once. A `catch` clause either recovers and records the error, or rethrows it: unchanged when the error is unexpected, wrapped with `{ cause }` when it translates an expected error.

The rule reports three patterns:

- An unbound `catch`, which can neither record the failure nor pass it as a `cause`.
- A swallowed error: the binding is never referenced and nothing is thrown.
- Log and rethrow: the error is passed to a call and also rethrown, so the same failure is recorded twice.

## Examples

Incorrect:

```ts
try {
	g();
} catch {}

try {
	g();
} catch (error) {}

try {
	g();
} catch (error) {
	logger.error({ error });
	throw error;
}
```

Correct:

```ts
// Rethrow unexpected errors unchanged.
try {
	g();
} catch (error) {
	if (!(error instanceof NotFound)) throw error;
	return fallback;
}

// Wrap expected errors with `cause`.
try {
	g();
} catch (error) {
	throw new AppError('x', { cause: error });
}

// Recover and record once.
try {
	g();
} catch (error) {
	logger.warn(error);
	return fallback;
}
```

## Limitations

- A `throw` counts when it leaves the `catch` body: not inside a nested function or class, and not inside the `try` block of a nested `try` that catches it. The thrown value does not matter, so `throw other` counts as a rethrow.
- Any reference to the binding counts as handling, so passing `error.message` or using the error inside a callback (`setTimeout(() => report(error))`) is not reported.
- Recording means passing the error itself as a call or `new` argument directly in the `catch` body, optionally through object literals, arrays, spreads, template literals, or type assertions. Calls inside the thrown expression or inside nested functions do not count.
- A destructured binding (`catch ({ message })`) is never treated as recorded, because it forwards parts of the error rather than the error itself.

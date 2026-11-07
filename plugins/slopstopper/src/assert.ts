export class AssertionError extends Error {
	override name = 'AssertionError';
}

/** @throws {AssertionError} When `value` is not zero. */
export function assertZero(value: number) {
	if (value !== 0) throw new AssertionError('expected zero');
}

/** @throws {AssertionError} When `values` does not hold exactly one value. */
export function assertSingle<T>(values: T[]) {
	return assertDefined(assertOptional(values));
}

/** @throws {AssertionError} When `value` is `undefined`. */
export function assertDefined<T>(value: T | undefined) {
	if (typeof value === 'undefined') throw new AssertionError('value must be defined');
	return value;
}

/** @throws {AssertionError} When `value` is `null`. */
export function assertNotNull<T>(value: T | null) {
	if (value === null) throw new AssertionError('value must not be null');
	return value;
}

/** @throws {AssertionError} When `values` holds more than one value. */
export function assertOptional<T>(values: T[]) {
	if (values.length > 1) throw new AssertionError('expected at most one value');
	return values[0];
}

export class AssertionError extends Error {
	override name = 'AssertionError';
}

/** @throws {AssertionError} */
export function assertZero(value: number) {
	if (value !== 0) throw new AssertionError('expected zero');
}

/** @throws {AssertionError} */
export function assertSingle<T>(values: T[]) {
	return assertDefined(assertOptional(values));
}

/** @throws {AssertionError} */
export function assertDefined<T>(value: T | undefined) {
	if (typeof value === 'undefined') throw new AssertionError('value must be defined');
	return value;
}

/** @throws {AssertionError} */
export function assertOptional<T>([value, ...values]: T[]) {
	if (values.length > 0) throw new AssertionError('expected at most one value');
	return value;
}

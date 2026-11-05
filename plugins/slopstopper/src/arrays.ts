/** The only element of a list, or `null` when the list is empty or holds more than one element. */
export function onlyElement<T>(values: readonly T[]) {
	return values.length === 1 ? (values[0] ?? null) : null;
}

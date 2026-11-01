/** The only element of a list, or `null` when the list is empty or holds more than one element. */
export function onlyElement<T>([value, ...rest]: readonly T[]) {
	return rest.length === 0 ? (value ?? null) : null;
}

import type { ESTree } from '@oxlint/plugins';

/**
 * The name of a public property that a key spells out statically: an identifier that is not computed, or a string or
 * number literal, computed or not. Returns `null` for a private name and for any other computed key.
 */
export function propertyName(key: ESTree.PropertyKey, computed: boolean) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only identifiers and literals spell out a public name, so `default` covers the rest.
	switch (key.type) {
		case 'Identifier':
			return computed ? null : key.name;
		case 'Literal':
			return typeof key.value === 'string' || typeof key.value === 'number'
				? String(key.value)
				: null;
		default:
			return null;
	}
}

/**
 * The name of an identifier or private name key that is not computed, without the `#` of a private name. Returns `null`
 * for literals and computed keys.
 */
export function identifierName(key: ESTree.PropertyKey, computed: boolean) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two identifier kinds have a name, so `default` covers the rest.
	switch (key.type) {
		case 'Identifier':
		case 'PrivateIdentifier':
			return computed ? null : key.name;
		default:
			return null;
	}
}

import { defineRule, type ESTree } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { assertNotNull } from '#assert.ts';
import { unwrap } from '#ast/discriminant.ts';
import { propertyName } from '#ast/property-keys.ts';
import { tableOptionsObject } from '#ast/tanstack-table.ts';

/** Matches the name of a state change handler, as in `onPaginationChange`, and captures the capitalized slice. */
const HANDLER_NAME_REGEX = /^on(?<slice>[A-Z]\w*)Change$/u;

/**
 * Reports a controlled TanStack Table state slice that lacks its other half, in the options object literal passed to
 * `useTable`, `createTable`, or `tableOptions`. A key `slice` of `options.state` needs the option `onSliceChange`, and
 * an option `onSliceChange` needs `options.state.slice` unless `options.atoms.slice` owns the slice. A state without its
 * handler leaves the table no way to report updates, so the table ignores them; a handler without its state replaces the
 * internal update without feeding the value back, so the table and its owner desynchronize.
 *
 * An options object, `state` object, or `atoms` object whose keys the rule cannot see, through a spread, a computed key,
 * or a value that is no object literal, exempts the checks that depend on it. A `state` getter counts when its body
 * returns an object literal, as Svelte options often do.
 */
export const REQUIRE_TABLE_STATE_PAIRS = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require each controlled TanStack Table state slice to have both its `state` entry and its `on<Slice>Change` handler.',
		},
		messages: {
			missingHandler:
				'`state.{{slice}}` has no matching `{{handler}}`. A controlled slice needs both its state and its change handler, or the table either ignores updates or desynchronizes.',
			missingState:
				'`{{handler}}` has no matching `state.{{slice}}` or `atoms.{{slice}}`. A controlled slice needs both its state and its change handler, or the table either ignores updates or desynchronizes.',
		},
		schema: [],
	},
	create(context) {
		return {
			CallExpression(node) {
				const options = tableOptionsObject(node);
				if (options === null) return;
				const keys = staticKeys(options);
				if (keys === null) return;

				const state = nestedKeys(keys.get('state'));
				if (state === null) return;

				for (const [slice, property] of state) {
					const handler = handlerName(slice);
					if (keys.has(handler)) continue;
					context.report({
						node: property,
						messageId: 'missingHandler',
						data: { slice, handler },
					});
				}

				const atoms = nestedKeys(keys.get('atoms'));
				if (atoms === null) return;

				for (const [handler, property] of keys) {
					const slice = handledSlice(handler);
					if (slice === null || state.has(slice) || atoms.has(slice)) continue;
					context.report({
						node: property,
						messageId: 'missingState',
						data: { slice, handler },
					});
				}
			},
		};
	},
});

/**
 * The static keys of the object literal that a property holds (see `staticKeys`): none when the property is absent, and
 * `null` when it holds no literal. The property holds the literal as its value or, as a getter, through a body that
 * returns only the literal.
 */
function nestedKeys(property: ESTree.ObjectProperty | undefined) {
	if (typeof property === 'undefined') return new Map<string, ESTree.ObjectProperty>();
	const object = heldObject(property.value);
	return object === null ? null : staticKeys(object);
}

/**
 * The object literal that a value holds, or that a function value returns from a body of one `return` statement, as a
 * getter does. Only a getter makes a function value useful as options, so the rule does not tell it apart from a method.
 */
function heldObject(value: ESTree.Expression): ESTree.ObjectExpression | null {
	const node = unwrap(value);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only an object literal or a function that returns one holds keys, so `default` covers the rest.
	switch (node.type) {
		case 'ObjectExpression':
			return node;
		case 'FunctionExpression': {
			const returned = returnedValue(node);
			return returned === null ? null : heldObject(returned);
		}
		default:
			return null;
	}
}

/** The value that a function returns when its body is one `return` statement with a value, otherwise `null`. */
function returnedValue({ body }: ESTree.Function) {
	const { body: statements } = assertNotNull(body);
	const statement = onlyElement(statements);
	return statement?.type === 'ReturnStatement' ? statement.argument : null;
}

/**
 * The properties of an object literal by static name, or `null` when a spread or a dynamic computed key hides a name. A
 * later property of the same name replaces an earlier one, as at runtime.
 */
function staticKeys({ properties }: ESTree.ObjectExpression) {
	const keys = new Map<string, ESTree.ObjectProperty>();
	for (const property of properties) {
		if (property.type === 'SpreadElement') return null;
		const name = propertyName(property.key, property.computed);
		if (name === null) return null;
		keys.set(name, property);
	}
	return keys;
}

/** The change handler option of a state slice: `on`, the slice name with its first letter capitalized, and `Change`. */
function handlerName(slice: string) {
	return `on${slice.charAt(0).toUpperCase()}${slice.slice(1)}Change`;
}

/** The state slice that a change handler option names, with its first letter lowercased, or `null` for any other name. */
function handledSlice(name: string) {
	const match = HANDLER_NAME_REGEX.exec(name);
	const capitalized = match?.groups?.slice;
	return typeof capitalized === 'undefined'
		? null
		: `${capitalized.charAt(0).toLowerCase()}${capitalized.slice(1)}`;
}

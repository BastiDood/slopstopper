import type { ESTree } from '@oxlint/plugins';

import { propertyName } from '#ast/property-keys.ts';

/** The longest source text that a message shows, including the `…` that ends a cut text. */
const MAX_LABEL_LENGTH = 40;

/** Matches a run of whitespace characters. */
const WHITESPACE_RUN_REGEX = /\s+/gu;

/** A source text for a message: whitespace runs collapse to one space, and a longer text is cut to end in `…`. */
export function messageLabel(text: string) {
	const flat = text.replaceAll(WHITESPACE_RUN_REGEX, ' ');
	return flat.length > MAX_LABEL_LENGTH ? `${flat.slice(0, MAX_LABEL_LENGTH - 1)}…` : flat;
}

/**
 * A function for a message: its name in backticks, or `this function` when it has none. A function goes by its own
 * name, the name of the variable that it initializes, or the static key of the member that it implements.
 */
export function functionLabel(node: ESTree.Node) {
	const name = functionName(node);
	return name === null ? 'this function' : `\`${name}\``;
}

/** The name that a function goes by, or `null` when it has none. */
function functionName(node: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only functions and signatures have a name, so `default` covers the rest.
	switch (node.type) {
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'TSDeclareFunction':
		case 'TSEmptyBodyFunctionExpression':
			return node.id === null ? contextualName(node) : node.id.name;
		case 'ArrowFunctionExpression':
			return contextualName(node);
		case 'TSMethodSignature':
			return keyName(node.key, node.computed);
		default:
			return null;
	}
}

/** The name that a function takes from where it appears: a variable that it initializes or a member that it implements. */
function contextualName(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only declarators and members name a function, so `default` covers the rest.
	switch (parent.type) {
		case 'VariableDeclarator':
			return parent.init === node && parent.id.type === 'Identifier' ? parent.id.name : null;
		case 'MethodDefinition':
		case 'TSAbstractMethodDefinition':
		case 'PropertyDefinition':
		case 'Property':
			return parent.value === node ? keyName(parent.key, parent.computed) : null;
		default:
			return null;
	}
}

/** The static name of a key, with the `#` of a private name, or `null` for a dynamic computed key. */
export function keyName(key: ESTree.PropertyKey, computed: boolean) {
	return key.type === 'PrivateIdentifier' ? `#${key.name}` : propertyName(key, computed);
}

/** A list for a message: `a`, `a and b`, or `a, b, and c`, or `none` when the list is empty. */
export function listLabel(items: readonly string[], none: string) {
	const last = items.at(-1);
	if (typeof last === 'undefined') return none;
	if (items.length <= 2) return items.join(' and ');
	return `${items.slice(0, -1).join(', ')}, and ${last}`;
}

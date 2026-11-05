import type { ESTree, Reference, SourceCode } from '@oxlint/plugins';

import { assertDefined, assertNotNull } from '#assert.ts';
import { propertyName } from '#ast/property-keys.ts';
import { isWithin } from '#ast/ranges.ts';

/**
 * The property of an object literal that sets a TanStack Query option, such as `queryKey` or `queryFn`: the last
 * property whose static key is `name`, written as `name: value`, a shorthand, or a method. Getters and setters do not
 * count. Returns `null` when no property sets the option.
 */
export function queryOption({ properties }: ESTree.ObjectExpression, name: string) {
	for (let index = properties.length - 1; index >= 0; --index) {
		const property = assertDefined(properties[index]);
		if (
			property.type === 'Property' &&
			property.kind === 'init' &&
			propertyName(property.key, property.computed) === name
		) {
			return property;
		}
	}
	return null;
}

/**
 * The value reads inside an expression (see `isValueRead`), in source order. Reads inside the functions and classes
 * nested in the expression do not count.
 */
export function valueReads(sourceCode: SourceCode, { parent, range }: ESTree.Expression) {
	// The scope around the parent holds the expression, even when the expression is a function with a scope of its own.
	const { references } = sourceCode.getScope(parent);
	return references
		.filter(reference => isWithin(reference.identifier.range, range) && isValueRead(reference))
		.sort(({ identifier: left }, { identifier: right }) => left.range[0] - right.range[0]);
}

/** Whether a reference reads a value, rather than only writing it or naming a type, as in `x as Key` or `typeof x`. */
export function isValueRead(reference: Reference) {
	return reference.isRead() && !isTypeName(reference.identifier.parent);
}

/**
 * The member reads and calls that a node starts, from the node outward: `a`, `a.b`, and `a.b(c)` for `a` in `a.b(c)`.
 * Optional chains and TypeScript assertions between them do not end the chain and are left out of it. Expects the node
 * to read a value (see `isValueRead`), so that it sits in the expression of any such wrapper, never in its type.
 */
export function accessChain(node: ESTree.Node) {
	return [node, ...outerAccesses(node)];
}

/** The member reads and calls around a node whose object or callee it is, from the node outward (see `accessChain`). */
function outerAccesses(node: ESTree.Node): ESTree.Expression[] {
	const parent = assertNotNull(node.parent);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only wrappers, members, and calls continue the chain, so `default` covers the rest.
	switch (parent.type) {
		case 'ChainExpression':
		case 'TSNonNullExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
			return outerAccesses(parent);
		case 'MemberExpression':
			return parent.object === node ? [parent, ...outerAccesses(parent)] : [];
		case 'CallExpression':
			return parent.callee === node ? [parent, ...outerAccesses(parent)] : [];
		default:
			return [];
	}
}

/** Whether the parent of an identifier makes it the name of a type. */
function isTypeName(parent: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only type positions name a type, so `default` covers the rest.
	switch (parent.type) {
		case 'TSTypeReference':
		case 'TSQualifiedName':
		case 'TSTypeQuery':
			return true;
		default:
			return false;
	}
}

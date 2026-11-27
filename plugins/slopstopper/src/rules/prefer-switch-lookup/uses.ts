import type { ESTree, SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { negatedNumber } from '#ast/literals.ts';
import { isCallee, outermostUse, outermostWrapper } from '#ast/members.ts';
import { propertyName } from '#ast/property-keys.ts';

import type { TableKind } from './tables.ts';

/** A membership test. `includes` is the property of an `A.includes(k)` call, which the `Set` rewrite turns into `.has`. */
interface MembershipUse {
	kind: 'membership';
	includes: ESTree.Expression | ESTree.IdentifierName | ESTree.PrivateIdentifier | null;
}

/** A `value` read, a `call` of the value that a lookup finds, a `size` read (`.length` or `.size`), or a `type` query. */
interface OtherUse {
	kind: 'value' | 'call' | 'size' | 'type';
}

/** How one read of a case table uses it. */
export type TableUse = MembershipUse | OtherUse;

/**
 * How a read of a table of the given kind uses it, or `null` for any use that a `switch` cannot replace, such as a
 * write, a static member read, an argument, or iteration. `node` is the table itself: a reference to a bound table, or
 * an inline table literal.
 */
export function tableUse(
	sourceCode: SourceCode,
	kind: TableKind,
	node: ESTree.Node,
): TableUse | null {
	const wrapper = outermostUse(node);
	const { parent } = wrapper;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only members, `in`, `Object.hasOwn`, and type queries read a table, so `default` covers the rest.
	switch (parent?.type) {
		case 'TSTypeQuery':
			return { kind: 'type' };
		case 'MemberExpression':
			return parent.object === wrapper ? memberUse(sourceCode, kind, parent) : null;
		case 'BinaryExpression':
			return kind === 'object' && parent.operator === 'in' && parent.right === wrapper
				? { kind: 'membership', includes: null }
				: null;
		case 'CallExpression':
			return kind === 'object' && isHasOwnCall(parent, wrapper)
				? { kind: 'membership', includes: null }
				: null;
		default:
			return null;
	}
}

/** How a member read off a table uses it: a lookup with a dynamic key, a lookup method, or `.length` or `.size`. */
function memberUse(
	sourceCode: SourceCode,
	kind: TableKind,
	member: ESTree.MemberExpression,
): TableUse | null {
	const name = propertyName(member.property, member.computed);
	if (name === null) {
		return !member.computed || kind !== 'object' || isWritten(member)
			? null
			: resultUse(sourceCode, member);
	}

	const call = methodCall(member);
	if (call === null) {
		return isSizeName(kind, name) && !isWritten(member) ? { kind: 'size' } : null;
	}
	switch (kind) {
		case 'array':
			if (name === 'includes') return { kind: 'membership', includes: member.property };
			return name === 'indexOf' ? indexOfUse(call) : null;
		case 'set':
			return name === 'has' ? { kind: 'membership', includes: null } : null;
		case 'map':
			if (name === 'has') return { kind: 'membership', includes: null };
			return name === 'get' ? resultUse(sourceCode, call) : null;
		case 'object':
			return null;
	}
}

/** The call of a method that takes exactly one argument, which is no spread, or `null` when the member is not called so. */
function methodCall(member: ESTree.MemberExpression) {
	const wrapper = outermostWrapper(member);
	if (!isCallee(wrapper)) return null;
	const { parent } = wrapper;
	if (parent.type !== 'CallExpression') return null;
	const argument = onlyElement(parent.arguments);
	return argument === null || argument.type === 'SpreadElement' ? null : parent;
}

function isSizeName(kind: TableKind, name: string) {
	switch (kind) {
		case 'array':
			return name === 'length';
		case 'set':
		case 'map':
			return name === 'size';
		case 'object':
			return false;
	}
}

/**
 * Whether `A.indexOf(k)` only tests membership, by comparing its result with `-1` or `0`, or reads a position. Either
 * use maps to a `switch`.
 */
function indexOfUse(call: ESTree.CallExpression): TableUse {
	const wrapper = outermostWrapper(call);
	const { parent } = wrapper;
	if (parent.type !== 'BinaryExpression' || !isOrderOrEquality(parent.operator)) {
		return { kind: 'value' };
	}
	const other = parent.left === wrapper ? parent.right : parent.left;
	return isMembershipBound(other) ? { kind: 'membership', includes: null } : { kind: 'value' };
}

function isOrderOrEquality(operator: ESTree.BinaryExpression['operator']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only comparisons can test a found position, so `default` covers the arithmetic operators.
	switch (operator) {
		case '===':
		case '!==':
		case '==':
		case '!=':
		case '<':
		case '<=':
		case '>':
		case '>=':
			return true;
		default:
			return false;
	}
}

/** Whether an operand is the `-1` or `0` that a position is compared against to test membership. */
function isMembershipBound(node: ESTree.Expression | ESTree.PrivateIdentifier) {
	return node.type === 'UnaryExpression'
		? negatedNumber(node) === -1
		: node.type === 'Literal' && node.value === 0;
}

/**
 * Whether the value that a lookup finds is called, directly as `T[k](x)` or `T[k]?.(x)`, or through a `const` whose
 * every read is a call. Any other use reads the value.
 */
function resultUse(sourceCode: SourceCode, lookup: ESTree.Expression): TableUse {
	const wrapper = outermostWrapper(lookup);
	if (isCallee(wrapper)) return { kind: 'call' };
	const { parent } = wrapper;
	if (
		parent.type !== 'VariableDeclarator' ||
		parent.init !== wrapper ||
		parent.id.type !== 'Identifier'
	) {
		return { kind: 'value' };
	}
	const declaration = parent.parent;
	if (declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
		return { kind: 'value' };
	}
	const variable = onlyElement(sourceCode.getDeclaredVariables(parent));
	const reads = variable?.references.filter(({ init }) => !init) ?? [];
	return reads.length > 0 && reads.every(({ identifier }) => isCallee(outermostUse(identifier)))
		? { kind: 'call' }
		: { kind: 'value' };
}

/** Whether a member is assigned, updated, or deleted, which a `switch` cannot replace. */
function isWritten(member: ESTree.MemberExpression) {
	const wrapper = outermostWrapper(member);
	const { parent } = wrapper;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only assignments, updates, and `delete` write a member, so `default` covers the rest.
	switch (parent.type) {
		case 'AssignmentExpression':
			return parent.left === wrapper;
		case 'UpdateExpression':
			return true;
		case 'UnaryExpression':
			return parent.operator === 'delete';
		default:
			return false;
	}
}

/** Whether a call is `Object.hasOwn(table, key)` with the table as its first argument. */
function isHasOwnCall(call: ESTree.CallExpression, table: ESTree.Node) {
	const { callee, arguments: args } = call;
	if (args.length !== 2 || args[0] !== table || callee.type !== 'MemberExpression') return false;
	const { object, property, computed } = callee;
	return (
		object.type === 'Identifier' &&
		object.name === 'Object' &&
		propertyName(property, computed) === 'hasOwn'
	);
}

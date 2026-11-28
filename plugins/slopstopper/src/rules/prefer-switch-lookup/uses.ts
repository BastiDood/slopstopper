import type { ESTree, Reference, SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { constReads, isGlobal } from '#ast/bindings.ts';
import { isCaseLiteral } from '#ast/case-comparand.ts';
import { methodTarget } from '#ast/known-arrays.ts';
import { isNullLiteral, isUndefined, negatedNumber } from '#ast/literals.ts';
import { isCallee, isTypeQueryName, outermostUse, outermostWrapper } from '#ast/members.ts';
import { isEquality } from '#ast/operators.ts';
import { propertyName } from '#ast/property-keys.ts';

import type { TableKind } from './tables.ts';

/** An `A.includes(k)` call, whose member the `Set` rewrite renames to `.has`. */
interface IncludesUse {
	kind: 'includes';
	member: ESTree.MemberExpression;
}

/**
 * Any other read: a `membership` test, a `value` read, a `call` of the value that a lookup finds, a `guard` that only
 * tests that value, a `size` read (`.length` or `.size`), or a `type` query (`typeof T`).
 */
interface OtherUse {
	kind: 'membership' | 'value' | 'call' | 'guard' | 'size' | 'type';
}

/** How one read of a table uses it. */
export type TableUse = IncludesUse | OtherUse;

/** How every read of a bound table uses it, or `null` as soon as one read is no lookup. */
export function usesOf(sourceCode: SourceCode, kind: TableKind, reads: readonly Reference[]) {
	const uses: TableUse[] = [];
	for (const { identifier } of reads) {
		const use = tableUse(sourceCode, kind, identifier);
		if (use === null) return null;
		uses.push(use);
	}
	return uses;
}

/**
 * How a read of a table of the given kind uses it, or `null` for any use that a `switch` cannot replace, such as a
 * write, a static member read, an argument, or iteration. The check reads only the syntax around the read, and it
 * allocates nothing for a read that it rejects, so a caller runs it before it builds a table's shape.
 */
export function tableUse(
	sourceCode: SourceCode,
	kind: TableKind,
	node: ESTree.Node,
): TableUse | null {
	const wrapper = outermostUse(node);
	if (isTypeQueryName(wrapper)) return { kind: 'type' };
	switch (kind) {
		case 'array':
			return arrayUse(wrapper);
		case 'set':
			return setUse(wrapper);
		case 'map':
			return mapUse(sourceCode, wrapper);
		case 'object':
			return objectUse(sourceCode, wrapper);
	}
}

/** `A.includes(k)`, `A.indexOf(k)`, or `A.length`. */
function arrayUse(wrapper: ESTree.Node): TableUse | null {
	const member = staticMember(wrapper);
	if (member === null) return null;
	const { name, call } = member;
	if (call === null) return name === 'length' ? { kind: 'size' } : null;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only two array methods look an entry up, so `default` covers every other name.
	switch (name) {
		case 'includes':
			return { kind: 'includes', member: member.node };
		case 'indexOf':
			return indexOfUse(call);
		default:
			return null;
	}
}

/** `S.has(k)` or `S.size`. */
function setUse(wrapper: ESTree.Node): TableUse | null {
	const member = staticMember(wrapper);
	if (member === null) return null;
	const { name, call } = member;
	if (call === null) return name === 'size' ? { kind: 'size' } : null;
	return name === 'has' ? { kind: 'membership' } : null;
}

/** `M.has(k)`, `M.get(k)`, or `M.size`. */
function mapUse(sourceCode: SourceCode, wrapper: ESTree.Node): TableUse | null {
	const member = staticMember(wrapper);
	if (member === null) return null;
	const { name, call } = member;
	if (call === null) return name === 'size' ? { kind: 'size' } : null;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only two `Map` methods look an entry up, so `default` covers every other name.
	switch (name) {
		case 'has':
			return { kind: 'membership' };
		case 'get':
			return resultUse(sourceCode, call);
		default:
			return null;
	}
}

/** `O[k]` with a dynamic key, `k in O`, or `Object.hasOwn(O, k)`. */
function objectUse(sourceCode: SourceCode, wrapper: ESTree.Node): TableUse | null {
	const { parent } = wrapper;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a member, `in`, and `Object.hasOwn` look a key up, so `default` covers the rest.
	switch (parent?.type) {
		case 'MemberExpression':
			return parent.object === wrapper && isDynamicKey(parent) && !isWritten(parent)
				? resultUse(sourceCode, parent)
				: null;
		case 'BinaryExpression':
			return parent.operator === 'in' && parent.right === wrapper
				? { kind: 'membership' }
				: null;
		case 'CallExpression':
			return isHasOwnCall(sourceCode, parent, wrapper) ? { kind: 'membership' } : null;
		default:
			return null;
	}
}

/**
 * Whether a member reads a key that no literal spells out, as in `O[k]`. A literal key, written as `O.a`, `O['a']`,
 * ``O[`a`]``, `O[-1]`, `O[true]`, or `O[null]`, reads one known entry, as a constant would. A key read through a name,
 * as in `O[K]` or `O[E.A]`, counts as dynamic, even when the name holds a constant.
 */
function isDynamicKey({ computed, property }: ESTree.MemberExpression) {
	return computed && !isCaseLiteral(property) && !isNullLiteral(property);
}

/**
 * Whether a read of a table changes it: a write to one of its members, as in `T[k] = v` or `delete T.a`, or a call of a
 * method that changes the table in place, such as `A.push`, `S.add`, or `M.set`. Expects a read that `tableUse` rejects.
 */
export function writesTable(kind: TableKind, node: ESTree.Node) {
	const wrapper = outermostUse(node);
	const { parent } = wrapper;
	if (parent?.type !== 'MemberExpression' || parent.object !== wrapper) return false;
	if (isWritten(parent)) return true;
	const name = propertyName(parent.property, parent.computed);
	return name !== null && isCallee(outermostWrapper(parent)) && changesInPlace(kind, name);
}

/** Whether a method of a table of the given kind changes the table in place. */
function changesInPlace(kind: TableKind, name: string) {
	switch (kind) {
		case 'array':
			return changesArray(name);
		case 'set':
			return name === 'add' || changesCollection(name);
		case 'map':
			return name === 'set' || changesCollection(name);
		case 'object':
			return false;
	}
}

function changesArray(name: string) {
	switch (name) {
		case 'push':
		case 'pop':
		case 'shift':
		case 'unshift':
		case 'splice':
		case 'sort':
		case 'reverse':
		case 'fill':
		case 'copyWithin':
			return true;
		default:
			return false;
	}
}

/** Whether a method of a `Set` or a `Map` removes entries. */
function changesCollection(name: string) {
	switch (name) {
		case 'delete':
		case 'clear':
			return true;
		default:
			return false;
	}
}

/**
 * The static member that a table read is the object of: its node, its name, and its call as a method with one
 * argument that is no spread, or a `null` call when no such call reads it. Returns `null` for any other read, and for a
 * member that is written.
 */
function staticMember(wrapper: ESTree.Node) {
	const { parent } = wrapper;
	if (parent?.type !== 'MemberExpression' || parent.object !== wrapper || isWritten(parent)) {
		return null;
	}
	const name = propertyName(parent.property, parent.computed);
	return name === null ? null : { node: parent, name, call: methodCall(parent) };
}

/** The call of a member as a method with exactly one argument, which is no spread, or `null` for any other read. */
function methodCall(member: ESTree.MemberExpression) {
	const wrapper = outermostWrapper(member);
	const { parent } = wrapper;
	if (parent.type !== 'CallExpression' || parent.callee !== wrapper) return null;
	const argument = onlyElement(parent.arguments);
	return argument === null || argument.type === 'SpreadElement' ? null : parent;
}

/**
 * Whether `A.indexOf(k)` only tests membership, or reads a position. It tests membership when it is compared with
 * `-1` for equality, or by `> -1`, `<= -1`, `>= 0`, or `< 0`, on either side. Any other use reads the position.
 */
function indexOfUse(call: ESTree.CallExpression): TableUse {
	const wrapper = outermostWrapper(call);
	const { parent } = wrapper;
	if (parent.type !== 'BinaryExpression') return { kind: 'value' };
	const onLeft = parent.left === wrapper;
	const bound = boundValue(onLeft ? parent.right : parent.left);
	const operator = onLeft ? parent.operator : mirrored(parent.operator);
	return bound !== null && testsMembership(operator, bound)
		? { kind: 'membership' }
		: { kind: 'value' };
}

/** The number that a comparison operand spells out: a number literal or a negated one, or `null` for anything else. */
function boundValue(node: ESTree.Expression | ESTree.PrivateIdentifier) {
	if (node.type === 'UnaryExpression') return negatedNumber(node);
	return node.type === 'Literal' && typeof node.value === 'number' ? node.value : null;
}

/** The operator that gives the same result with its operands swapped. */
function mirrored(operator: ESTree.BinaryOperator) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the order comparisons change when mirrored, so `default` covers the rest.
	switch (operator) {
		case '<':
			return '>';
		case '>':
			return '<';
		case '<=':
			return '>=';
		case '>=':
			return '<=';
		default:
			return operator;
	}
}

/** Whether `A.indexOf(k) <operator> <bound>`, with the call on the left, tests only whether `k` is in `A`. */
function testsMembership(operator: ESTree.BinaryOperator, bound: number) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only comparisons can test a found position, so `default` covers the rest.
	switch (operator) {
		case '===':
		case '!==':
		case '==':
		case '!=':
		case '>':
		case '<=':
			return bound === -1;
		case '>=':
		case '<':
			return bound === 0;
		default:
			return false;
	}
}

/**
 * Whether the value that a lookup finds is called, only tested, or read. It is called directly, as in `T[k](x)` or
 * `T[k]?.(x)`, or through a `const` that is called at least once and otherwise only tested (see `isTested`). It is a
 * `guard` when it is only tested where it is found, as in `if (T[k])` or `T[k] && T[k]()`.
 */
function resultUse(sourceCode: SourceCode, lookup: ESTree.Expression): TableUse {
	const wrapper = outermostWrapper(lookup);
	if (isCallee(wrapper)) return { kind: 'call' };
	if (isTested(sourceCode, wrapper)) return { kind: 'guard' };

	const { parent } = wrapper;
	if (parent.type !== 'VariableDeclarator' || parent.init !== wrapper) return { kind: 'value' };
	const binding = constReads(sourceCode, parent);
	if (binding === null || binding.exported) return { kind: 'value' };

	const reads = binding.reads.map(({ identifier }) => outermostUse(identifier));
	const calls = reads.some(read => isCallee(read));
	return calls && reads.every(read => isCallee(read) || isTested(sourceCode, read))
		? { kind: 'call' }
		: { kind: 'value' };
}

/**
 * Whether an expression is only tested: as the test of an `if`, a loop, or a conditional, the operand of `!`, the left
 * operand of `&&`, compared with `null` or `undefined`, or read by a `typeof` that is compared with a string.
 */
function isTested(sourceCode: SourceCode, wrapper: ESTree.Node) {
	const { parent } = wrapper;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only tests and comparisons with a nullish value or a type name only test a value, so `default` covers the rest.
	switch (parent?.type) {
		case 'IfStatement':
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'ForStatement':
		case 'ConditionalExpression':
			return parent.test === wrapper;
		case 'UnaryExpression':
			return (
				parent.operator === '!' ||
				(parent.operator === 'typeof' && isComparedWithString(parent))
			);
		case 'LogicalExpression':
			return parent.operator === '&&' && parent.left === wrapper;
		case 'BinaryExpression': {
			const other = parent.left === wrapper ? parent.right : parent.left;
			return (
				isEquality(parent.operator) &&
				other.type !== 'PrivateIdentifier' &&
				(isNullLiteral(other) || isUndefined(sourceCode, other))
			);
		}
		default:
			return false;
	}
}

/** Whether a `typeof` is compared with a string literal, as in `typeof h === 'function'`. */
function isComparedWithString(typeofExpression: ESTree.UnaryExpression) {
	const { parent } = typeofExpression;
	if (parent.type !== 'BinaryExpression' || !isEquality(parent.operator)) return false;
	const other = parent.left === typeofExpression ? parent.right : parent.left;
	return other.type === 'Literal' && typeof other.value === 'string';
}

/**
 * Whether a member is written, which a `switch` cannot replace: assigned, as a destructuring target too, the target of
 * a `for…in` or `for…of` loop, updated, or deleted.
 */
function isWritten(member: ESTree.MemberExpression) {
	const wrapper = outermostWrapper(member);
	const { parent } = wrapper;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only assignments, patterns, loop targets, updates, and `delete` write a member, so `default` covers the rest.
	switch (parent.type) {
		case 'AssignmentExpression':
		case 'AssignmentPattern':
		case 'ForInStatement':
		case 'ForOfStatement':
			return parent.left === wrapper;
		case 'ArrayPattern':
		case 'RestElement':
		case 'UpdateExpression':
			return true;
		case 'Property':
			return parent.value === wrapper && parent.parent.type === 'ObjectPattern';
		case 'UnaryExpression':
			return parent.operator === 'delete';
		default:
			return false;
	}
}

/** Whether a call is `Object.hasOwn(table, key)` of the global `Object`, with the table as its first argument. */
function isHasOwnCall(sourceCode: SourceCode, call: ESTree.CallExpression, table: ESTree.Node) {
	const { callee, arguments: args } = call;
	if (args.length !== 2 || args[0] !== table) return false;
	const target = methodTarget(callee);
	return target?.name === 'hasOwn' && isGlobal(sourceCode, target.object, 'Object');
}

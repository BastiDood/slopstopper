import type { ESTree, SourceCode, Variable } from '@oxlint/plugins';

import { assertNotNull } from '#assert.ts';
import {
	firstConstInitializer,
	isGlobal,
	isNeverReassigned,
	unvisitedVariable,
} from '#ast/bindings.ts';
import { unwrap } from '#ast/discriminant.ts';
import { propertyName } from '#ast/property-keys.ts';
import { isDefaultLibraryMember, type TypeServices } from '#type-services.ts';

/** A method that a callee names statically: its name, the property node that names it, and the receiver. */
export interface MethodTarget {
	name: string;
	property: ESTree.Expression | ESTree.IdentifierName | ESTree.PrivateIdentifier;
	object: ESTree.Expression;
}

/**
 * Whether the type checker resolves a method to the standard one of `Array` or `ReadonlyArray` (see
 * `isDefaultLibraryMember`).
 */
export function isStandardArrayMethod(services: TypeServices, property: ESTree.Node) {
	return isDefaultLibraryMember(services, isArrayTypeName, property);
}

/**
 * The call that takes a callback as its first argument and names the given method, as `xs.map` in `xs.map(callback)`,
 * or `null` for a callback anywhere else. Expects the outermost wrapper around the callback (see `outermostWrapper`).
 */
export function callbackCall(wrapper: ESTree.Node, method: string) {
	const { parent } = wrapper;
	return parent?.type === 'CallExpression' &&
		parent.arguments[0] === wrapper &&
		methodName(parent.callee) === method
		? parent
		: null;
}

/** How well an initializer is known to build an array of its own (see `arrayEvidence`). */
export type ArrayEvidence = NonNullable<ReturnType<typeof arrayEvidence>>;

/**
 * How well an initializer is known to build an array of its own, which a `Set` built from it can replace:
 *
 * - `fresh`: an array literal, a new-array method on a known array (see `isKnownArrayExpression`), or the global
 *   `Array`, `Array.from`, or `Array.of`. No other name holds the array.
 * - `possible`: a known array that another name can also hold, which is an identifier bound to one or `sort`,
 *   `reverse`, `fill`, or `copyWithin` on any receiver, since they return it; a new-array method on a receiver that
 *   is not known to be an array, such as a string's `concat` or `slice`; or `split`, `splice`, or `toArray`,
 *   which build a new array only on a string, an array, or an iterator, a type that the syntax does not show.
 *
 * Returns `null` for anything else.
 */
export function arrayEvidence(sourceCode: SourceCode, expression: ESTree.Expression) {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only literals, `new`, calls, and bindings carry array evidence, so `default` covers the rest.
	switch (node.type) {
		case 'ArrayExpression':
			return 'fresh';
		case 'NewExpression':
			return isGlobal(sourceCode, node.callee, 'Array') ? 'fresh' : null;
		case 'CallExpression': {
			if (isGlobal(sourceCode, node.callee, 'Array')) return 'fresh';
			const target = methodTarget(node.callee);
			if (target === null) return null;
			const { name, object } = target;
			if (isGlobal(sourceCode, object, 'Array')) return isArrayFactory(name) ? 'fresh' : null;
			if (returnsNewArray(name)) {
				return isKnownArrayExpression(sourceCode, object) ? 'fresh' : 'possible';
			}
			return returnsPossibleArray(name) ? 'possible' : null;
		}
		case 'Identifier':
			return isKnownArrayExpression(sourceCode, node) ? 'possible' : null;
		default:
			return null;
	}
}

/**
 * Whether `arrayEvidence` can accept an expression, judged by its syntax alone: an array literal, a name, `Array()`,
 * `new Array`, `Array.from`, `Array.of`, or a call of a method whose name can return an array. A caller runs this
 * cheap check before it resolves bindings.
 */
export function mayBuildArray(expression: ESTree.Expression) {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these forms can build an array, so `default` covers the rest.
	switch (node.type) {
		case 'ArrayExpression':
		case 'Identifier':
			return true;
		case 'CallExpression': {
			if (isArrayName(node.callee)) return true;
			const target = methodTarget(node.callee);
			if (target === null) return false;
			const { name, object } = target;
			return isArrayName(object)
				? isArrayFactory(name)
				: returnsNewArray(name) || returnsPossibleArray(name);
		}
		case 'NewExpression':
			return isArrayName(node.callee);
		default:
			return false;
	}
}

/**
 * Whether a method can return an array that another name also holds, or an array only on some receivers: `sort`,
 * `reverse`, `fill`, and `copyWithin`, which change an array in place and return it; and `split`, `splice`, and
 * `toArray`, which build a new array only on a string, an array, or an iterator. The syntax does not show the type of
 * the receiver.
 */
function returnsPossibleArray(name: string) {
	switch (name) {
		case 'sort':
		case 'reverse':
		case 'fill':
		case 'copyWithin':
		case 'split':
		case 'splice':
		case 'toArray':
			return true;
		default:
			return false;
	}
}

/** Whether an expression names `Array`, judged by its syntax alone, which cannot tell whether a local binding shadows it. */
function isArrayName(expression: ESTree.Expression) {
	const node = unwrap(expression);
	return node.type === 'Identifier' && node.name === 'Array';
}

function isArrayFactory(name: string) {
	switch (name) {
		case 'from':
		case 'of':
			return true;
		default:
			return false;
	}
}

/**
 * Whether an expression is an array by local evidence: an array literal, a call of an array method that returns a new
 * array on a known array, or a never-reassigned binding that is annotated with an array or tuple type or, for a
 * `const`, initialized with a known array. An unknown receiver, such as an iterator, does not count.
 */
export function isKnownArrayExpression(sourceCode: SourceCode, expression: ESTree.Expression) {
	return isKnownArray(sourceCode, [], expression);
}

/**
 * Whether an expression is a known array (see `isKnownArrayExpression`). `visited` holds the bindings already followed,
 * so that a cycle of aliases ends.
 */
function isKnownArray(
	sourceCode: SourceCode,
	visited: Variable[],
	expression: ESTree.Expression,
): boolean {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only literals, calls, and bindings carry array evidence, so `default` covers the rest.
	switch (node.type) {
		case 'ArrayExpression':
			return true;
		case 'CallExpression': {
			const name = methodName(node.callee);
			if (name === null || !returnsNewArray(name)) return false;
			const { object } = assertNotNull(methodTarget(node.callee));
			return isKnownArray(sourceCode, visited, object);
		}
		case 'Identifier':
			return isKnownArrayBinding(sourceCode, visited, node);
		default:
			return false;
	}
}

/**
 * Whether an identifier resolves to a never-reassigned binding whose first type annotation is an array type, or that
 * has no annotation and a `const` initializer that is a known array.
 */
function isKnownArrayBinding(
	sourceCode: SourceCode,
	visited: Variable[],
	identifier: ESTree.IdentifierReference,
) {
	const variable = unvisitedVariable(sourceCode, visited, identifier);
	if (variable === null || !isNeverReassigned(variable)) return false;

	for (const { typeAnnotation } of variable.identifiers) {
		const annotation = typeAnnotation ?? null;
		if (annotation !== null) return isArrayAnnotation(annotation.typeAnnotation);
	}
	const init = firstConstInitializer(variable);
	return init !== null && isKnownArray(sourceCode, visited, init);
}

/** The static name of the method that a callee reads, as `map` in `xs.map`, or `null` when the callee is no member. */
export function methodName(callee: ESTree.Expression) {
	const member = unwrap(callee);
	return member.type === 'MemberExpression'
		? propertyName(member.property, member.computed)
		: null;
}

function returnsNewArray(name: string) {
	switch (name) {
		case 'map':
		case 'filter':
		case 'flatMap':
		case 'flat':
		case 'slice':
		case 'concat':
		case 'toSorted':
		case 'toReversed':
		case 'toSpliced':
		case 'with':
			return true;
		default:
			return false;
	}
}

/**
 * The method that a callee names statically, as in `xs.map` or `xs['map']`, through optional chains and TypeScript
 * assertions (see `unwrap`). Returns `null` for any other callee, such as a private name or a dynamic computed key.
 */
export function methodTarget(callee: ESTree.Expression) {
	const member = unwrap(callee);
	if (member.type !== 'MemberExpression') return null;
	const { property, computed, object } = member;
	const name = propertyName(property, computed);
	return name === null ? null : ({ name, property, object } satisfies MethodTarget);
}

/** Whether a type annotation is an array or tuple type, `Array<T>`, or `ReadonlyArray<T>`, optionally `readonly`. */
function isArrayAnnotation(type: ESTree.TSType): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only array, tuple, `readonly`, and reference types name an array, so `default` covers the rest.
	switch (type.type) {
		case 'TSArrayType':
		case 'TSTupleType':
			return true;
		case 'TSTypeOperator':
			return type.operator === 'readonly' && isArrayAnnotation(type.typeAnnotation);
		case 'TSTypeReference': {
			const { typeName } = type;
			return typeName.type === 'Identifier' && isArrayTypeName(typeName.name);
		}
		default:
			return false;
	}
}

function isArrayTypeName(name: string) {
	switch (name) {
		case 'Array':
		case 'ReadonlyArray':
			return true;
		default:
			return false;
	}
}

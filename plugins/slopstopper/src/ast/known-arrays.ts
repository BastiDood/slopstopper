import type { ESTree, SourceCode, Variable } from '@oxlint/plugins';

import { assertNotNull } from '#assert.ts';
import { firstConstInitializer, isNeverReassigned, unvisitedVariable } from '#ast/bindings.ts';
import { unwrap } from '#ast/discriminant.ts';
import { propertyName } from '#ast/property-keys.ts';
import { isDefaultLibraryMember, type TypeServices } from '#type-services.ts';

/** The interfaces of the default library that declare the standard array methods. */

/** A method that a callee names statically: its name, the property node that names it, and the receiver. */
export interface MethodTarget {
	name: string;
	property: ESTree.Expression | ESTree.IdentifierName | ESTree.PrivateIdentifier;
	object: ESTree.Expression;
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
 * Whether the type checker resolves a method to the standard one of `Array` or `ReadonlyArray` (see
 * `isDefaultLibraryMember`).
 */
export function isStandardArrayMethod(services: TypeServices, property: ESTree.Node) {
	return isDefaultLibraryMember(services, isArrayTypeName, property);
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
 * The method that a callee names statically, as in `xs.map` or `xs['map']`, through optional chains and TypeScript
 * assertions (see `unwrap`). Returns `null` for any other callee, such as a private name or a dynamic computed key.
 */
/** The static name of the method that a callee reads, as `map` in `xs.map`, or `null` when the callee is no member. */
export function methodName(callee: ESTree.Expression) {
	const member = unwrap(callee);
	return member.type === 'MemberExpression'
		? propertyName(member.property, member.computed)
		: null;
}

export function methodTarget(callee: ESTree.Expression) {
	const member = unwrap(callee);
	if (member.type !== 'MemberExpression') return null;
	const { property, computed, object } = member;
	const name = propertyName(property, computed);
	return name === null ? null : ({ name, property, object } satisfies MethodTarget);
}

function returnsNewArray(name: string) {
	switch (name) {
		case 'map':
		case 'filter':
		case 'flatMap':
		case 'slice':
		case 'concat':
		case 'toSorted':
		case 'toReversed':
		case 'toSpliced':
			return true;
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

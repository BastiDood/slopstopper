import type { Definition, ESTree, SourceCode } from '@oxlint/plugins';

import { constInitializer, onlyDefinition } from '#ast/bindings.ts';
import { unwrap } from '#ast/discriminant.ts';
import { negatedNumber, scalarKindOf } from '#ast/literals.ts';
import { propertyName } from '#ast/property-keys.ts';
import {
	isNeverOrTopType,
	type Type,
	type TypeChecker,
	typeAtLocation,
	typeServicesOf,
	type TypeServices,
} from '#type-services.ts';

/**
 * Builds the `CaseComparand` predicate for a file: an expression that a `switch` case can name as a constant. The
 * syntax tier accepts a literal (see `isCaseLiteral`), an identifier bound to a same-file `const` whose initializer is
 * such a literal, a member of a same-file `enum`, and a member of a same-file `const` object literal whose property is
 * such a literal. With type information, the type tier also accepts an expression of a single literal type, such as an
 * imported constant or an enum member. Call it once per file.
 */
export function caseComparandsOf(sourceCode: SourceCode) {
	const services = typeServicesOf(sourceCode);
	return (node: ESTree.Expression) =>
		isCaseLiteral(node) ||
		isConstantReference(sourceCode, node) ||
		(services !== null && hasLiteralType(services, node));
}

/**
 * Whether an expression reads a same-file constant that a `switch` case can name: an identifier bound to a `const`
 * literal, `E.A` of an `enum E`, or `K.A` of a `const K` object literal whose property `A` is a literal.
 */
function isConstantReference(sourceCode: SourceCode, node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only identifiers and member accesses read constants, so `default` covers the rest.
	switch (node.type) {
		case 'Identifier': {
			const definition = onlyDefinition(sourceCode, node);
			if (definition === null) return false;
			const value = constValue(definition);
			return value !== null && isCaseLiteral(value);
		}
		case 'MemberExpression': {
			const key = propertyName(node.property, node.computed);
			const object = unwrap(node.object);
			if (key === null || object.type !== 'Identifier') return false;

			const definition = onlyDefinition(sourceCode, object);
			if (definition === null) return false;
			if (definition.node.type === 'TSEnumDeclaration') return true;
			const value = constValue(definition);
			return value?.type === 'ObjectExpression' && hasLiteralProperty(value, key);
		}
		default:
			return false;
	}
}

/**
 * The initializer of a `const` declarator that binds an identifier (see `constInitializer`), without `as const`,
 * `satisfies`, and other wrappers, or `null` for any other definition.
 */
function constValue(definition: Definition) {
	const initializer = constInitializer(definition);
	return initializer === null ? null : unwrap(initializer);
}

/** Whether the first property of an object literal with the given name holds a literal that a `switch` case can name. */
function hasLiteralProperty({ properties }: ESTree.ObjectExpression, name: string) {
	for (const property of properties) {
		if (
			property.type === 'Property' &&
			property.kind === 'init' &&
			propertyName(property.key, property.computed) === name
		) {
			return isCaseLiteral(unwrap(property.value));
		}
	}
	return false;
}

/**
 * Whether an expression is a literal that a `switch` case can name: a string, number, boolean, or bigint literal, a
 * template literal without expressions, or a negated number. `null` and regular expressions are excluded.
 */
function isCaseLiteral(node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the many expression types are literals, so `default` covers the rest.
	switch (node.type) {
		case 'Literal':
			return scalarKindOf(node.value) !== null;
		case 'TemplateLiteral':
			return node.expressions.length === 0;
		case 'UnaryExpression':
			return negatedNumber(node) !== null;
		default:
			return false;
	}
}

/** Whether the type of an expression is a single literal type. */
function hasLiteralType(services: TypeServices, node: ESTree.Expression) {
	const type = typeAtLocation(services, node);
	return type !== null && isLiteralType(services.checker, type);
}

/**
 * Whether a type is a single literal type: a string, number, or bigint literal, an enum literal member, `true`, or
 * `false`. Unions (including `boolean` and whole enums) and intersections are excluded. Literal types carry a `value`,
 * except `true` and `false`, which are the only other types that are assignable to `boolean` without being a union,
 * `never`, or a top type such as `any`.
 */
function isLiteralType(checker: TypeChecker, type: Type) {
	if (type.isUnion() || type.isIntersection()) return false;
	if (typeof type.value !== 'undefined') return true;
	return (
		!isNeverOrTopType(checker, type) &&
		checker.isTypeAssignableTo(type, checker.getBooleanType())
	);
}

import type { ESTree, SourceCode } from '@oxlint/plugins';

import { AssertionError } from '#assert.ts';
import { findVariable } from '#ast/bindings.ts';

/**
 * Whether a type is an intersection whose constituents are all object type literals or extendable type references, so
 * that an `interface ... extends` declares it instead. Owned by `needless-type-intersection`.
 */
export function isExtendableIntersection(sourceCode: SourceCode, type: ESTree.TSType) {
	return type.type === 'TSIntersectionType' && isExtendable(sourceCode, type);
}

/** Whether every constituent of the type is an object type literal or an extendable type reference. */
function isExtendable(sourceCode: SourceCode, type: ESTree.TSType): boolean {
	switch (type.type) {
		case 'TSParenthesizedType':
			throw new AssertionError('both parsers drop type parentheses');
		case 'TSIntersectionType':
			return type.types.every(constituent => isExtendable(sourceCode, constituent));
		case 'TSTypeLiteral':
			return true;
		case 'TSImportType':
			return type.qualifier !== null;
		case 'TSTypeReference':
			return isExtendableName(sourceCode, type.typeName);
		case 'TSAnyKeyword':
		case 'TSBigIntKeyword':
		case 'TSBooleanKeyword':
		case 'TSIntrinsicKeyword':
		case 'TSNeverKeyword':
		case 'TSNullKeyword':
		case 'TSNumberKeyword':
		case 'TSObjectKeyword':
		case 'TSStringKeyword':
		case 'TSSymbolKeyword':
		case 'TSUndefinedKeyword':
		case 'TSUnknownKeyword':
		case 'TSVoidKeyword':
		case 'TSArrayType':
		case 'TSConditionalType':
		case 'TSConstructorType':
		case 'TSFunctionType':
		case 'TSIndexedAccessType':
		case 'TSInferType':
		case 'TSLiteralType':
		case 'TSMappedType':
		case 'TSNamedTupleMember':
		case 'TSTemplateLiteralType':
		case 'TSThisType':
		case 'TSTupleType':
		case 'TSTypeOperator':
		case 'TSTypePredicate':
		case 'TSTypeQuery':
		case 'TSUnionType':
		case 'TSJSDocNullableType':
		case 'TSJSDocNonNullableType':
		case 'TSJSDocUnknownType':
			return false;
	}
}

/** Whether an interface can extend the named type, assuming that names outside the file are extendable. */
function isExtendableName(sourceCode: SourceCode, name: ESTree.TSTypeName) {
	switch (name.type) {
		case 'Identifier':
			return !isTypeParameter(sourceCode, name);
		case 'TSQualifiedName':
			return true;
		case 'ThisExpression':
			throw new AssertionError('both parsers parse a `this` type as `TSThisType`');
	}
}

/** Whether the nearest binding of the referenced name is a type parameter, which an interface cannot extend. */
function isTypeParameter(sourceCode: SourceCode, identifier: ESTree.IdentifierReference) {
	const variable = findVariable(sourceCode.getScope(identifier), identifier.name);
	return variable?.defs.some(({ node }) => node.type === 'TSTypeParameter') === true;
}

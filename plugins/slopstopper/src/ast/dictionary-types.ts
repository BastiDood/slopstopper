import type { ESTree, SourceCode } from '@oxlint/plugins';

import {
	fullyExpanded,
	globalTypeName,
	type ResolvedType,
	typeDeclaration,
	within,
} from '#ast/type-aliases.ts';

/** Whether a value type promises nothing about a value because it is `any`, or for another reason, or `null` when it promises something. */
type UnsafeValue = 'any' | 'unsafe' | null;

/**
 * Whether a value type promises nothing about a value: `unknown`, `any`, `object`, an empty object type (see
 * `isEmptyObjectType`), a union with such a member, an intersection whose every member is one (or one of which is
 * `any`), or a global `Readonly`, `Partial`, `Required`, or `NonNullable` of one, after expanding aliases.
 */
export function isUnsafeValue(sourceCode: SourceCode, value: ResolvedType) {
	return unsafeExpansion(sourceCode, value) !== null;
}

/**
 * The type that a value type expands to (see `fullyExpanded`) when it promises nothing about a value (see
 * `isUnsafeValue`), or `null` when it promises something.
 */
export function unsafeExpansion(sourceCode: SourceCode, value: ResolvedType) {
	const resolved = fullyExpanded(sourceCode, value);
	return unsafeValue(sourceCode, resolved) === null ? null : resolved;
}

/**
 * Whether a value type promises nothing about a value (see `isUnsafeValue`), and whether because it is `any`. Expects a
 * type that expands no further (see `fullyExpanded`).
 */
function unsafeValue(sourceCode: SourceCode, resolved: ResolvedType): UnsafeValue {
	const { type } = resolved;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these types can promise nothing, so `default` covers the rest.
	switch (type.type) {
		case 'TSAnyKeyword':
			return 'any';
		case 'TSUnknownKeyword':
		case 'TSObjectKeyword':
			return 'unsafe';
		case 'TSTypeLiteral':
			return isEmptyObjectType(type.members) ? 'unsafe' : null;
		case 'TSUnionType':
			return type.types.some(member => isUnsafeValue(sourceCode, within(resolved, member)))
				? 'unsafe'
				: null;
		case 'TSIntersectionType': {
			let isEveryMemberUnsafe = true;
			for (const member of type.types) {
				const value = unsafeValue(
					sourceCode,
					fullyExpanded(sourceCode, within(resolved, member)),
				);
				if (value === 'any') return 'any';
				if (value === null) isEveryMemberUnsafe = false;
			}
			return isEveryMemberUnsafe ? 'unsafe' : null;
		}
		case 'TSTypeReference': {
			const argument = transparentArgument(globalTypeName(sourceCode, type), type);
			if (argument !== null) {
				return unsafeValue(
					sourceCode,
					fullyExpanded(sourceCode, within(resolved, argument)),
				);
			}
			return isEmptyInterface(sourceCode, type) ? 'unsafe' : null;
		}
		default:
			return null;
	}
}

/**
 * The type argument of a reference to a global `Readonly`, `Partial`, `Required`, or `NonNullable`, given the global
 * name that the reference names (see `globalTypeName`), or `null` for any other reference.
 */
export function transparentArgument(
	globalName: string | null,
	{ typeArguments }: ESTree.TSTypeReference,
) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the four transparent wrappers matter, so `default` covers `null` and every other name.
	switch (globalName) {
		case 'Readonly':
		case 'Partial':
		case 'Required':
		case 'NonNullable':
			return typeArguments?.params[0] ?? null;
		default:
			return null;
	}
}

/** Whether a reference names a same-file interface, declared once, that extends nothing and is an empty object type. */
function isEmptyInterface(sourceCode: SourceCode, { typeName }: ESTree.TSTypeReference) {
	if (typeName.type !== 'Identifier') return false;
	const declaration = typeDeclaration(sourceCode, typeName);
	return (
		declaration?.type === 'TSInterfaceDeclaration' &&
		declaration.extends.length === 0 &&
		isEmptyObjectType(declaration.body.body)
	);
}

/** Whether an object type accepts any object: every member, if any, is an optional property of type `never`. */
function isEmptyObjectType(members: readonly ESTree.TSSignature[]) {
	return members.every(
		member =>
			member.type === 'TSPropertySignature' &&
			member.optional &&
			member.typeAnnotation?.typeAnnotation.type === 'TSNeverKeyword',
	);
}

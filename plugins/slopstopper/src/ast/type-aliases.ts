import type { ESTree, SourceCode } from '@oxlint/plugins';

import { onlyDefinition, resolvedVariable } from '#ast/bindings.ts';

/** The type arguments that the type parameters of expanded aliases stand for, each in the context where it is written. */
type Substitutions = ReadonlyMap<ESTree.TSTypeParameter, ResolvedType>;

/**
 * A type in the context of the alias expansions that led to it: the type arguments of the expanded aliases, and the
 * aliases themselves, which do not expand again, so that a recursive alias ends. The expansion of an alias substitutes
 * every type parameter of the alias (see `aliasExpansion`), so an alias without type parameters expands without
 * substitutions.
 */
export interface ResolvedType {
	type: ESTree.TSType;
	substitutions: Substitutions;
	expanding: ReadonlySet<ESTree.TSTypeAliasDeclaration>;
}

/** The substitutions outside any alias expansion, shared by every such type. */
const NO_SUBSTITUTIONS: Substitutions = new Map<ESTree.TSTypeParameter, ResolvedType>();

/** The aliases that expand outside any alias expansion, shared by every such type. */
const NO_EXPANSIONS: ReadonlySet<ESTree.TSTypeAliasDeclaration> =
	new Set<ESTree.TSTypeAliasDeclaration>();

/** A type as written, outside any alias expansion. */
export function written(type: ESTree.TSType) {
	return {
		type,
		substitutions: NO_SUBSTITUTIONS,
		expanding: NO_EXPANSIONS,
	} satisfies ResolvedType;
}

/** The type that a resolved type expands to once no alias or type parameter is left to expand (see `expand`). */
export function fullyExpanded(sourceCode: SourceCode, resolved: ResolvedType) {
	let current = resolved;
	while (true) {
		const next = expand(sourceCode, current);
		if (next === null) return current;
		current = next;
	}
}

/**
 * Expands a type reference by one step, following the scope of its name. A type parameter with a type argument becomes
 * that argument in its own context. A same-file type alias that is not already expanding becomes its type, with its
 * type parameters bound to the reference's type arguments or to their defaults. Returns `null` for any other type, and
 * for an alias reference that leaves a type parameter without an argument or a default. A type as written (see
 * `written`) has no type arguments to substitute, so only an alias reference expands.
 */
export function expand(sourceCode: SourceCode, resolved: ResolvedType) {
	const { type } = resolved;
	if (type.type !== 'TSTypeReference' || type.typeName.type !== 'Identifier') return null;
	const declaration = typeDeclaration(sourceCode, type.typeName);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only type parameters and aliases expand, so `default` covers every other declaration.
	switch (declaration?.type) {
		case 'TSTypeParameter':
			return resolved.substitutions.get(declaration) ?? null;
		case 'TSTypeAliasDeclaration':
			return resolved.expanding.has(declaration)
				? null
				: aliasExpansion(declaration, resolved, type);
		default:
			return null;
	}
}

/**
 * The node that declares the only definition of a type name, such as a type alias, an interface, or a type parameter,
 * or `null` when the name is unresolved, global, or declared more than once, as merged interfaces are.
 */
export function typeDeclaration(sourceCode: SourceCode, name: ESTree.IdentifierReference) {
	const definition = onlyDefinition(sourceCode, name);
	return definition === null ? null : definition.node;
}

/**
 * The type of an alias with its type parameters bound. An explicit type argument keeps the context of the reference,
 * and a default takes the context of the alias with the type parameters before it.
 */
function aliasExpansion(
	alias: ESTree.TSTypeAliasDeclaration,
	reference: ResolvedType,
	{ typeArguments }: ESTree.TSTypeReference,
) {
	const expanding = new Set(reference.expanding).add(alias);
	const parameters = alias.typeParameters?.params;
	if (typeof parameters === 'undefined') {
		return {
			type: alias.typeAnnotation,
			substitutions: NO_SUBSTITUTIONS,
			expanding,
		} satisfies ResolvedType;
	}

	const substitutions = new Map<ESTree.TSTypeParameter, ResolvedType>();
	for (const [index, parameter] of parameters.entries()) {
		const argument = typeArguments?.params[index];
		const fallback = parameter.default ?? null;
		if (typeof argument !== 'undefined') {
			substitutions.set(parameter, within(reference, argument));
		} else if (fallback === null) {
			return null;
		} else {
			substitutions.set(parameter, {
				type: fallback,
				substitutions: new Map(substitutions),
				expanding,
			});
		}
	}

	return { type: alias.typeAnnotation, substitutions, expanding } satisfies ResolvedType;
}

/** A child type of a resolved type, in the same context. */
export function within({ substitutions, expanding }: ResolvedType, type: ESTree.TSType) {
	return { type, substitutions, expanding } satisfies ResolvedType;
}

/**
 * The name of the global type that a reference names, such as `Record` or `Promise`, when no binding of the file shadows
 * it, or `null` for any other reference. A linter may resolve a global to a variable without definitions.
 */
export function globalTypeName(sourceCode: SourceCode, { typeName }: ESTree.TSTypeReference) {
	if (typeName.type !== 'Identifier') return null;
	const variable = resolvedVariable(sourceCode, typeName);
	return variable === null || variable.defs.length === 0 ? typeName.name : null;
}

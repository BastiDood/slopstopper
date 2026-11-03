import type { ESTree, SourceCode } from '@oxlint/plugins';

import { transparentArgument } from '#ast/dictionary-types.ts';
import {
	expand,
	fullyExpanded,
	globalTypeName,
	type ResolvedType,
	within,
	written,
} from '#ast/type-aliases.ts';

/** How an explicit target type widens a value: to `unknown`, to `object`, to an anonymous object type, or to an open dictionary. */
type WideningTarget = 'unknown' | 'object' | 'anonymous object' | 'open dictionary';

/**
 * How an explicit target type discards the known type of a value, or `null` when it keeps it: `unknown`, `object`, an
 * anonymous object type, an object type with an index signature, a mapped type, or a global `Record` with a broad key
 * (see `isBroadKey`), seen through global `Readonly`, `Partial`, `Required`, and `NonNullable`. A same-file alias names
 * a contract, so it widens only when it resolves to `unknown`, `object`, or an open dictionary (see `aliasTarget`), and
 * a generic alias only when it resolves to an open dictionary.
 */
export function wideningTarget(sourceCode: SourceCode, type: ESTree.TSType): WideningTarget | null {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these types can widen a value, so `default` covers the rest.
	switch (type.type) {
		case 'TSUnknownKeyword':
			return 'unknown';
		case 'TSObjectKeyword':
			return 'object';
		case 'TSTypeLiteral':
			if (hasIndexSignature(type)) return 'open dictionary';
			return type.members.length > 0 ? 'anonymous object' : null;
		case 'TSMappedType':
			return 'open dictionary';
		case 'TSTypeReference':
			return referenceTarget(sourceCode, type);
		default:
			return null;
	}
}

/**
 * How a type reference widens a value (see `wideningTarget`). Only an alias reference expands as written (see `expand`),
 * and its expansion has substitutions exactly when the alias is generic (see `ResolvedType`).
 */
function referenceTarget(sourceCode: SourceCode, type: ESTree.TSTypeReference) {
	const globalName = globalTypeName(sourceCode, type);
	const wrapped = transparentArgument(globalName, type);
	if (wrapped !== null) return wideningTarget(sourceCode, wrapped);
	if (globalName === 'Record') return recordTarget(sourceCode, written(type), type);

	const alias = expand(sourceCode, written(type));
	if (alias === null) return null;
	const target = aliasTarget(sourceCode, alias);
	return alias.substitutions.size === 0 || target === 'open dictionary' ? target : null;
}

/**
 * How the type that an alias resolves to widens a value: to `unknown`, to `object`, or to an open dictionary, which is
 * an object type with an index signature, or a mapped type or a global `Record` with a broad key (see `isBroadKey`).
 */
function aliasTarget(sourceCode: SourceCode, alias: ResolvedType): WideningTarget | null {
	const resolved = fullyExpanded(sourceCode, alias);
	const { type } = resolved;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these types can widen a value, so `default` covers the rest.
	switch (type.type) {
		case 'TSUnknownKeyword':
			return 'unknown';
		case 'TSObjectKeyword':
			return 'object';
		case 'TSTypeLiteral':
			return hasIndexSignature(type) ? 'open dictionary' : null;
		case 'TSMappedType':
			return isBroadKey(sourceCode, within(resolved, type.constraint))
				? 'open dictionary'
				: null;
		case 'TSTypeReference': {
			const globalName = globalTypeName(sourceCode, type);
			const wrapped = transparentArgument(globalName, type);
			if (wrapped !== null) return aliasTarget(sourceCode, within(resolved, wrapped));
			return globalName === 'Record' ? recordTarget(sourceCode, resolved, type) : null;
		}
		default:
			return null;
	}
}

function hasIndexSignature({ members }: ESTree.TSTypeLiteral) {
	return members.some(({ type }) => type === 'TSIndexSignature');
}

/** An open dictionary when a global `Record` in the given context has a broad key (see `isBroadKey`) or none at all. */
function recordTarget(
	sourceCode: SourceCode,
	context: ResolvedType,
	{ typeArguments }: ESTree.TSTypeReference,
) {
	const [key] = typeArguments?.params ?? [];
	return typeof key === 'undefined' || isBroadKey(sourceCode, within(context, key))
		? 'open dictionary'
		: null;
}

/**
 * Whether a key type admits keys that no value spells out in advance: `string`, `number`, `symbol`, the global
 * `PropertyKey`, or a union that holds one, after expanding aliases.
 */
function isBroadKey(sourceCode: SourceCode, key: ResolvedType): boolean {
	const resolved = fullyExpanded(sourceCode, key);
	const { type } = resolved;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these types can be broad keys, so `default` covers the rest.
	switch (type.type) {
		case 'TSStringKeyword':
		case 'TSNumberKeyword':
		case 'TSSymbolKeyword':
			return true;
		case 'TSUnionType':
			return type.types.some(member => isBroadKey(sourceCode, within(resolved, member)));
		case 'TSTypeReference':
			return globalTypeName(sourceCode, type) === 'PropertyKey';
		default:
			return false;
	}
}

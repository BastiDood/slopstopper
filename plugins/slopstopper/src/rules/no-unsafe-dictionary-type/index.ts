import { type Context, defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { transparentArgument, unsafeExpansion } from '#ast/dictionary-types.ts';
import { messageLabel } from '#ast/labels.ts';
import {
	fullyExpanded,
	globalTypeName,
	type ResolvedType,
	typeDeclaration,
	within,
	written,
} from '#ast/type-aliases.ts';

/** A type that can declare a dictionary: an object type with an index signature, a mapped type, or a reference. */
type DictionaryCandidate = ESTree.TSTypeReference | ESTree.TSTypeLiteral | ESTree.TSMappedType;

/**
 * Where a dictionary type sits: inside the constraint of a type parameter, inside a type alias declaration, and within
 * which enclosing dictionary types.
 */
interface Ancestry {
	inConstraint: boolean;
	inAliasDeclaration: boolean;
	dictionaries: DictionaryCandidate[];
}

/**
 * Reports a dictionary type whose value type promises nothing about its values: `Record<K, V>`, an index signature, or
 * a mapped type whose `V` is `unknown`, `any`, `object`, `{}`, or a union or alias that holds one (see `isUnsafeValue`).
 * Global `Readonly`, `Partial`, `Required`, `NonNullable`, `Pick`, and `Omit` and same-file aliases are seen through.
 * Only the outermost dictionary type is reported, a type parameter constraint is exempt, and a plain reference to an
 * alias outside alias declarations is left to the report on the alias.
 */
export const NO_UNSAFE_DICTIONARY_TYPE = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow dictionary types whose value type is `unknown`, `any`, `object`, `{}`, or a union or alias that holds one.',
		},
		messages: {
			unsafeDictionary:
				'`{{dictionary}}` declares its values as `{{value}}`, which promises nothing about them. Replace `{{value}}` with the concrete value type, and parse untrusted data into that type before inserting it.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		return {
			TSTypeReference: node => checkDictionary(context, node),
			TSTypeLiteral: node => checkDictionary(context, node),
			TSMappedType: node => checkDictionary(context, node),
			TSIndexSignature(node) {
				// The object type that holds an index signature reports it.
				if (node.parent.type === 'TSTypeLiteral') return;
				const value = unsafeExpansion(
					sourceCode,
					written(node.typeAnnotation.typeAnnotation),
				);
				if (value !== null) report(context, node, value);
			},
		};
	},
});

/** Reports a dictionary type with an unsafe value type unless an exemption applies (see `NO_UNSAFE_DICTIONARY_TYPE`). */
function checkDictionary(context: Context, node: DictionaryCandidate) {
	const { sourceCode } = context;
	const { inConstraint, inAliasDeclaration, dictionaries } = ancestryOf(node);
	if (inConstraint || (!inAliasDeclaration && isPlainAliasReference(sourceCode, node))) return;
	const value = unsafeValueType(sourceCode, node);
	if (
		value === null ||
		dictionaries.some(dictionary => unsafeValueType(sourceCode, dictionary) !== null)
	) {
		return;
	}
	report(context, node, value);
}

/** Reports a dictionary with its value type, expanded through aliases and type parameters to the type that is unsafe. */
function report(context: Context, dictionary: ESTree.Node, { type: value }: ResolvedType) {
	const { sourceCode } = context;
	context.report({
		node: dictionary,
		messageId: 'unsafeDictionary',
		data: {
			dictionary: messageLabel(sourceCode.getText(dictionary)),
			value: messageLabel(sourceCode.getText(value)),
		},
	});
}

/**
 * Whether a type lies inside the constraint of a type parameter, as in `T extends Record<string, unknown>`, and inside
 * a type alias declaration, and the dictionary types that enclose it, so that an enclosing one reports instead.
 */
function ancestryOf(node: DictionaryCandidate) {
	let inConstraint = false;
	let inAliasDeclaration = false;
	const dictionaries: DictionaryCandidate[] = [];
	let child: ESTree.Node = node;
	for (let { parent } = node; parent.type !== 'Program'; { parent } = parent) {
		// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only constraints, alias declarations, and dictionary types matter, so `default` covers the rest.
		switch (parent.type) {
			case 'TSTypeParameter':
				inConstraint ||= parent.constraint === child;
				break;
			case 'TSTypeAliasDeclaration':
				inAliasDeclaration = true;
				break;
			case 'TSTypeReference':
			case 'TSTypeLiteral':
			case 'TSMappedType':
				dictionaries.push(parent);
				break;
			default:
				break;
		}
		child = parent;
	}
	return { inConstraint, inAliasDeclaration, dictionaries } satisfies Ancestry;
}

/** Whether a type is a reference to a same-file alias without type arguments. */
function isPlainAliasReference(sourceCode: SourceCode, node: DictionaryCandidate) {
	if (
		node.type !== 'TSTypeReference' ||
		(node.typeArguments !== null && typeof node.typeArguments !== 'undefined') ||
		node.typeName.type !== 'Identifier'
	) {
		return false;
	}
	const declaration = typeDeclaration(sourceCode, node.typeName);
	return declaration?.type === 'TSTypeAliasDeclaration';
}

/**
 * The first value type of a dictionary type that promises nothing, expanded to the type that is unsafe (see
 * `unsafeExpansion`), or `null` when none does.
 */
function unsafeValueType(sourceCode: SourceCode, node: DictionaryCandidate) {
	for (const value of valueTypes(sourceCode, written(node))) {
		const unsafe = unsafeExpansion(sourceCode, value);
		if (unsafe !== null) return unsafe;
	}
	return null;
}

/**
 * The value types of a dictionary type: the types of an object type's index signatures, the value of a mapped type, or
 * `V` of a global `Record<K, V>`, seen through global `Readonly`, `Partial`, `Required`, `NonNullable`, `Pick`, and
 * `Omit` and through aliases. Returns no types for any other type.
 */
function valueTypes(sourceCode: SourceCode, dictionary: ResolvedType): ResolvedType[] {
	const resolved = fullyExpanded(sourceCode, dictionary);
	const { type } = resolved;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only object types, mapped types, and references declare dictionaries, so `default` covers the rest.
	switch (type.type) {
		case 'TSTypeLiteral':
			return type.members.flatMap(member =>
				member.type === 'TSIndexSignature'
					? [within(resolved, member.typeAnnotation.typeAnnotation)]
					: [],
			);
		case 'TSMappedType': {
			const value = type.typeAnnotation ?? null;
			return value === null ? [] : [within(resolved, value)];
		}
		case 'TSTypeReference':
			return referencedValueTypes(sourceCode, resolved, type);
		default:
			return [];
	}
}

/** The value types of a reference to a global dictionary type or a wrapper of one (see `valueTypes`). */
function referencedValueTypes(
	sourceCode: SourceCode,
	resolved: ResolvedType,
	type: ESTree.TSTypeReference,
) {
	const globalName = globalTypeName(sourceCode, type);
	const wrapped = transparentArgument(globalName, type);
	if (wrapped !== null) return valueTypes(sourceCode, within(resolved, wrapped));

	const [first, second] = type.typeArguments?.params ?? [];
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these global names declare dictionaries, so `default` covers `null` and every other name.
	switch (globalName) {
		case 'Record':
			return typeof second === 'undefined' ? [] : [within(resolved, second)];
		case 'Pick':
		case 'Omit':
			return typeof first === 'undefined'
				? []
				: valueTypes(sourceCode, within(resolved, first));
		default:
			return [];
	}
}

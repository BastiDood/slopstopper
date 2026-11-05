import { type Context, defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { functionLabel, messageLabel } from '#ast/labels.ts';
import {
	fullyExpanded,
	globalTypeName,
	type ResolvedType,
	within,
	written,
} from '#ast/type-aliases.ts';

/** A function or a function signature whose return type the rule checks. */
type Signature =
	| ESTree.ArrowFunctionExpression
	| ESTree.Function
	| ESTree.TSCallSignatureDeclaration
	| ESTree.TSConstructSignatureDeclaration
	| ESTree.TSConstructorType
	| ESTree.TSFunctionType
	| ESTree.TSMethodSignature;

/**
 * Reports an explicit return type that resolves to `unknown`: `unknown` itself, a union that holds it, a global
 * `Promise` or `PromiseLike` of such a type, or a reference to a same-file alias that resolves to one of these. The
 * caller then has to check a value that the function could have checked once.
 */
export const NO_UNKNOWN_RETURNS = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow explicit return types that resolve to `unknown` or `Promise<unknown>`.',
		},
		messages: {
			unknownReturn:
				'The return type `{{type}}` of {{function}} hands `unknown` to every caller. Validate the value inside {{function}} and declare the validated type as its return type.',
		},
		schema: [],
	},
	create(context) {
		return {
			ArrowFunctionExpression: node => checkReturnType(context, node),
			FunctionDeclaration: node => checkReturnType(context, node),
			FunctionExpression: node => checkReturnType(context, node),
			TSDeclareFunction: node => checkReturnType(context, node),
			TSEmptyBodyFunctionExpression: node => checkReturnType(context, node),
			TSCallSignatureDeclaration: node => checkReturnType(context, node),
			TSConstructSignatureDeclaration: node => checkReturnType(context, node),
			TSConstructorType: node => checkReturnType(context, node),
			TSFunctionType: node => checkReturnType(context, node),
			TSMethodSignature: node => checkReturnType(context, node),
		};
	},
});

/** Reports the return type of a signature when it resolves to `unknown`. */
function checkReturnType(context: Context, signature: Signature) {
	const { sourceCode } = context;
	const { returnType } = signature;
	if (returnType === null || typeof returnType === 'undefined') return;
	const { typeAnnotation } = returnType;
	if (!returnsUnknown(sourceCode, written(typeAnnotation))) return;

	context.report({
		node: typeAnnotation,
		messageId: 'unknownReturn',
		data: {
			type: messageLabel(sourceCode.getText(typeAnnotation)),
			function: functionLabel(signature),
		},
	});
}

/**
 * Whether a return type is `unknown`, a union that holds `unknown`, or a global `Promise` or `PromiseLike` of such a
 * type, after expanding aliases and type parameters.
 */
function returnsUnknown(sourceCode: SourceCode, returnType: ResolvedType): boolean {
	const resolved = fullyExpanded(sourceCode, returnType);
	const { type } = resolved;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only `unknown`, unions, and promise references can resolve to `unknown`, so `default` covers the rest.
	switch (type.type) {
		case 'TSUnknownKeyword':
			return true;
		case 'TSUnionType':
			return type.types.some(member => returnsUnknown(sourceCode, within(resolved, member)));
		case 'TSTypeReference': {
			const value = promisedType(sourceCode, type);
			return value !== null && returnsUnknown(sourceCode, within(resolved, value));
		}
		default:
			return false;
	}
}

/** The type argument of a reference to the global `Promise` or `PromiseLike`, or `null` for any other reference. */
function promisedType(sourceCode: SourceCode, reference: ESTree.TSTypeReference) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two promise types matter, so `default` covers `null` and every other name.
	switch (globalTypeName(sourceCode, reference)) {
		case 'Promise':
		case 'PromiseLike':
			return reference.typeArguments?.params[0] ?? null;
		default:
			return null;
	}
}

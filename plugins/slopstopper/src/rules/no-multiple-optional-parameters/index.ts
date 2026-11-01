import { type Context, defineRule, type ESTree } from '@oxlint/plugins';

import { isOptionalParameter } from '#ast/parameters.ts';

/** Reports a signature with two or more optional parameters, which belong in one options object instead. */
export const NO_MULTIPLE_OPTIONAL_PARAMETERS = defineRule({
	meta: {
		type: 'suggestion',
		docs: { description: 'Disallow signatures with more than one optional parameter.' },
		messages: {
			multipleOptional:
				'This signature has {{count}} optional parameters. Group them into one `options: Partial<Options>` parameter so that callers name each value instead of padding positions.',
		},
		schema: [],
	},
	create(context) {
		return {
			ArrowFunctionExpression: node => check(context, node),
			FunctionDeclaration: node => check(context, node),
			FunctionExpression: node => check(context, node),
			TSDeclareFunction: node => check(context, node),
			TSEmptyBodyFunctionExpression: node => check(context, node),
			TSMethodSignature: node => check(context, node),
			TSFunctionType: node => check(context, node),
			TSCallSignatureDeclaration: node => check(context, node),
			TSConstructSignatureDeclaration: node => check(context, node),
			TSConstructorType: node => check(context, node),
		};
	},
});

/** Reports a signature with two or more optional parameters. */
function check(context: Context, node: { params: ESTree.ParamPattern[] } & ESTree.Node) {
	let count = 0;
	for (const parameter of node.params) if (isOptionalParameter(parameter)) ++count;
	if (count > 1) context.report({ node, messageId: 'multipleOptional', data: { count } });
}

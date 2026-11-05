import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { methodName } from '#ast/known-arrays.ts';
import { outermostWrapper } from '#ast/members.ts';
import { mutationMethodOf } from '#ast/tanstack-mutations.ts';

/**
 * Reports a `QueryClient` cache update inside the per-call callbacks of a TanStack Query mutation's `mutate`. TanStack
 * Query drops these callbacks when the component unmounts first or a later call replaces this one, so the update can
 * silently not run, while the callbacks of the mutation definition always run. There is no rewrite: the definition can
 * live in another module.
 */
export const NO_MUTATE_CALLBACK_CACHE_UPDATE = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow `QueryClient` cache updates in the per-call callbacks of a TanStack Query `mutate` call.',
		},
		messages: {
			cacheUpdate:
				'Move this cache update into the callbacks of the mutation definition. Callbacks passed to `mutate` do not run when the component unmounts first or when a later call replaces this one, so keep only UI consequences here.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		return {
			CallExpression(node) {
				const name = methodName(node.callee);
				if (name === null || !isCacheUpdate(name)) return;
				if (isInsideMutateOptions(sourceCode, node)) {
					context.report({ node, messageId: 'cacheUpdate' });
				}
			},
		};
	},
});

/** Whether a method of `QueryClient` updates the query cache. */
function isCacheUpdate(name: string) {
	switch (name) {
		case 'invalidateQueries':
		case 'refetchQueries':
		case 'resetQueries':
		case 'removeQueries':
		case 'cancelQueries':
		case 'setQueryData':
		case 'setQueriesData':
			return true;
		default:
			return false;
	}
}

/** Whether a node sits inside an object literal that is the second argument of a call to `mutate`. */
function isInsideMutateOptions(sourceCode: SourceCode, node: ESTree.Node) {
	for (let { parent } = node; parent !== null; { parent } = parent) {
		if (parent.type === 'ObjectExpression' && isMutateOptions(sourceCode, parent)) return true;
	}
	return false;
}

/** Whether an object literal is the second argument of a call to `mutate`. */
function isMutateOptions(sourceCode: SourceCode, options: ESTree.ObjectExpression) {
	const wrapper = outermostWrapper(options);
	const { parent } = wrapper;
	return (
		parent.type === 'CallExpression' &&
		parent.arguments[1] === wrapper &&
		mutationMethodOf(sourceCode, parent.callee) === 'mutate'
	);
}

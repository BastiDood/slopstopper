import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { methodTarget } from '#ast/known-arrays.ts';
import { outermostWrapper } from '#ast/members.ts';
import { mutationMethodOf } from '#ast/tanstack-mutations.ts';

/**
 * Reports a member call of a `QueryClient` cache update (`invalidateQueries`, `refetchQueries`, `resetQueries`,
 * `removeQueries`, `cancelQueries`, `setQueryData`, or `setQueriesData`) anywhere inside the object literal that is the
 * second argument of a call to a mutation's `mutate`. The callee is `mutate` when it reads that method (see
 * `mutationMethodOf`): a field that a `const` pattern destructures from `useMutation` or `createMutation` under any
 * local name, a `const` alias of one, an untraced identifier named `mutate`, or any member named `mutate`. TanStack
 * Query drops these per-call callbacks when the component unmounts first or a later call replaces this one, so a cache
 * update there can silently not run. The callbacks of the mutation definition always run, so the update belongs there.
 * There is no rewrite: moving the update needs the definition, which can live in another module.
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
				const target = methodTarget(node.callee);
				if (target === null || !isCacheUpdate(target.name)) return;
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

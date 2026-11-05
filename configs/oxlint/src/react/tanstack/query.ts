import type { Entry } from '#compose/index.ts';

export const TANSTACK_REACT_QUERY = {
	config: {},
	restrictions: {
		importPaths: [
			{
				name: '@tanstack/react-query',
				importNames: ['useQueryClient'],
				message:
					'Perform client actions in mutation success or failure hooks, which receive the query client in context, instead of capturing `useQueryClient`. Suppress this only to call `prefetchQuery` on hover or `ensureQueryData` in an event handler, and name that use in the suppression reason.',
			},
		],
		syntax: [
			{
				selector:
					'VariableDeclarator[id.type="Identifier"] > CallExpression[callee.name="useMutation"]',
				message:
					'Destructure the fields that you use from `useMutation(...)`. The result object changes identity on every render, so keeping it whole makes it an unstable dependency.',
			},
		],
	},
} satisfies Entry;

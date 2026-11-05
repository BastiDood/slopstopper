import type { Entry } from '#compose/index.ts';

/** TanStack Query rules that apply to every framework adapter. */
export const TANSTACK_QUERY = {
	config: { rules: {} },
	restrictions: {
		syntax: [
			{
				selector:
					'CallExpression:matches([callee.name="mutate"], [callee.property.name="mutate"]) > ObjectExpression:nth-child(2) CallExpression[callee.property.name=/^(?:invalidateQueries|refetchQueries|resetQueries|removeQueries|cancelQueries|setQueryData|setQueriesData)$/]',
				message:
					'Move this cache update into the callbacks of the mutation definition. Callbacks passed to `mutate` do not run when the component unmounts first or when a later call replaces this one, so keep only UI consequences here.',
			},
		],
	},
} satisfies Entry;

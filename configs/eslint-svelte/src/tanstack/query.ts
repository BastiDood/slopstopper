/** TanStack Svelte Query rules. */
export const TANSTACK_SVELTE_QUERY = {
	restrictions: {
		importPaths: [
			{
				name: '@tanstack/svelte-query',
				importNames: ['useQueryClient'],
				message:
					'Obtain the `QueryClient` from the query or mutation callback context instead of capturing `useQueryClient` in a closure. Suppress this only to call `prefetchQuery` on hover or `ensureQueryData` in an event handler, and name that use in the suppression reason.',
			},
		],
		syntax: [
			{
				selector:
					'VariableDeclarator[id.type="ObjectPattern"][init.callee.name=/^create(?:Query|InfiniteQuery|Mutation|Queries)$/]',
				message:
					'Read fields from the result object, such as `query.data`. The result is a reactive proxy, so destructuring copies its current values and stops updates.',
			},
			{
				selector:
					'CallExpression[callee.name=/^create(?:Infinite)?Query$/] > :function > ObjectExpression > Property[key.name="queryFn"], CallExpression[callee.name=/^create(?:Infinite)?Query$/] > :function > BlockStatement ReturnStatement > ObjectExpression > Property[key.name="queryFn"]',
				message:
					'Define `queryKey` and `queryFn` together in a `queryOptions()` factory and pass its result, such as `createQuery(() => jobQueries.detail(id))`.',
			},
			{
				selector:
					'SvelteDirective[kind="Action"][key.name.name="enhance"] ~ SvelteAttribute[key.name="onsubmit"], SvelteAttribute[key.name="onsubmit"] ~ SvelteDirective[kind="Action"][key.name.name="enhance"]',
				message:
					'Choose one submission lifecycle for this form: `use:enhance` with a SvelteKit form action, or an `onsubmit` handler that calls a TanStack mutation. With both, one submit runs both.',
			},
		],
	},
};

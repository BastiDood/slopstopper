/** Forbids capturing the TanStack Svelte Query client in closures. */
export const TANSTACK_SVELTE_QUERY = {
	restrictions: {
		importPaths: [
			{
				name: '@tanstack/svelte-query',
				importNames: ['useQueryClient'],
				message:
					'Obtain the `QueryClient` from the query or mutation callback context instead of capturing `useQueryClient` in a closure.',
			},
		],
	},
};

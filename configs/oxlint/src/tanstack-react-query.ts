import type { Entry } from './compose/index.ts';

export const TANSTACK_REACT_QUERY = {
	config: {},
	restrictions: {
		importPaths: [
			{
				name: '@tanstack/react-query',
				importNames: ['useQueryClient'],
				message:
					'Perform client actions in mutation success or failure hooks, which receive the query client in context, instead of capturing `useQueryClient`.',
			},
		],
	},
} satisfies Entry;

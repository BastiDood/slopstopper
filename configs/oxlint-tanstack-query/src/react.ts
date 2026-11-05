import type { Entry } from '@bastidood/oxlint-config';

/**
 * TanStack React Query rules from `@tanstack/eslint-plugin-query`. `no-void-query-fn` is off because it needs type
 * information, which Oxlint does not give to JS plugins. The plugin specifier resolves from this package, so that the
 * consumer does not install the plugin itself.
 */
export const TANSTACK_REACT_QUERY = {
	config: {
		jsPlugins: [
			{
				name: '@tanstack/query',
				specifier: import.meta.resolve('@tanstack/eslint-plugin-query'),
			},
		],
		rules: {
			'@tanstack/query/exhaustive-deps': 'error',
			'@tanstack/query/infinite-query-property-order': 'error',
			'@tanstack/query/mutation-property-order': 'error',
			'@tanstack/query/no-rest-destructuring': 'error',
			'@tanstack/query/no-unstable-deps': 'error',
			'@tanstack/query/prefer-query-options': 'error',
			'@tanstack/query/stable-query-client': 'error',
		},
	},
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

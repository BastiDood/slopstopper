import type { Linter } from 'eslint';
import sveltePlugin from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export interface RestrictedGlobal {
	readonly name: string;
	readonly message: string;
}

export interface ScopedGlobals {
	readonly files: string[];
	readonly restrictions: { readonly globals: RestrictedGlobal[] };
}

export interface SvelteEntry {
	readonly configs: (Linter.Config | Linter.Config[])[];
	readonly extraFileExtensions: string[];
	readonly scopedRestrictions: ScopedGlobals[];
}

/** Svelte components and rune modules, the files that `eslint-plugin-svelte` itself parses. */
const SVELTE_FILES = ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'];

/** `eslint-plugin-svelte` rules with type-aware parsing of `.svelte` components and rune modules. */
export const SVELTE: SvelteEntry = {
	configs: [
		sveltePlugin.configs.recommended,
		{
			name: '@bastidood/eslint-config-svelte/parser',
			files: SVELTE_FILES,
			languageOptions: {
				parserOptions: {
					parser: tseslint.parser,
					projectService: true,
				},
			},
			// `svelte/prefer-const` replaces the base rule, which reports runes such as `$derived`.
			rules: { 'prefer-const': 'off', 'svelte/prefer-const': 'error' },
		},
	],
	extraFileExtensions: ['.svelte'],
	scopedRestrictions: [
		{
			files: SVELTE_FILES,
			restrictions: {
				globals: [
					{
						name: '$effect',
						message:
							'Perform side effects in the event handlers that cause them instead of synchronizing them with `$effect`, which leads to buggy reactivity.',
					},
				],
			},
		},
	],
};

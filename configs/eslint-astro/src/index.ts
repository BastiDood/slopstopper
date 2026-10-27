import type { Linter } from 'eslint';
import { configs as astroConfigs } from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';

export interface AstroEntry {
	readonly configs: (Linter.Config | Linter.Config[])[];
	readonly extraFileExtensions: string[];
}

/**
 * `eslint-plugin-astro` rules with type-aware parsing of `.astro` components.
 *
 * @param tsconfigRootDir Directory that contains the project's `tsconfig.json`, usually `import.meta.dirname`.
 */
export function astro(tsconfigRootDir: string): AstroEntry {
	return {
		configs: [
			astroConfigs.recommended,
			{
				name: '@bastidood/eslint-config-astro/parser',
				// `eslint-plugin-astro` parses these files with `astro-eslint-parser`.
				files: ['**/*.astro'],
				languageOptions: {
					parserOptions: {
						parser: tseslint.parser,
						// `astro-eslint-parser` supports `project` but not `projectService`.
						projectService: false,
						project: true,
						tsconfigRootDir,
					},
				},
			},
		],
		extraFileExtensions: ['.astro'],
	};
}

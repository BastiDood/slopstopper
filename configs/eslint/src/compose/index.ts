import { RestrictionLists } from '@bastidood/oxlint-config/restrictions';
import type { Linter } from 'eslint';

export interface RestrictedImportPath {
	readonly name: string;
	readonly importNames?: string[];
	readonly message: string;
}

export interface RestrictedImportPattern {
	readonly regex: string;
	readonly message: string;
}

export interface RestrictedGlobal {
	readonly name: string;
	readonly message: string;
}

export interface RestrictedProperty {
	readonly object: string;
	readonly property: string;
	readonly message: string;
}

export interface RestrictedSyntax {
	readonly selector: string;
	readonly message: string;
}

/** The same restriction lists as `@bastidood/oxlint-config/restrictions`. */
export interface Restrictions {
	readonly importPaths?: RestrictedImportPath[];
	readonly importPatterns?: RestrictedImportPattern[];
	readonly globals?: RestrictedGlobal[];
	readonly properties?: RestrictedProperty[];
	readonly syntax?: RestrictedSyntax[];
}

export interface ScopedRestrictions {
	readonly files: string[];
	readonly restrictions: Restrictions;
}

/**
 * An entry point: ESLint configuration objects plus the lists that `compose` concatenates, namely the
 * restriction lists, the non-standard file extensions that the TypeScript project service must resolve, and the
 * file extensions that the `import` rules follow, with the parser of each extension that the linted file's parser
 * cannot parse. `configs` may nest a configuration list one level deep, such as a plugin's `recommended` list.
 */
export interface Entry {
	readonly configs?: (Linter.Config | Linter.Config[])[];
	readonly extraFileExtensions?: string[];
	readonly importExtensions?: string[];
	/** Maps the module name of a parser to the file extensions that it parses, as in `import-x/parsers`. */
	readonly importParsers?: Record<string, string[]>;
	readonly restrictions?: Restrictions;
	readonly scopedRestrictions?: ScopedRestrictions[];
}

/**
 * Compose entry points into one ESLint flat configuration for `extends`. Restriction lists and file extension
 * lists are concatenated instead of replaced, and every scoped configuration repeats the top-level restrictions
 * so that it cannot drop them.
 */
// oxlint-disable-next-line slopstopper/no-inferrable-return-type -- `tsdown` cannot emit the inferred type, which references ESLint's unexported `RulesConfig` (TS2883).
export function compose(...entries: Entry[]): Linter.Config[] {
	const configs: Linter.Config[] = [];
	const extraFileExtensions: string[] = [];
	const importExtensions: string[] = [];
	const importParsers: Record<string, string[]> = {};
	const restrictions = new RestrictionLists();

	for (const {
		configs: entryConfigs,
		extraFileExtensions: entryExtensions,
		importExtensions: entryImportExtensions,
		importParsers: entryImportParsers,
		restrictions: entryRestrictions,
	} of entries) {
		appendConfigs(configs, entryConfigs);
		appendAll(extraFileExtensions, entryExtensions);
		appendAll(importExtensions, entryImportExtensions);
		if (typeof entryImportParsers !== 'undefined') {
			for (const parser in entryImportParsers) {
				if (!Object.hasOwn(entryImportParsers, parser)) continue;
				const extensions = importParsers[parser] ?? [];
				appendAll(extensions, entryImportParsers[parser]);
				importParsers[parser] = extensions;
			}
		}
		if (typeof entryRestrictions !== 'undefined') restrictions.append(entryRestrictions);
	}

	configs.push({
		name: '@bastidood/eslint-config/restrictions',
		rules: restrictionRules(restrictions),
	});

	for (const { scopedRestrictions } of entries) {
		if (typeof scopedRestrictions === 'undefined') continue;
		for (const { files, restrictions: scoped } of scopedRestrictions) {
			const lists = restrictions.copy();
			lists.append(scoped);
			configs.push({
				name: '@bastidood/eslint-config/scoped-restrictions',
				files,
				rules: restrictionRules(lists),
			});
		}
	}

	if (extraFileExtensions.length > 0) {
		configs.push({
			name: '@bastidood/eslint-config/project-service',
			languageOptions: { parserOptions: { extraFileExtensions } },
		});
	}

	if (importExtensions.length > 0) {
		configs.push({
			name: '@bastidood/eslint-config/import-extensions',
			settings: {
				'import-x/extensions': importExtensions,
				'import-x/parsers': importParsers,
			},
		});
	}

	return configs;
}

function appendAll<T>(target: T[], items: Iterable<T> | undefined) {
	if (typeof items === 'undefined') return;
	for (const item of items) target.push(item);
}

/** Append an entry point's configurations, flattening nested configuration lists one level. */
function appendConfigs(target: Linter.Config[], configs: Entry['configs']) {
	if (typeof configs === 'undefined') return;
	for (const config of configs) {
		if (Array.isArray(config)) {
			for (const nested of config) target.push(nested);
		} else {
			target.push(config);
		}
	}
}

function restrictionRules(lists: RestrictionLists) {
	const rules: Linter.RulesRecord = {};
	const imports = lists.importsRule();
	if (imports !== null) rules['no-restricted-imports'] = imports;
	const globals = lists.globalsRule();
	if (globals !== null) rules['no-restricted-globals'] = globals;
	const properties = lists.propertiesRule();
	if (properties !== null) rules['no-restricted-properties'] = properties;
	const syntax = lists.syntaxRule();
	if (syntax !== null) rules['no-restricted-syntax'] = syntax;
	return rules;
}

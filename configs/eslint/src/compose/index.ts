import { RestrictionLists } from '@bastidood/oxlint-config/restrictions';
import type { Linter } from 'eslint';
import type { NewResolver } from 'eslint-plugin-import-x';

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

/** An `import-x/resolver-next` resolver. `eslint-import-resolver-typescript` widens `interfaceVersion` to `number`. */
export interface ImportResolver extends Omit<NewResolver, 'interfaceVersion'> {
	readonly interfaceVersion: number;
}

export interface ScopedRestrictions {
	readonly files: string[];
	readonly restrictions: Restrictions;
}

/**
 * An entry point: ESLint configuration objects plus the lists that `compose` concatenates, namely the
 * restriction lists, the non-standard file extensions that the TypeScript project service must resolve, and the
 * `import-x` settings lists. `configs` may nest a configuration list one level deep, such as a plugin's
 * `recommended` list.
 */
export interface Entry {
	readonly configs?: (Linter.Config | Linter.Config[])[];
	readonly extraFileExtensions?: string[];
	/** The file extensions that the `import` rules follow, as in `import-x/extensions`. */
	readonly importExtensions?: string[];
	/** The folders whose modules the `import` rules treat as external, as in `import-x/external-module-folders`. */
	readonly importExternalModuleFolders?: string[];
	/** Maps the module name of a parser to the file extensions that it parses, as in `import-x/parsers`. */
	readonly importParsers?: Record<string, string[]>;
	/** The resolvers that the `import` rules try in order, as in `import-x/resolver-next`. */
	readonly importResolvers?: ImportResolver[];
	readonly restrictions?: Restrictions;
	readonly scopedRestrictions?: ScopedRestrictions[];
}

/**
 * Compose entry points into one ESLint flat configuration for `extends`. Restriction lists, file extension
 * lists, and `import-x` settings lists are concatenated instead of replaced, and every scoped configuration repeats the top-level restrictions
 * so that it cannot drop them.
 */
// oxlint-disable-next-line slopstopper/no-inferrable-return-type -- `tsdown` cannot emit the inferred type, which references ESLint's unexported `RulesConfig` (TS2883).
export function compose(...entries: Entry[]): Linter.Config[] {
	const configs: Linter.Config[] = [];
	const extraFileExtensions: string[] = [];
	const importExtensions: string[] = [];
	const importExternalModuleFolders: string[] = [];
	const importParsers: Record<string, string[]> = {};
	const importResolvers: ImportResolver[] = [];
	let hasImportParsers = false;
	const restrictions = new RestrictionLists();

	for (const {
		configs: entryConfigs,
		extraFileExtensions: entryExtensions,
		importExtensions: entryImportExtensions,
		importExternalModuleFolders: entryImportExternalModuleFolders,
		importParsers: entryImportParsers,
		importResolvers: entryImportResolvers,
		restrictions: entryRestrictions,
	} of entries) {
		appendConfigs(configs, entryConfigs);
		appendAll(extraFileExtensions, entryExtensions);
		appendAll(importExtensions, entryImportExtensions);
		appendAll(importExternalModuleFolders, entryImportExternalModuleFolders);
		appendAll(importResolvers, entryImportResolvers);
		if (typeof entryImportParsers !== 'undefined') {
			for (const parser in entryImportParsers) {
				if (!Object.hasOwn(entryImportParsers, parser)) continue;
				const extensions = importParsers[parser] ?? [];
				appendAll(extensions, entryImportParsers[parser]);
				importParsers[parser] = extensions;
				hasImportParsers = true;
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

	// Each `import-x` setting is written only when an entry contributes to it, so that an empty list does not replace
	// the plugin's default.
	const importSettings: NonNullable<Linter.Config['settings']> = {};
	let hasImportSettings = hasImportParsers;
	if (hasImportParsers) importSettings['import-x/parsers'] = importParsers;
	if (importExtensions.length > 0) {
		importSettings['import-x/extensions'] = importExtensions;
		hasImportSettings = true;
	}
	if (importExternalModuleFolders.length > 0) {
		importSettings['import-x/external-module-folders'] = importExternalModuleFolders;
		hasImportSettings = true;
	}
	if (importResolvers.length > 0) {
		importSettings['import-x/resolver-next'] = importResolvers;
		hasImportSettings = true;
	}
	if (hasImportSettings) {
		configs.push({ name: '@bastidood/eslint-config/import', settings: importSettings });
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

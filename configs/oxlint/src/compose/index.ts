import type { ExternalPluginEntry, OxlintConfig, OxlintOverride } from 'oxlint';

import {
	RestrictionLists,
	type Restrictions,
	type ScopedRestrictions,
} from '#restrictions/index.ts';

/** An entry point: an Oxlint configuration plus the restriction lists that `compose` concatenates. */
export interface Entry {
	readonly config: OxlintConfig;
	readonly restrictions?: Restrictions;
	readonly scopedRestrictions?: ScopedRestrictions[];
}

type Rules = NonNullable<OxlintConfig['rules']>;
type Plugin = NonNullable<OxlintConfig['plugins']>[number];

const ESLINT_JS_PLUGIN = { name: 'eslint-js', specifier: 'oxlint-plugin-eslint' };

/**
 * Compose entry points into one Oxlint configuration for `extends`. Restriction lists are concatenated
 * instead of replaced, and every scoped override repeats the top-level restrictions so that it cannot drop
 * them.
 */
export function compose(...entries: Entry[]) {
	const plugins = new Set<Plugin>();
	const jsPlugins = new Map<string, ExternalPluginEntry>();
	const categories: NonNullable<OxlintConfig['categories']> = {};
	const env: NonNullable<OxlintConfig['env']> = {};
	const globals: NonNullable<OxlintConfig['globals']> = {};
	const ignorePatterns: string[] = [];
	const overrides: OxlintOverride[] = [];
	const rules: Rules = {};
	const restrictions = new RestrictionLists();

	for (const {
		config: {
			plugins: entryPlugins,
			jsPlugins: entryJsPlugins,
			categories: entryCategories,
			env: entryEnv,
			globals: entryGlobals,
			ignorePatterns: entryIgnorePatterns,
			overrides: entryOverrides,
			rules: entryRules,
		},
		restrictions: entryRestrictions,
	} of entries) {
		if (typeof entryPlugins !== 'undefined') {
			for (const plugin of entryPlugins) plugins.add(plugin);
		}
		if (typeof entryJsPlugins !== 'undefined' && entryJsPlugins !== null) {
			for (const plugin of entryJsPlugins) jsPlugins.set(pluginName(plugin), plugin);
		}
		Object.assign(categories, entryCategories);
		Object.assign(env, entryEnv);
		Object.assign(globals, entryGlobals);
		Object.assign(rules, entryRules);
		if (typeof entryIgnorePatterns !== 'undefined') {
			for (const pattern of entryIgnorePatterns) ignorePatterns.push(pattern);
		}
		if (typeof entryOverrides !== 'undefined') {
			for (const override of entryOverrides) overrides.push(override);
		}
		if (typeof entryRestrictions !== 'undefined') restrictions.append(entryRestrictions);
	}

	let usesSyntax = writeRestrictionRules(rules, restrictions);
	for (const { scopedRestrictions } of entries) {
		if (typeof scopedRestrictions === 'undefined') continue;
		for (const { files, restrictions: scoped } of scopedRestrictions) {
			const lists = restrictions.copy();
			lists.append(scoped);
			const scopedRules: Rules = {};
			usesSyntax = writeRestrictionRules(scopedRules, lists) || usesSyntax;
			overrides.push({ files, rules: scopedRules });
		}
	}
	if (usesSyntax) jsPlugins.set(ESLINT_JS_PLUGIN.name, ESLINT_JS_PLUGIN);

	return {
		plugins: [...plugins],
		jsPlugins: [...jsPlugins.values()],
		categories,
		env,
		globals,
		ignorePatterns,
		overrides,
		rules,
	} satisfies OxlintConfig;
}

/** Write the non-empty restriction rules and report whether a syntax restriction needs the `eslint-js` plugin. */
function writeRestrictionRules(rules: Rules, lists: RestrictionLists) {
	const imports = lists.importsRule();
	if (imports !== null) rules['no-restricted-imports'] = imports;
	const globals = lists.globalsRule();
	if (globals !== null) rules['no-restricted-globals'] = globals;
	const properties = lists.propertiesRule();
	if (properties !== null) rules['no-restricted-properties'] = properties;
	const syntax = lists.syntaxRule();
	if (syntax !== null) rules['eslint-js/no-restricted-syntax'] = syntax;
	return syntax !== null;
}

function pluginName(plugin: ExternalPluginEntry) {
	return typeof plugin === 'string' ? plugin : plugin.name;
}

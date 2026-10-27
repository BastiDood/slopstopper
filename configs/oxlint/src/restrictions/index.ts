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

interface ImportOptions {
	readonly paths: RestrictedImportPath[];
	readonly patterns: RestrictedImportPattern[];
}

/**
 * Restriction lists accumulated across entry points for the list-valued `no-restricted-*` rules, which Oxlint and
 * ESLint replace instead of merge. Each list is stored as the final rule entry with its severity in front, so
 * emitting a rule never copies the list.
 */
export class RestrictionLists {
	readonly #imports: ImportOptions = { paths: [], patterns: [] };
	readonly #globals: ['error', ...RestrictedGlobal[]] = ['error'];
	readonly #properties: ['error', ...RestrictedProperty[]] = ['error'];
	readonly #syntax: ['error', ...RestrictedSyntax[]] = ['error'];

	/** Append every list of an entry point's restrictions. */
	append(restrictions: Restrictions) {
		appendAll(this.#imports.paths, restrictions.importPaths);
		appendAll(this.#imports.patterns, restrictions.importPatterns);
		appendAll(this.#globals, restrictions.globals);
		appendAll(this.#properties, restrictions.properties);
		appendAll(this.#syntax, restrictions.syntax);
	}

	/** Copy these lists so that a scoped override can extend them without changing the top-level rules. */
	copy() {
		const copy = new RestrictionLists();
		appendAll(copy.#imports.paths, this.#imports.paths);
		appendAll(copy.#imports.patterns, this.#imports.patterns);
		appendAll(copy.#globals, this.#globals.values().drop(1));
		appendAll(copy.#properties, this.#properties.values().drop(1));
		appendAll(copy.#syntax, this.#syntax.values().drop(1));
		return copy;
	}

	importsRule(): ['error', ImportOptions] | null {
		const { paths, patterns } = this.#imports;
		return paths.length === 0 && patterns.length === 0 ? null : ['error', this.#imports];
	}

	globalsRule() {
		return this.#globals.length === 1 ? null : this.#globals;
	}

	propertiesRule() {
		return this.#properties.length === 1 ? null : this.#properties;
	}

	syntaxRule() {
		return this.#syntax.length === 1 ? null : this.#syntax;
	}
}

function appendAll<T>(target: T[], items: Iterable<T> | undefined) {
	if (typeof items === 'undefined') return;
	for (const item of items) target.push(item);
}

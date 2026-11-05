import type {
	Definition,
	DefinitionType,
	ESTree,
	Scope,
	SourceCode,
	Variable,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';

/**
 * Whether an identifier resolves to a local binding with exactly one definition and no write besides its
 * initialization, such as a `const`, or a `let` or parameter that is never reassigned.
 */
export function isUnwritten(sourceCode: SourceCode, identifier: ESTree.IdentifierReference) {
	const variable = resolvedVariable(sourceCode, identifier);
	if (variable === null) return false;
	const definition = onlyElement(variable.defs);
	return definition !== null && isLocalBinding(definition.type) && isNeverReassigned(variable);
}

/**
 * The only definition of the variable that an identifier resolves to, or `null` when it resolves to none or the
 * variable has no definition or several, as globals and merged declarations do.
 */
export function onlyDefinition(sourceCode: SourceCode, identifier: ESTree.IdentifierReference) {
	const variable = resolvedVariable(sourceCode, identifier);
	return variable === null ? null : onlyElement(variable.defs);
}

/**
 * The variable that an identifier resolves to when a walk over aliases reaches it for the first time, or `null` when it
 * resolves to none or `visited` already holds it. Appends the variable to `visited`, so that a cycle of aliases ends. A
 * walk that must not follow a reassigned alias checks `isNeverReassigned` itself.
 */
export function unvisitedVariable(
	sourceCode: SourceCode,
	visited: Variable[],
	identifier: ESTree.IdentifierReference,
) {
	const variable = resolvedVariable(sourceCode, identifier);
	if (variable === null || visited.includes(variable)) return null;
	visited.push(variable);
	return variable;
}

/** The variable that an identifier resolves to, or `null` when it resolves to none. */
export function resolvedVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference) {
	const { references } = sourceCode.getScope(identifier);
	const reference = references.find(candidate => candidate.identifier === identifier);
	return reference?.resolved ?? null;
}

/**
 * The initializer of a variable that a `const` declarator binds to an identifier, as written, or `null` for any other
 * variable. Only the first such definition counts, so that a declaration that merges with the `const` leaves it intact.
 */
export function firstConstInitializer({ defs }: Variable) {
	for (const definition of defs) {
		const init = constInitializer(definition);
		if (init !== null) return init;
	}
	return null;
}

/** The initializer of a `const` declarator that binds an identifier, as written, or `null` for any other definition. */
export function constInitializer({ node }: Definition) {
	if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier') return null;
	const { init, parent } = node;
	return parent.type === 'VariableDeclaration' && parent.kind === 'const' ? init : null;
}

/** Whether no reference writes a variable besides its initialization. */
export function isNeverReassigned({ references }: Variable) {
	return references.every(reference => reference.init || !reference.isWrite());
}

/** Whether a name resolves in the scope chain of a scope, or names a global that code in the scope reads. */
export function isBound(scope: Scope, name: string) {
	return (
		scope.through.some(({ identifier }) => identifier.name === name) ||
		findVariable(scope, name) !== null
	);
}

/** The nearest variable with the given name in a scope or the scopes that enclose it, or `null` when none declares it. */
export function findVariable(scope: Scope, name: string) {
	for (let current: Scope | null = scope; current !== null; current = current.upper) {
		const variable = current.set.get(name);
		if (typeof variable !== 'undefined') return variable;
	}
	return null;
}

/** Whether a definition binds a local name. Imports are live bindings that the exporting module can change. */
function isLocalBinding(type: DefinitionType) {
	switch (type) {
		case 'Variable':
		case 'Parameter':
		case 'CatchClause':
		case 'ClassName':
		case 'FunctionName':
			return true;
		case 'ImportBinding':
		case 'ImplicitGlobalVariable':
			return false;
	}
}

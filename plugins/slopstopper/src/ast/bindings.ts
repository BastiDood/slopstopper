import type { DefinitionType, ESTree, Scope, SourceCode, Variable } from '@oxlint/plugins';

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

/** The variable that an identifier resolves to, or `null` when it resolves to none. */
export function resolvedVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference) {
	const { references } = sourceCode.getScope(identifier);
	const reference = references.find(candidate => candidate.identifier === identifier);
	return reference?.resolved ?? null;
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

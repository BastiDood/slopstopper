import type { ESTree, SourceCode, Variable } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { firstConstInitializer, resolvedVariable, unvisitedVariable } from '#ast/bindings.ts';
import { unwrap } from '#ast/discriminant.ts';
import { methodName } from '#ast/known-arrays.ts';
import { propertyName } from '#ast/property-keys.ts';

/** Matches the name of a TanStack Query adapter package, such as `@tanstack/react-query` or `@tanstack/svelte-query`. */
const TANSTACK_QUERY_PACKAGE_REGEX = /^@tanstack\/[\w-]+-query$/u;

/**
 * The method of a TanStack Query mutation that an expression reads: `mutate` or `mutateAsync`, or `null` for anything
 * else. A member reads the method of its static property name, whatever its object. An identifier reads the method that
 * its binding holds: a field that a `const` pattern destructures, under any local name, from the result of
 * `useMutation` or `createMutation` (see `isMutationResult`), or a `const` alias of such a method. An
 * identifier that the rule cannot trace reads the method of its own name.
 */
export function mutationMethodOf(sourceCode: SourceCode, expression: ESTree.Expression) {
	return methodOf(sourceCode, [], expression);
}

/** The method that every reference to a variable reads (see `mutationMethodOf`). */
export function variableMethodOf(sourceCode: SourceCode, variable: Variable) {
	return namedMethod(sourceCode, [variable], variable, variable.name);
}

/**
 * The method that an expression reads (see `mutationMethodOf`). `visited` holds the aliases already followed, so that
 * a cycle of aliases ends.
 */
function methodOf(
	sourceCode: SourceCode,
	visited: Variable[],
	expression: ESTree.Expression,
): ReturnType<typeof mutationMethod> {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only identifiers and members read a method, so `default` covers the rest.
	switch (node.type) {
		case 'Identifier':
			return namedMethod(
				sourceCode,
				visited,
				unvisitedVariable(sourceCode, visited, node),
				node.name,
			);
		case 'MemberExpression': {
			const name = methodName(node);
			return name === null ? null : mutationMethod(name);
		}
		default:
			return null;
	}
}

/**
 * The method that an identifier reads: the method that its `const` binding holds, or else the method of its name.
 * Expects `visited` to hold the variable already.
 */
function namedMethod(
	sourceCode: SourceCode,
	visited: Variable[],
	variable: Variable | null,
	name: string,
) {
	const traced = variable === null ? null : boundMethod(sourceCode, visited, variable);
	return traced ?? mutationMethod(name);
}

/**
 * The method that the first `const` declarator of a variable binds: the method of the initializer for a plain name, or
 * the destructured key for a pattern on a mutation result. Returns `null` for any other binding.
 */
function boundMethod(sourceCode: SourceCode, visited: Variable[], { defs }: Variable) {
	for (const { node, name } of defs) {
		if (node.type !== 'VariableDeclarator' || node.init === null || !isConstDeclarator(node)) {
			continue;
		}
		if (node.id === name) return methodOf(sourceCode, visited, node.init);
		const key = patternKey(node.id, name);
		const method = key === null ? null : mutationMethod(key);
		return method !== null && isMutationResult(sourceCode, visited, node.init) ? method : null;
	}
	return null;
}

/** Whether a declarator belongs to a `const` declaration. */
function isConstDeclarator({ parent }: ESTree.VariableDeclarator) {
	return parent.type === 'VariableDeclaration' && parent.kind === 'const';
}

/**
 * The static key under which the top level of an object pattern binds an identifier, with or without a default value,
 * or `null` when the identifier sits elsewhere or the key is computed.
 */
function patternKey(pattern: ESTree.BindingPattern, binding: ESTree.Node) {
	if (pattern.type !== 'ObjectPattern') return null;
	const property = pattern.properties.find(
		candidate =>
			candidate.type === 'Property' &&
			(candidate.value === binding ||
				(candidate.value.type === 'AssignmentPattern' && candidate.value.left === binding)),
	);
	return property?.type === 'Property' ? propertyName(property.key, property.computed) : null;
}

/**
 * Whether an expression is the result of a mutation: a call of `useMutation` or `createMutation` (see
 * `isMutationFactory`), directly or through `const` aliases.
 */
function isMutationResult(
	sourceCode: SourceCode,
	visited: Variable[],
	expression: ESTree.Expression,
): boolean {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only calls and identifiers hold a mutation result, so `default` covers the rest.
	switch (node.type) {
		case 'CallExpression':
			return isMutationFactory(sourceCode, node.callee);
		case 'Identifier': {
			const variable = unvisitedVariable(sourceCode, visited, node);
			const init = variable === null ? null : firstConstInitializer(variable);
			return init !== null && isMutationResult(sourceCode, visited, init);
		}
		default:
			return false;
	}
}

/**
 * Whether a callee is `useMutation` or `createMutation`: a binding imported under any local name from a TanStack
 * Query adapter package, or a global of that name that no declaration in the file binds.
 */
function isMutationFactory(sourceCode: SourceCode, callee: ESTree.Expression) {
	const node = unwrap(callee);
	if (node.type !== 'Identifier') return false;
	const variable = resolvedVariable(sourceCode, node);
	if (variable === null || variable.defs.length === 0) return isFactoryName(node.name);
	const definition = onlyElement(variable.defs);
	return definition !== null && isFactoryImport(definition.node);
}

/** Whether a node is an import specifier of `useMutation` or `createMutation` from a TanStack Query adapter package. */
function isFactoryImport(node: ESTree.Node) {
	if (node.type !== 'ImportSpecifier') return false;
	const { imported, parent } = node;
	return (
		parent.type === 'ImportDeclaration' &&
		TANSTACK_QUERY_PACKAGE_REGEX.test(parent.source.value) &&
		isFactoryName(imported.type === 'Literal' ? imported.value : imported.name)
	);
}

/** Whether a name is that of a mutation factory: `useMutation` in React, or `createMutation` in Svelte. */
function isFactoryName(name: string) {
	switch (name) {
		case 'useMutation':
		case 'createMutation':
			return true;
		default:
			return false;
	}
}

/** The mutation method of a name: `mutate` or `mutateAsync`, or `null` for any other name. */
function mutationMethod(name: string) {
	switch (name) {
		case 'mutate':
		case 'mutateAsync':
			return name;
		default:
			return null;
	}
}

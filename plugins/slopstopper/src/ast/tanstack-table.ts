import type { ESTree, SourceCode, Variable } from '@oxlint/plugins';

import { findVariable, firstConstInitializer, unvisitedVariable } from '#ast/bindings.ts';
import { unwrap } from '#ast/discriminant.ts';
import { isNeverOrTopType, typeAtLocation, type TypeServices } from '#type-services.ts';

/** The name that marks a table without type information: the identifier `table` or a `table` member. */
const TABLE_NAME = 'table';

/** The properties that every TanStack Table instance has and that together tell it apart from other objects. */
const TABLE_PROPERTIES = ['store', 'atoms', 'baseAtoms'];

/**
 * The object literal that a call to `useTable`, `createTable`, or `tableOptions` passes as the table options, or `null`
 * when the call is none of them or its first argument is no object literal. The literal may sit inside TypeScript
 * assertions, as in `{ ... } satisfies TableOptions`.
 */
export function tableOptionsObject(call: ESTree.CallExpression) {
	if (calleeName(call, isOptionsFactory) === null) return null;
	const [first] = call.arguments;
	if (typeof first === 'undefined' || first.type === 'SpreadElement') return null;
	const options = unwrap(first);
	return options.type === 'ObjectExpression' ? options : null;
}

/**
 * Whether an expression is a table without type information: the identifier `table`, a non-computed `table` member, a
 * call to `useTable` or `createTable`, or a `const` binding whose initializer is one of these, followed through aliases.
 */
export function isTableReference(sourceCode: SourceCode, node: ESTree.Expression) {
	return isTableExpression(sourceCode, [], node);
}

/**
 * Whether the object of a JSX member name, as in `<table.Subscribe>`, is a table without type information: the name
 * `table`, a `table` member, or a `const` binding that `isTableReference` accepts.
 */
export function isTableJsxObject(sourceCode: SourceCode, object: ESTree.JSXMemberExpressionObject) {
	switch (object.type) {
		case 'JSXIdentifier':
			return (
				object.name === TABLE_NAME ||
				isTableVariable(
					sourceCode,
					[],
					findVariable(sourceCode.getScope(object), object.name),
				)
			);
		case 'JSXMemberExpression':
			return object.property.name === TABLE_NAME;
	}
}

/** Whether an expression is a table without type information. Adds every variable that it follows to `visited`. */
function isTableExpression(
	sourceCode: SourceCode,
	visited: Variable[],
	node: ESTree.Expression,
): boolean {
	const target = unwrap(node);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only identifiers, members, and calls name a table, so `default` covers the rest.
	switch (target.type) {
		case 'Identifier':
			return (
				target.name === TABLE_NAME ||
				isTableVariable(sourceCode, visited, unvisitedVariable(sourceCode, visited, target))
			);
		case 'MemberExpression':
			return (
				!target.computed &&
				target.property.type === 'Identifier' &&
				target.property.name === TABLE_NAME
			);
		case 'CallExpression':
			return isTableFactoryCall(target);
		default:
			return false;
	}
}

/** Whether a variable is a `const` whose initializer is a table without type information. */
function isTableVariable(sourceCode: SourceCode, visited: Variable[], variable: Variable | null) {
	const init = variable === null ? null : firstConstInitializer(variable);
	return init !== null && isTableExpression(sourceCode, visited, init);
}

/** Whether a call is `useTable(...)` or `createTable(...)`, which return a table instance. */
export function isTableFactoryCall(call: ESTree.CallExpression) {
	return calleeName(call, isTableFactory) !== null;
}

/**
 * The name of a call's callee when it names a function that `isName` accepts directly, as in `useTable(...)`, or `null`
 * otherwise. The callee may sit inside TypeScript assertions.
 */
function calleeName({ callee }: ESTree.CallExpression, isName: (name: string) => boolean) {
	const target = unwrap(callee);
	return target.type === 'Identifier' && isName(target.name) ? target.name : null;
}

/** Whether a name is that of a TanStack Table factory that returns a table instance: `useTable` or `createTable`. */
function isTableFactory(name: string) {
	switch (name) {
		case 'useTable':
		case 'createTable':
			return true;
		default:
			return false;
	}
}

/** Whether a name is that of a TanStack Table call whose first argument is the table options. */
function isOptionsFactory(name: string) {
	switch (name) {
		case 'useTable':
		case 'createTable':
		case 'tableOptions':
			return true;
		default:
			return false;
	}
}

/**
 * Whether the type of a node has every property of a TanStack Table instance: `store`, `atoms`, and `baseAtoms`. A
 * `never` or top type has no such properties.
 */
export function isTableType(services: TypeServices, node: ESTree.Node) {
	const type = typeAtLocation(services, node);
	if (type === null || isNeverOrTopType(services.checker, type)) return false;
	return TABLE_PROPERTIES.every(
		name => typeof services.checker.getPropertyOfType(type, name) !== 'undefined',
	);
}

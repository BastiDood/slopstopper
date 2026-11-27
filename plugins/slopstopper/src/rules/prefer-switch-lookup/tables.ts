import type { ESTree, Scope, SourceCode } from '@oxlint/plugins';

import { findVariable, onlyDefinition } from '#ast/bindings.ts';
import { type CaseComparand, unwrap } from '#ast/discriminant.ts';
import { isFunction } from '#ast/functions.ts';
import { negatedNumber } from '#ast/literals.ts';
import { propertyName } from '#ast/property-keys.ts';

/** The container of a case table, which names it in a report. */
export type TableKind = 'array' | 'set' | 'map' | 'object';

/** A literal table whose keys a `switch` case can name: its container, its entry count, and whether every value is a function. */
export interface CaseTable {
	kind: TableKind;
	entries: number;
	holdsFunctions: boolean;
}

/**
 * The container that an expression builds, judged by syntax alone: an array literal, an object literal, or `new Set`
 * or `new Map` of the globals. Returns `null` for anything else, so that a caller can rule out a node before it checks
 * the entries (see `caseTableOf`).
 */
export function tableKindOf(scope: Scope, node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only literals and `new` build a container, so `default` covers the rest.
	switch (node.type) {
		case 'ArrayExpression':
			return 'array';
		case 'ObjectExpression':
			return 'object';
		case 'NewExpression': {
			const { callee } = node;
			if (callee.type !== 'Identifier' || isDeclared(scope, callee.name)) return null;
			// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two keyed collections count, so `default` covers every other constructor.
			switch (callee.name) {
				case 'Set':
					return 'set';
				case 'Map':
					return 'map';
				default:
					return null;
			}
		}
		default:
			return null;
	}
}

/**
 * Whether code declares a name that shadows the global, as a local `class Set` does. A global that the environment
 * provides, such as `Set` itself, resolves to a variable without definitions.
 */
export function isDeclared(scope: Scope, name: string) {
	const variable = findVariable(scope, name);
	return variable !== null && variable.defs.length > 0;
}

/**
 * The case table that an expression builds, or `null` when an entry does not fit. Every key must be a case comparand.
 * Every value must be a function or an expression that reads the same value on every evaluation (see `valueKind`),
 * so that a `switch` that returns it behaves like the table.
 */
export function caseTableOf(
	sourceCode: SourceCode,
	isCaseComparand: CaseComparand,
	kind: TableKind,
	expression: ESTree.Expression,
) {
	const node = unwrap(expression);
	switch (kind) {
		case 'array':
			return node.type === 'ArrayExpression'
				? arrayTable(isCaseComparand, node, 'array')
				: null;
		case 'set': {
			const elements = constructorElements(node);
			return elements === null ? null : arrayTable(isCaseComparand, elements, 'set');
		}
		case 'map': {
			const elements = constructorElements(node);
			return elements === null ? null : mapTable(sourceCode, isCaseComparand, elements);
		}
		case 'object':
			return node.type === 'ObjectExpression'
				? objectTable(sourceCode, isCaseComparand, node)
				: null;
	}
}

/** An array or `Set` table whose every element is a case comparand. */
function arrayTable(
	isCaseComparand: CaseComparand,
	{ elements }: ESTree.ArrayExpression,
	kind: 'array' | 'set',
) {
	for (const element of elements) {
		if (element === null || element.type === 'SpreadElement' || !isCaseComparand(element)) {
			return null;
		}
	}
	return { kind, entries: elements.length, holdsFunctions: false } satisfies CaseTable;
}

/** The array literal that `new Set([...])` or `new Map([...])` takes as its only argument, or `null` for any other call. */
function constructorElements(node: ESTree.Expression) {
	if (node.type !== 'NewExpression' || node.arguments.length !== 1) return null;
	const [argument] = node.arguments;
	return argument?.type === 'ArrayExpression' ? argument : null;
}

/** A `Map` table of `[key, value]` pairs whose keys are case comparands and whose values fit (see `valueKind`). */
function mapTable(
	sourceCode: SourceCode,
	isCaseComparand: CaseComparand,
	{ elements }: ESTree.ArrayExpression,
) {
	let holdsFunctions = true;
	for (const element of elements) {
		if (element?.type !== 'ArrayExpression' || element.elements.length !== 2) return null;
		const [key, value] = element.elements.map(expressionElement);
		if (key === null || typeof key === 'undefined' || !isCaseComparand(key)) return null;
		if (value === null || typeof value === 'undefined') return null;
		const kind = valueKind(sourceCode, value);
		if (kind === null) return null;
		holdsFunctions &&= kind === 'function';
	}
	return {
		kind: 'map',
		entries: elements.length,
		holdsFunctions: holdsFunctions && elements.length > 0,
	} satisfies CaseTable;
}

/** An array element that is an expression, or `null` for a hole or a spread. */
function expressionElement(element: ESTree.ArrayExpression['elements'][number]) {
	return element === null || element.type === 'SpreadElement' ? null : element;
}

/**
 * An object table whose every property is a plain or method property with a static name and a value that fits (see
 * `isStableValue`). Spreads, accessors, and `__proto__` keys rule it out.
 */
function objectTable(
	sourceCode: SourceCode,
	isCaseComparand: CaseComparand,
	{ properties }: ESTree.ObjectExpression,
) {
	let holdsFunctions = true;
	for (const property of properties) {
		if (property.type !== 'Property' || property.kind !== 'init') return null;
		const name = propertyName(property.key, property.computed);
		if (name === null || name === '__proto__') return null;
		if (
			property.computed &&
			(property.key.type === 'PrivateIdentifier' || !isCaseComparand(property.key))
		) {
			return null;
		}
		const kind = valueKind(sourceCode, property.value);
		if (kind === null) return null;
		holdsFunctions &&= kind === 'function';
	}
	return {
		kind: 'object',
		entries: properties.length,
		holdsFunctions: holdsFunctions && properties.length > 0,
	} satisfies CaseTable;
}

/**
 * Whether a table value is a function or another value that a `switch` case can return without a change in behavior
 * (`stable`), or `null` when it is neither. A function is a function expression, an arrow function, or an identifier
 * bound to a function declaration or to a `const` function. A stable value reads the same value on every evaluation:
 * a literal other than a regular expression, a template literal without expressions, a negated number, an
 * identifier, or a static member of an identifier. An object or array literal, a call, or `new` builds a new value on
 * every evaluation, so it does not fit.
 */
function valueKind(sourceCode: SourceCode, expression: ESTree.Expression) {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only functions and a few constant forms fit, so `default` covers the rest.
	switch (node.type) {
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			return 'function';
		case 'Identifier':
			return isFunctionBinding(sourceCode, node) ? 'function' : 'stable';
		case 'Literal':
			return 'regex' in node ? null : 'stable';
		case 'TemplateLiteral':
			return node.expressions.length === 0 ? 'stable' : null;
		case 'UnaryExpression':
			return negatedNumber(node) === null ? null : 'stable';
		case 'MemberExpression': {
			if (node.computed) return null;
			const object = unwrap(node.object);
			return object.type === 'Identifier' ? 'stable' : null;
		}
		default:
			return null;
	}
}

/** Whether an identifier resolves to a function declaration or to a `const` whose initializer is a function. */
function isFunctionBinding(sourceCode: SourceCode, identifier: ESTree.IdentifierReference) {
	const definition = onlyDefinition(sourceCode, identifier);
	if (definition === null) return false;
	const { node } = definition;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only declarations of functions and `const` bindings can hold a function, so `default` covers the rest.
	switch (node.type) {
		case 'FunctionDeclaration':
			return true;
		case 'VariableDeclarator': {
			if (node.init === null) return false;
			const { parent } = node;
			return (
				parent.type === 'VariableDeclaration' &&
				parent.kind === 'const' &&
				isFunction(unwrap(node.init))
			);
		}
		default:
			return false;
	}
}

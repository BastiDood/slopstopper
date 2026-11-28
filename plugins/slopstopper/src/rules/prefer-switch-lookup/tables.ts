import type { ESTree, SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { constInitializer, onlyDefinition } from '#ast/bindings.ts';
import { type CaseComparand, unwrap } from '#ast/discriminant.ts';
import { negatedNumber } from '#ast/literals.ts';
import { propertyName } from '#ast/property-keys.ts';

/** The container of a table, which names it in a report. */
export type TableKind = 'array' | 'set' | 'map' | 'object';

/** A table that an object literal lists. */
interface ObjectShape {
	kind: 'object';
	list: ESTree.ObjectExpression;
	entries: number;
}

/**
 * A table that an array literal lists: an array, or the array literal that `new Set` or `new Map` takes, also through
 * `as const` or `satisfies` (see `unwrap`).
 */
interface ListShape {
	kind: 'array' | 'set' | 'map';
	list: ESTree.ArrayExpression;
	entries: number;
}

/** A table judged by syntax alone: its container, the literal that lists its entries, and how many it lists. */
export type TableShape = ObjectShape | ListShape;

/**
 * The shape of a table that an expression builds: an array literal, an object literal, or `new Set([...])` or
 * `new Map([...])` of the globals, whose array argument can carry an assertion. Returns `null` for anything else and for a table without entries, which a
 * `switch` has no case for. This check is cheap, so a caller runs it before it classifies reads or entries.
 */
export function tableShapeOf(sourceCode: SourceCode, expression: ESTree.Expression) {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only literals and `new` build a table, so `default` covers the rest.
	switch (node.type) {
		case 'ArrayExpression':
			return listShape('array', node);
		case 'ObjectExpression': {
			const entries = node.properties.length;
			return entries === 0
				? null
				: ({ kind: 'object', list: node, entries } satisfies ObjectShape);
		}
		case 'NewExpression': {
			const kind = collectionKind(node);
			const argument = onlyElement(node.arguments);
			if (kind === null || argument === null || argument.type === 'SpreadElement') {
				return null;
			}
			const list = unwrap(argument);
			return list.type === 'ArrayExpression' && sourceCode.isGlobalReference(node.callee)
				? listShape(kind, list)
				: null;
		}
		default:
			return null;
	}
}

/**
 * The kind of table that a literal or a `new` expression builds, judged by its syntax alone, or `null` for any
 * constructor other than `Set` and `Map`. A caller runs this cheap check before `tableShapeOf`.
 */
export function tableKindOf(
	node: ESTree.ArrayExpression | ESTree.ObjectExpression | ESTree.NewExpression,
) {
	switch (node.type) {
		case 'ArrayExpression':
			return 'array';
		case 'ObjectExpression':
			return 'object';
		case 'NewExpression':
			return collectionKind(node);
	}
}

function listShape(kind: ListShape['kind'], list: ESTree.ArrayExpression) {
	const entries = list.elements.length;
	return entries === 0 ? null : ({ kind, list, entries } satisfies ListShape);
}

/** The keyed collection, `Set` or `Map`, that a `new` expression constructs by name, or `null` for any other constructor. */
function collectionKind({ callee }: ESTree.NewExpression) {
	if (callee.type !== 'Identifier') return null;
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

/**
 * The values of a table whose every entry fits a `case`, or `null` when an entry does not. Every key must be a case
 * comparand. Every value must be a function or an expression that reads the same value on every evaluation (see
 * `isCaseValue`), so that a `switch` that returns it behaves like the table. An array or `Set` lists keys only, so its
 * values are empty. The check reads syntax and case comparands only.
 */
export function caseValuesOf(isCaseComparand: CaseComparand, shape: TableShape) {
	const values: ESTree.Expression[] = [];
	switch (shape.kind) {
		case 'array':
		case 'set':
			return shape.list.elements.every(element => {
				const entry = expressionElement(element);
				return entry !== null && isCaseComparand(entry);
			})
				? values
				: null;
		case 'map':
			for (const element of shape.list.elements) {
				const pair = pairOf(element);
				if (pair === null || !isCaseComparand(pair.key) || !isCaseValue(pair.value)) {
					return null;
				}
				values.push(pair.value);
			}
			return values;
		case 'object':
			for (const property of shape.list.properties) {
				const value = casePropertyValue(isCaseComparand, property);
				if (value === null) return null;
				values.push(value);
			}
			return values;
	}
}

/**
 * The value of an object table's property when it fits a `case`, or `null` when it does not. The property must be a
 * plain or method property with a static name other than `__proto__`, and a computed key must be a literal case
 * comparand.
 */
function casePropertyValue(
	isCaseComparand: CaseComparand,
	property: ESTree.ObjectExpression['properties'][number],
) {
	if (property.type !== 'Property' || property.kind !== 'init') return null;
	const { key, computed, value } = property;
	const name = propertyName(key, computed);
	if (name === null || name === '__proto__') return null;
	const caseKey = !computed || (key.type !== 'PrivateIdentifier' && isCaseComparand(key));
	return caseKey && isCaseValue(value) ? value : null;
}

/**
 * Whether a table value fits a `case` that returns it: a function, or an expression that reads the same value on
 * every evaluation. Such an expression is a literal other than a regular expression, a template literal without
 * expressions, a negated number, an identifier, or a static member of an identifier. An object or array literal, a
 * call, or `new` builds a new value on every evaluation, so it does not fit.
 */
function isCaseValue(expression: ESTree.Expression) {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only functions and a few constant forms fit, so `default` covers the rest.
	switch (node.type) {
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
		case 'Identifier':
			return true;
		case 'Literal':
			return !('regex' in node);
		case 'TemplateLiteral':
			return node.expressions.length === 0;
		case 'UnaryExpression':
			return negatedNumber(node) !== null;
		case 'MemberExpression': {
			if (node.computed) return false;
			const object = unwrap(node.object);
			return object.type === 'Identifier';
		}
		default:
			return false;
	}
}

/**
 * Whether every value of a table (see `caseValuesOf`) can be a handler for a `switch` case to call. A value is ruled
 * out only when it is known to be no function (see `isHandler`). Only a `Map` or object table can be called, so an
 * array or `Set` never reaches this check.
 */
export function holdsHandlers(sourceCode: SourceCode, values: readonly ESTree.Expression[]) {
	return values.every(value => isHandler(sourceCode, value));
}

/**
 * The key and value of a `Map` entry written as `[key, value]`, also through `as const` or `satisfies` (see `unwrap`),
 * or `null` for any other element.
 */
function pairOf(element: ESTree.ArrayExpression['elements'][number]) {
	const entry = expressionElement(element);
	if (entry === null) return null;
	const pair = unwrap(entry);
	if (pair.type !== 'ArrayExpression' || pair.elements.length !== 2) return null;
	const [key, value] = pair.elements.map(expressionElement);
	return key === null ||
		typeof key === 'undefined' ||
		value === null ||
		typeof value === 'undefined'
		? null
		: { key, value };
}

/** An array element that is an expression, or `null` for a hole or a spread. */
function expressionElement(element: ESTree.ArrayExpression['elements'][number]) {
	return element === null || element.type === 'SpreadElement' ? null : element;
}

/**
 * Whether a table value that fits a `case` (see `isCaseValue`) can be a function: a function expression, a static
 * member, or a name. A name is ruled out only when it is bound to a `const` whose initializer is known to be no
 * function, such as a literal. An imported or undeclared name, an alias, or a wrapper call such as `memoize(f)` can
 * hold one.
 */
function isHandler(sourceCode: SourceCode, expression: ESTree.Expression) {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only functions, members, and names can be handlers, so `default` covers the rest.
	switch (node.type) {
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
		case 'MemberExpression':
			return true;
		case 'Identifier': {
			const definition = onlyDefinition(sourceCode, node);
			const init = definition === null ? null : constInitializer(definition);
			return init === null || !isNonFunction(unwrap(init));
		}
		default:
			return false;
	}
}

/** Whether an expression evaluates to something other than a function: a literal, a template, an operator, or an object or array literal. */
function isNonFunction(node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only literal and operator forms are known to be no function, so `default` covers the rest.
	switch (node.type) {
		case 'Literal':
		case 'TemplateLiteral':
		case 'UnaryExpression':
		case 'BinaryExpression':
		case 'ObjectExpression':
		case 'ArrayExpression':
			return true;
		default:
			return false;
	}
}

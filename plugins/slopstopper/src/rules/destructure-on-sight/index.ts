import {
	type Context,
	defineRule,
	type ESTree,
	type Fix,
	type Reference,
	type Scope,
	type SourceCode,
	type Variable,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { assertDefined } from '#assert.ts';
import { findVariable } from '#ast/bindings.ts';
import { isCallee, outermostWrapper } from '#ast/members.ts';
import { isReservedWord } from '#ast/names.ts';
import { isEquality } from '#ast/operators.ts';
import { isOptionalParameter } from '#ast/parameters.ts';
import { dropsComment } from '#ast/ranges.ts';
import { typeAtLocation, type TypeServices, typeServicesOf } from '#type-services.ts';

/**
 * Where a binding takes the destructuring pattern: a declarator or a parameter, an arrow parameter without parentheses,
 * which needs them around the pattern, or a parameter of a function whose `'use strict'` directive forbids the pattern.
 */
type Binding = 'declarator' | 'parameter' | 'bareArrowParameter' | 'strictParameter';

/** A static property read off the binding, as in `x.p`, with the scope that reads it. */
interface PropertyRead {
	member: ESTree.MemberExpression;
	name: string;
	scope: Scope;
	/** Whether the read is a narrowing test: compared, checked with `in` or `typeof`, or a `switch` discriminant. */
	isNarrowing: boolean;
}

/** A binding whose every use reads a property, with its distinct property names in the order of their first read. */
interface Reader {
	variable: Variable;
	id: ESTree.BindingIdentifier;
	reads: PropertyRead[];
	names: string[];
}

/** A reader that destructuring can rewrite, with the kind of its binding. */
interface Candidate extends Reader {
	binding: Binding;
}

/** A candidate's destructuring: its pattern, and the local name that replaces each read of a property. */
interface Rewrite {
	candidate: Candidate;
	pattern: string;
	localOf: (name: string) => string;
}

/**
 * Reports a binding whose every use reads a static property off it, as in `x.p`, in favor of destructuring it where
 * it is bound. The binding is a function parameter, with or without a type annotation or a default value, or the
 * identifier of a `const` declarator. Any other use takes the value whole and exempts the binding: passing, returning,
 * assigning, spreading, or comparing it, a method call `x.m()` that needs `this`, a member write, update, or `delete`,
 * an optional read `x?.p`, a computed read `x[k]`, and any use from a nested function, which would capture a snapshot
 * instead of reading the property live.
 *
 * A read that narrows, such as `x.type === 'a'`, usually narrows a union whose other properties only some members
 * have, so destructuring them would not type-check. Without type information, a narrowing read exempts the binding.
 * With it, the rule reports a binding exactly when every read property exists on every member of its type.
 *
 * A binding whose only read is `length` destructures it under the binding's name, as in `{ length: trimmedLength }`.
 * Two or more parameters of one function that each read only the same property, as a comparator does, are reported
 * together and destructure it under their own names, as in `({ position: left }, { position: right })`.
 *
 * Destructuring reads each property once, at the binding, while `x.p` reads it at each use, so a mutation or a getter
 * in between changes the result, and so does a `Proxy` that returns a different value on each read. The rule cannot
 * prove that none happens, so the rewrite is a suggestion.
 */
export const DESTRUCTURE_ON_SIGHT = defineRule({
	meta: {
		type: 'suggestion',
		hasSuggestions: true,
		docs: {
			description: 'Destructure a binding whose every use reads a property off it.',
		},
		messages: {
			destructure:
				'Destructure `{{name}}` where it is bound, since every use reads a property.',
			destructureInto:
				'Destructure `{{name}}` into `{{pattern}}`. If the object is a `Proxy` or has getters or properties that change between the binding and its reads, suppress this diagnostic.',
			destructureParameters:
				'Destructure `{{property}}` out of `{{names}}` where they are bound, since every use reads it.',
			destructureParametersInto:
				'Destructure `{{property}}` out of `{{names}}` under their own names. If an object is a `Proxy` or has getters or properties that change between the binding and its reads, suppress this diagnostic.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const services = typeServicesOf(sourceCode);

		return {
			ArrowFunctionExpression: node => checkFunction(context, services, node),
			FunctionDeclaration: node => checkFunction(context, services, node),
			FunctionExpression: node => checkFunction(context, services, node),
			VariableDeclarator(node) {
				const { id, parent } = node;
				if (
					id.type !== 'Identifier' ||
					node.init === null ||
					parent.type !== 'VariableDeclaration' ||
					parent.kind !== 'const' ||
					parent.parent.type === 'ExportNamedDeclaration'
				) {
					return;
				}

				const variable = onlyElement(sourceCode.getDeclaredVariables(node));
				if (variable === null) return;

				const reader = readerOf(services, variable, id);
				if (reader !== null) reportCandidate(context, { ...reader, binding: 'declarator' });
			},
		};
	},
});

/** Reports the parameters of a function that make candidates, grouping those that each read only the same property. */
function checkFunction(
	context: Context,
	services: TypeServices | null,
	node: ESTree.Function | ESTree.ArrowFunctionExpression,
) {
	const { sourceCode } = context;
	const { set } = sourceCode.getScope(node);
	const found: Reader[] = [];

	for (const parameter of node.params) {
		const id = parameterIdentifier(parameter);
		if (id === null) continue;

		const variable = set.get(id.name);
		if (typeof variable === 'undefined') continue;

		const reader = readerOf(services, variable, id);
		if (reader !== null) found.push(reader);
	}
	if (found.length === 0) return;

	const isStrict = hasUseStrict(node);
	const candidates: Candidate[] = [];
	for (const reader of found) {
		candidates.push({ ...reader, binding: parameterBinding(sourceCode, reader.id, isStrict) });
	}

	const groups = sharedPropertyGroups(candidates);
	const grouped = new Set(groups.flatMap(([, members]) => members));
	for (const [property, members] of groups) reportGroup(context, property, members);
	for (const candidate of candidates) {
		if (!grouped.has(candidate)) reportCandidate(context, candidate);
	}
}

/** Reports a candidate on its own, suggesting a pattern of every property it reads. */
function reportCandidate(context: Context, candidate: Candidate) {
	const { sourceCode } = context;
	const { id, names, binding } = candidate;
	const alias = names.length === 1 && names[0] === 'length' ? `${id.name}Length` : null;
	const pattern = alias === null ? `{ ${names.join(', ')} }` : `{ length: ${alias} }`;

	const fixes =
		binding === 'strictParameter'
			? null
			: destructuring(sourceCode, [{ candidate, pattern, localOf: name => alias ?? name }]);

	context.report({
		node: id,
		messageId: 'destructure',
		data: { name: id.name },
		suggest:
			fixes === null
				? null
				: [
						{
							messageId: 'destructureInto',
							data: { name: id.name, pattern },
							fix: () => fixes,
						},
					],
	});
}

/** Reports a group of parameters that each read only `property`, suggesting that each destructure it under its own name. */
function reportGroup(context: Context, property: string, members: readonly Candidate[]) {
	const { sourceCode } = context;
	const first = assertDefined(members[0]);
	const data = { property, names: members.map(({ id }) => id.name).join('`, `') };

	const fixes =
		first.binding === 'strictParameter'
			? null
			: destructuring(
					sourceCode,
					members.map(candidate => ({
						candidate,
						pattern: `{ ${property}: ${candidate.id.name} }`,
						localOf: () => candidate.id.name,
					})),
				);

	context.report({
		node: first.id,
		messageId: 'destructureParameters',
		data,
		suggest:
			fixes === null
				? null
				: [{ messageId: 'destructureParametersInto', data, fix: () => fixes }],
	});
}

/**
 * The reader that a binding makes, or `null` when a use takes it whole or destructuring it would not type-check.
 * Without type information, a narrowing read stands for a union that destructuring would not type-check. With it, every
 * read property must exist on every member of the binding's type.
 */
function readerOf(services: TypeServices | null, variable: Variable, id: ESTree.BindingIdentifier) {
	const reads = propertyReads(variable);
	if (reads === null || reads.length === 0) return null;

	const names = [...new Set(reads.map(({ name }) => name))];
	const isDestructurable =
		services === null
			? !reads.some(({ isNarrowing }) => isNarrowing)
			: hasEveryProperty(services, id, names);
	return isDestructurable ? ({ variable, id, reads, names } satisfies Reader) : null;
}

/** Whether every property name exists on every member of the type of a binding, or on the type when it is no union. */
function hasEveryProperty(
	services: TypeServices,
	id: ESTree.BindingIdentifier,
	names: readonly string[],
) {
	const type = typeAtLocation(services, id);
	if (type === null) return false;

	const members = type.isUnion() ? assertDefined(type.types) : [type];
	return members.every(member =>
		names.every(
			name => typeof services.checker.getPropertyOfType(member, name) !== 'undefined',
		),
	);
}

/**
 * The groups of two or more parameters that each read only the same property, keyed by that property, in parameter
 * order. A comparator such as `(left, right) => left.position - right.position` makes one group.
 */
function sharedPropertyGroups(candidates: readonly Candidate[]) {
	const byProperty = new Map<string, Candidate[]>();
	for (const candidate of candidates) {
		const property = onlyElement(candidate.names);
		if (property === null) continue;
		const members = byProperty.get(property) ?? [];
		byProperty.set(property, [...members, candidate]);
	}

	return [...byProperty].filter(([, members]) => members.length >= 2);
}

/** How a parameter takes the pattern, by whether its function is strict and whether parentheses enclose it. */
function parameterBinding(sourceCode: SourceCode, id: ESTree.BindingIdentifier, isStrict: boolean) {
	if (isStrict) return 'strictParameter';
	const next = sourceCode.getTokenAfter(id);
	return next?.value === '=>' ? 'bareArrowParameter' : 'parameter';
}

/** The identifier of a parameter that binds one name, with or without a default, or `null` for any other parameter. */
function parameterIdentifier(parameter: ESTree.ParamPattern) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Patterns, rest elements, and parameter properties bind no plain name, so `default` covers them.
	switch (parameter.type) {
		case 'Identifier':
			return parameter.name === 'this' || isOptionalParameter(parameter) ? null : parameter;
		case 'AssignmentPattern':
			return parameter.left.type === 'Identifier' ? parameter.left : null;
		default:
			return null;
	}
}

/**
 * Whether a function body's directive prologue holds `'use strict'`, which forbids a destructured parameter. Only the
 * leading directives are read, because a directive can only open the body.
 */
function hasUseStrict(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	const { body } = node;
	if (body?.type !== 'BlockStatement') return false;

	for (const statement of body.body) {
		if (!('directive' in statement)) return false;
		if (statement.directive === 'use strict') return true;
	}
	return false;
}

/**
 * The static property reads of every use of a variable besides its initialization, or `null` when any use takes the
 * value whole.
 */
function propertyReads({ references, scope }: Variable) {
	const reads: PropertyRead[] = [];
	for (const reference of references) {
		if (reference.init) continue;
		const read = propertyRead(reference, scope.variableScope);
		if (read === null) return null;
		reads.push(read);
	}
	return reads;
}

/**
 * The static property read that a reference makes, or `null` when the reference takes the value whole: it writes the
 * binding, comes from a nested function, or is anything but the object of a non-optional, non-computed read of a
 * public property that is neither a method callee nor a write target.
 */
function propertyRead(reference: Reference, variableScope: Scope) {
	const { identifier, from } = reference;
	if (reference.isWrite() || from.variableScope !== variableScope) return null;

	const member = identifier.parent;
	if (
		member.type !== 'MemberExpression' ||
		member.object !== identifier ||
		member.computed ||
		member.optional ||
		member.property.type !== 'Identifier'
	) {
		return null;
	}

	const wrapper = outermostWrapper(member);
	if (isCallee(wrapper) || isWriteTarget(wrapper)) return null;

	return {
		member,
		name: member.property.name,
		scope: from,
		isNarrowing: isNarrowingTest(wrapper),
	};
}

/**
 * Whether a member is assigned, updated, deleted, or bound by a pattern or a `for` head. Expects the outermost wrapper
 * around the member (see `outermostWrapper`).
 */
function isWriteTarget(child: ESTree.Expression) {
	const { parent } = child;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types write a member, so `default` covers the rest.
	switch (parent.type) {
		case 'AssignmentExpression':
		case 'AssignmentPattern':
		case 'ForInStatement':
		case 'ForOfStatement':
			return parent.left === child;
		case 'UpdateExpression':
		case 'ArrayPattern':
		case 'RestElement':
			return true;
		case 'UnaryExpression':
			return parent.operator === 'delete';
		case 'Property':
			return parent.parent.type === 'ObjectPattern' && parent.value === child;
		default:
			return false;
	}
}

/**
 * Whether a member is a test that can narrow its object: an operand of an equality operator or `in`, a `switch`
 * discriminant, or the operand of `typeof`. Expects the outermost wrapper around the member (see `outermostWrapper`).
 */
function isNarrowingTest(child: ESTree.Expression) {
	const { parent } = child;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types test a value, so `default` covers the rest.
	switch (parent.type) {
		case 'BinaryExpression':
			return isNarrowingOperator(parent.operator);
		case 'SwitchStatement':
			return parent.discriminant === child;
		case 'UnaryExpression':
			return parent.operator === 'typeof';
		default:
			return false;
	}
}

/** Whether a binary operator can narrow its operands: an equality operator or `in`. */
function isNarrowingOperator(operator: ESTree.BinaryOperator) {
	return operator === 'in' || isEquality(operator);
}

/**
 * The edits that destructure each candidate: its name becomes its pattern, and every read becomes the local name of
 * its property. Returns `null` when a shorthand property name is a reserved word, a local name would clash with or
 * shadow another binding or a global that the code reads, or a read holds a comment that the rewrite would drop.
 */
function destructuring(sourceCode: SourceCode, rewrites: readonly Rewrite[]) {
	const fixes: Fix[] = [];

	for (const { candidate, pattern, localOf } of rewrites) {
		const { variable, id, binding, reads, names } = candidate;
		const scopes = [...new Set([variable.scope, ...reads.map(({ scope }) => scope)])];
		const isSafe = names.every(name => {
			const local = localOf(name);
			if (local === name && isReservedWord(name)) return false;
			return scopes.every(scope => isFree(scope, local, variable));
		});

		const token = sourceCode.getFirstToken(id);
		if (
			!isSafe ||
			token === null ||
			reads.some(({ member }) => dropsComment(sourceCode, { range: member.range, kept: [] }))
		) {
			return null;
		}

		const text = binding === 'bareArrowParameter' ? `(${pattern})` : pattern;
		fixes.push(
			{ range: token.range, text },
			...reads.map(({ member, name }) => ({ range: member.range, text: localOf(name) })),
		);
	}

	return fixes;
}

/**
 * Whether a name is free to bind in place of a variable as seen from a scope: it resolves to that variable or to
 * nothing, and no code in the scope reads a global of that name.
 */
function isFree(scope: Scope, name: string, variable: Variable) {
	const found = findVariable(scope, name);
	if (found !== null) return found === variable;
	return !scope.through.some(({ identifier }) => identifier.name === name);
}

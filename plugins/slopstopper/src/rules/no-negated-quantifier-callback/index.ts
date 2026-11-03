import { type Context, defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { negate } from '#ast/negation.ts';
import { dropsComment } from '#ast/ranges.ts';
import { isDefaultLibraryMember, type TypeServices, typeServicesOf } from '#type-services.ts';

/** The interfaces of the default library that declare the standard `some` and `every` methods (see `isDefaultLibraryMember`). */
const STANDARD_RECEIVERS = new Set([
	'Array',
	'ReadonlyArray',
	'Int8Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'Int16Array',
	'Uint16Array',
	'Int32Array',
	'Uint32Array',
	'Float16Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
	'IteratorObject',
]);

/** A `.some` or `.every` call whose callback returns a `!` negation, and the parts of the call that the rewrite edits. */
interface Quantifier {
	call: ESTree.CallExpression;
	property: ESTree.IdentifierName;
	dual: 'some' | 'every';
	negation: ESTree.UnaryExpression;
}

/**
 * Reports a `.some` or `.every` call whose callback returns `!p`, which negates once per element, in favor of the dual
 * quantifier with one negation outside the call. De Morgan's law turns `xs.every(x => !p)` into `!xs.some(x => p)` and
 * `xs.some(x => !p)` into `!xs.every(x => p)`, and a negated call drops both negations: `!xs.some(x => !p)` becomes
 * `xs.every(x => p)`. The rewrite is a fix when the type checker resolves the method to the standard one of an array,
 * a typed array, or an iterator (see `STANDARD_RECEIVERS`), and a suggestion otherwise.
 */
export const NO_NEGATED_QUANTIFIER_CALLBACK = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		hasSuggestions: true,
		docs: {
			description:
				'Prefer the dual quantifier with one negation outside the call over a `.some` or `.every` callback that negates each element.',
		},
		messages: {
			negatedQuantifierCallback:
				'This `.{{quantifier}}` callback negates once per element. Negate once outside the call instead, with `.{{dual}}`.',
			rewriteWithDual:
				'Rewrite with `.{{dual}}`. If `.{{quantifier}}` is not the standard array or iterator method, suppress the diagnostic instead.',
		},
		schema: [],
	},
	create(context) {
		const services = typeServicesOf(context.sourceCode);
		return {
			CallExpression(node) {
				const quantifier = quantifierOf(node);
				if (quantifier !== null) reportQuantifier(context, services, quantifier);
			},
		};
	},
});

/**
 * The quantifier of a call `xs.some(cb)` or `xs.every(cb)` whose only argument is a callback that returns `!p` (see
 * `negatedResult`), or `null` for any other call. A call in an optional chain does not count, because a `!` outside the
 * call would turn a short-circuited `undefined` into `true`.
 */
function quantifierOf(call: ESTree.CallExpression) {
	const { callee, arguments: args } = call;
	if (callee.type !== 'MemberExpression' || callee.computed || hasOptionalLink(call)) return null;

	const { property } = callee;
	if (property.type === 'PrivateIdentifier') return null;
	const dual = dualOf(property.name);
	const argument = onlyElement(args);
	if (dual === null || argument === null) return null;
	const predicate = predicateOf(argument);
	if (predicate === null) return null;

	const negation = negatedResult(predicate);
	return negation === null ? null : ({ call, property, dual, negation } satisfies Quantifier);
}

/** The dual quantifier of a method name: `every` for `some`, `some` for `every`, and `null` for any other name. */
function dualOf(name: string) {
	switch (name) {
		case 'some':
			return 'every';
		case 'every':
			return 'some';
		default:
			return null;
	}
}

/** Whether a call or member access, or any call or member access that it reads from, is an optional link (`?.`). */
function hasOptionalLink(node: ESTree.Expression | ESTree.Super): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only calls and member accesses form the links of a chain, so `default` covers the rest.
	switch (node.type) {
		case 'CallExpression':
			return node.optional || hasOptionalLink(node.callee);
		case 'MemberExpression':
			return node.optional || hasOptionalLink(node.object);
		default:
			return false;
	}
}

/** The argument as a predicate: an arrow or a function expression, or `null` for any other argument. */
function predicateOf(argument: ESTree.Argument) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two function expression kinds matter, so `default` covers the rest.
	switch (argument.type) {
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			return argument;
		default:
			return null;
	}
}

/**
 * The `!` negation that a predicate returns: the body of an arrow, or the argument of a block body's only statement
 * when it is a `return`. Returns `null` for a predicate that is `async` or a generator, whose result is no `boolean`,
 * that takes an index or array parameter, or that declares a type predicate, which the rewrite would invert.
 */
function negatedResult(predicate: ESTree.ArrowFunctionExpression | ESTree.Function) {
	const { params, body, async, generator, returnType } = predicate;
	if (
		async ||
		generator ||
		params.length > 1 ||
		params.some(({ type }) => type === 'RestElement') ||
		returnType?.typeAnnotation.type === 'TSTypePredicate' ||
		body === null
	) {
		return null;
	}

	const result = body.type === 'BlockStatement' ? returnedValue(body) : body;
	return result?.type === 'UnaryExpression' && result.operator === '!' ? result : null;
}

/** The value that a block body returns when its only statement is a `return` with an argument, otherwise `null`. */
function returnedValue({ body }: ESTree.FunctionBody) {
	const statement = onlyElement(body);
	return statement?.type === 'ReturnStatement' ? statement.argument : null;
}

/**
 * Reports a quantifier with its rewrite: the dual call, negated unless the call already is the operand of a `!`, which
 * the rewrite then drops. The rewrite is a fix when the method is proven standard, a suggestion otherwise, and absent
 * when a comment between the outer `!` and the call would be dropped.
 */
function reportQuantifier(context: Context, services: TypeServices | null, quantifier: Quantifier) {
	const { sourceCode } = context;
	const { call, property, dual } = quantifier;
	const { parent } = call;
	const outer = parent.type === 'UnaryExpression' && parent.operator === '!' ? parent : null;
	const target = outer ?? call;
	const data = { quantifier: property.name, dual };

	if (dropsComment(sourceCode, { range: target.range, kept: [call.range] })) {
		context.report({ node: target, messageId: 'negatedQuantifierCallback', data });
		return;
	}

	const rewritten = dualCall(sourceCode, quantifier);
	const text = outer === null ? negatedCall(call, rewritten) : rewritten;

	if (services !== null && isDefaultLibraryMember(services, STANDARD_RECEIVERS, property)) {
		context.report({
			node: target,
			messageId: 'negatedQuantifierCallback',
			data,
			fix: fixer => fixer.replaceText(target, text),
		});
		return;
	}

	context.report({
		node: target,
		messageId: 'negatedQuantifierCallback',
		data,
		suggest: [
			{
				messageId: 'rewriteWithDual',
				data,
				fix: fixer => fixer.replaceText(target, text),
			},
		],
	});
}

/**
 * The text of the call with the dual method, whose callback returns the operand of its `!`. Both quantifiers read only
 * the truthiness of the callback's result, so the `!` goes away without a `!!` in its place (see `negate`).
 */
function dualCall(sourceCode: SourceCode, { call, property, dual, negation }: Quantifier) {
	const { text } = sourceCode;
	const [start, end] = call.range;
	const [propertyStart, propertyEnd] = property.range;
	const { start: editStart, end: editEnd, text: edit } = negate(sourceCode, true, negation);
	return (
		text.slice(start, propertyStart) +
		dual +
		text.slice(propertyEnd, editStart) +
		edit +
		text.slice(editEnd, end)
	);
}

/** The text of a `!` before the call, in parentheses where the call's position binds tighter than `!`. */
function negatedCall(call: ESTree.CallExpression, text: string) {
	return bindsTighterThanNot(call) ? `(!${text})` : `!${text}`;
}

/** Whether the call is the object of a member access, the callee of a call or `new`, a tag, or the left operand of `**`. */
function bindsTighterThanNot(call: ESTree.CallExpression) {
	const { parent } = call;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types bind tighter than `!`, so `default` covers the rest.
	switch (parent.type) {
		case 'MemberExpression':
			return parent.object === call;
		case 'CallExpression':
		case 'NewExpression':
			return parent.callee === call;
		case 'TaggedTemplateExpression':
			return parent.tag === call;
		case 'BinaryExpression':
			return parent.operator === '**' && parent.left === call;
		default:
			return false;
	}
}

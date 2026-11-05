import {
	defineRule,
	type ESTree,
	type Reference,
	type SourceCode,
	type Variable,
} from '@oxlint/plugins';

import { assertDefined } from '#assert.ts';
import { referenceKey, unwrap } from '#ast/discriminant.ts';
import { isFunction } from '#ast/functions.ts';
import { messageLabel } from '#ast/labels.ts';
import { propertyName } from '#ast/property-keys.ts';
import { isWithin } from '#ast/ranges.ts';
import { accessChain, isValueRead, queryOption, valueReads } from '#ast/tanstack-query.ts';

/** What the `queryKey` of a query holds, as seen from its `queryFn`. */
interface QueryKey {
	/** The value reads in the key, in source order. */
	reads: Reference[];
	/** The paths (see `pathOf`) of the static member reads in the key, by the variable at their root. */
	paths: Map<Variable, string[]>;
	/** The key when it is a call, such as `keys.detail(id)`, through optional chains and TypeScript assertions. */
	call: ESTree.CallExpression | null;
}

/**
 * Reports a value that the inline `queryFn` of a TanStack Query captures from its closure while the sibling `queryKey`
 * holds it too. The query function context passes the key to `queryFn`, so reading the value from there keeps the fetch
 * in step with the cache entry that the key names.
 *
 * Inside `queryFn`, a reference that resolves outside it is reported when it reads a variable that the key reads, or a
 * static member path of one: a key that holds `filters.status` reports `filters.status`, and a key that holds `filters`
 * reports every read of `filters`. A `.queryKey` read on a captured object, such as `opts.queryKey`, and a call with the
 * same tokens and bindings as a key that is a call, such as a repeated key factory call `keys.detail(id)`, are reported
 * too. Each offending expression is reported once, at the outermost match. The context parameter of `queryFn`, its
 * locals, and captures that the key does not hold are never reported. There is no rewrite: the position of a value in
 * the key is up to the key's author.
 */
export const PREFER_QUERY_KEY_CONTEXT = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Require `queryFn` to read the values of its `queryKey` from the query function context.',
		},
		messages: {
			readFromContext:
				'`queryFn` captures `{{value}}`, which its `queryKey` holds too. Read the value from the `queryKey` of the query function context instead, so that the fetch matches the cache entry.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		return {
			ObjectExpression(node) {
				const key = queryOption(node, 'queryKey');
				const fn = queryOption(node, 'queryFn');
				if (key === null || fn === null) return;
				const queryFn = unwrap(fn.value);
				if (!isFunction(queryFn)) return;

				for (const capture of keyCaptures(
					sourceCode,
					queryKeyOf(sourceCode, key.value),
					queryFn,
				)) {
					context.report({
						node: capture,
						messageId: 'readFromContext',
						data: { value: messageLabel(sourceCode.getText(capture)) },
					});
				}
			},
		};
	},
});

/**
 * What a `queryKey` value holds. A read adds a path only when its whole access chain (see `accessChain`) reads static
 * members, so that a callee such as `keys.detail` in `keys.detail(id)` and a dynamic read such as `items[i]` add none.
 */
function queryKeyOf(sourceCode: SourceCode, value: ESTree.Expression) {
	const reads = valueReads(sourceCode, value);
	const paths = new Map<Variable, string[]>();
	for (const { identifier, resolved } of reads) {
		const path = pathOf(assertDefined(accessChain(identifier).at(-1)));
		if (resolved === null || path === null) continue;
		const known = paths.get(resolved);
		if (typeof known === 'undefined') paths.set(resolved, [path]);
		else known.push(path);
	}

	const target = unwrap(value);
	return {
		reads,
		paths,
		call: target.type === 'CallExpression' ? target : null,
	} satisfies QueryKey;
}

/**
 * The nodes in `queryFn` that capture what the key holds: the outermost match in the access chain of each value read
 * that resolves outside `queryFn`, without any match that lies inside another. The context parameter and the locals of
 * `queryFn` resolve inside it, so they never count. Expects `queryFn` to be a function.
 */
function keyCaptures(sourceCode: SourceCode, key: QueryKey, queryFn: ESTree.Node) {
	const captures: ESTree.Node[] = [];
	const { through } = sourceCode.getScope(queryFn);
	for (const reference of through) {
		if (!isValueRead(reference)) continue;
		const capture = accessChain(reference.identifier).findLast(node =>
			isKeyCapture(sourceCode, key, reference, node),
		);
		if (typeof capture !== 'undefined') captures.push(capture);
	}
	return captures.filter(
		capture =>
			!captures.some(other => other !== capture && isWithin(capture.range, other.range)),
	);
}

/**
 * Whether a node in the access chain of a captured reference reads what the key holds: a static member path that the
 * key reads off the same variable, a `.queryKey` read, or a call that repeats a key that is a call.
 */
function isKeyCapture(
	sourceCode: SourceCode,
	key: QueryKey,
	{ resolved }: Reference,
	node: ESTree.Node,
) {
	const path = pathOf(node);
	return (
		(resolved !== null && path !== null && key.paths.get(resolved)?.includes(path) === true) ||
		isQueryKeyRead(node) ||
		(key.call !== null &&
			node.type === 'CallExpression' &&
			repeatsCall(sourceCode, key.reads, key.call, node))
	);
}

/**
 * The path that a node in an access chain reads: the name of an identifier, the reference key (see `referenceKey`) of a
 * static member read, or `null` for a call or a dynamic member read.
 */
function pathOf(node: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only identifiers and members read a path, so `default` covers the rest.
	switch (node.type) {
		case 'Identifier':
			return node.name;
		case 'MemberExpression':
			return referenceKey(node);
		default:
			return null;
	}
}

/** Whether a node reads a static `queryKey` member. */
function isQueryKeyRead(node: ESTree.Node) {
	return (
		node.type === 'MemberExpression' &&
		node.property.type !== 'PrivateIdentifier' &&
		propertyName(node.property, node.computed) === 'queryKey'
	);
}

/**
 * Whether a call repeats the key call: both have the same tokens, and each value read in one resolves to the same
 * variable as the value read at the same position in the other. `keyReads` holds the value reads of the key call.
 */
function repeatsCall(
	sourceCode: SourceCode,
	keyReads: readonly Reference[],
	keyCall: ESTree.CallExpression,
	call: ESTree.CallExpression,
) {
	const keyTokens = sourceCode.getTokens(keyCall);
	const tokens = sourceCode.getTokens(call);
	if (
		tokens.length !== keyTokens.length ||
		tokens.some((token, index) => token.value !== keyTokens[index]?.value)
	) {
		return false;
	}

	const reads = valueReads(sourceCode, call);
	return (
		reads.length === keyReads.length &&
		reads.every(({ resolved }, index) => resolved === keyReads[index]?.resolved)
	);
}

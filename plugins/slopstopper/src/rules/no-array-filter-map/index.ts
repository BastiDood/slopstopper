import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { unwrap } from '#ast/discriminant.ts';
import {
	isKnownArrayExpression,
	isStandardArrayMethod,
	type MethodTarget,
	methodTarget,
} from '#ast/known-arrays.ts';
import { messageLabel } from '#ast/labels.ts';
import { type TypeServices, typeServicesOf } from '#type-services.ts';

/** Two adjacent passes over an array: the inner `filter` or `map` call and the outer call of the other method. */
interface Passes {
	inner: MethodTarget;
	outer: MethodTarget;
}

/**
 * Reports `xs.filter(f).map(g)` and `xs.map(f).filter(g)` on an array, which build an intermediate array, in favor of
 * one pass: a single loop or `.flatMap`, or lazy iterator helpers where the runtime supports them. The receiver counts
 * as an array by local evidence (see `isKnownArrayExpression`), or when the type checker resolves the inner method to
 * the standard one of `Array` or `ReadonlyArray`. Iterator helper pipelines are lazy already and stay unreported. There
 * is no rewrite: iterator helpers pass neither the index nor the array to the callbacks, interleave the side effects of
 * both callbacks, and need an ES2025 runtime.
 */
export const NO_ARRAY_FILTER_MAP = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow adjacent array `.filter` and `.map` passes in favor of one pass over the array.',
		},
		messages: {
			arrayFilterMap:
				'`{{receiver}}.{{first}}(…).{{second}}(…)` walks the array twice. Do it in one pass with a single loop or `.flatMap`, or with lazy iterator helpers (`.values()`) where the runtime supports them.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const services = typeServicesOf(sourceCode);
		return {
			CallExpression(node) {
				const passes = passesOf(node);
				if (passes === null || !isArrayReceiver(sourceCode, services, passes.inner)) return;
				const { inner, outer } = passes;
				context.report({
					node,
					messageId: 'arrayFilterMap',
					data: {
						receiver: messageLabel(sourceCode.getText(inner.object)),
						first: inner.name,
						second: outer.name,
					},
				});
			},
		};
	},
});

/** The passes of a call `xs.filter(f).map(g)` or `xs.map(f).filter(g)`, or `null` for any other call. */
function passesOf({ callee }: ESTree.CallExpression) {
	const outer = methodTarget(callee);
	if (outer === null) return null;
	const partner = partnerOf(outer.name);
	const innerCall = unwrap(outer.object);
	if (partner === null || innerCall.type !== 'CallExpression') return null;
	const inner = methodTarget(innerCall.callee);
	return inner?.name === partner ? ({ inner, outer } satisfies Passes) : null;
}

/** The method that forms a reported pair with a method name: `filter` for `map`, `map` for `filter`, otherwise `null`. */
function partnerOf(name: string) {
	switch (name) {
		case 'map':
			return 'filter';
		case 'filter':
			return 'map';
		default:
			return null;
	}
}

/**
 * Whether the receiver of the inner pass is an array: a known array by local evidence, or, with type information, a
 * receiver whose inner method is the standard one of `Array` or `ReadonlyArray`.
 */
function isArrayReceiver(
	sourceCode: SourceCode,
	services: TypeServices | null,
	{ object, property }: MethodTarget,
) {
	return (
		isKnownArrayExpression(sourceCode, object) ||
		(services !== null && isStandardArrayMethod(services, property))
	);
}

import type { ESTree } from '@oxlint/plugins';

import { propertyName } from '#ast/property-keys.ts';

/** A contiguous run of operands in a logical chain that each compare one shared discriminant. */
interface EqualityRun {
	first: ESTree.Expression;
	last: ESTree.Expression;
	count: number;
	discriminant: ESTree.Expression;
	key: string;
}

/** One side of a comparison against a case comparand (see `caseSide`). */
export interface CaseSide {
	node: ESTree.Expression;
	key: string;
	comparand: ESTree.Expression;
}

/**
 * Whether an expression is a comparand that a `switch` case can name, such as a literal or a constant. The rules build
 * one per file (see `caseComparandsOf`), so that these helpers stay pure on the AST.
 */
export type CaseComparand = (node: ESTree.Expression) => boolean;

/**
 * Finds every run of two or more contiguous `||` operands that compare one shared discriminant with `===` against a
 * case comparand (see `caseSide`). An operand that compares another discriminant ends the run and may start the next one.
 */
export function equalityRuns(isCaseComparand: CaseComparand, operands: ESTree.Expression[]) {
	const runs: EqualityRun[] = [];
	let run: EqualityRun | null = null;

	for (const operand of operands) {
		const side = caseSide(isCaseComparand, '===', operand);
		if (run !== null && side?.key === run.key) {
			run.last = operand;
			++run.count;
			continue;
		}

		if (run !== null && run.count >= 2) runs.push(run);
		run =
			side === null
				? null
				: {
						first: operand,
						last: operand,
						count: 1,
						discriminant: side.node,
						key: side.key,
					};
	}

	if (run !== null && run.count >= 2) runs.push(run);
	return runs;
}

/**
 * Whether every operand compares one shared discriminant with `operator` against a case comparand (see `caseSide`): an
 * `===` run that `no-equality-chain` reports, or a `!==` chain that De Morgan's law turns into one.
 */
export function isCaseChain(
	isCaseComparand: CaseComparand,
	operator: '===' | '!==',
	operands: ESTree.Expression[],
) {
	let key: string | null = null;
	for (const operand of operands) {
		const side = caseSide(isCaseComparand, operator, operand);
		if (side === null || (key !== null && side.key !== key)) return false;
		({ key } = side);
	}
	return true;
}

/**
 * The sides of a comparison with `operator` against a case comparand: the discriminant `node` with its reference
 * `key`, and the `comparand` that a `switch` case names. Checks the right side first. Returns `null` when the node is no
 * comparison with `operator`, when neither side is a case comparand, so comparisons against `null`, `undefined`, and
 * other references guard or narrow values instead of selecting a case, or when the discriminant has no reference key.
 */
export function caseSide(
	isCaseComparand: CaseComparand,
	operator: '===' | '!==',
	test: ESTree.Expression,
) {
	if (test.type !== 'BinaryExpression' || test.operator !== operator) return null;

	// The reference keys come first because they are cheaper than a case comparand check, which may ask the type checker.
	const { left, right } = test;
	const leftTarget = unwrap(left);
	const rightTarget = unwrap(right);
	const leftKey = referenceKey(leftTarget);
	if (leftKey !== null && isCaseComparand(rightTarget)) {
		return { node: left, key: leftKey, comparand: right } satisfies CaseSide;
	}

	// A right comparand makes the left side the discriminant, so a left side without a key leaves no case side.
	const rightKey = referenceKey(rightTarget);
	if (rightKey === null || (leftKey === null && isCaseComparand(rightTarget))) return null;
	return isCaseComparand(leftTarget)
		? ({ node: right, key: rightKey, comparand: left } satisfies CaseSide)
		: null;
}

/**
 * A structural key for a discriminant candidate: an identifier, `this`, or a member chain with static property names
 * (such as `node.type` or `this.kind`). Two expressions read the same reference when their keys are equal, regardless of
 * whitespace, parentheses, or optional chaining. Returns `null` for anything else (calls, literals, `undefined`, ...).
 * Expects a node without wrappers (see `unwrap`).
 */
export function referenceKey(target: ESTree.Expression): string | null {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only identifiers, `this`, and member chains are references, so `default` covers the rest.
	switch (target.type) {
		case 'Identifier':
			return target.name === 'undefined' ? null : target.name;
		case 'ThisExpression':
			return 'this';
		case 'MemberExpression': {
			const name = memberKey(target);
			if (name === null) return null;
			const object =
				target.object.type === 'Super' ? 'super' : referenceKey(unwrap(target.object));
			return object === null ? null : `${object}[${name}]`;
		}
		default:
			return null;
	}
}

/**
 * The static key of a member expression's property: `#name` for a private name, and the quoted `propertyName`
 * otherwise. Returns `null` when the property is computed from a non-literal key.
 */
function memberKey({ property, computed }: ESTree.MemberExpression) {
	if (property.type === 'PrivateIdentifier') return `#${property.name}`;
	const name = propertyName(unwrap(property), computed);
	return name === null ? null : JSON.stringify(name);
}

/** Strips wrappers that do not change which value an expression reads: optional chains and TypeScript assertions. */
export function unwrap(node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (node.type) {
		case 'ChainExpression':
		case 'TSNonNullExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
			return unwrap(node.expression);
		default:
			return node;
	}
}

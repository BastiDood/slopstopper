import type { ESTree } from '@oxlint/plugins';

/** Whether an operator compares for equality or inequality: `===`, `!==`, `==`, or `!=`. */
export function isEquality(operator: ESTree.BinaryOperator) {
	return flipEquality(operator) !== null;
}

/** The equality operator with the opposite result, or `null` for any other operator. */
export function flipEquality(operator: ESTree.BinaryOperator) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the four equality operators have an opposite operator, so `default` covers the rest.
	switch (operator) {
		case '===':
			return '!==';
		case '!==':
			return '===';
		case '==':
			return '!=';
		case '!=':
			return '==';
		default:
			return null;
	}
}

/** Whether an operator compares for inequality: `!==` or `!=`. */
export function isInequality(operator: ESTree.BinaryOperator) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two inequality operators matter, so `default` covers the rest.
	switch (operator) {
		case '!==':
		case '!=':
			return true;
		default:
			return false;
	}
}

/** Whether an operator compares strictly: `===` or `!==`. */
export function isStrictEquality(operator: ESTree.BinaryOperator) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two strict equality operators matter, so `default` covers the rest.
	switch (operator) {
		case '===':
		case '!==':
			return true;
		default:
			return false;
	}
}

/** Whether an assignment operator evaluates its right side only sometimes: `&&=`, `||=`, or `??=`. */
export function isLogicalAssignment(operator: ESTree.AssignmentOperator) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the three logical assignment operators matter, so `default` covers the rest.
	switch (operator) {
		case '&&=':
		case '||=':
		case '??=':
			return true;
		default:
			return false;
	}
}

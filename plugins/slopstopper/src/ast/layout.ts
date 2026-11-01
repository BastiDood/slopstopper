import type { ESTree, SourceCode } from '@oxlint/plugins';

import { assertDefined } from '#assert.ts';

/** The whitespace that starts the line of a node. */
export function indentation({ lines }: SourceCode, { loc }: ESTree.Node) {
	const line = assertDefined(lines[loc.start.line - 1]);
	const { length: trimmedLength } = line.trimStart();
	return line.slice(0, line.length - trimmedLength);
}

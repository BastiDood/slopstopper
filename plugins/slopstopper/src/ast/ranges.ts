import type { Range, SourceCode } from '@oxlint/plugins';

/** The range that a rewrite replaces and the ranges inside it whose text the rewrite keeps. */
interface Replaced {
	range: Range;
	kept: readonly Range[];
}

/** Whether a comment inside the replaced range lies outside every kept range, so that the rewrite would drop it. */
export function dropsComment(sourceCode: SourceCode, { range, kept }: Replaced) {
	return sourceCode
		.getAllComments()
		.some(
			({ range: commentRange }) =>
				isWithin(commentRange, range) && !isWithinAny(commentRange, kept),
		);
}

/** Whether a range lies within any of the given ranges. */
function isWithinAny(range: Range, ranges: readonly Range[]) {
	return ranges.some(outer => isWithin(range, outer));
}

/** Whether the `inner` range lies within the `outer` range. */
export function isWithin([innerStart, innerEnd]: Range, [outerStart, outerEnd]: Range) {
	return outerStart <= innerStart && innerEnd <= outerEnd;
}

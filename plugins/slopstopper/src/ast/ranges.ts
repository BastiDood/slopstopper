import type { Comment, Range, SourceCode } from '@oxlint/plugins';

import { assertDefined } from '#assert.ts';

/** The range that a rewrite replaces and the ranges inside it whose text the rewrite keeps. */
interface Replaced {
	range: Range;
	kept: readonly Range[];
}

/** Whether a comment inside the replaced range lies outside every kept range, so that the rewrite would drop it. */
export function dropsComment(sourceCode: SourceCode, { range, kept }: Replaced) {
	const comments = sourceCode.getAllComments();
	const [start, end] = range;
	for (let index = firstCommentFrom(comments, start); index < comments.length; ++index) {
		const { range: commentRange } = assertDefined(comments[index]);
		if (commentRange[0] >= end) return false;
		if (commentRange[1] <= end && !isWithinAny(commentRange, kept)) return true;
	}
	return false;
}

/** The index of the first comment that starts at or after `offset`. Expects the comments in source order. */
function firstCommentFrom(comments: readonly Comment[], offset: number) {
	let low = 0;
	let high = comments.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const { range } = assertDefined(comments[middle]);
		if (range[0] < offset) low = middle + 1;
		else high = middle;
	}
	return low;
}

function isWithinAny(range: Range, ranges: readonly Range[]) {
	return ranges.some(outer => isWithin(range, outer));
}

/** Whether the `inner` range lies within the `outer` range. */
export function isWithin(inner: Range, outer: Range) {
	return outer[0] <= inner[0] && inner[1] <= outer[1];
}

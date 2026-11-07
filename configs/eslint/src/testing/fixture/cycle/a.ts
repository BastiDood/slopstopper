// oxlint-disable-next-line import/no-cycle -- This fixture is a deliberate import cycle.
import { b } from './b.ts';

export const a = 1;

export function readB() {
	return b;
}

// oxlint-disable-next-line import/no-cycle -- This fixture is a deliberate import cycle.
import { a } from './a.ts';

export const b = 2;

export function readA() {
	return a;
}

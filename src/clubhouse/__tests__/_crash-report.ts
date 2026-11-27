/**
 * A section that crashes while its screen is rendered without the shell (as these tests render it) has no signal
 * place yet: chSignalReport holds the crash's report for the shell's configure and, when none comes, sends it on its
 * own a microtask later. Await this after the crash and before asserting its report.
 */
export const crashReported = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

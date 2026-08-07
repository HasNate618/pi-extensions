/**
 * Session-resume helpers for the dashboard.
 *
 * A real session resume requires the full session-replacement lifecycle
 * (teardown + runtime rebuild from the saved file) that `pi --session <file>`
 * performs. `ctx.sessionManager.setSessionFile()` only rebinds the file
 * pointer on the running session manager — the agent runtime stays on the
 * fresh startup session, so the conversation history is lost.
 *
 * These helpers are pure and dependency-free so they can be unit-tested
 * without importing pi packages.
 */

/** CLI flags that already select a session at startup. When any of these is
 * present in argv, the session pi opens was explicitly chosen, so the
 * dashboard must not show (otherwise it would overlay a resumed session). */
const SESSION_SELECT_FLAGS = new Set([
	"--session",
	"--session-id",
	"--resume",
	"--continue",
	"--fork",
	"-r",
	"-c",
]);

/** Flags that consume the next argv token as their value. */
const SESSION_SELECT_VALUE_FLAGS = new Set([
	"--session",
	"--session-id",
	"--fork",
]);

/** True when the given argv contains a session-selecting CLI flag. */
export function hasSessionSelectFlag(args: string[]): boolean {
	return args.some((arg) => SESSION_SELECT_FLAGS.has(arg));
}

/** Build the argv for the resume re-exec: the original args minus any
 * session-selecting flags (and their values), plus `--session <file>`. */
export function buildResumeArgs(
	args: string[],
	file: string,
): string[] {
	const out: string[] = [];
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (SESSION_SELECT_FLAGS.has(arg)) {
			// Value-taking flags consume the next token too.
			if (SESSION_SELECT_VALUE_FLAGS.has(arg) && i + 1 < args.length) {
				i += 1;
			}
			continue;
		}
		out.push(arg);
	}
	out.push("--session", file);
	return out;
}

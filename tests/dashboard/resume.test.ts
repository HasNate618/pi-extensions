import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResumeArgs, hasSessionSelectFlag } from "../../extensions/dashboard/resume.ts";

test("buildResumeArgs appends --session <file> to plain args", () => {
	assert.deepEqual(buildResumeArgs([], "/sessions/old.jsonl"), [
		"--session",
		"/sessions/old.jsonl",
	]);
	assert.deepEqual(buildResumeArgs(["-e", "./ext.ts"], "/s/old.jsonl"), [
		"-e",
		"./ext.ts",
		"--session",
		"/s/old.jsonl",
	]);
});

test("buildResumeArgs strips session-selecting flags from the original argv", () => {
	for (const flag of ["--resume", "--continue", "-r", "-c"]) {
		assert.deepEqual(
			buildResumeArgs([flag], "/s/chosen.jsonl"),
			["--session", "/s/chosen.jsonl"],
			`${flag} should be replaced by the chosen session`,
		);
	}
});

test("buildResumeArgs strips value-taking session flags along with their value", () => {
	for (const flag of ["--session", "--session-id", "--fork"]) {
		assert.deepEqual(
			buildResumeArgs([flag, "/s/old.jsonl"], "/s/chosen.jsonl"),
			["--session", "/s/chosen.jsonl"],
			`${flag} + value should be replaced by the chosen session`,
		);
	}
});

test("buildResumeArgs keeps unrelated flags", () => {
	assert.deepEqual(
		buildResumeArgs(["--session-dir", "/custom/sessions", "--model", "x"], "/s/old.jsonl"),
		["--session-dir", "/custom/sessions", "--model", "x", "--session", "/s/old.jsonl"],
	);
});

test("buildResumeArgs is deterministic and preserves arg order", () => {
	const args = ["--session", "ignored", "-e", "a.ts", "--continue", "--model", "m"];
	assert.deepEqual(buildResumeArgs(args, "/s/new.jsonl"), [
		"-e",
		"a.ts",
		"--model",
		"m",
		"--session",
		"/s/new.jsonl",
	]);
});

test("hasSessionSelectFlag detects session-selecting flags", () => {
	assert.equal(hasSessionSelectFlag([]), false);
	assert.equal(hasSessionSelectFlag(["-e", "ext.ts"]), false);
	assert.equal(hasSessionSelectFlag(["--session", "/s/x.jsonl"]), true);
	assert.equal(hasSessionSelectFlag(["-c"]), true);
	assert.equal(hasSessionSelectFlag(["--resume"]), true);
	assert.equal(hasSessionSelectFlag(["--fork", "x"]), true);
	// --session-dir is a storage dir, not a session selection
	assert.equal(hasSessionSelectFlag(["--session-dir", "/d"]), false);
});

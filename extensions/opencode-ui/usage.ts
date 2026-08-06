export type SessionUsage = {
	input?: unknown;
	output?: unknown;
	cacheRead?: unknown;
	cacheWrite?: unknown;
	cost?: { total?: unknown };
};

export type SessionEntry = {
	type?: string;
	id?: string | number;
	timestamp?: string | number;
	usage?: SessionUsage;
	message?: { role?: string; usage?: SessionUsage };
};

export type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
};

const normalize = (value: unknown): number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

export function computeUsageTotals(entries: readonly SessionEntry[]): UsageTotals {
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cost = 0;
	for (const entry of entries) {
		if (entry.type === "message" && entry.message?.role !== "assistant" && entry.message?.role !== "toolResult") {
			continue;
		}
		const usage = entry.message?.usage ?? entry.usage;
		input += normalize(usage?.input);
		output += normalize(usage?.output);
		cacheRead += normalize(usage?.cacheRead);
		cacheWrite += normalize(usage?.cacheWrite);
		const total = usage?.cost?.total;
		cost += normalize(total);
	}
	return { input, output, cacheRead, cacheWrite, cost };
}

export function computeUsageFingerprint(entries: readonly SessionEntry[]): string {
	return entries
		.map((entry) =>
			JSON.stringify([
				entry.id ?? null,
				entry.timestamp ?? null,
				entry.type ?? null,
				entry.message?.role ?? null,
				entry.message?.usage?.input ?? entry.usage?.input ?? null,
				entry.message?.usage?.output ?? entry.usage?.output ?? null,
				entry.message?.usage?.cost?.total ?? entry.usage?.cost?.total ?? null,
			]),
		)
		.join("\0");
}

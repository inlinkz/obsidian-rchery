import type { SessionState } from './scorecard';

/** One saved aim sample, in degrees, relative to the shot break. */
export interface AimSample {
	yaw: number;
	pitch: number;
}

/**
 * A shot's aim trace plus the sampling values that describe it.
 * `breakIndex` is the release sample. Sample time is
 * `(index - breakIndex) / hz` seconds. Yaw is positive to the right and
 * pitch is positive up.
 */
export interface AimTrace {
	hz: number;
	secondsBefore: number;
	secondsAfter: number;
	halfAngleDeg: number;
	breakIndex: number;
	points: AimSample[];
}

/** One trace placed on a scorecard cell. Indexes are 1-based. */
export interface ExportedAimTrace {
	card: number;
	end: number;
	arrow: number;
	trace: AimTrace;
}

const AIM_PREFIX = '<!-- archery-aim:';
const AIM_SHOT_PREFIX = '<!-- archery-aim-shot:';
const DRAW_CAP = 400;

const SHOT_LINE = /^<!-- archery-aim-shot:\s*(\d+)\.(\d+)(?:\.(\d+))?\s*(.*)$/;

export function aimTraceKey(card: number, end: number, arrow: number): string {
	return `${card}.${end}.${arrow}`;
}

export function formatAimCoord(value: number): string {
	const rounded = Math.round(value * 1000) / 1000;
	if (rounded === Math.round(rounded)) {
		const whole = Math.round(rounded);
		return whole === 0 ? '0' : String(whole);
	}
	return rounded.toFixed(3).replace(/0+$/, '');
}

/**
 * Markdown comments appended after the scorecard so a plugin can read the
 * series and the sampling values together.
 *
 * A shared header carries the axis contract. When every shot was recorded
 * with the same rate, window, and face angle, those values sit on the header
 * and each shot line is `card.end.arrow break`. A shot that differs carries
 * its own sampling object.
 */
export function formatAimTraces(traces: ExportedAimTrace[]): string {
	const usable = traces.filter((item) => item.trace.points.length >= 2);
	if (usable.length === 0) return '';
	const first = usable[0]!.trace;
	const uniform = usable.every((item) => sameSampling(item.trace, first));
	const header: Record<string, unknown> = {
		v: 1,
		unit: 'deg',
		yaw: 'right',
		pitch: 'up',
		origin: 'release',
		...(uniform ? sampling(first) : {}),
	};
	const lines = [`${AIM_PREFIX} ${JSON.stringify(header)} -->`];
	for (const item of usable) {
		const key = `${item.card}.${item.end}.${item.arrow}`;
		if (uniform) {
			lines.push(`${AIM_SHOT_PREFIX} ${key} ${item.trace.breakIndex}`);
		} else {
			lines.push(
				`${AIM_SHOT_PREFIX} ${key} ${JSON.stringify({ ...sampling(item.trace), break: item.trace.breakIndex })}`,
			);
		}
		for (const point of item.trace.points) {
			lines.push(`${formatAimCoord(point.yaw)},${formatAimCoord(point.pitch)}`);
		}
		lines.push('-->');
	}
	return lines.join('\n');
}

export function formatSessionAimTraces(state: SessionState): string {
	const traces: ExportedAimTrace[] = [];
	for (let card = 0; card < state.cards.length; card++) {
		const scorecard = state.cards[card];
		if (!scorecard) continue;
		for (let end = 0; end < scorecard.ends.length; end++) {
			const row = scorecard.ends[end];
			if (!row) continue;
			for (let arrow = 0; arrow < row.length; arrow++) {
				const aim = row[arrow]?.aim;
				if (!aim) continue;
				traces.push({ card: card + 1, end: end + 1, arrow: arrow + 1, trace: aim });
			}
		}
	}
	return formatAimTraces(traces);
}

/** Keys are `card.end.arrow`, 0-based. */
export function parseAimTraces(content: string): Map<string, AimTrace> {
	const lines = content.split('\n');
	let header: Record<string, unknown> = {};
	const counters = new Map<string, number>();
	const result = new Map<string, AimTrace>();
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]!.trim();
		if (trimmed.startsWith(AIM_PREFIX)) {
			header = jsonComment(trimmed, AIM_PREFIX) ?? header;
			continue;
		}
		const shot = SHOT_LINE.exec(trimmed);
		if (!shot) continue;
		const card = Number.parseInt(shot[1]!, 10) - 1;
		const end = Number.parseInt(shot[2]!, 10) - 1;
		const counterKey = `${card}.${end}`;
		let arrow: number;
		if (shot[3] === undefined) {
			arrow = counters.get(counterKey) ?? 0;
			counters.set(counterKey, arrow + 1);
		} else {
			arrow = Number.parseInt(shot[3], 10) - 1;
		}
		let rest = shot[4]!.trim();
		const closed = rest.endsWith('-->');
		if (closed) rest = rest.replace(/\s*-->\s*$/, '').trim();
		const points: AimSample[] = [];
		if (!closed) {
			i++;
			while (i < lines.length) {
				const line = lines[i]!.trim();
				const endOfBlock = line.endsWith('-->');
				const body = endOfBlock ? line.replace(/\s*-->\s*$/, '').trim() : line;
				const sample = parseSample(body);
				if (sample) points.push(sample);
				if (endOfBlock) break;
				i++;
			}
		}
		const own = rest.startsWith('{') ? decodeMap(rest) : null;
		const fields: Record<string, unknown> = { ...header, ...own };
		if (own === null) {
			const breakIndex = Number.parseInt(rest, 10);
			if (rest !== '' && Number.isFinite(breakIndex) && String(breakIndex) === rest) {
				fields.break = breakIndex;
			}
		}
		const trace = traceFrom(fields, points);
		if (trace && card >= 0 && end >= 0 && arrow >= 0) {
			result.set(aimTraceKey(card, end, arrow), trace);
		}
	}
	return result;
}

/**
 * Place trace samples on the target. The release sits on the plot point.
 * `faceRadius / halfAngleDeg` maps one face-radius of angle onto the face.
 * Returned `y` is up, matching scorecard coordinates.
 */
export interface AimTracePlotPoint {
	x: number;
	y: number;
	/** This sample is the release. */
	break: boolean;
}

export function aimTraceOnTarget(
	trace: AimTrace,
	plotX: number,
	plotY: number,
	faceRadius: number,
): AimTracePlotPoint[] {
	if (trace.points.length < 2 || trace.halfAngleDeg <= 0) return [];
	const scale = faceRadius / trace.halfAngleDeg;
	return drawIndexes(trace.points.length, trace.breakIndex).map((index) => {
		const point = trace.points[index]!;
		return {
			x: plotX + point.yaw * scale,
			y: plotY - point.pitch * scale,
			break: index === trace.breakIndex,
		};
	});
}

function drawIndexes(count: number, breakIndex: number): number[] {
	if (count <= DRAW_CAP) {
		return Array.from({ length: count }, (_, index) => index);
	}
	const step = count / DRAW_CAP;
	const chosen = new Set<number>();
	for (let i = 0; i < DRAW_CAP; i++) {
		chosen.add(Math.floor(i * step));
	}
	chosen.add(count - 1);
	if (breakIndex >= 0 && breakIndex < count) chosen.add(breakIndex);
	return [...chosen].sort((a, b) => a - b);
}

function sampling(trace: AimTrace): Record<string, number> {
	return {
		hz: trace.hz,
		before: trace.secondsBefore,
		after: trace.secondsAfter,
		halfAngleDeg: round4(trace.halfAngleDeg),
	};
}

function sameSampling(a: AimTrace, b: AimTrace): boolean {
	return (
		a.hz === b.hz &&
		a.secondsBefore === b.secondsBefore &&
		a.secondsAfter === b.secondsAfter &&
		round4(a.halfAngleDeg) === round4(b.halfAngleDeg)
	);
}

function round4(value: number): number {
	return Math.round(value * 10000) / 10000;
}

function traceFrom(fields: Record<string, unknown>, points: AimSample[]): AimTrace | null {
	if (points.length === 0 || points.length > 13000) return null;
	const hz = asInt(fields.hz);
	const before = asInt(fields.before);
	const after = asInt(fields.after);
	const half = asDouble(fields.halfAngleDeg);
	if (hz === null || hz < 1 || hz > 4000) return null;
	if (before === null || before < 1 || before > 15) return null;
	if (after === null || after < 1 || after > 15) return null;
	if (half === null || half <= 0 || half > 90) return null;
	let breakIndex = asInt(fields.break);
	if (breakIndex === null || breakIndex < 0 || breakIndex >= points.length) {
		breakIndex = nearestBreak(points);
	}
	return {
		hz,
		secondsBefore: before,
		secondsAfter: after,
		halfAngleDeg: half,
		breakIndex,
		points,
	};
}

function nearestBreak(points: AimSample[]): number {
	let index = 0;
	let best = Number.POSITIVE_INFINITY;
	for (let i = 0; i < points.length; i++) {
		const point = points[i]!;
		const reach = Math.abs(point.yaw) + Math.abs(point.pitch);
		if (reach < best) {
			best = reach;
			index = i;
		}
	}
	return index;
}

function jsonComment(line: string, prefix: string): Record<string, unknown> | null {
	const json = line.slice(prefix.length).replace(/\s*-->\s*$/, '').trim();
	return decodeMap(json);
}

function decodeMap(json: string): Record<string, unknown> | null {
	try {
		const raw: unknown = JSON.parse(json);
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
		const fields: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(raw)) {
			fields[key] = value;
		}
		return fields;
	} catch {
		return null;
	}
}

function asInt(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.round(value);
}

function asDouble(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return value;
}

function parseSample(line: string): AimSample | null {
	if (!line) return null;
	const parts = line.split(',');
	if (parts.length !== 2) return null;
	const yaw = Number.parseFloat(parts[0]!.trim());
	const pitch = Number.parseFloat(parts[1]!.trim());
	if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
	return { yaw, pitch };
}

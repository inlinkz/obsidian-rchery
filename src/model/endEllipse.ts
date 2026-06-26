export interface Point2D {
	x: number;
	y: number;
}

export interface OrientedEllipse {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	angleDeg: number;
}

const MIN_AXIS = 0.2;

export function computeEndEllipse(
	points: Point2D[],
	markerPadding = 0.45,
): OrientedEllipse | null {
	if (points.length === 0) return null;
	if (points.length === 1) {
		const point = points[0]!;
		return {
			cx: point.x,
			cy: point.y,
			rx: markerPadding,
			ry: markerPadding,
			angleDeg: 0,
		};
	}

	const n = points.length;
	let meanX = 0;
	let meanY = 0;
	for (const point of points) {
		meanX += point.x;
		meanY += point.y;
	}
	meanX /= n;
	meanY /= n;

	let varianceX = 0;
	let varianceY = 0;
	let covariance = 0;
	for (const point of points) {
		const dx = point.x - meanX;
		const dy = point.y - meanY;
		varianceX += dx * dx;
		varianceY += dy * dy;
		covariance += dx * dy;
	}
	varianceX /= n;
	varianceY /= n;
	covariance /= n;

	const angle = 0.5 * Math.atan2(2 * covariance, varianceX - varianceY);
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	let minMajor = Infinity;
	let maxMajor = -Infinity;
	let minMinor = Infinity;
	let maxMinor = -Infinity;

	for (const point of points) {
		const dx = point.x - meanX;
		const dy = point.y - meanY;
		const major = dx * cos + dy * sin;
		const minor = -dx * sin + dy * cos;
		minMajor = Math.min(minMajor, major);
		maxMajor = Math.max(maxMajor, major);
		minMinor = Math.min(minMinor, minor);
		maxMinor = Math.max(maxMinor, minor);
	}

	const rx = Math.max((maxMajor - minMajor) / 2, MIN_AXIS) + markerPadding;
	const ry = Math.max((maxMinor - minMinor) / 2, MIN_AXIS) + markerPadding;

	return {
		cx: meanX,
		cy: meanY,
		rx,
		ry,
		angleDeg: (angle * 180) / Math.PI,
	};
}

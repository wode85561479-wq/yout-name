// Which Itomori to build: the town before the comet fell (default) or the
// abandoned town eight years later, with the second crater that turned the
// round lake into a gourd shape. Chosen with ?era=after or #after, and
// switchable at runtime (the world is rebuilt in place).

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const hash = typeof location !== 'undefined' ? location.hash : '';

export const ERA = { after: params.get('era') === 'after' || hash === '#after' };

// Impact site of the comet fragment: the shrine grounds on the festival night.
const th = -2.42, r = 650;
export const CRATER2 = { x: Math.cos(th) * r, z: Math.sin(th) * r, R: 300 };

export function craterDist(x, z) {
  return Math.hypot(x - CRATER2.x, z - CRATER2.z) - CRATER2.R;
}

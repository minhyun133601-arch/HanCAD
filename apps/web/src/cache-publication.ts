/** All document workspaces publish the one active recovery cache through a shared queue. */
export const drawingCachePublication = { version: 0, queue: Promise.resolve() };

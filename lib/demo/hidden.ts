/** A demo authority can be hidden from the dashboard, so a backup stays out of sight of the room. */
export function isHiddenDemoSpace(metadata: unknown) {
  const row = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>
  return row.demo === true && row.demoHidden === true
}

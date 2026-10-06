/**
 * Fixed-timestep accumulator. The renderer feeds it real elapsed time; it calls `step`
 * a whole number of times at exactly `dt` each. Pure: no timers, no DOM.
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    private readonly step: () => void,
    readonly dt: number,
    private readonly maxSteps: number,
  ) {}

  /**
   * Adds `elapsedSeconds` of real time and runs as many fixed steps as fit.
   * Returns the leftover fraction of a step in [0, 1), for render interpolation.
   */
  advance(elapsedSeconds: number): number {
    this.accumulator += Math.max(0, elapsedSeconds);
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      this.step();
      this.accumulator -= this.dt;
      steps++;
    }
    // If we hit the cap, drop the backlog instead of trying to catch up forever.
    if (steps >= this.maxSteps && this.accumulator >= this.dt) this.accumulator = 0;
    return this.accumulator / this.dt;
  }
}

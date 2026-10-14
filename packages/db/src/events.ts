export interface EventDeliveryFailure<Event> {
  event: Event;
  error: unknown;
}

export class EventBus<Event> {
  private readonly listeners = new Set<(event: Event) => void>();
  private readonly recordedFailures: EventDeliveryFailure<Event>[] = [];

  constructor(private readonly onError?: (failure: EventDeliveryFailure<Event>) => void) {}

  get failures(): readonly EventDeliveryFailure<Event>[] {
    return [...this.recordedFailures];
  }

  takeFailures(): readonly EventDeliveryFailure<Event>[] {
    return this.recordedFailures.splice(0);
  }

  subscribe(listener: (event: Event) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: Event): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        const failure = { event, error };
        this.recordedFailures.push(failure);
        try {
          this.onError?.(failure);
        } catch (reporterError) {
          this.recordedFailures.push({ event, error: reporterError });
        }
      }
    }
  }
}

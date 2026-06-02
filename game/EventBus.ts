class SimpleEventEmitter {
  private listeners: Record<string, Array<{ fn: Function; context?: any; once?: boolean }>> = {};

  on(event: string, fn: Function, context?: any) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push({ fn, context, once: false });
    return this;
  }

  once(event: string, fn: Function, context?: any) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push({ fn, context, once: true });
    return this;
  }

  off(event: string, fn: Function, context?: any) {
    if (!this.listeners[event]) return this;
    this.listeners[event] = this.listeners[event].filter(
      (l) => l.fn !== fn || (context && l.context !== context)
    );
    return this;
  }

  removeListener(event: string, fn: Function, context?: any) {
    return this.off(event, fn, context);
  }

  emit(event: string, ...args: any[]) {
    if (!this.listeners[event]) return false;
    const list = [...this.listeners[event]];
    
    // Filter out 'once' listeners
    this.listeners[event] = this.listeners[event].filter(l => !l.once);
    
    for (const listener of list) {
      try {
        listener.fn.apply(listener.context, args);
      } catch (err) {
        console.error(`[EventBus] Error in listener for event "${event}":`, err);
      }
    }
    return true;
  }

  removeAllListeners(event?: string) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
    return this;
  }
}

const globalForEventBus = globalThis as unknown as {
  rcadeEventBus: SimpleEventEmitter | undefined;
};

export const EventBus = globalForEventBus.rcadeEventBus ?? new SimpleEventEmitter();

if (typeof window !== 'undefined') {
  globalForEventBus.rcadeEventBus = EventBus;
}


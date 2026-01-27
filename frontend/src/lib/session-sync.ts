// Session synchronization system for real-time user management.
export class SessionSync {
  private static instance: SessionSync;
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000; // 3 seconds
  private onSessionInvalidated: (() => void) | null = null;
  private onUserBlocked: ((reason: string) => void) | null = null;

  private constructor() {}

  static getInstance(): SessionSync {
    if (!SessionSync.instance) {
      SessionSync.instance = new SessionSync();
    }
    return SessionSync.instance;
  }

  // Initialize session synchronization with callbacks.
  initialize(
    onSessionInvalidated: () => void,
    onUserBlocked: (reason: string) => void
  ) {
    this.onSessionInvalidated = onSessionInvalidated;
    this.onUserBlocked = onUserBlocked;
    this.connect();
  }

  // Connect to server-sent events.
  private connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource('/api/auth/session-sync', {
        withCredentials: true,
      });

      this.eventSource.onopen = () => {
        console.log('Session sync connected');
        this.reconnectAttempts = 0;
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse session sync message:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('Session sync error:', error);
        this.handleReconnect();
      };

      // Register handlers for specific event types.
      this.eventSource.addEventListener('session-invalidated', (event) => {
        console.log('Session invalidated by admin');
        this.onSessionInvalidated?.();
      });

      this.eventSource.addEventListener('user-blocked', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('User blocked:', data.reason);
          this.onUserBlocked?.(data.reason);
        } catch (error) {
          console.error('Failed to parse user-blocked event:', error);
        }
      });

      this.eventSource.addEventListener('force-logout', (event) => {
        console.log('Force logout initiated');
        this.onSessionInvalidated?.();
      });

    } catch (error) {
      console.error('Failed to connect to session sync:', error);
      this.handleReconnect();
    }
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case 'session-invalidated':
        console.log('Session invalidated:', data.reason);
        this.onSessionInvalidated?.();
        break;
      case 'user-blocked':
        console.log('User blocked:', data.reason);
        this.onUserBlocked?.(data.reason);
        break;
      case 'force-logout':
        console.log('Force logout:', data.reason);
        this.onSessionInvalidated?.();
        break;
      case 'ping':
        // Keep-alive ping; no action required.
        break;
      default:
        console.log('Unknown session sync message:', data);
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting to session sync... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached for session sync');
    }
  }

  // Disconnect from session synchronization.
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.reconnectAttempts = 0;
  }

  // Check connection status.
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  // Send a heartbeat to maintain the connection.
  async sendHeartbeat() {
    try {
      await fetch('/api/auth/heartbeat', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }
}

export default SessionSync.getInstance();

export type StoryCleanup = () => void;

const ELEMENT_NAME = 'catchphrase-workbench-mount';

class WorkbenchMount extends HTMLElement {
  mountStory?: (host: HTMLElement) => StoryCleanup;
  private cleanup?: StoryCleanup;
  private mounting = false;
  private disconnecting = false;
  private disconnectRevision = 0;

  connectedCallback(): void {
    if (this.cleanup || this.mounting || this.disconnecting || !this.isConnected) return;
    if (!this.mountStory) throw new Error('Workbench mount callback was not assigned');
    this.mounting = true;
    const revision = this.disconnectRevision;
    try {
      const cleanup = this.mountStory(this);
      if (this.isConnected && revision === this.disconnectRevision) this.cleanup = cleanup;
      else cleanup();
    } finally {
      this.mounting = false;
    }
    if (this.isConnected && !this.cleanup) this.connectedCallback();
  }

  disconnectedCallback(): void {
    if (this.disconnecting) return;
    this.disconnecting = true;
    this.disconnectRevision += 1;
    const cleanup = this.cleanup;
    this.cleanup = undefined;
    try {
      cleanup?.();
    } finally {
      this.disconnecting = false;
      // A disposer can reconnect the host. It still needs a fresh controller.
      if (this.isConnected && !this.mounting) this.connectedCallback();
    }
  }
}

if (!customElements.get(ELEMENT_NAME)) {
  customElements.define(ELEMENT_NAME, WorkbenchMount);
}

/** Mount only after connection; release controller ownership synchronously on removal. */
export function mountedStory(mount: (host: HTMLElement) => StoryCleanup): HTMLElement {
  const host = document.createElement(ELEMENT_NAME) as WorkbenchMount;
  host.mountStory = mount;
  return host;
}

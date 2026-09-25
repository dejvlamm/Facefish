import type { SourceState } from '../facecap/source';

export type HudState = 'live' | 'idle' | 'error';

/**
 * The small overlay: connection dot, status text, packet rate and the relay
 * URL form. Tapping the canvas toggles it.
 */
export class Hud {
  private readonly root = document.getElementById('hud') as HTMLDivElement;
  private readonly dot = document.getElementById('hud-dot') as HTMLSpanElement;
  private readonly text = document.getElementById('hud-text') as HTMLSpanElement;
  private readonly fps = document.getElementById('hud-fps') as HTMLSpanElement;
  private readonly form = document.getElementById('hud-form') as HTMLFormElement;
  private readonly input = document.getElementById('hud-url') as HTMLInputElement;

  onConnect: ((url: string) => void) | null = null;

  constructor(initialUrl: string) {
    this.input.value = initialUrl;
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = this.input.value.trim();
      if (url) this.onConnect?.(url);
      this.input.blur();
    });
  }

  get url(): string {
    return this.input.value.trim();
  }

  toggle(): void {
    this.root.classList.toggle('hidden');
  }

  setSource(state: SourceState, detail?: string): void {
    switch (state) {
      case 'open':
        this.set('idle', 'connected, waiting for Face Cap');
        break;
      case 'connecting':
        this.set('idle', `connecting to ${detail ?? 'relay'}…`);
        break;
      case 'closed':
        this.set('error', 'relay disconnected, retrying…');
        break;
      case 'error':
        this.set('error', detail ?? 'error');
        break;
    }
  }

  setLive(live: boolean, packetsPerSecond: number): void {
    if (live) {
      this.set('live', 'tracking');
      this.fps.textContent = `${packetsPerSecond.toFixed(0)} pkt/s`;
    } else {
      this.fps.textContent = '';
    }
  }

  private set(state: HudState, text: string): void {
    this.dot.dataset.state = state;
    this.text.textContent = text;
  }
}

import type { KitchenSinkApplication } from '@/KitchenSinkApplication';

/**
 * Sidebar scene-picker for the kitchen-sink demo.
 * Owns the DOM nav, active-state tracking, and hash-based scene selection.
 */
export class Sidebar {
  private app: KitchenSinkApplication;
  private nav: HTMLElement;
  private allLinks: HTMLAnchorElement[] = [];

  constructor(app: KitchenSinkApplication) {
    this.app = app;

    const sidebar = document.getElementById('sidebar');
    const nav = sidebar?.querySelector('nav');
    if (!nav) {
      throw new Error('[Sidebar] <nav> element not found in #sidebar — check index.html');
    }
    this.nav = nav;
  }

  mount(): void {
    this.populateNav();
    this.bindEvents();
    this.syncActiveFromHash();
    this.populateVersionMeta();
  }

  private populateNav(): void {
    const groups = this.app.scenes.debugGroupsList;

    groups.forEach((group: HTMLOptGroupElement) => {
      const section = document.createElement('div');

      const heading = document.createElement('h3');
      heading.textContent = group.label;
      section.appendChild(heading);

      const ul = document.createElement('ul');

      Array.from(group.children as any).forEach((child: any) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = child.innerHTML;
        a.href = `#${child.value}`;
        li.appendChild(a);
        ul.appendChild(li);
        this.allLinks.push(a);
      });

      section.appendChild(ul);
      this.nav.appendChild(section);
    });
  }

  private bindEvents(): void {
    this.app.signal.onSceneChangeComplete.connect(() => {
      this.nav.classList.remove('disabled');
    });

    window.addEventListener('hashchange', () => this.syncActiveFromHash());
  }

  private syncActiveFromHash(): void {
    const scene = this.app.scenes.getSceneFromHash();
    const defaultScene = this.app.scenes.defaultScene;
    const target = scene ?? defaultScene;

    const current = this.nav.querySelector('.active');
    if (current) current.classList.remove('active');

    const link = this.nav.querySelector(`a[href="#${target}"]`);
    if (link) link.classList.add('active');
  }

  private populateVersionMeta(): void {
    const el = document.getElementById('version-meta');
    if (!el) return;
    const version = (import.meta as any).env?.VITE_APP_VERSION ?? '';
    el.textContent = version ? `v${version}` : 'dev';
  }
}

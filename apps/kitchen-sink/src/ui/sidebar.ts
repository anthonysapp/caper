import type { KitchenSinkApplication } from '@/KitchenSinkApplication';

/**
 * Sidebar scene-picker for the kitchen-sink demo.
 * Owns the DOM nav, active-state tracking, hash-based scene selection,
 * fuzzy filtering, and keyboard navigation.
 */
export class Sidebar {
  private app: KitchenSinkApplication;
  private nav: HTMLElement;
  private allLinks: HTMLAnchorElement[] = [];
  private searchInput: HTMLInputElement | null = null;
  private searchCount: HTMLElement | null = null;
  private searchBar: HTMLElement | null = null;
  private hamburger: HTMLElement | null = null;
  private backdrop: HTMLElement | null = null;
  private sidebar: HTMLElement | null = null;
  private isOverlayOpen = false;

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
    this.setupSearch();
    this.setupKeyboardNav();
    this.setupHamburger();
  }

  private populateNav(): void {
    const groups = this.app.scenes.debugGroupsList;

    groups.forEach((group: HTMLOptGroupElement) => {
      const section = document.createElement('div');
      section.classList.add('nav-group');

      const heading = document.createElement('h3');
      heading.textContent = group.label;
      section.appendChild(heading);

      const ul = document.createElement('ul');

      Array.from(group.children as any).forEach((child: any) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = child.innerHTML;
        a.href = `#${child.value}`;
        a.dataset.scene = child.value;
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

  /* ── Fuzzy filter ── */

  private setupSearch(): void {
    this.searchInput = document.getElementById('search-input') as HTMLInputElement;
    this.searchCount = document.getElementById('search-count');
    this.searchBar = document.getElementById('search-bar');
    if (!this.searchInput) return;

    this.searchBar?.classList.add('empty');
    this.searchInput.addEventListener('input', () => this.applyFilter());
  }

  private applyFilter(): void {
    const query = (this.searchInput?.value ?? '').toLowerCase().trim();
    const isEmpty = query.length === 0;
    this.searchBar?.classList.toggle('empty', isEmpty);

    let visibleCount = 0;
    const groups = this.nav.querySelectorAll<HTMLElement>('.nav-group');

    groups.forEach((group) => {
      const links = group.querySelectorAll<HTMLAnchorElement>('a');
      let groupVisible = 0;

      links.forEach((a) => {
        const text = (a.textContent ?? '').toLowerCase();
        const matches = isEmpty || text.includes(query);
        const li = a.parentElement;
        if (li) li.style.display = matches ? '' : 'none';
        if (matches) groupVisible++;
      });

      group.style.display = groupVisible > 0 || isEmpty ? '' : 'none';
      visibleCount += groupVisible;
    });

    if (this.searchCount) {
      this.searchCount.textContent = isEmpty ? '' : `${visibleCount} / ${this.allLinks.length}`;
    }
  }

  private clearFilter(): void {
    if (this.searchInput) {
      this.searchInput.value = '';
      this.applyFilter();
      this.searchInput.blur();
    }
  }

  /* ── Keyboard navigation ── */

  private setupKeyboardNav(): void {
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  private handleKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    // '/' focuses the search input (unless already in an input)
    if (e.key === '/' && !isInputFocused) {
      e.preventDefault();
      this.searchInput?.focus();
      return;
    }

    // Escape clears filter and blurs
    if (e.key === 'Escape' && isInputFocused) {
      e.preventDefault();
      this.clearFilter();
      return;
    }

    // j/k navigation (only when not in input)
    if (isInputFocused) return;

    if (e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      const direction = e.key === 'j' ? 1 : -1;
      this.navigateScenes(direction, false);
      return;
    }

    // J/K (shift) jumps groups
    if (e.key === 'J' || e.key === 'K') {
      e.preventDefault();
      const direction = e.key === 'J' ? 1 : -1;
      this.navigateScenes(direction, true);
      return;
    }
  }

  private getVisibleLinks(): HTMLAnchorElement[] {
    return this.allLinks.filter((a) => {
      const li = a.parentElement;
      return li && li.style.display !== 'none';
    });
  }

  private navigateScenes(direction: number, jumpGroup: boolean): void {
    const visible = this.getVisibleLinks();
    if (visible.length === 0) return;

    const activeLink = this.nav.querySelector('a.active') as HTMLAnchorElement | null;
    const currentIndex = activeLink ? visible.indexOf(activeLink) : -1;

    let nextIndex: number;

    if (jumpGroup) {
      nextIndex = this.findNextGroupStart(visible, currentIndex, direction);
    } else {
      if (currentIndex === -1) {
        nextIndex = direction === 1 ? 0 : visible.length - 1;
      } else {
        nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = visible.length - 1;
        if (nextIndex >= visible.length) nextIndex = 0;
      }
    }

    const target = visible[nextIndex];
    if (target) {
      location.hash = target.dataset.scene ?? '';
    }
  }

  private findNextGroupStart(
    visible: HTMLAnchorElement[],
    currentIndex: number,
    direction: number,
  ): number {
    if (visible.length === 0) return 0;
    if (currentIndex === -1) return 0;

    const currentGroup = visible[currentIndex]?.closest('.nav-group');

    if (direction === 1) {
      // Find first link in the next group
      for (let i = currentIndex + 1; i < visible.length; i++) {
        if (visible[i].closest('.nav-group') !== currentGroup) return i;
      }
      return 0; // wrap to beginning
    } else {
      // Find first link in the previous group
      // First, step back to find a different group
      let prevGroupLink = -1;
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (visible[i].closest('.nav-group') !== currentGroup) {
          prevGroupLink = i;
          break;
        }
      }
      if (prevGroupLink === -1) {
        // Wrap to last group
        const lastGroup = visible[visible.length - 1]?.closest('.nav-group');
        for (let i = 0; i < visible.length; i++) {
          if (visible[i].closest('.nav-group') === lastGroup && (i === 0 || visible[i - 1].closest('.nav-group') !== lastGroup)) {
            return i;
          }
        }
        return visible.length - 1;
      }
      // Find the start of that group
      const targetGroup = visible[prevGroupLink].closest('.nav-group');
      for (let i = 0; i <= prevGroupLink; i++) {
        if (visible[i].closest('.nav-group') === targetGroup) return i;
      }
      return prevGroupLink;
    }
  }

  /* ── Hamburger / overlay toggle ── */

  private setupHamburger(): void {
    this.hamburger = document.getElementById('hamburger');
    this.backdrop = document.getElementById('sidebar-backdrop');
    this.sidebar = document.getElementById('sidebar');

    if (!this.hamburger) return;

    this.hamburger.addEventListener('click', () => this.toggleOverlay());
    this.backdrop?.addEventListener('click', () => this.closeOverlay());

    // Close overlay when a scene is selected
    this.nav.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'A' && this.isOverlayOpen) {
        this.closeOverlay();
      }
    });
  }

  private toggleOverlay(): void {
    this.isOverlayOpen ? this.closeOverlay() : this.openOverlay();
  }

  private openOverlay(): void {
    this.isOverlayOpen = true;
    this.sidebar?.classList.add('open');
    this.hamburger?.classList.add('open');
    this.backdrop?.classList.add('visible');
  }

  private closeOverlay(): void {
    this.isOverlayOpen = false;
    this.sidebar?.classList.remove('open');
    this.hamburger?.classList.remove('open');
    this.backdrop?.classList.remove('visible');
  }
}

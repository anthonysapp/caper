import type { KitchenSinkApplication } from '@/KitchenSinkApplication';

/**
 * Scene reel — horizontal bottom-drawer scene picker for the kitchen-sink
 * demo. Owns the DOM nav (a horizontal strip of scene cards grouped by
 * inline dividers), active-state tracking, hash-based scene selection,
 * fuzzy filtering, keyboard navigation, and the collapse/expand toggle.
 *
 * Class name stays `Sidebar` for import-stability; the behavior is a
 * horizontal reel, not a vertical sidebar.
 */
export class Sidebar {
  private app: KitchenSinkApplication;
  private nav: HTMLElement;
  private scroll: HTMLElement | null = null;
  private allCards: HTMLAnchorElement[] = [];
  private searchInput: HTMLInputElement | null = null;
  private searchCount: HTMLElement | null = null;
  private searchBar: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private isOpen = false;

  constructor(app: KitchenSinkApplication) {
    this.app = app;

    const reel = document.getElementById('reel');
    const nav = reel?.querySelector<HTMLElement>('nav.reel-nav');
    if (!nav) {
      throw new Error('[Sidebar] nav.reel-nav not found in #reel — check index.html');
    }
    this.nav = nav;
    this.scroll = reel?.querySelector<HTMLElement>('.reel-scroll') ?? null;
  }

  mount(): void {
    this.populateNav();
    this.bindEvents();
    this.syncActiveFromHash();
    this.scrollActiveIntoView();
    this.populateVersionMeta();
    this.setupSearch();
    this.setupKeyboardNav();
    this.setupToggle();
  }

  /* ── Nav population ── */

  private populateNav(): void {
    const groups = this.app.scenes.debugGroupsList;

    groups.forEach((group: HTMLOptGroupElement) => {
      const groupEl = document.createElement('div');
      groupEl.classList.add('reel-group');
      groupEl.dataset.group = group.label;

      const label = document.createElement('div');
      label.classList.add('reel-group-label');
      label.textContent = group.label;
      groupEl.appendChild(label);

      const cardsRow = document.createElement('div');
      cardsRow.classList.add('reel-group-cards');

      Array.from(group.children as any).forEach((child: any) => {
        const card = this.createCard(group.label, child);
        cardsRow.appendChild(card);
        this.allCards.push(card);
      });

      groupEl.appendChild(cardsRow);
      this.nav.appendChild(groupEl);
    });
  }

  private createCard(groupLabel: string, sceneOpt: HTMLOptionElement): HTMLAnchorElement {
    const card = document.createElement('a');
    card.classList.add('scene-card');
    card.href = `#${sceneOpt.value}`;
    card.dataset.scene = sceneOpt.value;
    card.dataset.group = groupLabel;

    const thumb = document.createElement('div');
    thumb.classList.add('scene-card-thumb');

    // Placeholder: first letter of scene name over grid
    const sceneName = sceneOpt.textContent ?? sceneOpt.value;
    const initial = document.createElement('span');
    initial.classList.add('scene-card-thumb-initial');
    initial.textContent = sceneName.charAt(0).toUpperCase();
    thumb.appendChild(initial);
    card.appendChild(thumb);

    const label = document.createElement('div');
    label.classList.add('scene-card-label');
    label.textContent = sceneName;
    card.appendChild(label);

    return card;
  }

  /* ── Events ── */

  private bindEvents(): void {
    this.app.signal.onSceneChangeComplete.connect(() => {
      this.nav.classList.remove('disabled');
    });

    window.addEventListener('hashchange', () => {
      this.syncActiveFromHash();
      this.scrollActiveIntoView();
    });
  }

  private syncActiveFromHash(): void {
    const scene = this.app.scenes.getSceneFromHash();
    const defaultScene = this.app.scenes.defaultScene;
    const target = scene ?? defaultScene;

    const current = this.nav.querySelector('.active');
    if (current) current.classList.remove('active');

    const card = this.nav.querySelector(`a[href="#${target}"]`);
    if (card) card.classList.add('active');
  }

  private scrollActiveIntoView(): void {
    if (!this.scroll) return;
    const active = this.nav.querySelector<HTMLElement>('.scene-card.active');
    if (!active) return;
    active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
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
    const groupEls = this.nav.querySelectorAll<HTMLElement>('.reel-group');

    groupEls.forEach((groupEl) => {
      const cards = groupEl.querySelectorAll<HTMLAnchorElement>('.scene-card');
      let groupVisible = 0;

      cards.forEach((card) => {
        const text = (card.textContent ?? '').toLowerCase();
        const matches = isEmpty || text.includes(query);
        card.style.display = matches ? '' : 'none';
        if (matches) groupVisible++;
      });

      groupEl.style.display = groupVisible > 0 || isEmpty ? '' : 'none';
      visibleCount += groupVisible;
    });

    if (this.searchCount) {
      this.searchCount.textContent = isEmpty ? '' : `${visibleCount} / ${this.allCards.length}`;
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

    if (e.key === '/' && !isInputFocused) {
      e.preventDefault();
      if (!this.isOpen) this.openReel();
      this.searchInput?.focus();
      return;
    }

    if (e.key === 'Escape' && isInputFocused) {
      e.preventDefault();
      this.clearFilter();
      return;
    }

    if (isInputFocused) return;

    if (e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      const direction = e.key === 'j' ? 1 : -1;
      this.navigateScenes(direction, false);
      return;
    }

    if (e.key === 'J' || e.key === 'K') {
      e.preventDefault();
      const direction = e.key === 'J' ? 1 : -1;
      this.navigateScenes(direction, true);
      return;
    }
  }

  private getVisibleCards(): HTMLAnchorElement[] {
    return this.allCards.filter((c) => c.style.display !== 'none');
  }

  private navigateScenes(direction: number, jumpGroup: boolean): void {
    const visible = this.getVisibleCards();
    if (visible.length === 0) return;

    const activeCard = this.nav.querySelector('.scene-card.active') as HTMLAnchorElement | null;
    const currentIndex = activeCard ? visible.indexOf(activeCard) : -1;

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

    const currentGroup = visible[currentIndex]?.dataset.group;

    if (direction === 1) {
      for (let i = currentIndex + 1; i < visible.length; i++) {
        if (visible[i].dataset.group !== currentGroup) return i;
      }
      return 0;
    } else {
      let prevGroupCard = -1;
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (visible[i].dataset.group !== currentGroup) {
          prevGroupCard = i;
          break;
        }
      }
      if (prevGroupCard === -1) {
        const lastGroup = visible[visible.length - 1]?.dataset.group;
        for (let i = 0; i < visible.length; i++) {
          if (visible[i].dataset.group === lastGroup && (i === 0 || visible[i - 1].dataset.group !== lastGroup)) {
            return i;
          }
        }
        return visible.length - 1;
      }
      const targetGroup = visible[prevGroupCard].dataset.group;
      for (let i = 0; i <= prevGroupCard; i++) {
        if (visible[i].dataset.group === targetGroup) return i;
      }
      return prevGroupCard;
    }
  }

  /* ── Reel toggle ── */

  private setupToggle(): void {
    this.toggleBtn = document.getElementById('reel-toggle');
    if (!this.toggleBtn) return;

    this.toggleBtn.addEventListener('click', () => this.toggleReel());

    // Close reel when a card is clicked (optional — improves canvas visibility after pick)
    this.nav.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.scene-card');
      if (target) {
        // Keep the reel open after selection; user can close manually.
      }
    });
  }

  private toggleReel(): void {
    if (this.isOpen) this.closeReel();
    else this.openReel();
  }

  private openReel(): void {
    this.isOpen = true;
    document.body.classList.add('reel-open');
    this.scrollActiveIntoView();
  }

  private closeReel(): void {
    this.isOpen = false;
    document.body.classList.remove('reel-open');
  }
}

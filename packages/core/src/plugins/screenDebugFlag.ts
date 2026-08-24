const queryKey = 'caper-screen-debug';
const storageKey = 'caper:screen-debug';

export function shouldEnableScreenDebug(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const value = new URLSearchParams(window.location.search).get(queryKey);
  const enabledByQuery = value === '1' || value === 'true';
  const disabledByQuery = value === '0' || value === 'false';

  try {
    if (enabledByQuery) {
      window.localStorage.setItem(storageKey, '1');
      return true;
    }
    if (disabledByQuery) {
      window.localStorage.removeItem(storageKey);
      return false;
    }
    return window.localStorage.getItem(storageKey) === '1';
  } catch {
    return enabledByQuery;
  }
}

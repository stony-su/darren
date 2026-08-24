/**
 * Tiny coordination bus for the bottom-right side panels (Playground, Modes).
 *
 * They occupy the same slot on screen, so opening one has to close the other.
 * A window event keeps that from turning into the panels holding references to
 * each other — each just announces itself and closes on anyone else's shout.
 *
 * The open/closed state also drives a `panel-open` class on <html>, which the
 * stylesheet uses to slide both toggle buttons out from under the sheet. The
 * set (rather than a boolean) is what makes a hand-off safe: swapping panels
 * fires the new panel's open before the old one's close, and a boolean would
 * end up cleared.
 */

const EVENT = 'pg:panel-open';

const openPanels = new Set<string>();

/** Record `id`'s open state; opening also tells every other panel to close. */
export function setPanelOpen(id: string, open: boolean): void {
  if (open) {
    openPanels.add(id);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
  } else {
    openPanels.delete(id);
  }
  document.documentElement.classList.toggle('panel-open', openPanels.size > 0);
}

/** Run `close` whenever a panel other than `id` opens. */
export function onPanelOpened(id: string, close: () => void, signal: AbortSignal): void {
  window.addEventListener(
    EVENT,
    (e) => {
      if ((e as CustomEvent<string>).detail !== id) close();
    },
    { signal }
  );
}

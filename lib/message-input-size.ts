/** Border-box sizing; reserve history space even with a short visual viewport. */
export function messageInputSize(contentHeight: number, minimum: number, viewportHeight: number, desktop: boolean, paneHeight?: number, composerChrome = 0) {
  const responsiveLimit = desktop ? 280 : viewportHeight * 0.38;
  const availableLimit = paneHeight === undefined ? responsiveLimit : paneHeight - composerChrome - Math.min(96, paneHeight * 0.35);
  const maximum = Math.max(minimum, Math.min(responsiveLimit, availableLimit));
  const height = Math.max(minimum, Math.min(contentHeight, maximum));
  return { height, overflow: contentHeight > height + 1 ? 'auto' as const : 'hidden' as const };
}

/**
 * A plain, dark phone to stand real app footage in. The screen is whatever the
 * recipe puts in `.screen`; the phone itself is hardware only, no invented UI.
 */
export const PHONE_CSS = `
  .phone {
    position: absolute;
    box-sizing: border-box;
    border-radius: calc(var(--r) + var(--bezel));
    padding: var(--bezel);
    background:
      linear-gradient(158deg, #77777f 0%, #2d2d32 11%, #131316 46%, #1d1d21 76%, #5e5e67 100%);
    box-shadow:
      inset 0 0 0 1.5px rgba(255, 255, 255, 0.16),
      inset 0 0 0 4px rgba(0, 0, 0, 0.8),
      0 60px 120px rgba(0, 0, 0, 0.7),
      0 18px 48px rgba(0, 0, 0, 0.55);
  }
  .phone::before, .phone::after {
    content: '';
    position: absolute;
    width: 3px;
    border-radius: 2px;
    background: linear-gradient(180deg, #6d6d76, #2c2c31);
  }
  .phone::before { right: -3px; top: 21%; height: 9%; }
  .phone::after { left: -3px; top: 17%; height: 13%; }
  .screen {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: var(--r);
    background: #000;
  }
`;

/** Lays a phone out so its screen is exactly `width` x `height` CSS pixels. */
export function phoneStyle({ width, height, x, y, bezel = 11, radius = 44, extra = '' }) {
  const outerW = width + bezel * 2;
  const outerH = height + bezel * 2;
  return (
    `--bezel:${bezel}px;--r:${radius}px;width:${outerW}px;height:${outerH}px;` +
    `left:${x - outerW / 2}px;top:${y - outerH / 2}px;${extra}`
  );
}

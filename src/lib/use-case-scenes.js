/* The four use-case panels on the home page: what each frame is made of.
 *
 * One source for two readers: TextImgLink.astro draws the static frame from
 * it (the field, the mass, and in 01 the satellite: the design system's key
 * visual, which is all that shows without JavaScript), and
 * src/scripts/use-case-anims.js animates the same frame on a canvas.
 *
 * Coordinates are in a 1440 × 804 frame, the panels' own ratio. Each mass is
 * cropped by the frame and sits where the system allows one: Gravity's
 * corner (bottom-right), the horizon (the bottom edge), or the inverted
 * frame's top-left, used once in the sequence. `pause` is the corner the
 * stop button takes, chosen so it always sits on one surface. */
export const FRAME = { w: 1440, h: 804 };

export const SCENES = {
  /* 01 · One tool instead of dozens of scripts. A · Corner fall. */
  consolidate: {
    field: 'mint',
    mass: { color: 'ink', x: 1500, y: 1010, r: 760 },
    sat: { x: 470, y: 230, r: 50 },
    pause: { corner: 'top', surface: 'mint' },
  },
  /* 02 · Connect every system. The bus as a horizon, on D · Quiet's colours. */
  connect: {
    field: 'mist',
    mass: { color: 'mint', x: 720, y: 1560, r: 1150 },
    pause: { corner: 'top', surface: 'white' },
  },
  /* 03 · Partners and suppliers in hours, not months. Gravity's corner, on white. */
  partners: {
    field: 'white',
    mass: { color: 'ink', x: 1500, y: 1150, r: 1000 },
    pause: { corner: 'bottom', surface: 'ink' },
  },
  /* 04 · Full visibility and control. C · Inverted, the one per sequence. */
  control: {
    field: 'ink',
    mass: { color: 'mint', x: -210, y: -300, r: 760 },
    pause: { corner: 'bottom', surface: 'ink' },
  },
};

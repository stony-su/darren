export interface CaseStudy {
  built: string;
  challenge: string;
  outcome: string;
}

/** One screen of a project, carried out on a shard when its card's image shatters. */
export interface ProjectPage {
  /** Viewport-only capture (no browser chrome), ~16:10. */
  src: string;
  label: string;
}

export interface ProjectFact {
  value: string;
  label: string;
}

export interface ProjectCredit {
  label: string;
  href?: string;
}

/** What a stage control does when pressed. */
export type StageAction =
  /** Handed to the running build through the bridge. */
  | { cmd: string; arg?: string | number }
  /** Replace the frame with this address. */
  | { load: string };

export interface StageControl {
  label: string;
  /** Controls sharing a group behave like radio buttons. */
  group?: string;
  /** Lit when the stage opens. */
  active?: boolean;
  action: StageAction;
}

interface StageBase {
  /** The card's main button. Defaults to a word that suits the kind of stage. */
  cta?: string;
  /** One line on how to play, shown under the stage. */
  hint: string;
  /** Touch devices either get the real thing or the film and a desktop note. */
  touch: 'play' | 'film';
  controls?: StageControl[];
}

export interface StageVariant {
  label: string;
  /** Stills played as a short flipbook. */
  frames: string[];
}

export type StageDef =
  /** A self-hosted build under /play. `exit` is how Esc leaves it: games keep a
   *  tap for their own pause menu and leave on a hold. */
  | (StageBase & { kind: 'build'; src: string; exit: 'tap' | 'hold' })
  /** Somebody's live site in a sandboxed frame. */
  | (StageBase & { kind: 'remote'; src: string })
  /** Real app screens in a phone, each one scrollable. */
  | (StageBase & { kind: 'phone'; screens: { src: string; label: string }[] })
  /** A film with sound controls, optionally beside flipbooks to pick from. */
  | (StageBase & {
      kind: 'film';
      src: string;
      poster: string;
      portrait?: boolean;
      variants?: StageVariant[];
    });

export interface Project {
  title: string;
  description: string;
  /** A still, for a card with no film yet. */
  image?: string;
  /** A short silent 3:2 loop. The poster is its first frame. */
  film?: { src: string; poster: string };
  tags: string[];
  facts?: ProjectFact[];
  credits?: ProjectCredit[];
  liveUrl?: string;
  /** What the live link is called. Defaults to "Visit site". */
  liveLabel?: string;
  /** Leave unset for private repos: the link would 404 for visitors. */
  repoUrl?: string;
  theme: number; // index into THEMES
  caseStudy?: CaseStudy;
  /** Screens shown on the shards of the hover shatter. Falls back to the
   *  accent-tinted wireframes in placeholderPages.ts when absent. */
  pages?: ProjectPage[];
  /** The real thing, opened full-screen from the card. */
  play?: StageDef;
}

/** Where a project's film, poster and glass screens live. */
function showcase(slug: string, screens: string[]): Pick<Project, 'film' | 'pages'> {
  return {
    film: { src: `/showcase/${slug}/loop.mp4`, poster: `/showcase/${slug}/poster.webp` },
    pages: screens.map((label, i) => ({ src: `/showcase/${slug}/page-${i + 1}.webp`, label })),
  };
}

const flipbook = (loadout: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `/showcase/rico-rite/${loadout}-${i + 1}.webp`);

export const PROJECTS: Project[] = [
  {
    title: 'Rico Rite',
    description:
      'A Breakout roguelike on Steam. Your heroes are the balls, the bricks are a swarm coming down at you, and a clean run climbs a combo ladder until everything is moving too fast.',
    ...showcase('rico-rite', ['Title', 'Pinball Lobber', 'Tesla', 'Twin Cast', 'Hive', 'The Prism Core']),
    tags: ['LÖVE', 'Lua', 'Steam'],
    facts: [
      { value: '11', label: 'paddle loadouts' },
      { value: 'D–FRENZY', label: 'combo ranks' },
      { value: '1.75×', label: 'speed at the top' },
    ],
    credits: [{ label: 'Built on SNKRX by a327ex', href: 'https://github.com/a327ex/SNKRX' }],
    liveUrl: 'https://store.steampowered.com/app/3618810/Rico_Rite/',
    liveLabel: 'Steam',
    repoUrl: 'https://github.com/stony-su/rouge1.1',
    theme: 5,
    play: {
      kind: 'film',
      src: '/showcase/rico-rite/trailer.mp4',
      poster: '/showcase/rico-rite/trailer.webp',
      hint: 'Watch the trailer, or pick a paddle to see how it changes the run',
      touch: 'play',
      variants: [
        { label: 'Standard', frames: flipbook('standard', 8) },
        { label: 'Pinball Lobber', frames: flipbook('pinball', 8) },
        { label: 'Aegis', frames: flipbook('aegis', 8) },
        { label: 'Mitosis', frames: flipbook('mitosis', 8) },
        { label: 'Hive', frames: flipbook('hive', 8) },
        { label: 'Vampire', frames: flipbook('vampire', 8) },
        { label: 'Boomerang', frames: flipbook('boomerang', 8) },
        { label: 'Twin Cast', frames: flipbook('twincast', 8) },
        { label: 'Tesla', frames: flipbook('tesla', 8) },
        { label: 'Cannon', frames: flipbook('cannon', 8) },
      ],
    },
  },
  {
    title: 'Ink',
    description:
      'Ink spreading through water, simulated live on your GPU. Drop it, stir it, then switch from glowing ink on dark water to pigment on paper.',
    ...showcase('ink', ['Paper', 'Sumi', 'Water', 'Rain', 'Stirred', 'Bloom']),
    tags: ['WebGL2', 'GLSL', 'JavaScript'],
    facts: [
      { value: '1024px', label: 'ink grid' },
      { value: '2', label: 'ways to see it' },
      { value: '0', label: 'dependencies' },
    ],
    liveUrl: 'https://stony-su.github.io/ink/',
    repoUrl: 'https://github.com/stony-su/ink',
    theme: 6,
    play: {
      kind: 'build',
      src: '/play/ink/index.html',
      exit: 'tap',
      cta: 'Try it',
      hint: 'Click to drop ink, drag to stir',
      touch: 'play',
      controls: [
        { label: 'Water', action: { cmd: 'mode', arg: 0 } },
        { label: 'Paper', action: { cmd: 'mode', arg: 1 } },
        { label: 'Rain', action: { cmd: 'rain' } },
        { label: 'Clear', action: { cmd: 'clear' } },
      ],
    },
  },
  {
    title: 'ReSound',
    description:
      'A co-op action roguelike for one to three players where nothing you hit stays down. Reflect shots, ricochet arrows and launch enemies into walls, because anything sent back hits harder.',
    ...showcase('resound', ['Title', 'Classes', 'Swordsman', 'Archer', 'Brawler', 'The Carillon']),
    tags: ['TypeScript', 'PixiJS', 'Web Audio', 'WebSockets'],
    facts: [
      { value: '12', label: 'generated rooms' },
      { value: '42', label: 'upgrades' },
      { value: '0', label: 'image or audio files' },
    ],
    credits: [{ label: 'With contributions from UserNoName0000' }],
    liveUrl: 'https://stony-su.itch.io/resound',
    liveLabel: 'itch.io',
    repoUrl: 'https://github.com/stony-su/rougelike',
    theme: 7,
    play: {
      kind: 'build',
      src: '/play/resound/index.html?team=sword,bow,fist&autopilot=expert&stop=6&seed=7',
      exit: 'hold',
      hint: 'Take over to play: WASD to move, mouse to aim, click to attack, Space to dash',
      touch: 'film',
      controls: [
        {
          label: 'Watch the bots',
          group: 'who',
          active: true,
          action: { load: '/play/resound/index.html?team=sword,bow,fist&autopilot=expert&stop=6&seed=7' },
        },
        // No autopilot: the first seat is yours and bots keep the other two.
        { label: 'Take over', group: 'who', action: { load: '/play/resound/index.html?team=sword,bow,fist&stop=6&seed=7' } },
      ],
    },
  },
  {
    title: 'Fragment Ecology',
    description:
      'Six living algorithms, from slime mould to ray-marched fractals. Each one grows from a single seed, runs in real time and reacts to your hand.',
    ...showcase('fragment-ecology', ['Aurora', 'Curl', 'Reagent', 'Attractor', 'Physarum', 'Fold']),
    tags: ['WebGL2', 'GLSL', 'Canvas 2D'],
    facts: [
      { value: '6', label: 'generative systems' },
      { value: '250k', label: 'orbits in Attractor' },
      { value: '0', label: 'libraries' },
    ],
    liveUrl: 'https://stony-su.github.io/glsl/',
    repoUrl: 'https://github.com/stony-su/glsl',
    theme: 8,
    play: {
      kind: 'build',
      src: '/play/fragment-ecology/index.html',
      exit: 'tap',
      cta: 'Try it',
      hint: 'Move and press on the piece to disturb it',
      touch: 'play',
      controls: [
        { label: 'Physarum', group: 'piece', active: true, action: { cmd: 'piece', arg: 'physarum' } },
        { label: 'Reagent', group: 'piece', action: { cmd: 'piece', arg: 'reagent' } },
        { label: 'Attractor', group: 'piece', action: { cmd: 'piece', arg: 'attractor' } },
        { label: 'Fold', group: 'piece', action: { cmd: 'piece', arg: 'fold' } },
        { label: 'Aurora', group: 'piece', action: { cmd: 'piece', arg: 'aurora' } },
        { label: 'Curl', group: 'piece', action: { cmd: 'piece', arg: 'curl' } },
        { label: 'New seed', action: { cmd: 'seed' } },
      ],
    },
  },
  {
    title: 'cGEM',
    description:
      "The website for Canada's national high school biotech case competition, opened by a field of particles that folds from a DNA helix into a plasmid map and then a maple leaf.",
    ...showcase('cgem', ['Helix', 'Plasmid', 'Maple leaf', 'Format', 'Case domains', 'Rules']),
    tags: ['HTML', 'CSS', 'JavaScript', 'Canvas 2D'],
    facts: [
      { value: '980', label: 'particles at most' },
      { value: '3', label: 'shapes in one loop' },
      { value: '0', label: 'dependencies' },
    ],
    liveUrl: 'https://cgem.vercel.app/',
    theme: 9,
    play: {
      kind: 'build',
      src: '/play/cgem/index.html',
      exit: 'tap',
      hint: 'Drag across the particles to fold them from one shape to the next',
      touch: 'play',
      cta: 'Try it',
      controls: [
        { label: 'Helix', action: { cmd: 'shape', arg: 0 } },
        { label: 'Plasmid', action: { cmd: 'shape', arg: 1 } },
        { label: 'Maple leaf', action: { cmd: 'shape', arg: 2 } },
      ],
    },
  },
  {
    title: 'APEIRON',
    description:
      'A precision platformer about geometry. You start as a triangle, take a vertex from every boss and end as a circle, and each world turns one algorithmic-art technique into its level design.',
    ...showcase('apeiron', ['The Lattice', 'Voronoi Caverns', 'The Currents', 'Fractal Gardens', 'Harmonic Spire', 'The Recursion']),
    tags: ['JavaScript', 'Canvas 2D', 'WebGL', 'Web Audio'],
    facts: [
      { value: '24', label: 'levels' },
      { value: '5', label: 'bosses' },
      { value: '0', label: 'image files' },
    ],
    liveUrl: 'https://stony-su.github.io/plat/',
    repoUrl: 'https://github.com/stony-su/plat',
    theme: 10,
    play: {
      kind: 'build',
      src: '/play/apeiron/index.html#level=w1-1&form=3',
      exit: 'hold',
      hint: 'Arrows or WASD to move, Space to jump, X to dash, C to orbit. Hold Esc to leave',
      touch: 'film',
      controls: [
        { label: 'Triangle', group: 'form', active: true, action: { load: '/play/apeiron/index.html#level=w1-1&form=3' } },
        { label: 'Square', group: 'form', action: { load: '/play/apeiron/index.html#level=w2-1&form=4' } },
        { label: 'Pentagon', group: 'form', action: { load: '/play/apeiron/index.html#level=w3-1&form=5' } },
        { label: 'Hexagon', group: 'form', action: { load: '/play/apeiron/index.html#level=w4-1&form=6' } },
        { label: 'Circle', group: 'form', action: { load: '/play/apeiron/index.html#level=w5-1&form=99' } },
      ],
    },
  },
  {
    title: 'Gospel',
    description:
      'An offline Android meal planner. Twelve questions size a repeating schedule to your body, any meal can be swapped, and the grocery list knows what is already in your cupboard.',
    ...showcase('gospel', ['Recipe', 'Swap a meal', 'Nutrition', 'Grocery', 'Pantry', 'References']),
    tags: ['React Native', 'Expo', 'TypeScript'],
    facts: [
      { value: '500', label: 'recipes' },
      { value: '48', label: 'nutrient targets' },
      { value: '0', label: 'network calls' },
    ],
    credits: [
      {
        label: 'Tamagoyaki photo by 極地狐 (cropped), CC BY 2.0',
        href: 'https://commons.wikimedia.org/wiki/File:%E9%B3%A5%E7%84%BC%E3%81%8D%E5%B1%85%E9%85%92%E5%B1%8B_%2839394233682%29.jpg',
      },
    ],
    liveUrl: 'https://stony-su.github.io/gospel/',
    liveLabel: 'Get the app',
    repoUrl: 'https://github.com/stony-su/gospel',
    theme: 14,
    play: {
      kind: 'phone',
      cta: 'Open app',
      hint: 'Scroll inside the phone, and pick a screen above it',
      touch: 'play',
      screens: ['Recipe', 'Nutrition', 'Protein', 'Grocery', 'Pantry', 'References'].map((label, i) => ({
        src: `/showcase/gospel/screen-${i + 1}.webp`,
        label,
      })),
    },
  },
  {
    title: 'Lost Bottle',
    description:
      'An anonymous sea of messages from strangers. Hold to cast a line, read what someone let go of, then keep it, answer it or throw one of your own back.',
    ...showcase('lost-bottle', ['The sea', 'A letter', 'Currents', 'The table', 'Sealed', 'Passport']),
    tags: ['React', 'Firebase', 'Canvas 2D'],
    facts: [
      { value: '5', label: 'casts a day' },
      { value: '1,600', label: 'particles in the sea' },
      { value: '0', label: 'names attached' },
    ],
    liveUrl: 'https://lostbottlev2.vercel.app/',
    theme: 11,
    play: {
      kind: 'build',
      src: '/play/lost-bottle/index.html',
      exit: 'tap',
      cta: 'Cast a line',
      hint: 'Press and hold the water, then let go. This is a demo sea of sample bottles',
      touch: 'play',
    },
  },
  {
    title: 'cosu',
    description:
      'A rhythm game that is also a pen plotter. One seed composes the song, writes the map and picks the pens, and your timing decides how clean the finished drawing comes out.',
    ...showcase('cosu', ['Seeds', 'Plotter', 'Peak', 'Figures', 'Moiré', 'Finished plot']),
    tags: ['JavaScript', 'WebGL', 'Web Audio'],
    facts: [
      { value: '1', label: 'seed for everything' },
      { value: '0', label: 'audio files' },
      { value: '∞', label: 'songs' },
    ],
    repoUrl: 'https://github.com/stony-su/cosu',
    theme: 12,
    play: {
      kind: 'build',
      src: '/play/cosu/index.html',
      exit: 'hold',
      hint: 'Left and Right change the seed, Enter starts, Z and X hit. Hold Esc to leave',
      touch: 'film',
      controls: [{ label: 'New seed', action: { cmd: 'seed' } }],
    },
  },
  {
    title: 'KEEP',
    description:
      'A pixel-art platformer with one strange tool: a Pocket that drinks your speed and pours it back wherever you aim, so a long fall becomes the way up.',
    ...showcase('keep', ['The Threshold', 'The Reliquary', 'The Deep Well', 'The Thorn Choir', 'The Gallery', 'The Keep']),
    tags: ['Godot 4', 'GDScript', 'Pixel art'],
    facts: [
      { value: '8', label: 'rooms' },
      { value: '1', label: 'button to learn' },
      { value: '480×270', label: 'native pixels' },
    ],
    theme: 13,
    play: {
      kind: 'build',
      src: '/play/keep/index.html',
      exit: 'hold',
      hint: 'Arrows to move, Z to jump, hold X to drink and aim, release to pour. Hold Esc to leave',
      touch: 'film',
    },
  },
  {
    title: 'Vertex',
    description:
      'A centralized platform for high school students to find, apply to, and track volunteer opportunities',
    ...showcase('vertex', ['Landing', 'Features', 'Philosophy', 'Get started', 'Browse roles', 'Sign up']),
    tags: ['Next.js', 'Three.js', 'Tailwind CSS', 'Supabase'],
    liveUrl: 'https://fblc-26.vercel.app/',
    repoUrl: 'https://github.com/B-Eddie/fblc-26',
    theme: 0,
    play: {
      kind: 'remote',
      src: 'https://fblc-26.vercel.app/',
      hint: 'The live site. Scroll and click around',
      touch: 'play',
    },
    caseStudy: {
      // TODO(darren): edit this placeholder copy
      built:
        'A full-stack volunteer platform with opportunity search, one-click applications, and an hours tracker, built on Next.js with Supabase auth and database.',
      // TODO(darren): edit this placeholder copy
      challenge:
        'Modeling the many-to-many relationship between students, organizations, and opportunities while keeping row-level security rules airtight in Supabase.',
      // TODO(darren): edit this placeholder copy
      outcome:
        'Built for the FBLA 2026 season — a working prototype that lets students discover and track volunteer work in one place instead of spreadsheets.',
    },
  },
  {
    title: 'ShadBus',
    description:
      'Maps Routes - A proof of concept app for Calgary’s mobile grocery bus business.',
    ...showcase('shadbus', ['City network', 'Downtown', 'Culture filter', 'Bus details', 'Winter Mode', 'Community hub']),
    tags: ['React', 'Tailwind CSS', 'Firebase', 'Google Translate API'],
    liveUrl: 'https://shadbusv2.vercel.app/',
    repoUrl: 'https://github.com/stony-su/shadbusv2',
    theme: 3,
    play: {
      kind: 'remote',
      src: 'https://shadbusv2.vercel.app/',
      hint: 'The live site. Pan the map and filter the routes',
      touch: 'play',
    },
    caseStudy: {
      // TODO(darren): edit this placeholder copy
      built:
        'A route-map web app for a mobile grocery bus: live stop schedules, route visualization, and multi-language support via the Google Translate API.',
      // TODO(darren): edit this placeholder copy
      challenge:
        'Serving riders across several languages and keeping route data easy for a non-technical operator to update in Firebase.',
      // TODO(darren): edit this placeholder copy
      outcome:
        'A proof of concept the business could put in front of riders — schedules and stops readable in their own language.',
    },
  },
  {
    title: 'Onyx',
    description:
      'An indie platformer made at a Shanghai game jam for high school students. Built with Unity',
    ...showcase('onyx', ['The Dungeon', 'Spikes', 'The Gargoyle', 'The Leap', 'Dash', 'The Updraft']),
    tags: ['Unity', 'C#'],
    liveUrl: 'https://stony-su.itch.io/onyx',
    liveLabel: 'Play on itch.io',
    repoUrl: 'https://github.com/stony-su/onyx',
    theme: 1,
    caseStudy: {
      // TODO(darren): edit this placeholder copy
      built:
        'A 2D platformer with custom movement physics, level design, and art, made under game-jam time pressure with a small team.',
      // TODO(darren): edit this placeholder copy
      challenge:
        'Tuning jump arcs and coyote time so the controls felt fair while shipping a complete, playable game inside the jam deadline.',
      // TODO(darren): edit this placeholder copy
      outcome:
        'A finished, published game on itch.io — and a crash course in scoping a project to the time you actually have.',
    },
  },
  {
    title: 'Barcode Food Expiry App',
    description: 'An app that scans barcodes and shows food expiry dates',
    ...showcase('barcode-food-expiry-app', ['Pantry', 'Receipt scan', 'Ingredients', 'Generate recipes', 'Expiry calendar', 'Settings']),
    tags: ['Node.js', 'Expo CLI', 'OpenAI', 'Phone Camera'],
    repoUrl: 'https://github.com/B-Eddie/barcodescan',
    theme: 2,
    play: {
      kind: 'film',
      src: '/showcase/barcode-food-expiry-app/demo.mp4',
      poster: '/showcase/barcode-food-expiry-app/demo.webp',
      portrait: true,
      hint: 'The whole demo: scan a receipt, fill the pantry, get recipes, check the expiry calendar',
      touch: 'play',
    },
    caseStudy: {
      // TODO(darren): edit this placeholder copy
      built:
        'A React Native app that scans product barcodes with the phone camera, looks up the item, and estimates expiry dates with help from the OpenAI API.',
      // TODO(darren): edit this placeholder copy
      challenge:
        'Handling barcodes with no database match — falling back to AI-assisted product identification without making the scan flow feel slow.',
      // TODO(darren): edit this placeholder copy
      outcome:
        'A working demo that turns a pantry into a searchable list with expiry warnings, reducing forgotten-food waste.',
    },
  },
  {
    title: 'My Old Personal Website',
    description: "See how far I've come! I made this when I was in grade 9",
    ...showcase('my-old-personal-website', ['Home', 'About', 'Experience', 'Specializations', 'Skills', 'Projects']),
    tags: ['HTML', 'CSS', 'PHP', 'JS'],
    liveUrl: 'https://stony-su.github.io/personal-website/',
    repoUrl: 'https://github.com/stony-su/personal-website/tree/main',
    theme: 4,
    play: {
      kind: 'remote',
      src: 'https://stony-su.github.io/personal-website/',
      hint: 'The original, still online. Scroll around',
      touch: 'play',
    },
    caseStudy: {
      // TODO(darren): edit this placeholder copy
      built:
        'My first website, hand-written in plain HTML, CSS, and JS with a bit of PHP — no frameworks, no build tools.',
      // TODO(darren): edit this placeholder copy
      challenge:
        'Everything was new: layout, hosting, making pages talk to each other. Every feature was a first.',
      // TODO(darren): edit this placeholder copy
      outcome:
        'Kept online as a time capsule — the clearest before/after of how far the last few years of building have taken me.',
    },
  },
];

import './style.css';
import { ParticleScene } from './animation/scene';
import { IntroSequence, INTRO_RAIL_LABELS } from './components/IntroSequence';
import { ProjectSlideshow, SLUGS } from './components/ProjectSlideshow';
import { PlaygroundPanel } from './components/PlaygroundPanel';
import { ProgressRail } from './components/ProgressRail';
import { PROJECTS } from './data/projects';

function introSeen(): boolean {
  try {
    return sessionStorage.getItem('introSeen') === '1';
  } catch {
    return false;
  }
}

async function main() {
  const app = document.getElementById('app')!;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const particleScene = new ParticleScene(app);
  await particleScene.getReady();
  particleScene.start();

  if (reducedMotion) {
    // Calm the field: slow drift, no trails, no gusts worth noticing.
    particleScene.setSpeedMultiplier(0.15);
    particleScene.setTrailOverride(0);
  }

  /* One timeline for the whole journey: intro steps, then slides. */
  const INTRO_OFFSET = INTRO_RAIL_LABELS.length;
  const railLabels = [
    ...INTRO_RAIL_LABELS,
    'Work',
    ...PROJECTS.map((p) => p.title),
    'Contact',
  ];

  let mode: 'intro' | 'slides' = 'slides';
  let intro: IntroSequence | null = null;
  let slideshow: ProjectSlideshow | null = null;
  let playground: PlaygroundPanel | null = null;
  let pendingSlide = 0;

  const rail = new ProgressRail(railLabels, INTRO_OFFSET, (i) => {
    if (mode === 'intro' && intro) {
      if (i < INTRO_OFFSET) {
        intro.goToLine(i);
      } else {
        // A slide dot during the intro skips ahead to that slide
        pendingSlide = i - INTRO_OFFSET;
        intro.finish();
      }
    } else if (mode === 'slides') {
      if (i < INTRO_OFFSET) {
        // An intro dot from the slideshow replays the intro at that step
        teardownSlideshow();
        startIntro(i, true);
      } else {
        slideshow?.goTo(i - INTRO_OFFSET);
      }
    }
  });
  rail.mount(app);

  const showSlideshow = (initialIndex = 0): void => {
    mode = 'slides';
    slideshow = new ProjectSlideshow(app, particleScene, (i) =>
      rail.setActive(INTRO_OFFSET + i)
    );
    slideshow.show({ initialIndex });
    playground = new PlaygroundPanel(particleScene);
    playground.mount(app);
  };

  const teardownSlideshow = (): void => {
    slideshow?.destroy();
    slideshow = null;
    playground?.destroy();
    playground = null;
    history.replaceState(null, '', location.pathname + location.search);
  };

  const startIntro = (line = 0, immediate = false): void => {
    mode = 'intro';
    pendingSlide = 0;
    rail.setActive(line);
    intro = new IntroSequence(
      app,
      particleScene,
      () => {
        intro = null;
        // Jumping straight to a project slide: spread the center-clustered
        // field first, or it sits glowing behind the card for seconds. The
        // edge slides (Work / Contact) have no card, so skip the reseed there
        // and let the formation the intro was holding disperse on its own —
        // reseeding reads as every particle teleporting at once.
        const isEdgeSlide = pendingSlide === 0 || pendingSlide === SLUGS.length - 1;
        if (!isEdgeSlide) particleScene.seedSpread();
        showSlideshow(pendingSlide);
      },
      (i) => rail.setActive(i)
    );
    intro.start({ startLine: line, immediate });
  };

  // Deep link (#vertex etc.) skips the intro and opens at that slide
  const hashSlug = location.hash.replace(/^#/, '');
  const hashIndex = hashSlug ? SLUGS.indexOf(hashSlug) : -1;

  if (hashIndex >= 0) {
    particleScene.seedSpread();
    showSlideshow(hashIndex);
  } else if (reducedMotion || introSeen()) {
    particleScene.seedSpread();
    showSlideshow(0);
  } else {
    startIntro(0);
  }
}

main().catch(console.error);

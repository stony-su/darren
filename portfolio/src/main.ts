import './style.css';
import { ParticleScene } from './animation/scene';
import { IntroSequence } from './components/IntroSequence';
import { ProjectSlideshow, SLUGS } from './components/ProjectSlideshow';
import { PlaygroundPanel } from './components/PlaygroundPanel';

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

  const slideshow = new ProjectSlideshow(app, particleScene);

  const showSlideshow = (initialIndex = 0) => {
    slideshow.show({ initialIndex });
    const playground = new PlaygroundPanel(particleScene);
    playground.mount(app);
  };

  // Deep link (#vertex etc.) skips the intro and opens at that slide
  const hashSlug = location.hash.replace(/^#/, '');
  const hashIndex = hashSlug ? SLUGS.indexOf(hashSlug) : -1;

  if (hashIndex >= 0) {
    showSlideshow(hashIndex);
  } else if (reducedMotion || introSeen()) {
    showSlideshow(0);
  } else {
    const intro = new IntroSequence(app, particleScene, () => {
      showSlideshow(0);
    });
    intro.start();
  }
}

main().catch(console.error);

import './style.css';
import { ParticleScene } from './animation/scene';
import { IntroSequence } from './components/IntroSequence';
import { ProjectSlideshow } from './components/ProjectSlideshow';

async function main() {
  const app = document.getElementById('app')!;

  // Initialize the particle animation
  const particleScene = new ParticleScene(app);
  await particleScene.getReady();
  particleScene.start();

  // Create the project slideshow (hidden initially)
  const slideshow = new ProjectSlideshow(app, particleScene);

  // Start the intro sequence, then show projects on completion
  const intro = new IntroSequence(app, particleScene, () => {
    slideshow.show();
  });

  intro.start();
}

main().catch(console.error);

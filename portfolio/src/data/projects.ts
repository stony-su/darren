export interface Project {
  title: string;
  description: string;
  image: string;
  video?: string;
  tags: string[];
  liveUrl?: string;
  repoUrl?: string;
  theme: number; // 0-4 maps to color themes
}

export const PROJECTS: Project[] = [
  {
    title: 'Vertex',
    description:
      'A centralized platform for high school students to find, apply to, and track volunteer opportunities',
    image: '/pictures/websites/5q1dcsong1.jpg',
    tags: ['Next.js', 'Three.js', 'Tailwind CSS', "Supabase"],
    liveUrl: 'https://fblc-26.vercel.app/',
    repoUrl: 'https://github.com/B-Eddie/fblc-26',
    theme: 0,
  },
  {
    title: 'Onyx',
    description:
      'A indie platform made at a Shanghai game jam for high school students. Built with Unity',
    image: '/pictures/websites/onyx.png',
    tags: ['Unity', 'C#'],
    liveUrl: 'https://stony-su.itch.io/onyx',
    repoUrl: 'https://github.com/stony-su/onyx',
    theme: 1,
  },
  {
    title: 'Barcode Food Expiry App',
    description:
      'An app that scans barcodes and shows food expiry dates',
    image: '/pictures/websites/barcode-food-expiry.jpg',
    video: '/pictures/websites/Screen_Recording_Jun_6_2025.mp4',
    tags: ['Node.js', 'Expo Cli', 'OpenAI', 'Phone Camera'],
    liveUrl: '',
    repoUrl: 'https://github.com/B-Eddie/barcodescan',
    theme: 2,
  },
  {
    title: 'ShadBus',
    description:
      'Maps Routes - A proof of concept app for Calgary’s mobile grocery bus business.',
    image: '/pictures/websites/shadbus.jpg',
    tags: ['React', 'Tailwind CSS', 'Firebase', 'Google Translate API',   ],
    liveUrl: 'https://shadbusv2.vercel.app/',
    repoUrl: 'https://github.com/stony-su/shadbusv2',
    theme: 3,
  },
  {
    title: 'My Old Personal Website',
    description:
      "See how far I've come! I made this when I was in grade 9",
    image: '/pictures/websites/chrome_OAPAuGFtV4.png',
    tags: ['HTML', 'CSS', 'PHP', 'JS'],
    liveUrl: 'https://stony-su.github.io/personal-website/',
    repoUrl: 'https://github.com/stony-su/personal-website/tree/main',
    theme: 4,
  },
  {
    title: 'Turntable',
    description:
      'Three.js Interactive Turntable. Made with Three.js. Drag the vinyl into the table and watch it spin!',
    image: '/pictures/websites/turntable.png',
    tags: ['Three.js'],
    liveUrl: 'https://vinyl-turntable.vercel.app/',
    repoUrl: 'https://github.com/stony-su/vinyl-turntable',
    theme: 2,
  },
];

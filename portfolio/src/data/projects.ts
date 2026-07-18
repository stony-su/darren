export interface CaseStudy {
  built: string;
  challenge: string;
  outcome: string;
}

export interface Project {
  title: string;
  description: string;
  image?: string;
  video?: string;
  tags: string[];
  liveUrl?: string;
  repoUrl?: string;
  theme: number; // 0-4 maps to color themes
  caseStudy?: CaseStudy;
}

export const PROJECTS: Project[] = [
  {
    title: 'Vertex',
    description:
      'A centralized platform for high school students to find, apply to, and track volunteer opportunities',
    image: '/pictures/websites/5q1dcsong1.jpg',
    tags: ['Next.js', 'Three.js', 'Tailwind CSS', 'Supabase'],
    liveUrl: 'https://fblc-26.vercel.app/',
    repoUrl: 'https://github.com/B-Eddie/fblc-26',
    theme: 0,
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
    title: 'Onyx',
    description:
      'An indie platformer made at a Shanghai game jam for high school students. Built with Unity',
    image: '/pictures/websites/onyx.png',
    tags: ['Unity', 'C#'],
    liveUrl: 'https://stony-su.itch.io/onyx',
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
    video: '/pictures/websites/Screen_Recording_Jun_6_2025.mp4',
    tags: ['Node.js', 'Expo CLI', 'OpenAI', 'Phone Camera'],
    liveUrl: '',
    repoUrl: 'https://github.com/B-Eddie/barcodescan',
    theme: 2,
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
    title: 'ShadBus',
    description:
      'Maps Routes - A proof of concept app for Calgary’s mobile grocery bus business.',
    image: '/pictures/websites/shadbus.jpg',
    tags: ['React', 'Tailwind CSS', 'Firebase', 'Google Translate API'],
    liveUrl: 'https://shadbusv2.vercel.app/',
    repoUrl: 'https://github.com/stony-su/shadbusv2',
    theme: 3,
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
    title: 'My Old Personal Website',
    description: "See how far I've come! I made this when I was in grade 9",
    image: '/pictures/websites/chrome_OAPAuGFtV4.png',
    tags: ['HTML', 'CSS', 'PHP', 'JS'],
    liveUrl: 'https://stony-su.github.io/personal-website/',
    repoUrl: 'https://github.com/stony-su/personal-website/tree/main',
    theme: 4,
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
  {
    title: 'Turntable',
    description:
      'Three.js Interactive Turntable. Made with Three.js. Drag the vinyl into the table and watch it spin!',
    image: '/pictures/websites/Turntable.png',
    tags: ['Three.js'],
    liveUrl: 'https://vinyl-turntable.vercel.app/',
    repoUrl: 'https://github.com/stony-su/vinyl-turntable',
    theme: 2,
    caseStudy: {
      // TODO(darren): edit this placeholder copy
      built:
        'An interactive 3D vinyl turntable in Three.js — drag the record onto the platter and it spins, with lighting and materials tuned for a warm, physical feel.',
      // TODO(darren): edit this placeholder copy
      challenge:
        'Making drag-and-drop feel physical in 3D: raycasting the record against the platter and easing it into place instead of snapping.',
      // TODO(darren): edit this placeholder copy
      outcome:
        'A small toy people actually play with — and the project that got me hooked on creative coding with Three.js.',
    },
  },
];

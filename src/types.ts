export type Project = {
  id: string;
  title: string;
  category: string;
  description: string;
  stack: string[];
  url: string;
  image: string;
  featured: boolean;
};
export type Content = {
  revision: number;
  profile: {
    name: string;
    role: string;
    tagline: string;
    bio: string;
    email: string;
    availability: string;
    skills: string[];
    github: string;
    linkedin: string;
  };
  projects: Project[];
  world: {
    title: string;
    subtitle: string;
    welcome: string;
    district: string;
    accent: string;
  };
  services: { title: string; description: string }[];
};
export type Destination = "about" | "projects" | "arcade" | "contact";
export const destinations: {
  id: Destination;
  name: string;
  place: string;
  x: number;
  z: number;
  color: string;
  symbol: string;
}[] = [
  {
    id: "about",
    name: "About me",
    place: "The Studio",
    x: -14,
    z: 2,
    color: "#c5ed8b",
    symbol: "✳",
  },
  {
    id: "projects",
    name: "Projects",
    place: "The Gallery",
    x: 14,
    z: -42,
    color: "#ffd198",
    symbol: "↗",
  },
  {
    id: "arcade",
    name: "Games",
    place: "The Arcade",
    x: -14,
    z: -88,
    color: "#c6b7f3",
    symbol: "✦",
  },
  {
    id: "contact",
    name: "Contact",
    place: "The Courtyard",
    x: 14,
    z: 65,
    color: "#9edbd1",
    symbol: "✉",
  },
];
export type Telemetry = {
  x: number;
  z: number;
  speed: number;
  heading: number;
  near: Destination | null;
  mode: "drive" | "walk";
  checkpoint: number;
  elapsed: number;
  race: "idle" | "countdown" | "running" | "finished";
  countdown?: number;
  /** Camera heading, used to rotate the radar. */
  view?: number;
  route?: [number, number][];
  waypoint?: Destination | null;
  car?: [number, number];
};

export const raceRoute = [
  [5.2, 28],
  [5.2, -65],
  [5.2, -112],
  [70, -112],
  [70, -20],
  [-5.2, -20],
  [-5.2, 70],
];

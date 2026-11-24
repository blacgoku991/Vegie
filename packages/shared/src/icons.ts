import type { IconName } from "./verdict.ts";

/**
 * Jeu d'icônes Vigie, partagé par l'app et la console : traits ronds de 2 px sur une grille
 * de 24 px. Toujours accompagnées d'un texte.
 */
export interface IconPath {
  d: string[];
  circles?: Array<[number, number, number]>;
}

export const iconPaths: Record<IconName, IconPath> = {
  bell: { d: ["M6 16v-5a6 6 0 0112 0v5l1.5 2.5h-15L6 16z", "M10 21a2.2 2.2 0 004 0"] },
  phoneIn: { d: ["M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z", "M20 4l-5 5", "M15 5v4h4"] },
  settings: { d: ["M4 7h9", "M17 7h3", "M4 17h3", "M11 17h9"], circles: [[15, 7, 2], [9, 17, 2]] },
  shield: { d: ["M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6l7-3z", "M8.8 12.2l2.2 2.2 4.3-4.6"] },
  check: { d: ["M5 12.5l4.5 4.5L19 7.5"] },
  alert: { d: ["M12 4l9 16H3L12 4z", "M12 10v4", "M12 17v.4"] },
  stop: { d: ["M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2L8.2 3z", "M9.5 9.5l5 5", "M14.5 9.5l-5 5"] },
  phone: { d: ["M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"] },
  phoneOff: { d: ["M3.5 14.5c4.7-4.3 12.3-4.3 17 0l-2.3 2.6-3.6-1.4.1-2.4c-1.8-.6-3.6-.6-5.4 0l.1 2.4-3.6 1.4-2.3-2.6z"] },
  mail: { d: ["M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z", "M3.5 7l8.5 6 8.5-6"] },
  message: { d: ["M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H10l-5 4v-4H5a1 1 0 01-1-1V6a1 1 0 011-1z"] },
  link: { d: ["M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1", "M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"] },
  globe: { d: ["M3 12h18", "M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"], circles: [[12, 12, 9]] },
  text: { d: ["M5 7h14", "M5 12h14", "M5 17h9"] },
  user: { d: ["M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"], circles: [[12, 8, 4]] },
  bank: { d: ["M3 9l9-5 9 5", "M4 10h16", "M6 10v8", "M10 10v8", "M14 10v8", "M18 10v8", "M3 21h18"] },
  clock: { d: ["M12 7v5l3 2"], circles: [[12, 12, 9]] },
  chevron: { d: ["M9 6l6 6-6 6"] },
  back: { d: ["M15 6l-6 6 6 6"] },
  plus: { d: ["M12 5v14", "M5 12h14"] },
  share: { d: ["M12 3v12", "M8 7l4-4 4 4", "M5 12v7h14v-7"] },
  heart: { d: ["M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"] },
  search: { d: ["M20 20l-4-4"], circles: [[11, 11, 7]] },
  close: { d: ["M6 6l12 12", "M18 6L6 18"] },
  chart: { d: ["M5 20V11", "M12 20V5", "M19 20v-7", "M3 20h18"] },
  logout: { d: ["M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3", "M10 16l-4-4 4-4", "M6 12h10"] },
};

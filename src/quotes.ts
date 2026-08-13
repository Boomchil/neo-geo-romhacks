export interface Quote {
  text: string;
  author?: string;
}

export const QUOTES: Quote[] = [
  { text: "Finally, I can finish Magician Lord!", author: "Elta" },
  { text: "Can't wait to be patched!", author: "Legend of Success Joe" },
  { text: "Pro-gear spec verified. You may pass.", author: "The Gatekeeper" },
  { text: "It's dangerous to patch alone! Take this.", author: "Wise Man" },
  { text: "Wait... Does this mean we will finally be able shoot diagonally?!", author: "Rick & Brook" },
  { text: "You think a romhack can beat my AI? Think again!", author: "Art of Fighting 2" },
  { text: "The Future is Patched." },
  { text: "Fixing what nobody asked for." },
  { text: "If it ain't broken... I'll patch it anyway." },
  { text: "Assembly required. Literally." },
  { text: "No source code? No problem." },
  { text: "Checksum failed successfully." },
  { text: "...but it works on my emulator!", author: "Boomchil" },
  { text: "Making purists uncomfortable since 2025." },
  { text: "Fixing problems nobody knew existed." },
  { text: "Preserving history by changing it." },
  { text: "new_final_new_patch_fixed_2.ips" },
  { text: "If you know you NOP" },
];

/** Returns a random quote from the pool. */
export function randomQuote(): Quote {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

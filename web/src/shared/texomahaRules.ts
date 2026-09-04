import type { Card } from "./types";

export const texomahaRules = {
  name: "Texomaha",
  holeCardsPerPlayer: 2,
  communityCards: 5,
  minPlayers: 2,
  maxPlayers: 6,
  handSelection: "holdem-any-five-of-seven",
  selectCandidateCards(holeCards: Card[], communityCards: Card[]): Card[] {
    return [...holeCards, ...communityCards];
  }
} as const;

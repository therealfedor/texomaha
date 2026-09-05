import type { Card } from "./types";

export const texomahaRules = {
  name: "Texomaha",
  holeCardsPerPlayer: 6,
  texasCardsRequired: 2,
  omahaCardsRequired: 4,
  communityCards: 5,
  minPlayers: 2,
  maxPlayers: 6,
  handSelection: "assign-two-texas-four-omaha-before-preflop",
  showdownMode: "split-pot-texas-and-omaha",
  selectTexasCandidateCards(texasCards: Card[], communityCards: Card[]): Card[] {
    return [...texasCards, ...communityCards];
  },
  selectOmahaCandidateHands(omahaCards: Card[], communityCards: Card[]): Card[][] {
    return combinations(omahaCards, 2).flatMap((holeSelection) =>
      combinations(communityCards, 3).map((boardSelection) => [...holeSelection, ...boardSelection])
    );
  }
} as const;

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, size - 1).map((combo) => [first, ...combo]), ...combinations(rest, size)];
}

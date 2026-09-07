import { texomahaRules } from "./texomahaRules";
import type { Card, Rank } from "./types";

const ranks: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const rankValue = Object.fromEntries(ranks.map((rank, index) => [rank, index + 2])) as Record<Rank, number>;

export interface EvaluatedHand {
  category: number;
  label: string;
  tiebreakers: number[];
  cards: Card[];
}

const labels = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
  "Royal Flush"
];

export function evaluateTexomahaHand(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
  const cards = texomahaRules.selectTexasCandidateCards(holeCards, communityCards);
  if (cards.length < 5) throw new Error("At least five cards are required");
  return combinations(cards, 5).map(evaluateFive).sort(compareHands).at(-1)!;
}

export function evaluateTexasHand(texasCards: Card[], communityCards: Card[]): EvaluatedHand {
  if (texasCards.length !== texomahaRules.texasCardsRequired) throw new Error("Texas requires exactly two assigned cards.");
  return evaluateTexomahaHand(texasCards, communityCards);
}

export function evaluateOmahaHand(omahaCards: Card[], communityCards: Card[]): EvaluatedHand {
  if (omahaCards.length !== texomahaRules.omahaCardsRequired) throw new Error("Omaha requires exactly four assigned cards.");
  if (communityCards.length < 3) throw new Error("Omaha requires at least three community cards.");
  return texomahaRules.selectOmahaCandidateHands(omahaCards, communityCards).map(evaluateFive).sort(compareHands).at(-1)!;
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let index = 0; index < Math.max(a.tiebreakers.length, b.tiebreakers.length); index += 1) {
    const diff = (a.tiebreakers[index] ?? 0) - (b.tiebreakers[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function evaluateFive(cards: Card[]): EvaluatedHand {
  const values = cards.map((card) => rankValue[card[0] as Rank]).sort((a, b) => b - a);
  const flush = cards.every((card) => card[1] === cards[0][1]);
  const straightHigh = getStraightHigh(values);
  const groups = [...countBy(values).entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  let category = 0;
  let tiebreakers = values;
  if (flush && straightHigh === 14) [category, tiebreakers] = [9, [14]];
  else if (flush && straightHigh) [category, tiebreakers] = [8, [straightHigh]];
  else if (groups[0].count === 4) [category, tiebreakers] = [7, [groups[0].value, groups[1].value]];
  else if (groups[0].count === 3 && groups[1].count === 2) [category, tiebreakers] = [6, [groups[0].value, groups[1].value]];
  else if (flush) [category, tiebreakers] = [5, values];
  else if (straightHigh) [category, tiebreakers] = [4, [straightHigh]];
  else if (groups[0].count === 3) [category, tiebreakers] = [3, [groups[0].value, ...groups.slice(1).map((g) => g.value).sort((a, b) => b - a)]];
  else if (groups[0].count === 2 && groups[1].count === 2) [category, tiebreakers] = [2, [groups[0].value, groups[1].value, groups[2].value]];
  else if (groups[0].count === 2) [category, tiebreakers] = [1, [groups[0].value, ...groups.slice(1).map((g) => g.value).sort((a, b) => b - a)]];

  return { category, label: labels[category], tiebreakers, cards };
}

function getStraightHigh(values: number[]): number | null {
  const unique = [...new Set(values)];
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const run = unique.slice(index, index + 5);
    if (run[0] - run[4] === 4) return run[0];
  }
  return null;
}

function countBy(values: number[]): Map<number, number> {
  const map = new Map<number, number>();
  values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
  return map;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, size - 1).map((combo) => [first, ...combo]), ...combinations(rest, size)];
}

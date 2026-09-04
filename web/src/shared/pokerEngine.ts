import { randomBytes } from "node:crypto";
import { texomahaRules } from "./texomahaRules";
import type { Card, GamePlayer, HandState, LegalActions, Pot, Rank, Suit, TableSettings } from "./types";

const ranks: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const suits: Suit[] = ["S", "H", "D", "C"];
const rankValue = Object.fromEntries(ranks.map((rank, index) => [rank, index + 2])) as Record<Rank, number>;

export function createDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => `${rank}${suit}` as Card));
}

export function shuffleDeck(deck: Card[], randomInt = secureRandomInt): Card[] {
  const copy = [...deck];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function secureRandomInt(maxExclusive: number): number {
  const limit = Math.floor(256 / maxExclusive) * maxExclusive;
  let value = randomBytes(1)[0];
  while (value >= limit) value = randomBytes(1)[0];
  return value % maxExclusive;
}

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
  const cards = texomahaRules.selectCandidateCards(holeCards, communityCards);
  if (cards.length < 5) throw new Error("At least five cards are required");
  return combinations(cards, 5).map(evaluateFive).sort(compareHands).at(-1)!;
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

export function startHand(players: GamePlayer[], settings: TableSettings, previousDealerSeat = -1, handNumber = 1): HandState {
  const active = players.filter((player) => !player.left && player.stack > 0).sort((a, b) => a.seat - b.seat);
  if (active.length < texomahaRules.minPlayers) throw new Error("At least two seated players are required");
  const deck = shuffleDeck(createDeck());
  players.forEach((player) => {
    const isActive = active.some((activePlayer) => activePlayer.userId === player.userId);
    player.currentBet = 0;
    player.totalCommitted = 0;
    player.folded = !isActive;
    player.allIn = !isActive;
    player.holeCards = [];
  });

  const dealerSeat = nextOccupiedSeat(active, previousDealerSeat);
  const smallBlindSeat = active.length === 2 ? dealerSeat : nextOccupiedSeat(active, dealerSeat);
  const bigBlindSeat = nextOccupiedSeat(active, smallBlindSeat);
  for (let cardIndex = 0; cardIndex < texomahaRules.holeCardsPerPlayer; cardIndex += 1) {
    active.forEach((player) => player.holeCards.push(deck.pop()!));
  }
  const history: string[] = [`Hand #${handNumber} started`];
  postBlind(players, smallBlindSeat, settings.smallBlind, history, "small blind");
  postBlind(players, bigBlindSeat, settings.bigBlind, history, "big blind");
  if (settings.ante > 0) active.forEach((player) => commitChips(player, settings.ante, history, "posted ante"));

  const initialPlayersToAct = players.filter(canAct).map((player) => player.userId);
  const actingSeat = nextActionSeat(players, bigBlindSeat, initialPlayersToAct);
  return {
    handNumber,
    deck,
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    street: "PREFLOP",
    communityCards: [],
    currentBet: Math.min(settings.bigBlind, players.find((p) => p.seat === bigBlindSeat)?.currentBet ?? 0),
    minRaise: settings.bigBlind,
    actingSeat,
    lastAggressorSeat: bigBlindSeat,
    playersToAct: initialPlayersToAct,
    pots: [],
    winners: [],
    history
  };
}

export function getLegalActions(player: GamePlayer, hand: HandState, settings: TableSettings): LegalActions {
  if (hand.actingSeat !== player.seat || player.folded || player.allIn || player.left) {
    return { canFold: false, canCheck: false, callAmount: 0, minBet: 0, minRaiseTo: 0, maxAmount: 0 };
  }
  const toCall = Math.max(0, hand.currentBet - player.currentBet);
  const maxAmount = player.stack + player.currentBet;
  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    callAmount: Math.min(toCall, player.stack),
    minBet: hand.currentBet === 0 ? settings.bigBlind : 0,
    minRaiseTo: hand.currentBet > 0 ? Math.min(maxAmount, hand.currentBet + hand.minRaise) : settings.bigBlind,
    maxAmount
  };
}

export function applyAction(players: GamePlayer[], hand: HandState, settings: TableSettings, userId: string, type: string, amount = 0): HandState {
  const player = players.find((candidate) => candidate.userId === userId);
  if (!player || hand.actingSeat !== player.seat) throw new Error("No longer your turn.");
  const legal = getLegalActions(player, hand, settings);
  if (type === "fold") {
    if (!legal.canFold) throw new Error("You can only fold facing a bet.");
    player.folded = true;
    hand.history.push(`${player.username} folded`);
  } else if (type === "check") {
    if (!legal.canCheck) throw new Error("Check is not legal.");
    hand.history.push(`${player.username} checked`);
  } else if (type === "call") {
    if (legal.callAmount <= 0) throw new Error("There is no bet to call.");
    commitChips(player, legal.callAmount, hand.history, `called ${legal.callAmount}`);
  } else if (type === "bet" || type === "raise") {
    const target = Math.floor(amount);
    if (target > legal.maxAmount) throw new Error("Bet exceeds your stack.");
    if (hand.currentBet === 0 && target < legal.minBet && target !== legal.maxAmount) throw new Error("Bet is below the minimum.");
    if (hand.currentBet > 0 && target < legal.minRaiseTo && target !== legal.maxAmount) throw new Error("Raise is below the minimum.");
    const added = target - player.currentBet;
    if (added <= 0) throw new Error("That bet is no longer valid.");
    const previousBet = hand.currentBet;
    commitChips(player, added, hand.history, `${type === "bet" ? "bet" : "raised to"} ${target}`);
    hand.currentBet = player.currentBet;
    hand.minRaise = Math.max(settings.bigBlind, hand.currentBet - previousBet);
    hand.lastAggressorSeat = player.seat;
    hand.playersToAct = playersToActAfter(players, player.seat);
  } else if (type === "all-in") {
    const target = player.currentBet + player.stack;
    commitChips(player, player.stack, hand.history, `moved all-in for ${target}`);
    if (target > hand.currentBet) {
      const previousBet = hand.currentBet;
      hand.currentBet = target;
      hand.minRaise = Math.max(settings.bigBlind, target - previousBet);
      hand.lastAggressorSeat = player.seat;
      hand.playersToAct = playersToActAfter(players, player.seat);
    }
  } else {
    throw new Error("Unsupported action.");
  }

  hand.playersToAct = hand.playersToAct.filter((id) => id !== userId);
  return advanceIfNeeded(players, hand);
}

export function advanceIfNeeded(players: GamePlayer[], hand: HandState): HandState {
  const live = players.filter((player) => !player.left && !player.folded);
  if (live.length === 1) return awardWithoutShowdown(players, hand, live[0]);
  if (hand.playersToAct.some((id) => canAct(players.find((p) => p.userId === id)))) {
    hand.actingSeat = nextActionSeat(players, hand.actingSeat ?? -1, hand.playersToAct);
    return hand;
  }
  players.forEach((player) => (player.currentBet = 0));
  hand.currentBet = 0;
  hand.playersToAct = [];
  hand.actingSeat = null;
  if (hand.street === "PREFLOP") dealStreet(players, hand, "FLOP", 3);
  else if (hand.street === "FLOP") dealStreet(players, hand, "TURN", 1);
  else if (hand.street === "TURN") dealStreet(players, hand, "RIVER", 1);
  else return showdown(players, hand);
  if (hand.actingSeat === null) return advanceIfNeeded(players, hand);
  return hand;
}

function dealStreet(players: GamePlayer[], hand: HandState, street: HandState["street"], count: number): void {
  hand.street = street;
  for (let index = 0; index < count; index += 1) hand.communityCards.push(hand.deck.pop()!);
  hand.history.push(`${street === "FLOP" ? "Flop" : street === "TURN" ? "Turn" : "River"} dealt`);
  hand.playersToAct = players.filter(canAct).sort((a, b) => a.seat - b.seat).map((player) => player.userId);
  hand.actingSeat = nextActionSeat(players, hand.dealerSeat, hand.playersToAct);
}

export function showdown(players: GamePlayer[], hand: HandState): HandState {
  hand.street = "SHOWDOWN";
  hand.actingSeat = null;
  hand.pots = calculatePots(players);
  hand.winners = [];
  for (const pot of hand.pots) {
    const eligible = players.filter((player) => pot.eligibleUserIds.includes(player.userId) && !player.folded);
    const ranked = eligible.map((player) => ({ player, hand: evaluateTexomahaHand(player.holeCards, hand.communityCards) })).sort((a, b) => compareHands(a.hand, b.hand));
    const best = ranked.at(-1)!;
    const winners = ranked.filter((entry) => compareHands(entry.hand, best.hand) === 0);
    const share = Math.floor(pot.amount / winners.length);
    winners.forEach(({ player, hand: bestHand }) => {
      player.stack += share;
      hand.winners.push({ userId: player.userId, amount: share, label: bestHand.label, cards: bestHand.cards });
      hand.history.push(`${player.username} won ${share} with ${bestHand.label}`);
    });
  }
  return hand;
}

export function calculatePots(players: GamePlayer[]): Pot[] {
  const committed = players.filter((player) => player.totalCommitted > 0).map((player) => ({ id: player.userId, amount: player.totalCommitted, folded: player.folded }));
  const levels = [...new Set(committed.map((entry) => entry.amount))].sort((a, b) => a - b);
  let previous = 0;
  return levels.flatMap((level) => {
    const contributors = committed.filter((entry) => entry.amount >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;
    return amount > 0 ? [{ amount, eligibleUserIds: contributors.filter((entry) => !entry.folded).map((entry) => entry.id) }] : [];
  });
}

function awardWithoutShowdown(players: GamePlayer[], hand: HandState, winner: GamePlayer): HandState {
  const pot = players.reduce((sum, player) => sum + player.totalCommitted, 0);
  winner.stack += pot;
  hand.street = "SHOWDOWN";
  hand.actingSeat = null;
  hand.winners = [{ userId: winner.userId, amount: pot, label: "Uncontested", cards: [] }];
  hand.history.push(`${winner.username} won ${pot}`);
  return hand;
}

function postBlind(players: GamePlayer[], seat: number, amount: number, history: string[], label: string): void {
  const player = players.find((candidate) => candidate.seat === seat)!;
  commitChips(player, amount, history, `posted ${label}`);
}

function commitChips(player: GamePlayer, amount: number, history: string[], label: string): void {
  const paid = Math.min(player.stack, amount);
  player.stack -= paid;
  player.currentBet += paid;
  player.totalCommitted += paid;
  player.allIn = player.stack === 0;
  history.push(`${player.username} ${label}`);
}

function canAct(player: GamePlayer | undefined): player is GamePlayer {
  return Boolean(player && player.stack > 0 && !player.left && !player.folded && !player.allIn);
}

function nextOccupiedSeat(players: GamePlayer[], afterSeat: number): number {
  return players.filter((player) => player.seat > afterSeat).sort((a, b) => a.seat - b.seat)[0]?.seat ?? players.sort((a, b) => a.seat - b.seat)[0].seat;
}

function nextActionSeat(players: GamePlayer[], afterSeat: number, allowedIds?: string[]): number | null {
  const candidates = players.filter((player) => canAct(player) && (!allowedIds || allowedIds.includes(player.userId))).sort((a, b) => a.seat - b.seat);
  return candidates.find((player) => player.seat > afterSeat)?.seat ?? candidates[0]?.seat ?? null;
}

function playersToActAfter(players: GamePlayer[], aggressorSeat: number): string[] {
  const ordered = [...players].sort((a, b) => ((a.seat - aggressorSeat + 100) % 100) - ((b.seat - aggressorSeat + 100) % 100));
  return ordered.filter((player) => player.seat !== aggressorSeat && canAct(player)).map((player) => player.userId);
}

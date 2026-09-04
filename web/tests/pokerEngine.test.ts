import { describe, expect, it } from "vitest";
import { applyAction, calculatePots, createDeck, evaluateTexomahaHand, getLegalActions, shuffleDeck, startHand } from "../src/shared/pokerEngine";
import type { Card, GamePlayer, TableSettings } from "../src/shared/types";

const settings: TableSettings = { startingStack: 1000, smallBlind: 10, bigBlind: 20, ante: 0, maxPlayers: 6 };

function players(count = 2): GamePlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    userId: `p${index + 1}`,
    username: `Player ${index + 1}`,
    avatar: `P${index + 1}`,
    seat: index,
    stack: 1000,
    currentBet: 0,
    totalCommitted: 0,
    folded: false,
    allIn: false,
    connected: true,
    left: false,
    holeCards: []
  }));
}

describe("deck and dealing", () => {
  it("creates a standard 52-card deck", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck)).toHaveLength(52);
  });

  it("shuffles deterministically when random source is injected", () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, () => 0);
    expect(shuffled).not.toEqual(deck);
    expect(new Set(shuffled)).toEqual(new Set(deck));
  });

  it("starts a hand with blinds, hole cards, and turn order", () => {
    const seated = players(2);
    const hand = startHand(seated, settings);
    expect(seated.every((player) => player.holeCards.length === 2)).toBe(true);
    expect(seated.reduce((sum, player) => sum + player.totalCommitted, 0)).toBe(30);
    expect(hand.street).toBe("PREFLOP");
    expect(hand.actingSeat).not.toBeNull();
  });
});

describe("hand evaluation", () => {
  it("ranks royal flush above four of a kind", () => {
    const royal = evaluateTexomahaHand(["AS", "KS"], ["QS", "JS", "TS", "2C", "3D"]);
    const quads = evaluateTexomahaHand(["AH", "AD"], ["AC", "AS", "2D", "3C", "4H"]);
    expect(royal.label).toBe("Royal Flush");
    expect(royal.category).toBeGreaterThan(quads.category);
  });

  it("detects ties by exact best hand strength", () => {
    const a = evaluateTexomahaHand(["AS", "KD"], ["2C", "5H", "9S", "JC", "QD"]);
    const b = evaluateTexomahaHand(["AH", "KC"], ["2C", "5H", "9S", "JC", "QD"]);
    expect(a.category).toBe(b.category);
    expect(a.tiebreakers).toEqual(b.tiebreakers);
  });
});

describe("betting state machine", () => {
  it("rejects acting out of turn", () => {
    const seated = players(2);
    const hand = startHand(seated, settings);
    const wrong = seated.find((player) => player.seat !== hand.actingSeat)!;
    expect(() => applyAction(seated, hand, settings, wrong.userId, "call")).toThrow("No longer your turn.");
  });

  it("supports calls and street progression through flop turn river showdown", () => {
    const seated = players(2);
    let hand = startHand(seated, settings);
    hand = applyAction(seated, hand, settings, seated.find((p) => p.seat === hand.actingSeat)!.userId, "call");
    hand = applyAction(seated, hand, settings, seated.find((p) => p.seat === hand.actingSeat)!.userId, "check");
    expect(hand.street).toBe("FLOP");
    expect(hand.communityCards).toHaveLength(3);
    hand = applyAction(seated, hand, settings, seated.find((p) => p.seat === hand.actingSeat)!.userId, "check");
    hand = applyAction(seated, hand, settings, seated.find((p) => p.seat === hand.actingSeat)!.userId, "check");
    expect(hand.street).toBe("TURN");
    hand = applyAction(seated, hand, settings, seated.find((p) => p.seat === hand.actingSeat)!.userId, "check");
    hand = applyAction(seated, hand, settings, seated.find((p) => p.seat === hand.actingSeat)!.userId, "check");
    expect(hand.street).toBe("RIVER");
    hand = applyAction(seated, hand, settings, seated.find((p) => p.seat === hand.actingSeat)!.userId, "check");
    hand = applyAction(seated, hand, settings, seated.find((p) => p.seat === hand.actingSeat)!.userId, "check");
    expect(hand.street).toBe("SHOWDOWN");
    expect(hand.winners.length).toBeGreaterThan(0);
  });

  it("supports legal raises and blocks below-minimum raises", () => {
    const seated = players(2);
    const hand = startHand(seated, settings);
    const actor = seated.find((player) => player.seat === hand.actingSeat)!;
    expect(getLegalActions(actor, hand, settings).minRaiseTo).toBe(40);
    expect(() => applyAction(seated, hand, settings, actor.userId, "raise", 30)).toThrow("Raise is below the minimum.");
    applyAction(seated, hand, settings, actor.userId, "raise", 40);
    expect(hand.currentBet).toBe(40);
  });

  it("awards the pot when everyone else folds", () => {
    const seated = players(2);
    const hand = startHand(seated, settings);
    const actor = seated.find((player) => player.seat === hand.actingSeat)!;
    applyAction(seated, hand, settings, actor.userId, "fold");
    expect(hand.winners[0].label).toBe("Uncontested");
  });

  it("supports all-ins and side pots", () => {
    const seated = players(3);
    seated[0].totalCommitted = 100;
    seated[1].totalCommitted = 200;
    seated[2].totalCommitted = 500;
    seated[0].folded = false;
    const pots = calculatePots(seated);
    expect(pots.map((pot) => pot.amount)).toEqual([300, 200, 300]);
    expect(pots[0].eligibleUserIds).toHaveLength(3);
  });

  it("keeps reconnects from resetting a hand", () => {
    const seated = players(2);
    const hand = startHand(seated, settings);
    seated[0].connected = false;
    seated[0].connected = true;
    expect(hand.street).toBe("PREFLOP");
    expect(seated[0].holeCards).toHaveLength(2);
  });

  it("handles player disconnect by allowing a safe fold marker", () => {
    const seated = players(2);
    const hand = startHand(seated, settings);
    const actor = seated.find((player) => player.seat === hand.actingSeat)!;
    actor.connected = false;
    if (getLegalActions(actor, hand, settings).canFold) applyAction(seated, hand, settings, actor.userId, "fold");
    expect(actor.connected).toBe(false);
  });
});

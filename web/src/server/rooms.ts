import { v4 as uuid } from "uuid";
import { applyAction, getLegalActions, startHand } from "../shared/pokerEngine";
import { texomahaRules } from "../shared/texomahaRules";
import type { ClientRoomView, GamePlayer, GameRoom, TableSettings } from "../shared/types";
import { database, persist, type StoredUser } from "./store";

export function createRoom(host: StoredUser, settings: TableSettings): GameRoom {
  const safeSettings = {
    startingStack: clampInt(settings.startingStack, 200, 100000),
    smallBlind: clampInt(settings.smallBlind, 1, 10000),
    bigBlind: clampInt(settings.bigBlind, 2, 20000),
    ante: clampInt(settings.ante, 0, 10000),
    maxPlayers: clampInt(settings.maxPlayers, texomahaRules.minPlayers, texomahaRules.maxPlayers)
  };
  if (safeSettings.bigBlind < safeSettings.smallBlind * 2) safeSettings.bigBlind = safeSettings.smallBlind * 2;
  const room: GameRoom = {
    id: uuid(),
    inviteToken: uuid().replaceAll("-", "").slice(0, 12).toUpperCase(),
    hostUserId: host.id,
    status: "WAITING",
    settings: safeSettings,
    players: [],
    hand: null,
    chat: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  database.rooms.push(room);
  joinRoom(room, host);
  return room;
}

export function joinRoom(room: GameRoom, user: StoredUser): GameRoom {
  if (room.status !== "WAITING" && !room.players.some((player) => player.userId === user.id)) throw new Error("Game has already started.");
  if (room.players.length >= room.settings.maxPlayers && !room.players.some((player) => player.userId === user.id)) throw new Error("Game is full.");
  let player = room.players.find((candidate) => candidate.userId === user.id);
  if (!player) {
    const usedSeats = new Set(room.players.map((candidate) => candidate.seat));
    const seat = Array.from({ length: room.settings.maxPlayers }, (_, index) => index).find((index) => !usedSeats.has(index)) ?? room.players.length;
    player = {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      seat,
      stack: room.settings.startingStack,
      currentBet: 0,
      totalCommitted: 0,
      folded: false,
      allIn: false,
      connected: true,
      left: false,
      holeCards: []
    };
    room.players.push(player);
  }
  player.connected = true;
  player.left = false;
  user.status = "in_game";
  touch(room);
  return room;
}

export function startRoomGame(room: GameRoom, user: StoredUser): GameRoom {
  if (room.hostUserId !== user.id) throw new Error("Only the host can start the game.");
  if (room.players.filter((player) => !player.left).length < texomahaRules.minPlayers) throw new Error("Waiting for your friends to join.");
  room.status = "IN_PROGRESS";
  room.hand = startHand(room.players, room.settings, room.hand?.dealerSeat ?? -1, (room.hand?.handNumber ?? 0) + 1);
  touch(room);
  return room;
}

export function nextHand(room: GameRoom, user: StoredUser): GameRoom {
  if (!room.players.some((player) => player.userId === user.id)) throw new Error("You are not seated here.");
  room.status = "IN_PROGRESS";
  room.hand = startHand(room.players, room.settings, room.hand?.dealerSeat ?? -1, (room.hand?.handNumber ?? 0) + 1);
  touch(room);
  return room;
}

export function playerAction(room: GameRoom, user: StoredUser, type: string, amount = 0): GameRoom {
  if (!room.hand || room.status !== "IN_PROGRESS") throw new Error("No hand is in progress.");
  room.hand = applyAction(room.players, room.hand, room.settings, user.id, type, amount);
  if (room.hand.winners.length > 0) {
    room.status = "HAND_COMPLETE";
    database.users.forEach((storedUser) => {
      if (room.players.some((player) => player.userId === storedUser.id)) storedUser.stats.handsPlayed += 1;
      if (room.hand?.winners.some((winner) => winner.userId === storedUser.id)) storedUser.stats.handsWon += 1;
    });
  }
  touch(room);
  return room;
}

export function leaveRoom(room: GameRoom, user: StoredUser): GameRoom {
  const player = room.players.find((candidate) => candidate.userId === user.id);
  if (!player) return room;
  player.connected = false;
  player.left = true;
  user.status = "online";
  if (room.hostUserId === user.id) {
    const nextHost = room.players.find((candidate) => !candidate.left);
    if (nextHost) room.hostUserId = nextHost.userId;
    else room.status = "ENDED";
  }
  if (room.hand?.actingSeat === player.seat) {
    try {
      playerAction(room, user, "fold");
    } catch {
      room.hand.actingSeat = null;
    }
  }
  touch(room);
  return room;
}

export function clientRoomView(room: GameRoom, userId: string): ClientRoomView {
  const shownCards: Record<string, GamePlayer["holeCards"]> = {};
  if (room.hand?.winners.length) {
    room.players.forEach((player) => {
      if (!player.folded) shownCards[player.userId] = player.holeCards;
    });
  }
  return {
    ...room,
    players: room.players.map(({ holeCards, ...player }) => player),
    hand: room.hand
      ? {
          ...room.hand,
          deck: undefined,
          heroCards: room.players.find((player) => player.userId === userId)?.holeCards ?? [],
          shownCards
        }
      : null
  } as ClientRoomView;
}

export function findRoomByToken(token: string): GameRoom | undefined {
  return database.rooms.find((room) => room.inviteToken === token && room.status !== "ENDED");
}

export function findRoom(id: string): GameRoom | undefined {
  return database.rooms.find((room) => room.id === id);
}

export function legalActions(room: GameRoom, user: StoredUser) {
  const player = room.players.find((candidate) => candidate.userId === user.id);
  if (!player || !room.hand) return null;
  return getLegalActions(player, room.hand, room.settings);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number(value) || min)));
}

function touch(room: GameRoom): void {
  room.updatedAt = Date.now();
  persist();
}

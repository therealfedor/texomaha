export type Suit = "S" | "H" | "D" | "C";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
export type Card = `${Rank}${Suit}`;
export type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";
export type RoomStatus = "WAITING" | "STARTING" | "IN_PROGRESS" | "SHOWDOWN" | "HAND_COMPLETE" | "ENDED";
export type PlayerStatus = "online" | "offline" | "in_game";
export type PokerActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in";

export interface PublicUser {
  id: string;
  username: string;
  avatar: string;
  status: PlayerStatus;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
}

export interface TableSettings {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  maxPlayers: number;
}

export interface GamePlayer {
  userId: string;
  username: string;
  avatar: string;
  seat: number;
  stack: number;
  currentBet: number;
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  left: boolean;
  holeCards: Card[];
}

export interface Pot {
  amount: number;
  eligibleUserIds: string[];
}

export interface HandState {
  handNumber: number;
  deck: Card[];
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  street: Street;
  communityCards: Card[];
  currentBet: number;
  minRaise: number;
  actingSeat: number | null;
  lastAggressorSeat: number | null;
  playersToAct: string[];
  pots: Pot[];
  winners: Array<{ userId: string; amount: number; label: string; cards: Card[] }>;
  history: string[];
}

export interface GameRoom {
  id: string;
  inviteToken: string;
  hostUserId: string;
  status: RoomStatus;
  settings: TableSettings;
  players: GamePlayer[];
  hand: HandState | null;
  chat: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  createdAt: number;
}

export interface ClientRoomView extends Omit<GameRoom, "players" | "hand"> {
  players: Omit<GamePlayer, "holeCards">[];
  hand: (Omit<HandState, "deck"> & { heroCards: Card[]; shownCards: Record<string, Card[]> }) | null;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  minBet: number;
  minRaiseTo: number;
  maxAmount: number;
}

import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, Socket } from "socket.io-client";
import type { ClientRoomView, LegalActions, PublicUser, TableSettings } from "../shared/types";
import "./styles.css";

type Lobby = {
  user: PublicUser & { stats: { handsPlayed: number; handsWon: number } };
  friends: PublicUser[];
  incomingRequests: Array<{ id: string; fromUserId: string; fromUser: PublicUser }>;
  outgoingRequests: Array<{ id: string; toUserId: string; toUser: PublicUser }>;
  games: ClientRoomView[];
};

const tokenKey = "texomaha_token";

function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) ?? "");
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [room, setRoom] = useState<ClientRoomView | null>(null);
  const [joinToken, setJoinToken] = useState(location.pathname.startsWith("/join/") ? location.pathname.split("/").at(-1) ?? "" : "");
  const [invitePreview, setInvitePreview] = useState<{ hostUsername: string; token: string } | null>(null);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(localStorage.getItem("texomaha_muted") !== "false");

  const api = useMemo(() => makeApi(token, setError), [token]);

  useEffect(() => {
    if (!token) return;
    api.get("/api/lobby").then(setLobby).catch(() => undefined);
  }, [api, token]);

  useEffect(() => {
    if (!joinToken) return;
    api.get(`/api/join/${joinToken}`).then((data) => {
      setInvitePreview(data);
      if (data.room) setRoom(data.room);
    }).catch(() => undefined);
  }, [api, joinToken]);

  useEffect(() => {
    if (!token || !room) return;
    const socket: Socket = io({ auth: { token } });
    socket.emit("room:watch", room.id);
    socket.on("room:update", setRoom);
    return () => { socket.close(); };
  }, [room?.id, token]);

  function onAuth(nextToken: string) {
    localStorage.setItem(tokenKey, nextToken);
    setToken(nextToken);
  }

  if (!token) return <AuthScreen api={api} onAuth={onAuth} invitePreview={invitePreview} />;

  return (
    <main>
      {error && <button className="toast" onClick={() => setError("")}>{error}</button>}
      {room ? (
        <RoomScreen room={room} api={api} lobby={lobby} muted={muted} setMuted={setMuted} onRoom={setRoom} onBack={() => { setRoom(null); history.pushState(null, "", "/"); }} />
      ) : joinToken && invitePreview ? (
        <InviteScreen preview={invitePreview} api={api} onJoin={setRoom} />
      ) : (
        <LobbyScreen lobby={lobby} api={api} onLobby={setLobby} onRoom={setRoom} onJoinToken={setJoinToken} />
      )}
    </main>
  );
}

function AuthScreen({ api, onAuth, invitePreview }: { api: Api; onAuth: (token: string) => void; invitePreview: { hostUsername: string } | null }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const data = await api.post(`/api/auth/${mode}`, { email, username, password }, { silent: true });
      onAuth(data.token);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="auth">
      <div className="brand">
        <span>TEXOMAHA</span>
        <h1>{invitePreview ? `${invitePreview.hostUsername} invited you to play Texomaha` : "Play Texomaha with friends"}</h1>
      </div>
      <form className="panel" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button>
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
        </div>
        <p className="authHint">Hosted accounts are separate from local test accounts. Create a new account here the first time you use the live server.</p>
        {formError && <div className="formError" role="alert">{formError}</div>}
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete={mode === "login" ? "email" : "email"} required /></label>
        {mode === "register" && <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" required /></label>}
        <label>Password<div className="passwordField"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div></label>
        <button className="primary" disabled={submitting}>{submitting ? "Working..." : mode === "register" ? "Create Account" : "Sign In"}</button>
      </form>
    </section>
  );
}

function LobbyScreen({ lobby, api, onLobby, onRoom }: { lobby: Lobby | null; api: Api; onLobby: (lobby: Lobby) => void; onRoom: (room: ClientRoomView) => void; onJoinToken: (token: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  async function refresh() { onLobby(await api.get("/api/lobby")); }
  async function findPlayers(value: string) {
    setSearch(value);
    setResults(value.length > 1 ? await api.get(`/api/users/search?q=${encodeURIComponent(value)}`) : []);
  }
  if (!lobby) return <div className="loading">Loading Texomaha...</div>;
  return (
    <section className="lobby">
      <header><h1>TEXOMAHA</h1><p>{lobby.user.username} · {lobby.user.stats.handsWon}/{lobby.user.stats.handsPlayed} hands won</p><button onClick={() => { localStorage.removeItem(tokenKey); location.reload(); }}>Logout</button></header>
      <div className="lobbyGrid">
        <section className="panel feature">
          <h2>Play With Friends</h2>
          <button className="primary" onClick={() => setCreating(true)}>Create Game</button>
          {creating && <CreateGame api={api} onRoom={onRoom} />}
        </section>
        <section className="panel">
          <h2>Your Games</h2>
          {lobby.games.length === 0 ? <Empty text="No active games." action="Create Game" onClick={() => setCreating(true)} /> : lobby.games.map((game) => <button className="row" key={game.id} onClick={() => onRoom(game)}>{game.status} · {game.players.length}/{game.settings.maxPlayers} players</button>)}
        </section>
        <section className="panel">
          <h2>Friends</h2>
          <div className="search"><input placeholder="Add friend by username" value={search} onChange={(event) => findPlayers(event.target.value)} /></div>
          {results.map((user) => <button className="row" key={user.id} onClick={async () => { await api.post("/api/friends/request", { toUserId: user.id }); setResults([]); setSearch(""); }}>{user.username}<span>Send request</span></button>)}
          {lobby.incomingRequests.map((request) => <FriendRequestRow key={request.id} request={request} api={api} refresh={refresh} />)}
          {lobby.outgoingRequests.map((request) => <div className="row muted" key={request.id}>{request.toUser.username}<span>Request sent</span></div>)}
          {lobby.friends.length === 0 ? <Empty text="You don't have any friends yet." action="Add Friend" /> : lobby.friends.map((friend) => <div className="row" key={friend.id}><span><Status status={friend.status} />{friend.username}</span><span>{friend.status.replace("_", " ")}</span></div>)}
        </section>
        <section className="panel profile"><h2>Profile</h2><div className="avatar big">{lobby.user.avatar}</div><strong>{lobby.user.username}</strong></section>
      </div>
    </section>
  );
}

function FriendRequestRow({ request, api, refresh }: { request: { id: string; fromUser: PublicUser }; api: Api; refresh: () => void }) {
  return <div className="row"><span>{request.fromUser.username} wants to connect</span><button onClick={async () => { await api.post("/api/friends/respond", { requestId: request.id, accept: true }); refresh(); }}>Accept</button><button onClick={async () => { await api.post("/api/friends/respond", { requestId: request.id, accept: false }); refresh(); }}>Decline</button></div>;
}

function CreateGame({ api, onRoom }: { api: Api; onRoom: (room: ClientRoomView) => void }) {
  const [settings, setSettings] = useState<TableSettings>({ startingStack: 1000, smallBlind: 10, bigBlind: 20, ante: 0, maxPlayers: 2 });
  return (
    <form className="create" onSubmit={async (event) => { event.preventDefault(); onRoom(await api.post("/api/rooms", settings)); }}>
      {(["startingStack", "smallBlind", "bigBlind", "ante", "maxPlayers"] as const).map((key) => (
        <label key={key}>{labelFor(key)}<input type="number" value={settings[key]} min={key === "maxPlayers" ? 2 : 0} max={key === "maxPlayers" ? 6 : undefined} onChange={(event) => setSettings({ ...settings, [key]: Number(event.target.value) })} /></label>
      ))}
      <button className="primary">Create Game</button>
    </form>
  );
}

function InviteScreen({ preview, api, onJoin }: { preview: { hostUsername: string; token: string }; api: Api; onJoin: (room: ClientRoomView) => void }) {
  return <section className="auth"><div className="panel invite"><h1>{preview.hostUsername} invited you to play Texomaha</h1><button className="primary" onClick={async () => onJoin(await api.post(`/api/join/${preview.token}`, {}))}>Join Game</button></div></section>;
}

function RoomScreen({ room, api, lobby, muted, setMuted, onRoom, onBack }: { room: ClientRoomView; api: Api; lobby: Lobby | null; muted: boolean; setMuted: (muted: boolean) => void; onRoom: (room: ClientRoomView) => void; onBack: () => void }) {
  const hero = lobby?.user;
  const me = room.players.find((player) => player.userId === hero?.id);
  const legal = room.hand && me?.seat === room.hand.actingSeat ? getClientLegal(room, me.userId) : null;
  const inviteUrl = `${location.origin}/join/${room.inviteToken}`;
  const [copyStatus, setCopyStatus] = useState("");
  async function copyInvite() {
    const copied = await copyText(inviteUrl);
    setCopyStatus(copied ? "Invite link copied" : "Select and copy the invite link below");
  }
  return (
    <section className="room">
      <header className="roomTop"><button onClick={onBack}>Lobby</button><h1>TEXOMAHA TABLE</h1><button onClick={() => { const next = !muted; setMuted(next); localStorage.setItem("texomaha_muted", String(next)); }}>{muted ? "Sound Off" : "Sound On"}</button><button onClick={copyInvite}>Copy Game Link</button></header>
      {copyStatus && <div className="copyStatus">{copyStatus}</div>}
      {room.status === "WAITING" ? (
        <WaitingRoom room={room} api={api} lobby={lobby} onRoom={onRoom} inviteUrl={inviteUrl} onCopyInvite={copyInvite} />
      ) : (
        <PokerTable room={room} heroId={hero?.id ?? ""} legal={legal} muted={muted} api={api} onRoom={onRoom} />
      )}
    </section>
  );
}

function WaitingRoom({ room, api, lobby, onRoom, inviteUrl, onCopyInvite }: { room: ClientRoomView; api: Api; lobby: Lobby | null; onRoom: (room: ClientRoomView) => void; inviteUrl: string; onCopyInvite: () => void }) {
  return <div className="waiting panel"><h2>Waiting for your friends to join...</h2><div className="inviteBox"><span>Invite link</span><input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /></div><div className="seated">{room.players.map((player) => <div className="seatCard" key={player.userId}><div className="avatar">{player.avatar}</div><strong>{player.username}</strong><span>Ready</span></div>)}</div><div className="actions"><button onClick={onCopyInvite}>Copy Invite Link</button><button className="primary" disabled={room.players.length < 2} onClick={async () => onRoom(await api.post(`/api/rooms/${room.id}/start`, {}))}>Start Game</button></div><div className="friendInvite">{lobby?.friends.map((friend) => <button key={friend.id} onClick={onCopyInvite}>Invite {friend.username}</button>)}</div></div>;
}

function PokerTable({ room, heroId, legal, muted, api, onRoom }: { room: ClientRoomView; heroId: string; legal: LegalActions | null; muted: boolean; api: Api; onRoom: (room: ClientRoomView) => void }) {
  const [amount, setAmount] = useState(legal?.minRaiseTo || legal?.minBet || 20);
  const [chat, setChat] = useState("");
  const [chatOpen, setChatOpen] = useState(localStorage.getItem("texomaha_chat_open") !== "false");
  const [chatError, setChatError] = useState("");
  const portraitTable = usePortraitTable();
  const heroIndex = room.players.findIndex((player) => player.userId === heroId);
  const visualPlayers = heroIndex >= 0 ? [...room.players.slice(heroIndex), ...room.players.slice(0, heroIndex)] : room.players;
  const pot = room.players.reduce((sum, player) => sum + player.totalCommitted, 0);
  const minWager = legal ? Math.min(legal.maxAmount, Math.max(legal.minBet, legal.minRaiseTo)) : 0;
  const wagerAmount = Math.min(Math.max(amount, minWager), legal?.maxAmount ?? amount);
  useEffect(() => {
    if (legal) setAmount(Math.min(legal.maxAmount, Math.max(legal.minBet, legal.minRaiseTo)));
  }, [legal?.maxAmount, legal?.minBet, legal?.minRaiseTo]);
  async function act(type: string, actionAmount = amount) {
    const data = await api.post(`/api/rooms/${room.id}/action`, { type, amount: actionAmount });
    playSound(type, muted);
    onRoom(data.room);
  }
  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const message = chat.trim();
    if (!message) return;
    setChatError("");
    try {
      const data = await api.post(`/api/rooms/${room.id}/chat`, { message }, { silent: true });
      setChat("");
      onRoom(data.room);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to send chat.");
    }
  }
  function toggleChat() {
    const next = !chatOpen;
    setChatOpen(next);
    localStorage.setItem("texomaha_chat_open", String(next));
  }
  return (
    <div className="tableLayout">
      <div className="felt">
        {visualPlayers.map((player, index) => <PlayerSeat key={player.userId} player={player} active={room.hand?.actingSeat === player.seat} hero={player.userId === heroId} portraitTable={portraitTable} cards={player.userId === heroId ? room.hand?.heroCards : room.hand?.shownCards[player.userId]} index={index} count={visualPlayers.length} />)}
        <div className="board">
          <div className="pot">Pot {pot}</div>
          <div className="cards">{[0, 1, 2, 3, 4].map((index) => <CardView key={index} card={room.hand?.communityCards[index]} />)}</div>
          <div className="street">{room.hand?.street}</div>
          {room.hand?.winners.map((winner) => <div className="winner" key={`${winner.userId}-${winner.amount}`}>{room.players.find((player) => player.userId === winner.userId)?.username} won {winner.amount} · {winner.label}</div>)}
        </div>
      </div>
      <aside className={`side panel ${chatOpen ? "" : "chatClosed"}`}>
        <div className="sideHeader"><h2>Hand #{room.hand?.handNumber}</h2><button type="button" onClick={toggleChat}>{chatOpen ? "Hide Chat" : "Show Chat"}</button></div>
        <div className="history">{room.hand?.history.slice(-16).map((line, index) => <p key={index}>{line}</p>)}</div>
        {chatOpen && <div className="chatPanel">
          <h2>Chat</h2>
          <div className="chat">{room.chat.slice(-20).map((message) => <p key={message.id}><strong>{message.username}</strong>: {message.message}</p>)}</div>
          {chatError && <div className="chatError" role="alert">{chatError}</div>}
          <form className="chatForm" onSubmit={sendChat}><input value={chat} onChange={(event) => setChat(event.target.value)} maxLength={240} placeholder="Message" autoComplete="off" /><button disabled={!chat.trim()}>Send</button></form>
        </div>}
      </aside>
      <div className="controls panel">
        {room.status === "HAND_COMPLETE" ? <button className="primary" onClick={async () => onRoom(await api.post(`/api/rooms/${room.id}/next-hand`, {}))}>Next Hand</button> : legal ? <>
          <strong>YOUR TURN</strong>
          {legal.canFold && <button onClick={() => act("fold")}>Fold</button>}
          {legal.canCheck && <button onClick={() => act("check")}>Check</button>}
          {legal.callAmount > 0 && <button onClick={() => act("call")}>Call {legal.callAmount}</button>}
          <button onClick={() => setAmount(Math.min(legal.maxAmount, Math.max(minWager, Math.floor(pot / 2))))}>1/2 Pot</button>
          <button onClick={() => setAmount(Math.min(legal.maxAmount, Math.max(minWager, Math.floor(pot * .75))))}>3/4 Pot</button>
          <button onClick={() => setAmount(Math.min(legal.maxAmount, Math.max(minWager, pot)))}>Pot</button>
          <input type="range" min={minWager} max={legal.maxAmount} value={wagerAmount} onChange={(event) => setAmount(Number(event.target.value))} />
          <input type="number" min={minWager} max={legal.maxAmount} value={wagerAmount} onChange={(event) => setAmount(Number(event.target.value))} />
          <button onClick={() => act(legal.callAmount > 0 ? "raise" : "bet", wagerAmount)}>{legal.callAmount > 0 ? "Raise To" : "Bet"} {wagerAmount}</button>
          <button onClick={() => act("all-in")}>All In</button>
        </> : <span>Waiting for action...</span>}
      </div>
    </div>
  );
}

function PlayerSeat({ player, active, hero, portraitTable, cards, index, count }: { player: { username: string; avatar: string; stack: number; currentBet: number; folded: boolean; allIn: boolean; connected: boolean }; active: boolean; hero: boolean; portraitTable: boolean; cards?: string[]; index: number; count: number }) {
  const angle = Math.PI / 2 + (Math.PI * 2 * index) / count;
  const xRadius = portraitTable ? 35 : 43;
  const yRadius = portraitTable ? 43 : 36;
  const style = { left: `${50 + Math.cos(angle) * xRadius}%`, top: `${50 + Math.sin(angle) * yRadius}%` };
  return <div className={`playerSeat ${active ? "active" : ""} ${hero ? "heroSeat" : ""}`} style={style}><div className="avatar">{player.avatar}</div><strong>{player.username}</strong><span>{player.stack} chips</span><small>{active && hero ? "YOUR TURN" : player.folded ? "Folded" : player.allIn ? "All in" : player.connected ? "Online" : "Reconnecting"}</small><div className="miniCards">{(cards ?? ["", ""]).map((card, cardIndex) => <CardView key={cardIndex} card={card} hidden={!card} />)}</div>{player.currentBet > 0 && <b className="bet">{player.currentBet}</b>}</div>;
}

function CardView({ card, hidden = false }: { card?: string; hidden?: boolean }) {
  const red = card?.endsWith("H") || card?.endsWith("D");
  return <div className={`card ${hidden || !card ? "back" : ""} ${red ? "red" : ""}`}>{card ? <><b>{card[0].replace("T", "10")}</b><span>{suit(card[1])}</span></> : ""}</div>;
}

function Empty({ text, action, onClick }: { text: string; action: string; onClick?: () => void }) {
  return <div className="empty"><p>{text}</p>{onClick && <button onClick={onClick}>{action}</button>}</div>;
}

function Status({ status }: { status: string }) {
  return <i className={`dot ${status}`} />;
}

function usePortraitTable() {
  const [portraitTable, setPortraitTable] = useState(() => window.matchMedia("(max-width: 600px) and (orientation: portrait)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 600px) and (orientation: portrait)");
    const update = () => setPortraitTable(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return portraitTable;
}

function getClientLegal(room: ClientRoomView, userId: string): LegalActions | null {
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!room.hand || !player) return null;
  const toCall = Math.max(0, room.hand.currentBet - player.currentBet);
  const maxAmount = player.stack + player.currentBet;
  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    callAmount: Math.min(toCall, player.stack),
    minBet: room.hand.currentBet === 0 ? room.settings.bigBlind : 0,
    minRaiseTo: room.hand.currentBet > 0 ? Math.min(maxAmount, room.hand.currentBet + room.hand.minRaise) : room.settings.bigBlind,
    maxAmount
  };
}

function labelFor(key: string) {
  return ({ startingStack: "Starting Chips", smallBlind: "Small Blind", bigBlind: "Big Blind", ante: "Optional Ante", maxPlayers: "Players" } as Record<string, string>)[key];
}

function suit(value: string) {
  return ({ S: "♠", H: "♥", D: "♦", C: "♣" } as Record<string, string>)[value] ?? value;
}

function playSound(type: string, muted: boolean) {
  if (muted) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = type === "fold" ? 160 : type === "check" ? 260 : type === "all-in" ? 520 : 390;
  gain.gain.value = 0.025;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.08);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path used by some embedded web views.
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);
  return copied;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type Api = ReturnType<typeof makeApi>;
function makeApi(token: string, setError: (error: string) => void) {
  async function request(path: string, options: RequestInit & { silent?: boolean } = {}) {
    const { silent, ...requestOptions } = options;
    const response = await fetch(path, { ...requestOptions, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...requestOptions.headers } });
    const data = await response.json();
    if (!response.ok) {
      if (!silent) setError(data.error ?? "Something went wrong.");
      throw new Error(data.error);
    }
    return data;
  }
  return {
    get: (path: string) => request(path),
    post: (path: string, body: unknown, options: { silent?: boolean } = {}) => request(path, { ...options, method: "POST", body: JSON.stringify(body) })
  };
}

createRoot(document.getElementById("root")!).render(<App />);

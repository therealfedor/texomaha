import express from "express";
import { createServer } from "node:http";
import { join } from "node:path";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { login, publicUser, register, requireUserFromHeader, userFromToken } from "./auth";
import { database, persist } from "./store";
import { clientRoomView, createRoom, findRoom, findRoomByToken, joinRoom, leaveRoom, legalActions, nextHand, playerAction, startRoomGame } from "./rooms";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";

app.use(express.json());

function asyncRoute(handler: express.RequestHandler): express.RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

app.post("/api/auth/register", asyncRoute(async (request, response) => response.json(await register(request.body.email, request.body.username, request.body.password))));
app.post("/api/auth/login", asyncRoute(async (request, response) => response.json(await login(request.body.email, request.body.password))));
app.get("/api/health", (_request, response) => response.json({ ok: true, service: "texomaha", uptime: process.uptime() }));
app.get("/api/me", (request, response) => response.json(publicUser(requireUserFromHeader(request.headers.authorization))));

app.get("/api/lobby", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const friendIds = new Set(database.friendships.flatMap((friendship) => friendship.userA === user.id ? [friendship.userB] : friendship.userB === user.id ? [friendship.userA] : []));
  response.json({
    user: publicUser(user),
    friends: database.users.filter((candidate) => friendIds.has(candidate.id)).map(publicUser),
    incomingRequests: database.friendRequests
      .filter((request) => request.toUserId === user.id && request.status === "pending")
      .map((request) => ({ ...request, fromUser: publicUser(database.users.find((candidate) => candidate.id === request.fromUserId)!) })),
    outgoingRequests: database.friendRequests
      .filter((request) => request.fromUserId === user.id && request.status === "pending")
      .map((request) => ({ ...request, toUser: publicUser(database.users.find((candidate) => candidate.id === request.toUserId)!) })),
    games: database.rooms.filter((room) => room.players.some((player) => player.userId === user.id) && room.status !== "ENDED").map((room) => clientRoomView(room, user.id))
  });
});

app.get("/api/users/search", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const query = String(request.query.q ?? "").trim().toLowerCase();
  response.json(database.users.filter((candidate) => candidate.id !== user.id && candidate.username.toLowerCase().includes(query)).slice(0, 8).map(publicUser));
});

app.post("/api/friends/request", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const toUserId = String(request.body.toUserId);
  if (!database.users.some((candidate) => candidate.id === toUserId)) throw new Error("Player not found.");
  if (database.friendships.some((friendship) => (friendship.userA === user.id && friendship.userB === toUserId) || (friendship.userB === user.id && friendship.userA === toUserId))) throw new Error("You are already friends.");
  if (database.friendRequests.some((candidate) => candidate.fromUserId === user.id && candidate.toUserId === toUserId && candidate.status === "pending")) throw new Error("Friend request already sent.");
  database.friendRequests.push({ id: uuid(), fromUserId: user.id, toUserId, status: "pending", createdAt: Date.now() });
  persist();
  response.json({ ok: true });
});

app.post("/api/friends/respond", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const friendRequest = database.friendRequests.find((candidate) => candidate.id === request.body.requestId && candidate.toUserId === user.id);
  if (!friendRequest) throw new Error("Friend request not found.");
  friendRequest.status = request.body.accept ? "accepted" : "declined";
  if (friendRequest.status === "accepted" && !database.friendships.some((friendship) => friendship.userA === friendRequest.fromUserId && friendship.userB === friendRequest.toUserId)) {
    database.friendships.push({ userA: friendRequest.fromUserId, userB: friendRequest.toUserId, createdAt: Date.now() });
  }
  persist();
  response.json({ ok: true });
});

app.post("/api/friends/remove", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const friendId = String(request.body.friendId);
  database.friendships = database.friendships.filter((friendship) => !((friendship.userA === user.id && friendship.userB === friendId) || (friendship.userB === user.id && friendship.userA === friendId)));
  persist();
  response.json({ ok: true });
});

app.post("/api/rooms", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const room = createRoom(user, request.body);
  response.json(clientRoomView(room, user.id));
});

app.get("/api/join/:token", (request, response) => {
  const user = request.headers.authorization ? requireUserFromHeader(request.headers.authorization) : null;
  const room = findRoomByToken(request.params.token);
  if (!room) throw new Error("Invite expired.");
  const host = database.users.find((candidate) => candidate.id === room.hostUserId);
  const isSeated = user ? room.players.some((player) => player.userId === user.id && !player.left) : false;
  response.json({ roomId: room.id, token: room.inviteToken, hostUsername: host?.username ?? "A friend", room: user && isSeated ? clientRoomView(room, user.id) : null });
});

app.post("/api/join/:token", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const room = findRoomByToken(request.params.token);
  if (!room) throw new Error("Invite expired.");
  joinRoom(room, user);
  emitRoom(room.id);
  response.json(clientRoomView(room, user.id));
});

app.post("/api/rooms/:id/start", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const room = mustRoom(request.params.id);
  startRoomGame(room, user);
  emitRoom(room.id);
  response.json(clientRoomView(room, user.id));
});

app.post("/api/rooms/:id/next-hand", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const room = mustRoom(request.params.id);
  nextHand(room, user);
  emitRoom(room.id);
  response.json(clientRoomView(room, user.id));
});

app.post("/api/rooms/:id/action", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const room = mustRoom(request.params.id);
  playerAction(room, user, request.body.type, request.body.amount);
  emitRoom(room.id);
  response.json({ room: clientRoomView(room, user.id), legalActions: legalActions(room, user) });
});

app.post("/api/rooms/:id/leave", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const room = mustRoom(request.params.id);
  leaveRoom(room, user);
  emitRoom(room.id);
  response.json({ ok: true });
});

app.post("/api/rooms/:id/chat", (request, response) => {
  const user = requireUserFromHeader(request.headers.authorization);
  const room = mustRoom(request.params.id);
  const recent = room.chat.filter((message) => message.userId === user.id && Date.now() - message.createdAt < 5000);
  if (recent.length >= 3) throw new Error("Please slow down before sending another message.");
  const message = String(request.body.message ?? "").trim().slice(0, 240);
  if (!message) throw new Error("Message cannot be empty.");
  room.chat.push({ id: uuid(), roomId: room.id, userId: user.id, username: user.username, message, createdAt: Date.now() });
  persist();
  emitRoom(room.id);
  response.json({ room: clientRoomView(room, user.id) });
});

io.use((socket, next) => {
  const user = userFromToken(String(socket.handshake.auth.token ?? ""));
  if (!user) return next(new Error("Authentication required."));
  socket.data.user = user;
  next();
});

io.on("connection", (socket) => {
  const user = socket.data.user as ReturnType<typeof userFromToken>;
  if (!user) return;
  user.status = "online";
  persist();
  socket.on("room:watch", (roomId: string) => {
    const room = findRoom(roomId);
    if (!room || !room.players.some((player) => player.userId === user.id)) return;
    socket.join(roomId);
    const player = room.players.find((candidate) => candidate.userId === user.id);
    if (player) player.connected = true;
    user.status = "in_game";
    persist();
    socket.emit("room:update", clientRoomView(room, user.id));
    emitRoom(roomId);
  });
  socket.on("disconnect", () => {
    database.rooms.forEach((room) => {
      const player = room.players.find((candidate) => candidate.userId === user.id);
      if (player) player.connected = false;
    });
    user.status = database.rooms.some((room) => room.players.some((player) => player.userId === user.id && !player.left && room.status !== "ENDED")) ? "in_game" : "offline";
    persist();
  });
});

function mustRoom(id: string) {
  const room = findRoom(id);
  if (!room) throw new Error("Game not found.");
  return room;
}

function emitRoom(roomId: string): void {
  const room = findRoom(roomId);
  if (!room) return;
  for (const socket of io.sockets.adapter.rooms.get(roomId) ?? []) {
    const client = io.sockets.sockets.get(socket);
    const user = client?.data.user as ReturnType<typeof userFromToken>;
    if (client && user) client.emit("room:update", clientRoomView(room, user.id));
  }
}

app.use(express.static(join(process.cwd(), "dist", "client")));
app.get(/.*/, (_request, response) => response.sendFile(join(process.cwd(), "dist", "client", "index.html")));
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ error: error.message }));

server.listen(port, host, () => console.log(`Texomaha server listening on http://${host}:${port}`));

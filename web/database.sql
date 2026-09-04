create table profiles (
  id uuid primary key,
  email text unique not null,
  username text unique not null,
  avatar text not null,
  status text not null check (status in ('online', 'offline', 'in_game')),
  created_at timestamptz default now()
);

create table friend_requests (
  id uuid primary key,
  from_user_id uuid references profiles(id) not null,
  to_user_id uuid references profiles(id) not null,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique (from_user_id, to_user_id)
);

create table friendships (
  user_a uuid references profiles(id) not null,
  user_b uuid references profiles(id) not null,
  created_at timestamptz default now(),
  primary key (user_a, user_b)
);

create table game_rooms (
  id uuid primary key,
  invite_token text unique not null,
  host_user_id uuid references profiles(id) not null,
  status text not null,
  settings jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table game_players (
  room_id uuid references game_rooms(id) not null,
  user_id uuid references profiles(id) not null,
  seat int not null,
  stack int not null,
  state jsonb not null,
  primary key (room_id, user_id)
);

create table game_hands (
  id uuid primary key,
  room_id uuid references game_rooms(id) not null,
  hand_number int not null,
  authoritative_state jsonb not null,
  created_at timestamptz default now()
);

create table game_actions (
  id uuid primary key,
  room_id uuid references game_rooms(id) not null,
  user_id uuid references profiles(id) not null,
  hand_number int not null,
  action_type text not null,
  amount int,
  created_at timestamptz default now()
);

create index idx_friend_requests_to_user on friend_requests(to_user_id, status);
create index idx_game_players_user on game_players(user_id);
create index idx_game_actions_room_hand on game_actions(room_id, hand_number, created_at);

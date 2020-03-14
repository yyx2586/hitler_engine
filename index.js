var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var welcome_message = 'Type in your name';

var new_deck = Array(17).fill('F').concat(Array(6).fill('L'));
var id_list_map = {
  5: ['h', 'f', 'l', 'l', 'l'],
  6: ['h', 'f', 'l', 'l', 'l', 'l'],
  7: ['h', 'f', 'f', 'l', 'l', 'l', 'l'],
  8: ['h', 'f', 'f', 'l', 'l', 'l', 'l', 'l'],
  9: ['h', 'f', 'f', 'f', 'l', 'l', 'l', 'l', 'l'],
}
var full_names = {
  'h': 'Hitler',
  'l': 'Liberty Party Member',
  'f': 'Fascist Party Member',
}


var existing_players = {};
var existing_players_ls = [];
var president_index = 0;
var chancellor_index = 0;
var dead_person = new Set();
var game_started = false;
var game_state = '';
var voted_lib = 0;
var voted_fascist = 0;
var hitler_index = 0;
var y_count = [];
var n_count = [];
var deck = [];
var president_draw = [];

function initiate_game() {
  Object.keys(io.sockets.sockets).forEach(function (s) {
    io.sockets.sockets[s].disconnect(true);
  });
  game_started = false;
  game_state = '';
  voted_lib = 0;
  voted_fascist = 0;
  existing_players = {};
  existing_players_ls = [];
  president_draw = [];
  president_index = 0;
  chancellor_index = 0;
  y_count = [];
  n_count = [];
  hitler_index = 0;
  dead_person = new Set();
  deck = [];
}

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

function new_user_feedback(socket) {
  console.log('user feedback: ' + socket.player);
  socket.emit('feedback', 'Your name is: ' + socket.player);
  io.emit('announcement', 'Current players: ' + JSON.stringify(existing_players_ls));
  io.emit('announcement', 'If everyone is here, type \"start\" to begin. Min players: 5.');
}

function process_pre_assigned_socket_state(socket, action, msg) {
  console.log('user feedback: ' + msg + ' todo: ' + action);
  switch (action) {
    case 'name_input':
      if (msg in existing_players) {
        socket.state = 'pending_player_exist_question';
        socket.emit('feedback', 'Player exists, replace? (y/n)');
        socket.temp_info = msg;
      }
      else {
        socket.player = msg;
        socket.state = 'player_assigned';
        existing_players[msg] = { 'state': 'waiting_to_begin', 'socket': socket };
        existing_players_ls.push(msg);
        new_user_feedback(socket);
      }
      break;
    case 'replace_player':
      if ((msg == 'yes') || (msg == 'y')) {
        socket.state = 'player_assigned';
        existing_players[socket.temp_info]['socket'] = socket;
        socket.player = socket.temp_info;
        new_user_feedback(socket);
      }
      else {
        socket.emit('welcome_message', welcome_message);
        socket.state = 'initial_state';
      }
      break;
  }
  return;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function assign_party_id() {
  console.log('Assigning party ids.');
  id_list = id_list_map[existing_players_ls.length];
  shuffleArray(id_list);
  var ct = 0;
  Object.keys(io.sockets.sockets).forEach(function (s) {
    if (io.sockets.sockets[s].player) {
      io.sockets.sockets[s].emit('feedback', 'Your identity is: ' + full_names[id_list[ct]]);
      existing_players[io.sockets.sockets[s].player]['state'] = id_list[ct];
      if (id_list[ct] == 'h') {
        hitler_index = ct;
      }
      ct++;
    }
  });
}

function draw_3_cards() {
  console.log('Draw 3 cards:');
  if (deck.length <= 3) {
    deck = new_deck.slice(0);
    shuffleArray(deck);
  }
  for (var i = 0; i < 3; i++) {
    president_draw.push(deck.pop());
  }
  return;
}

function peak_3_cards(socket) {
  console.log('Peak 3 cards:');
  if (deck.length <= 3) {
    deck = new_deck.slice(0);
    deck = shuffleArray(deck);
  }
  for (var i = 0; i < 3; i++) {
    socket.emit('feedback', 'Three cards are:' + JSON.stringify(deck.slice(0, 3)));
  }
  return;
}

function broadcast_game_progress() {
  io.emit('announcement', 'Current Fascist Vote: ' + voted_fascist);
  io.emit('announcement', 'Current Liberal Vote: ' + voted_lib);
  io.emit('announcement', 'Current President: ' + existing_players_ls[president_index]);
  io.emit('announcement', 'Current Chancellor: ' + existing_players_ls[chancellor_index]);
  io.emit('announcement', 'Player in order: ' + JSON.stringify(existing_players_ls));
}

function next_president() {
  if (president_index == existing_players_ls.length - 1) {
    president_index = 0;
    return;
  }
  president_index++;
  return;
}
function update_next_president() {
  next_president();
  while (existing_players_ls[president_index] in dead_person) {
    next_president();
  }
  return;
}

function switch_to_new_president() {
  io.emit('announcement', 'Next president ' + existing_players_ls[president_index] + ' please nominate your chancellor');
  game_state = 'nomination';
}

function reset_vote(){
  n_count = [];
  y_count = [];
}
function process_post_assigned_socket_state(socket, action, msg) {
  switch (action) {
    case 'start_game':
      game_started = true;
      assign_party_id();
      io.emit('announcement', 'Game has begun, first president: ' + existing_players_ls[president_index]);
      existing_players[existing_players_ls[president_index]]['socket'].emit('feedback', 'Please choose your chancellor: ');
      game_state = 'nomination';
      break;
    case 'nomination':
      if (!socket.player) {
        socket.emit('feedback', 'You do not belong to this game.');
        return;
      }
      else if (socket.player != existing_players_ls[president_index]) {
        socket.emit('feedback', 'Not your turn.');
        return;
      }
      else if (!(msg in existing_players) || msg in dead_person) {
        socket.emit('feedback', 'Player does not exist, check your spelling.');
        return;
      }
      chancellor_index = existing_players_ls.indexOf(msg);
      io.emit('announcement', existing_players_ls[president_index] + ' nominated ' + msg + ' as chancellor, vote (y/n)');
      game_state = 'election';
      break;
    case 'election':
      if (!socket.player) {
        socket.emit('feedback', 'You do not belong to this game.');
        return;
      }
      else if (!(msg == 'y' || msg == 'n')) {
        socket.emit('feedback', 'Invalide vote. Please type in \"y\" or \"n\"');
        return;
      }
      else if (msg == 'y') {
        y_count.push(socket.player);
        socket.emit('feedback', 'You have voted Ja!');
      }
      else if (msg == 'n') {
        n_count.push(socket.player);
        socket.emit('feedback', 'You have voted Nein!');
      }
      if (y_count.length >= existing_players_ls.length / 2) {
        game_state = 'president_drop_card';
        io.emit('announcement', 'Election ended. Yes: ' + JSON.stringify(y_count) + ' , No: ', JSON.stringify(n_count));
        io.emit('announcement', 'Congratulations Chancellor ' + existing_players_ls[chancellor_index] + '!');
        reset_vote();
        draw_3_cards();
        existing_players[existing_players_ls[president_index]]['socket'].emit('feedback', 'Your policies are:' + JSON.stringify(president_draw));
        existing_players[existing_players_ls[president_index]]['socket'].emit('feedback', 'Please type in the policy you want to drop.');
      }
      else if (n_count.length > existing_players_ls.length / 2) {
        io.emit('announcement', 'Election ended. Yes: ' + JSON.stringify(y_count) + ' , No: ', JSON.stringify(n_count));
        io.emit('announcement', 'Nomination rejected for ' + existing_players_ls[chancellor_index] + '. Moving on.');
        reset_vote();
        update_next_president();
        switch_to_new_president();
      }
      break;
    case 'drop':
      if (!socket.player) {
        socket.emit('feedback', 'You do not belong to this game.');
        return;
      }
      else if (socket.player != existing_players_ls[president_index]) {
        socket.emit('feedback', 'Not your turn.');
        return;
      }
      else if (!(president_draw.includes(msg))) {
        socket.emit('feedback', 'Selection does not exist, check your spelling (F/L)');
        return;
      }
      
      president_draw.splice(president_draw.indexOf(msg), 1);
      io.emit('announcement', 'President dropped one. Now passed by to Chacelor.');
      existing_players[existing_players_ls[chancellor_index]]['socket'].emit('feedback', 'President gave you: ' + JSON.stringify(president_draw) + ', select one for the people.');
      game_state = 'chancellor_select_policy';
      break;
    case 'chancellor_select':
      if (!socket.player) {
        socket.emit('feedback', 'You do not belong to this game.');
        return;
      }
      else if (socket.player != existing_players_ls[chancellor_index]) {
        socket.emit('feedback', 'Not your turn.');
        return;
      }
      else if (!(president_draw.includes(msg))){
        console.log('selection: '+ msg);
        socket.emit('feedback', 'Selection does not exist, check your spelling (F/L)');
        return;
      }
      else if (msg == 'F') {
        voted_fascist++;
      }
      else if (msg == 'L') {
        voted_lib++;
      }
      president_draw = [];
      broadcast_game_progress();
      if ((voted_fascist == 1 && (existing_players_ls.length == 5 || existing_players_ls.length == 6)) || (voted_fascist == 2 && (existing_players_ls.length >= 5 && existing_players_ls.length <= 8))) {
        io.emit('announcement', 'President check a party ID card: (type in player name)');
        game_state = 'check_id'
        break;
      }
      else if (voted_fascist == 3 && (existing_players_ls.length >= 5 && existing_players_ls.length <= 8)) {
        io.emit('announcement', 'Third Fascist Policy: President appoint next president: (type in player name)');
        game_state = 'appoint_next_president'
        break;
      }
      else if (voted_fascist == 3 && (existing_players_ls.length == 9 && existing_players_ls.length == 10)) {
        io.emit('announcement', 'Third Fascist Policy: President can check three cards.');
        peak_3_cards(existing_players[existing_players_ls[president_index]]['socket']);
        update_next_president();
        switch_to_new_president();
        game_state = 'nomination';
        break;
      }
      else if (voted_fascist == 4 || voted_fascist == 5) {
        io.emit('announcement', 'Forth Fascist Policy: President kill one person for the greater good.');
        game_state = 'kill'
        break;
      }
      else {
        update_next_president();
        switch_to_new_president();
      }

      break;
    case 'president_check_id':
      console.log('check id');
      if (!socket.player) {
        socket.emit('feedback', 'You do not belong to this game.');
        return;
      }
      else if (socket.player != existing_players_ls[president_index]) {
        socket.emit('feedback', 'Not your turn.');
        return;
      }
      else if (!(msg in existing_players) || msg in dead_person) {
        socket.emit('feedback', 'Selection does not exist, check your spelling');
        socket.emit('feedback', 'User list: ' + JSON.stringify(existing_players_ls));
        return;
      }
      else {
        socket.emit('feedback', 'Player ' + msg + ' has the identity of ' + full_names[existing_players[msg]['state']]);
        io.emit('announcement', 'President ' + socket.player + ' finished checking.')
        update_next_president();
        switch_to_new_president();
      }
      break;
    case 'president_appoint_next_president':
      if (!socket.player) {
        socket.emit('feedback', 'You do not belong to this game.');
        return;
      }
      else if (socket.player != existing_players_ls[president_index]) {
        socket.emit('feedback', 'Not your turn.');
        return;
      }
      else if (!(msg in existing_players) || msg in dead_person) {
        socket.emit('feedback', 'Selection does not exist, check your spelling');
        socket.emit('feedback', 'User list: ' + JSON.stringify(existing_players_ls));
        return;
      }
      else {
        io.emit('announcement', 'President has selected ' + msg + ' as new president.');
        president_index = existing_players_ls.indexOf('msg');
        switch_to_new_president();
      }
      break;
    case 'president_kill':
      if (!socket.player) {
        socket.emit('feedback', 'You do not belong to this game.');
        return;
      }
      else if (socket.player != existing_players_ls[president_index]) {
        socket.emit('feedback', 'Not your turn.');
        return;
      }
      else if (!(msg in existing_players) || msg in dead_person) {
        socket.emit('feedback', 'Selection does not exist, check your spelling');
        socket.emit('feedback', 'User list: ' + JSON.stringify(existing_players_ls));
        return;
      }
      else {
        io.emit('announcement', 'Sorry ' + msg + ', you are no longer with us. You will be remembered.');
        dead_person.add(msg);
        update_next_president();
        switch_to_new_president();
      }
      break;
  }
  return;
}

io.on('connection', function (socket) {
  console.log('a user connected');
  if (game_started) {
    socket.emit('welcome_message', 'Game already started. You are watching.');
  }
  else {
    socket.emit('feedback', welcome_message);
    socket.state = 'initial_state';
  }
  socket.on('user_input', function (msg) {
    console.log('user feedback: ' + msg + ' user state: ' + socket.state);
    if (socket.state) {
      switch (socket.state) {
        case 'initial_state':
          process_pre_assigned_socket_state(socket, 'name_input', msg);
          break;
        case 'pending_player_exist_question':
          process_pre_assigned_socket_state(socket, 'replace_player', msg);
          break;
        case 'player_assigned':
          if (msg == 'start' && (game_started == false)) {
            if (existing_players_ls.length < 5) {
              io.emit('announcement', 'Too few players. Please wait for more.');
            }
            else if (existing_players_ls.length > 9) {
              io.emit('announcement', 'Too many people, game restarting. Please refresh.');
            }
            else {
              process_post_assigned_socket_state(null, 'start_game', '');
            }
          }
          else if (msg == 'end') {
            io.emit('announcement', 'Restarting game engine, please refresh.');
            initiate_game();
          }
          else if (msg == 'cheat') {
            console.log(JSON.stringify(existing_players));
            socket.emit('feedback', JSON.stringify(existing_players));
          }
          else {
            if (game_state == 'nomination') {
              process_post_assigned_socket_state(socket, 'nomination', msg);
            }
            else if (game_state == 'election') {
              process_post_assigned_socket_state(socket, 'election', msg);
            }
            else if (game_state == 'president_drop_card') {
              process_post_assigned_socket_state(socket, 'drop', msg);
            }
            else if (game_state == 'chancellor_select_policy') {
              process_post_assigned_socket_state(socket, 'chancellor_select', msg);
            }
            else if (game_state == 'check_id') {
              process_post_assigned_socket_state(socket, 'president_check_id', msg);
            }
            else if (game_state == 'appoint_next_president') {
              process_post_assigned_socket_state(socket, 'president_appoint_next_president', msg);
            }
            else if (game_state == 'kill') {
              process_post_assigned_socket_state(socket, 'president_kill', msg);
            }
            else if (game_state == 'examine_top_three_cards') {
              process_post_assigned_socket_state(socket, 'examine_top_three_cards', msg);
            }
          }
          break;
      }
    }
  });
  socket.on('disconnect', function () {
    console.log('user disconnected');
  });
  socket.on('chat message', function (msg) {
    console.log('message: ' + msg);
    io.emit('chat message', msg + " modified");
  });
});

http.listen(3000, function () {
  console.log('listening on *:3000');
});
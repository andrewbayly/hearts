        
const express = require("express")
const app = express();      
var _http = require("http"); 
const path = require('path');

var http = _http.createServer(app);
var io = require("socket.io")(http, {
  pingInterval: 5000000,
  pingTimeout: 5000000
});

//var names = {};
var table = {};
table.players = [];
initTable();

//
var TRICKS_PER_HAND = 13;
var DEALS_PER_GAME = 4;
var SHOOT_THE_MOON = 139;

// Serve static files from the 'assets' directory:
app.use('/assets', express.static(path.join(__dirname, 'assets')));

//app.get("/cards/*", function(req, res) {
//  res.sendFile(__dirname + req.url);
//});

app.get("/", (req, res) => {
  //console.log("" + new Date() + " sending index.html");
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", socket => {
  console.log("a user connected: " + socket.id);
  
  //try to get the name from the client
  //io.to(socket.id).emit("getname");
  
  socket.on("disconnect", reason => {
    console.log("user disconnected: " + socket.id);
    console.log(reason);
  });

  socket.on("chat message", msg => {
    if (msg.startsWith("{")) {
      exec(socket, msg);
    } else {
      console.log("message: " + msg);
      var name = getName(socket);
      if (name !== "") {
        msg = name + ": " + msg;
      }
      io.emit("chat message", msg);
    }
  });
});

function exec(socket, msg) {
  var data = null;
  try {
    data = JSON.parse(msg);
  } catch (e) {
    console.log(e);
    return;
  }
  var method = data.method;
  if (method in fn) {
    fn[method](socket, data);
  }
}

//{"method" : "deal" }
//
//{"method" : "name", "name" : "andrew" }

var ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
var rankStr = ranks.join("");
var suits = ["H", "C", "D", "S"];
var suitStr = suits.join("");

function compareCards(a, b) {
  var aR = rankStr.indexOf(a.substr(0, 1));
  var bR = rankStr.indexOf(b.substr(0, 1));
  var aS = suitStr.indexOf(a.substr(1, 1));
  var bS = suitStr.indexOf(b.substr(1, 1));

  if (aS === bS) {
    return aR - bR;
  } else {
    return aS - bS;
  }
}

var cardScores = {
  "2H": 2,
  "3H": 3,
  "4H": 4,
  "5H": 5,
  "6H": 6,
  "7H": 7,
  "8H": 8,
  "9H": 9,
  TH: 10,
  JH: 10,
  QH: 10,
  KH: 10,
  AH: 15,
  QS: 40
};

/**
 report the current state back to the clients
 */
function report() {
  //check that players are all seated
  if (table.players.length < 4) return;

  //console.log("report:");
  //console.log(table);

  //send update to players:
  for (var p = 0; p < 4; p++) {
    var data = {};
    data.player = p;
    data.players = table.players;
    data.plays = table.plays;
    data.hand = table.hands[p];
    data.leader = table.leader; 
    data.shuffle = table.shuffle; 

    data.passed = [[], [], [], []];
    for (var p1 = 0; p1 < 4; p1++) {
      for (var i = 0; i < table.passed[p1].length; i++) {
        data.passed[p1].push(
          p === p1 && table.hands[p].length <= 10
            ? table.passed[p1][i]
            : "back"
        );
      }
    }

    socketId = table.players[p].id;
    io.to(socketId).emit("update", data);

    //console.log("update:");
    //console.log(data);
  }

  // hidden from players for now...
  //console.log("tricks = ");
  //console.log(table.tricks);
}

function getPlayer(socket) {
  var p = null;
  for (var i = 0; i < table.players.length; i++) {
    if (table.players[i].id === socket.id) {
      p = i;
      break;
    }
  }
  return p;
}

function getName(socket) {
  var p = getPlayer(socket);
  if (p === null) return "";
  else return table.players[p].name;
}

var fn = {
  name: function(socket, data) {
    //console.log("calling name...");
    //console.log(data);
    if ("name" in data) {
      var bFound = false;
      for (var i = 0; i < table.players.length; i++) {
        if (table.players[i].name === data.name) {
          bFound = true;
          table.players[i].id = socket.id;
        }
      }

      if (!bFound) {
        table.players.push({ id: socket.id, name: data.name });
      }

      var people = [];
      for (var i = 0; i < table.players.length; i++) {
        people.push(table.players[i].name);
      }

      io.emit("chat message", "HeartsBot: who's here: " + people.join(", "));

      report();
    }
    console.log("table.players:");
    console.log(table.players);
  },
  shootTheMoon : function(socket, data){ 
    var player = getPlayer(socket); 
    
    console.log(data.option); 
    console.log(player); 
    
    if(data.option == 'zero'){ 
      table.totalScores[player] = 0; 
    }
    else{
      for(var p = 0; p < 4; p++) {
        if(p != player){ 
          table.totalScores[p] *= 2;
        }
      }
    }
    
    printTotalScores(); 
    
  }, 
  untake: function(socket, data) {
    if (!("players" in table)) {
      console.log("error - can't untake trick yet");
      return;
    }

    if (!("tricks" in table)) {
      console.log("error - can't untake trick yet");
      return;
    }

    //check that there are no cards on the table: 
    var count = 0; 
    table.plays.forEach(play => count += play.length); 
    if(count != 0)
      return; 
    
    //deal 4 cards from your taken pile back onto the table: 
    var p = getPlayer(socket);
    
    //check that player has at least one trick
    if(table.tricks[p].length < 4)
      return; 
    
    for (var i = 3; i >= 0; i--) {
      var card = table.tricks[p].pop();
      table.plays[i].push(card);
    }
    
    var msg = "HeartsBot: " + table.players[p].name + " un-took a trick." ; 
    io.emit("chat message", msg); 
    
    table.trickCount--;
    table.leader = -1 ;
    report();
  },   
  take: function(socket, data) {
    if (!("players" in table)) {
      console.log("error - can't take trick yet");
      return;
    }

    if (!("tricks" in table)) {
      console.log("error - can't take trick yet");
      return;
    }
    
    var count = 0; 
    table.plays.forEach(play => count += play.length); 
    if(count != 4)
      return; 
    
    var p = getPlayer(socket);
    for (var i = 0; i < 4; i++) {
      var card = table.plays[i].pop();
      table.tricks[p].push(card);
    }
    
    var msg = "HeartsBot: " + table.players[p].name + " took a trick." ; 
    io.emit("chat message", msg); 
    
    table.trickCount++;
    table.leader = -1 ;
    report();

    if (table.trickCount === TRICKS_PER_HAND) {
      table.trickCount = 0;

      //calculate score && report
      //note: in this prototype,
      //we only play one game... then report the scores
      table.scores = [];
      for(var p = 0; p < 4; p++) {
        var score = 0;
        for(var j = 0; j < table.tricks[p].length; j++) {
          var card = table.tricks[p][j];
          if (card in cardScores) score += cardScores[card];
        }
        table.scores.push(score);
      }
      //reset tricks
      table.tricks = [[], [], [], []];

      var scoresMsg = "HeartsBot: Scores: ";
      for(var p = 0; p < 4; p++) {
        var name = table.players[p].name;
        scoresMsg += name + ": ";
        scoresMsg += table.scores[p] + " ";
      }

      io.emit("chat message", scoresMsg);

      //calculate and display total scores:
      var playerShootTheMoon = -1; 
      for(var p = 0; p < 4; p++) {
        if (table.scores[p] === SHOOT_THE_MOON) {
          playerShootTheMoon = p; 
        }
      }  
      
      if(playerShootTheMoon == -1){ 
        for(var p = 0; p < 4; p++) {
          table.totalScores[p] += table.scores[p];
        }
        printTotalScores(); 
      }
      else {
        io.to(table.players[playerShootTheMoon].id).emit("shoot the moon");
      }
  
    }
  },
  play: function(socket, data) {
    //console.log(table);
    var p = getPlayer(socket);
    console.log("player: " + p);
    
    if(p === null){ 
      console.log('player is null'); 
      return; 
    }

    //now find the card and move it into play
    var pos = null;
    for (var i = 0; i < table.hands[p].length; i++) {
      if (table.hands[p][i] === data.card) {
        pos = i;
      }
    }
    if (pos === null) {
      console.log("couldn't find card in hand: " + data.card);
      return;
    }

    var card = table.hands[p][pos];
    
    //cannot play a card if one is already in play:
    if(table.plays[p].length == 1){ 
      return; 
    }
        
    table.hands[p].splice(pos, 1);

    if (table.passingTo[p].cards > 0) {
      table.passed[table.passingTo[p].player].push(card);
      table.passingTo[p].cards--;
    } else {
      table.plays[p] = [card];
      
      //check if we are the leader when we play this card: 
      var total = 0; 
      table.plays.forEach(play => total += play.length); 
      if(total == 1){ 
        table.leader = p ; 
      }
      
      if(card.endsWith('H')){ 
        table.heartsPlayed++; 
      
        if(table.heartsPlayed == 1){ 
          io.emit("chat message", "HeartsBot: Hearts have been broken");
        }
      }
    }

    report();
  },
  unplay: function(socket, data) {
    console.log('unplay'); 
    
    var p = getPlayer(socket);
    
    var card = table.plays[p].pop(); 
    
    table.hands[p].push(card);

    table.hands[p] = table.hands[p].sort(compareCards);

    //check if we were the leader: 
    var total = 0; 
    table.plays.forEach(play => total += play.length); 
    if(total == 0){ 
      table.leader = -1 ; 
    }
    
    if(card.endsWith('H')){ 
      table.heartsPlayed--; 
    
      if(table.heartsPlayed == 0){ 
        io.emit("chat message", "HeartsBot: Oops. Hearts haven't been broken!");
      }
    }
    
    report(); 
  }, 
  accept: function(socket, data) {
    console.log("accept");
    var p = getPlayer(socket);

    if(table.passed[p].length != 3)
      return; 
    
    //accept cards into the player's hand:
    while (table.passed[p].length > 0) {
      table.hands[p].push(table.passed[p].pop());
    }

    table.hands[p] = table.hands[p].sort(compareCards);

    report();
  },
  startOver: function(socket, data) {
    io.emit("chat message", "HeartsBot: OK, we're starting over!");
    initTable(); 
    report();
  }, 
  client_keepalive: function(socket, data) {
    //console.log('client keep alive');  
  },  
  deal: function(socket, data) {
    var numPlayers = table.players.length;

    if (numPlayers !== 4) {
      io.emit(
        "chat message",
        "HeartsBot: There are " +
          numPlayers +
          " players. We need 4 before we can deal."
      );
      return;
    }
    
    var count = 0; 
    table.plays.forEach(play => count += play.length); 
    table.hands.forEach(hand => count += hand.length); 
    if(count > 0){
      console.log("Can't deal now. There are " + count + " cards still in play."); 
      return; 
    }
    
    table.deal++;
    
    var passingMsg = [null, "HeartsBot: passing to the left", 
                            "HeartsBot: passing to the right", 
                            "HeartsBot: passing across", 
                            "HeartsBot: no passing" ] ; 
    var pMsg = passingMsg[table.deal]; 
    io.emit("chat message", pMsg); 
    
    //just to make sure - we reset these arrays:
    table.passed = [[], [], [], []];
    table.plays = [[], [], [], []];
    
    table.heartsPlayed = 0; 

    var pack = [];
    for (var i = 0; i < ranks.length; i++) {
      for (var j = 0; j < suits.length; j++) {
        pack.push(ranks[i] + suits[j]);
      }
    }

    pack = shuffle(pack);

    for (var i = 0; i < 4; i++) {
      var hand = [];
      for (var j = 0; j < 13; j++) {
        hand.push(pack.pop());
      }
      table.hands[i] = hand.sort(compareCards);
    }

    if (table.deal <= 3) {
      //setup passingTo:
      var offsets = [null, 1, 3, 2];
      var offset = offsets[table.deal];

      for (var p = 0; p < 4; p++) {
        table.passingTo[p].player = (p + offset) % 4;
        table.passingTo[p].cards = 3;
      }
    }

    //toggle shuffle for the duration of the next report:
    table.shuffle = true ; 

    //console.log(table);
    report();
    table.shuffle = false ; 

    function shuffle(arr) {
      var ret = [];
      while (arr.length > 0) {
        var i = Math.floor(Math.random() * arr.length);
        ret.push(arr[i]);
        arr.splice(i, 1);
      }
      return ret;
    }
  }
};

function printTotalScores(){
  
  var totalScores = [];
  
  for (var p = 0; p < 4; p++) {
    totalScores.push({name: table.players[p].name, score: table.totalScores[p]})
  }

  var totalScoresMsg = "HeartsBot: Total Scores: " + 
    totalScores
      .sort((a, b)=>(b.score - a.score))
      .map( x => x.name + ': ' + x.score )
      .join(' ')

  io.emit("chat message", totalScoresMsg);

  /**
   TODO: Min calculation should allow for 
   ties, showing WInners are: foo, bar
   */

  if (table.deal === DEALS_PER_GAME) {
    var min = table.totalScores[0];
    for (var p = 0; p < 4; p++) {
      if (table.totalScores[p] < min) {
        min = table.totalScores[p];
      }
    }
    var winnerP = [];
    for (var p = 0; p < 4; p++) {
      if (table.totalScores[p] === min) {
        winnerP.push(p);
      }
    }

    var names = [];
    for (var i = 0; i < winnerP.length; i++) {
      names.push(table.players[winnerP[i]].name);
    }

    var msg =
      (names.length === 1
        ? "HeartsBot: The Winner is: "
        : "HeartsBot: The Winners are: ") + names.join(", ");

    io.emit("chat message", msg);

    table.deal = 0;
    table.totalScores = [0, 0, 0, 0];
  }
}


function initTable() {
  table.deal = 0; //number of deals
  
  table.shuffle = false ; 
  
  table.leader = -1 ; 
  
  table.heartsPlayed = 0; 

  table.passingTo = [];
  for (var i = 0; i < 4; i++) {
    table.passingTo.push({ player: 0, cards: 0 });
  }

  table.passed = [[], [], [], []];

  table.totalScores = [0, 0, 0, 0];
  table.plays = [[], [], [], []];
  table.hands = [[], [], [], []];
  table.tricks = [[], [], [], []];

  table.trickCount = 0;
}

http.listen(process.env.PORT, () => {  
  console.log("listening on *:" + process.env.PORT);
});

setInterval(() => {
  console.log('server keep alive'); 
  _http.get(`http://${process.env.PROJECT_DOMAIN}.glitch.me/`);
}, 60000);

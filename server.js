const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.js') {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Game State
let players = {};
let ball = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0.05, y: 0.05, z: 0 }
};

// Ball Reset Function
function resetBall() {
  ball.position = { x: 0, y: 0, z: 0 };
  // Randomize initial direction
  ball.velocity = {
    x: Math.random() > 0.5 ? 0.05 : -0.05,
    y: (Math.random() * 0.1) - 0.05,
    z: 0
  };
  io.emit('ballUpdate', ball);
}

// Handle Connections
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  console.log('Current number of players:', Object.keys(players).length);
  
  // Assign Player to Paddle1 or Paddle2
  if (Object.keys(players).length < 2) {
    players[socket.id] = {
      paddle: Object.keys(players).length === 0 ? 'paddle1' : 'paddle2',
      position: 0,
      score: 0,
      velocity: 0 // Added velocity property for advanced physics
    };
    console.log(`Assigned ${socket.id} to ${players[socket.id].paddle}`);
    socket.emit('init', { 
      paddle: players[socket.id].paddle,
      opponent: Object.keys(players).length === 1 ? 'waiting' : 'ready'
    });
    if (Object.keys(players).length === 2) {
      console.log('Two players connected. Starting game.');
      io.emit('startGame');
    }
  } else {
    console.log('Game full. Rejecting connection:', socket.id);
    socket.emit('full');
    return;
  }

  // Handle Paddle Movement
  socket.on('paddleMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].position = data.y;
      players[socket.id].velocity = data.velocity; // Update paddle velocity
      io.emit('paddleUpdate', { 
        paddle: players[socket.id].paddle, 
        y: data.y 
      });
    }
  });

  // Handle Catch Ball
  socket.on('catchBall', (data) => {
    const player = players[socket.id];
    if (player) {
      const paddleX = player.paddle === 'paddle1' ? -10 : 10;
      const distanceX = Math.abs(ball.position.x - paddleX);
      const distanceY = Math.abs(ball.position.y - player.position);
      
      // Check if ball is within paddle's hit zone
      if (distanceX < 1 && distanceY < 4) { // Increased Y range for better hit detection
        // Calculate collision normal based on paddle position
        const collisionNormal = player.paddle === 'paddle1' ? 1 : -1;

        // Advanced Physics: Modify ball velocity based on paddle movement
        ball.velocity.x = collisionNormal * Math.abs(ball.velocity.x) * 1.2; // Reverse and slightly increase speed

        // Apply additional velocity based on paddle's movement
        if (data.swinging) {
          ball.velocity.x *= 1.5; // Further increase speed for swinging hit
          ball.velocity.y += player.velocity * 0.2; // Greater influence from paddle movement
        } else {
          ball.velocity.y += player.velocity * 0.1; // Regular influence
        }

        // Limit the maximum speed of the ball to prevent it from going too fast
        const maxSpeed = 0.2;
        ball.velocity.x = Math.max(-maxSpeed, Math.min(maxSpeed, ball.velocity.x));
        ball.velocity.y = Math.max(-maxSpeed, Math.min(maxSpeed, ball.velocity.y));

        io.emit('ballUpdate', ball);
        io.emit('superAttack'); // Trigger any visual effects if needed
      }
    }
  });

  // Handle Super Attack
  socket.on('superAttack', (keySequence) => {
    const validSequences = getValidSequences();
    const sequence = keySequence.join('');
    if (validSequences.includes(sequence)) {
      // Super Attack Effect: Drastically increase ball speed
      ball.velocity.x *= 2;
      ball.velocity.y *= 2;
      // Limit the maximum speed after super attack
      const maxSpeed = 0.4;
      ball.velocity.x = Math.max(-maxSpeed, Math.min(maxSpeed, ball.velocity.x));
      ball.velocity.y = Math.max(-maxSpeed, Math.min(maxSpeed, ball.velocity.y));
      io.emit('superAttack');
      console.log(`Super Attack by ${socket.id}: ${sequence}`);
    }
  });

  // Handle Disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (players[socket.id]) {
      delete players[socket.id];
      io.emit('playerDisconnected');
      // Optionally reset the game
      resetBall();
    }
  });
});

// Ball Movement Logic
setInterval(() => {
  // Update ball position
  ball.position.x += ball.velocity.x;
  ball.position.y += ball.velocity.y;
  ball.position.z += ball.velocity.z;

  // Collision with top and bottom walls
  if (ball.position.y > 15 || ball.position.y < -15) {
    ball.velocity.y *= -1;
  }

  // Check for scoring
  if (ball.position.x > 12 || ball.position.x < -12) {
    const scorer = ball.position.x > 0 ? 'paddle1' : 'paddle2';
    if (players) {
      for (let id in players) {
        if (players[id].paddle === scorer) {
          players[id].score += 1;
          io.emit('scoreUpdate', { 
            paddle: players[id].paddle, 
            score: players[id].score 
          });
          break;
        }
      }
    }
    resetBall();
  } else {
    // Emit ball update if not scored
    io.emit('ballUpdate', ball);
  }
}, 16); // Approximately 60 FPS

// Helper Function to Define Valid Super Attack Sequences
function getValidSequences() {
  // Define some valid sequences
  return ['asdf', 'jkl;', 'qwer', 'zxcv', 'updown', 'leftright'];
}

server.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  console.log(`Server running on http://${address.address}:${address.port}`);
});
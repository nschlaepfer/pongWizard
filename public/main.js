// Initialize Socket.IO
const socket = io();

// DOM Elements
const statusDiv = document.getElementById('status');
const score1Span = document.getElementById('score1');
const score2Span = document.getElementById('score2');
const swingIndicator = document.getElementById('swingIndicator'); // New Element
const swingSound = new Audio('sounds/swing.wav'); // New Audio Element

// Game Variables
let playerPaddle = null;
let opponentPaddle = null;
let gameStarted = false;

// Three.js Variables
let scene, camera, renderer;
let paddle1, paddle2, ball;
let paddleSpeed = 2;

// Super Attack Variables
let superAttackSequence = [];
let superAttackTimeout = null;

// Add Swing Animation Variables
let isSwinging = false;
const swingDuration = 300; // milliseconds
const swingAngle = Math.PI / 8; // Reduced angle for more realistic swing

// Initialize Three.js Scene
function initThreeJS() {
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 30;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('gameContainer').appendChild(renderer.domElement);

    // Lighting
    const light = new THREE.PointLight(0xffffff, 1, 100);
    light.position.set(0, 20, 30);
    scene.add(light);

    // Paddles
    const paddleGeometry = new THREE.BoxGeometry(2, 6, 2);
    const paddleMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });

    paddle1 = new THREE.Mesh(paddleGeometry, paddleMaterial);
    paddle1.position.x = -10;
    scene.add(paddle1);

    paddle2 = new THREE.Mesh(paddleGeometry, paddleMaterial);
    paddle2.position.x = 10;
    scene.add(paddle2);

    // Ball
    const ballGeometry = new THREE.SphereGeometry(1, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    scene.add(ball);

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize, false);
}

// Handle Window Resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Render Loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Handle Keyboard Input
const keysPressed = {};

// Handle key down
document.addEventListener('keydown', (event) => {
    keysPressed[event.key] = true;
    handleInput();
    handleSuperAttackInput(event);
});

// Handle key up
document.addEventListener('keyup', (event) => {
    keysPressed[event.key] = false;
});

// Handle Input Function
function handleInput() {
    if (!gameStarted || !playerPaddle) return;

    let moved = false;
    let newY = playerPaddle.position.y;

    if (keysPressed['ArrowUp']) {
        newY += paddleSpeed;
        moved = true;
    }
    if (keysPressed['ArrowDown']) {
        newY -= paddleSpeed;
        moved = true;
    }

    // Clamp paddle position
    newY = Math.max(-15, Math.min(15, newY));

    if (moved) {
        playerPaddle.position.y = newY;
        socket.emit('paddleMove', { y: newY, velocity: keysPressed['ArrowUp'] ? paddleSpeed : (-paddleSpeed) });
    }

    // Handle Catch Ball (Swing)
    if ((keysPressed['c'] || keysPressed['C']) && !isSwinging) {
        initiateSwing();
        socket.emit('catchBall', { swinging: true }); // Send swing state
    }
}

// Swing Animation Function
function initiateSwing() {
    if (!playerPaddle) return;
    isSwinging = true;

    // Play Swing Sound
    swingSound.currentTime = 0;
    swingSound.play();

    // Show Swing Indicator
    swingIndicator.style.display = 'flex';
    gsap.to(swingIndicator, {
        opacity: 1,
        duration: 0.1,
        onComplete: () => {
            gsap.to(swingIndicator, {
                opacity: 0,
                duration: 0.3,
                delay: swingDuration / 1000,
                onComplete: () => {
                    swingIndicator.style.display = 'none';
                }
            });
        }
    });

    // Tween the paddle rotation using GSAP for smooth animation
    gsap.to(playerPaddle.rotation, {
        z: swingAngle, // Rotate along Z-axis for bat-like swing
        duration: swingDuration / 1000,
        ease: "power2.out",
        onComplete: () => {
            gsap.to(playerPaddle.rotation, {
                z: 0,
                duration: swingDuration / 1000,
                ease: "power2.in",
                onComplete: () => {
                    isSwinging = false;
                }
            });
        }
    });
}

// Handle Super Attack Input
function handleSuperAttackInput(event) {
    const key = event.key.toLowerCase();
    const validKeys = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';', 'q', 'w', 'e', 'r', 'z', 'x', 'c', 'v', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    if (validKeys.includes(key)) {
        superAttackSequence.push(key);
        if (superAttackSequence.length === 4) {
            socket.emit('superAttack', superAttackSequence);
            superAttackSequence = [];
            if (superAttackTimeout) clearTimeout(superAttackTimeout);
        } else {
            if (superAttackTimeout) clearTimeout(superAttackTimeout);
            superAttackTimeout = setTimeout(() => {
                superAttackSequence = [];
            }, 3000); // 3 seconds to input sequence
        }
    }
}

// Socket.IO Event Handlers

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('init', (data) => {
    console.log('Initialized:', data);
    if (data.paddle === 'paddle1') {
        playerPaddle = paddle1;
        opponentPaddle = paddle2;
    } else if (data.paddle === 'paddle2') {
        playerPaddle = paddle2;
        opponentPaddle = paddle1;
    }
    statusDiv.textContent = data.opponent === 'waiting' ? 'Waiting for another player...' : 'Player connected. Starting game...';
});

socket.on('startGame', () => {
    console.log('Game started');
    statusDiv.style.display = 'none';
    gameStarted = true;
});

socket.on('paddleUpdate', (data) => {
    if (data.paddle === 'paddle1') {
        paddle1.position.y = data.y;
    } else if (data.paddle === 'paddle2') {
        paddle2.position.y = data.y;
    }
});

socket.on('ballUpdate', (data) => {
    if (ball) {
        ball.position.set(data.position.x, data.position.y, data.position.z);
    }
});

socket.on('scoreUpdate', (data) => {
    if (data.paddle === 'paddle1') {
        score1Span.textContent = `Paddle 1: ${data.score}`;
    } else if (data.paddle === 'paddle2') {
        score2Span.textContent = `Paddle 2: ${data.score}`;
    }
});

socket.on('superAttack', () => {
    // Example super attack effect: Change ball color to yellow
    ball.material.color.set(0xffff00);
    setTimeout(() => {
        ball.material.color.set(0xff0000);
    }, 1000);
});

socket.on('playerDisconnected', () => {
    statusDiv.style.display = 'block';
    statusDiv.textContent = 'Player disconnected. Waiting for another player...';
    gameStarted = false;
});

// Initialize Three.js and Start Rendering
initThreeJS();
animate();
import React, { useState, useEffect, useRef, useCallback } from 'react';

type GameState = 'menu' | 'playing' | 'gameover';

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isRed: boolean;
}

export default function EclipseGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem('arcade_eclipse_highscore') || '0', 10));

  // Audio Context refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const droneOscRef = useRef<OscillatorNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // Game state refs for animation loop
  const gameRef = useRef({
    thrusting: false,
    radius: 150,
    angle: 0,
    score: 0,
    multiplier: 1,
    asteroids: [] as Asteroid[],
    lastTime: 0,
    spawnTimer: 0,
  });

  const MIN_RADIUS = 30; // Event horizon
  let MAX_RADIUS = 300; // Will be updated based on screen size

  // --- Audio Setup ---
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55; // Deep bass (A1)

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      filter.Q.value = 5;

      const gain = ctx.createGain();
      gain.gain.value = 0; // start silent

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start();

      droneOscRef.current = osc;
      filterRef.current = filter;
      gainRef.current = gain;
    }

    // Fade in
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    gainRef.current?.gain.setTargetAtTime(0.3, audioCtxRef.current.currentTime, 0.5);
  };

  const stopAudio = () => {
    if (audioCtxRef.current && gainRef.current) {
      gainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
    }
  };

  const playCrashSound = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    // Noise burst
    const bufferSize = ctx.sampleRate * 0.5; // 0.5 seconds
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 1000;
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    
    noise.start();
  };

  // --- Game Controls ---
  const handlePointerDown = useCallback((e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if (gameState === 'playing') {
      gameRef.current.thrusting = true;
    }
  }, [gameState]);

  const handlePointerUp = useCallback((e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if (gameState === 'playing') {
      gameRef.current.thrusting = false;
    }
  }, [gameState]);

  const startGame = () => {
    initAudio();
    const canvas = canvasRef.current;
    if (canvas) {
      MAX_RADIUS = Math.min(canvas.width, canvas.height) / 2 - 40;
    }
    
    gameRef.current = {
      thrusting: false,
      radius: MAX_RADIUS * 0.8,
      angle: 0,
      score: 0,
      multiplier: 1,
      asteroids: [],
      lastTime: performance.now(),
      spawnTimer: 0,
    };
    setScore(0);
    setGameState('playing');
  };

  const gameOver = () => {
    setGameState('gameover');
    stopAudio();
    playCrashSound();
    setHighScore((prev) => {
      const newHighScore = Math.max(prev, Math.floor(gameRef.current.score));
      localStorage.setItem('arcade_eclipse_highscore', newHighScore.toString());
      return newHighScore;
    });
  };

  // --- Game Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      MAX_RADIUS = Math.min(canvas.width, canvas.height) / 2 - 20;
    };
    window.addEventListener('resize', resize);
    resize();

    const loop = (time: number) => {
      animationId = requestAnimationFrame(loop);

      const dt = Math.min((time - gameRef.current.lastTime) / 1000, 0.1); // cap dt at 100ms
      gameRef.current.lastTime = time;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const state = gameRef.current;

      // Draw background (with trails)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (gameState !== 'playing') {
        // Just draw singularity
        ctx.shadowBlur = 30;
        ctx.shadowColor = 'white';
        ctx.fillStyle = 'black';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, MIN_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        return;
      }

      // 1. Update Player Physics
      const thrustPower = 300 * dt;
      const gravity = 150 * dt;

      if (state.thrusting) {
        state.radius += thrustPower;
      } else {
        // Gravity gets stronger the closer you are
        const gravityMultiplier = 1 + (MAX_RADIUS - state.radius) / MAX_RADIUS;
        state.radius -= gravity * gravityMultiplier;
      }

      // Bounds check
      if (state.radius > MAX_RADIUS) state.radius = MAX_RADIUS;
      
      // Calculate angular velocity (Kepler's third law rough approximation: closer = faster)
      const angularVel = 2 / Math.sqrt(Math.max(state.radius, MIN_RADIUS)) * 3;
      state.angle += angularVel * dt;

      // Death by black hole
      if (state.radius <= MIN_RADIUS) {
        gameOver();
        return;
      }

      const playerX = cx + Math.cos(state.angle) * state.radius;
      const playerY = cy + Math.sin(state.angle) * state.radius;

      // 2. Update Audio
      if (filterRef.current && audioCtxRef.current) {
        // Filter opens up as you get closer to singularity (radius approaches MIN_RADIUS)
        const closeness = 1 - ((state.radius - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS)); // 0 to 1
        const targetFreq = 200 + closeness * 2000;
        filterRef.current.frequency.setTargetAtTime(targetFreq, audioCtxRef.current.currentTime, 0.1);
      }

      // 3. Update Score
      // Multiplier increases exponentially the closer you are to the event horizon
      const proximity = 1 - ((state.radius - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS));
      state.multiplier = 1 + Math.pow(proximity * 10, 2);
      state.score += state.multiplier * dt * 10;
      setScore(Math.floor(state.score));

      // 4. Update Asteroids
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        // Spawn intensity increases with score
        state.spawnTimer = Math.max(0.2, 1.5 - (state.score / 10000)); 
        
        const angle = Math.random() * Math.PI * 2;
        const spawnDist = Math.max(canvas.width, canvas.height);
        const x = cx + Math.cos(angle) * spawnDist;
        const y = cy + Math.sin(angle) * spawnDist;
        
        // Target somewhere near the center, but slightly offset
        const targetX = cx + (Math.random() - 0.5) * 200;
        const targetY = cy + (Math.random() - 0.5) * 200;
        
        const dx = targetX - x;
        const dy = targetY - y;
        const mag = Math.sqrt(dx * dx + dy * dy);
        
        const speed = 150 + Math.random() * 200 + (state.score / 100);
        const isRed = Math.random() > 0.8; // 20% chance of fast red anomaly
        
        state.asteroids.push({
          x,
          y,
          vx: (dx / mag) * speed * (isRed ? 1.5 : 1),
          vy: (dy / mag) * speed * (isRed ? 1.5 : 1),
          radius: isRed ? 3 : 8 + Math.random() * 8,
          isRed
        });
      }

      for (let i = state.asteroids.length - 1; i >= 0; i--) {
        const a = state.asteroids[i];
        a.x += a.vx * dt;
        a.y += a.vy * dt;

        // Collision check
        const dist = Math.sqrt((playerX - a.x) ** 2 + (playerY - a.y) ** 2);
        if (dist < a.radius + 5) { // 5 is player ship radius
          gameOver();
          return;
        }

        // Remove if far off screen
        const distFromCenter = Math.sqrt((a.x - cx) ** 2 + (a.y - cy) ** 2);
        if (distFromCenter > Math.max(canvas.width, canvas.height) + 100) {
          state.asteroids.splice(i, 1);
        }
      }

      // 5. Draw Scene
      // Draw Singularity (Event Horizon)
      ctx.shadowBlur = 30 + Math.sin(time / 200) * 10;
      ctx.shadowColor = 'white';
      ctx.fillStyle = 'black';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, MIN_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw maximum safe orbit line (faint)
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.arc(cx, cy, MAX_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw player orbit path (faint)
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + state.multiplier / 200})`;
      ctx.beginPath();
      ctx.arc(cx, cy, state.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw Asteroids
      state.asteroids.forEach(a => {
        ctx.shadowBlur = a.isRed ? 15 : 5;
        ctx.shadowColor = a.isRed ? '#ff3333' : 'white';
        ctx.fillStyle = a.isRed ? '#ff3333' : 'white';
        ctx.beginPath();
        if (a.isRed) {
          // Draw sharp diamond for fast anomalies
          ctx.moveTo(a.x, a.y - a.radius * 2);
          ctx.lineTo(a.x + a.radius, a.y);
          ctx.lineTo(a.x, a.y + a.radius * 2);
          ctx.lineTo(a.x - a.radius, a.y);
        } else {
          ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
        }
        ctx.fill();
      });

      // Draw Player Ship
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00ffff';
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(playerX, playerY, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Engine trail if thrusting
      if (state.thrusting) {
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        // Draw thrust away from center
        const dirOffset = Math.PI; // push outwards
        ctx.arc(
           playerX + Math.cos(state.angle) * 8, 
           playerY + Math.sin(state.angle) * 8, 
           4, 0, Math.PI * 2
        );
        ctx.fill();
      }

      ctx.shadowBlur = 0;
    };

    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [gameState]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, []);

  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden font-sans select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 md:p-8 pointer-events-none flex justify-between items-start">
        {gameState === 'playing' ? (
          <div className="text-white">
            <div className="text-4xl font-light tracking-widest">{score.toLocaleString()}</div>
            <div className="text-xs text-cyan-400 tracking-[0.3em] uppercase mt-2">
              Multi: {gameRef.current.multiplier.toFixed(1)}x
            </div>
          </div>
        ) : (
          <div /> // Placeholder for layout
        )}
      </div>

      {/* Menus */}
      {gameState === 'menu' && (
        <div 
          onClick={startGame}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm p-6 text-center pointer-events-auto cursor-pointer z-20"
        >
          <h1 className="text-6xl md:text-7xl font-thin tracking-[0.4em] text-white mb-8 drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]">ECLIPSE</h1>
          
          <div className="max-w-md border border-white/20 bg-black/50 backdrop-blur-md p-6 rounded-2xl mb-12 shadow-2xl">
            <h2 className="text-white text-sm tracking-widest uppercase mb-4 opacity-80">Mission Briefing</h2>
            <ul className="text-gray-400 text-sm text-left space-y-3">
              <li><strong className="text-white font-normal">Gravity</strong> constantly pulls you into the singularity.</li>
              <li><strong className="text-cyan-400 font-normal">HOLD</strong> anywhere to fire thrusters and widen your orbit.</li>
              <li><strong className="text-white font-normal">RELEASE</strong> to spiral closer to the center.</li>
              <li>Orbiting closer to the center generates a massive <strong className="text-yellow-400 font-normal">Score Multiplier</strong>.</li>
              <li>Dodge the cosmic debris. Do not touch the singularity.</li>
            </ul>
          </div>

          <p className="animate-pulse text-cyan-400 text-xs tracking-[0.3em] uppercase drop-shadow-[0_0_8px_rgba(0,255,255,0.8)]">
            TAP ANYWHERE TO INITIALIZE
          </p>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6 text-center pointer-events-none fade-in">
          <h2 className="text-5xl border-b border-red-500/50 pb-4 font-light tracking-[0.3em] text-white mb-8 drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]">SYSTEM FAILURE</h2>
          
          <div className="flex flex-col gap-2 mb-12">
            <div className="text-gray-400 text-xs tracking-widest uppercase mb-1">Final Score</div>
            <div className="text-5xl text-white font-light tracking-wide">{score.toLocaleString()}</div>
            {highScore > 0 && (
              <div className="text-gray-500 text-xs tracking-widest uppercase mt-4">
                Personal Best: {highScore.toLocaleString()}
              </div>
            )}
          </div>

          <button 
            onClick={startGame}
            className="pointer-events-auto px-10 py-5 border border-white/30 text-white text-sm tracking-[0.3em] uppercase rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            REBOOT SYSTEM
          </button>
        </div>
      )}
    </div>
  );
}

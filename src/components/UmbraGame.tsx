import React, { useEffect, useRef, useState, useCallback } from 'react';

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

interface Monolith {
  id: number;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export default function UmbraGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  
  const stateRef = useRef({
    status: 'START' as GameState,
    score: 0,
    health: 100,
    player: {
      x: window.innerWidth / 2,
      y: window.innerHeight - 150,
      vx: 0,
      vy: 0,
      radius: Math.max(6, Math.min(window.innerWidth, window.innerHeight) * 0.015)
    },
    joystick: {
      active: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0
    },
    monoliths: [] as Monolith[],
    particles: [] as Particle[],
    spawnTimer: 0,
    difficulty: 1,
    monolithIdCounter: 0
  });

  const startGame = useCallback(() => {
    stateRef.current = {
      status: 'PLAYING',
      score: 0,
      health: 100,
      player: {
        x: window.innerWidth / 2,
        y: window.innerHeight - 150,
        vx: 0,
        vy: 0,
        radius: Math.max(6, Math.min(window.innerWidth, window.innerHeight) * 0.015)
      },
      joystick: { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 },
      monoliths: [
        // Initial safe zone
        { id: -1, x: window.innerWidth / 2, y: window.innerHeight - 150, r: 100, vx: 0, vy: 1 },
        // Pre-spawned monoliths so shadows are already falling
        { id: -2, x: window.innerWidth * 0.3, y: -window.innerHeight * 0.2, r: 80, vx: 0.2, vy: 2.5 },
        { id: -3, x: window.innerWidth * 0.7, y: -window.innerHeight * 0.6, r: 90, vx: -0.1, vy: 3 },
      ],
      particles: [],
      spawnTimer: 0,
      difficulty: 1,
      monolithIdCounter: 0
    };
    setScore(0);
    setGameState('PLAYING');
  }, []);

  // Input Handling (Virtual Joystick)
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if (stateRef.current.status !== 'PLAYING') return;
      
      stateRef.current.joystick.active = true;
      stateRef.current.joystick.startX = e.clientX;
      stateRef.current.joystick.startY = e.clientY;
      stateRef.current.joystick.currentX = e.clientX;
      stateRef.current.joystick.currentY = e.clientY;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!stateRef.current.joystick.active) return;
      stateRef.current.joystick.currentX = e.clientX;
      stateRef.current.joystick.currentY = e.clientY;
    };

    const handlePointerUp = () => {
      stateRef.current.joystick.active = false;
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    const preventDefault = (e: Event) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') e.preventDefault();
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('touchmove', preventDefault);
    };
  }, []);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== window.innerWidth * dpr || canvas.height !== window.innerHeight * dpr) {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.scale(dpr, dpr);
      }

      const state = stateRef.current;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Light source is far above the screen
      const lightX = width / 2;
      const lightY = -height;

      // Clear screen (Blinding White)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      if (state.status === 'PLAYING') {
        // --- Physics & Input ---
        if (state.joystick.active) {
          const dx = state.joystick.currentX - state.joystick.startX;
          const dy = state.joystick.currentY - state.joystick.startY;
          
          // Apply force based on drag distance (realistic acceleration)
          state.player.vx += dx * 0.0015;
          state.player.vy += dy * 0.0015;
        }

        // Apply Friction/Drag
        state.player.vx *= 0.94;
        state.player.vy *= 0.94;

        // Apply Velocity
        state.player.x += state.player.vx;
        state.player.y += state.player.vy;

        // Wall Collisions (Bounce)
        if (state.player.x < state.player.radius) {
          state.player.x = state.player.radius;
          state.player.vx *= -0.5;
        }
        if (state.player.x > width - state.player.radius) {
          state.player.x = width - state.player.radius;
          state.player.vx *= -0.5;
        }
        if (state.player.y < state.player.radius) {
          state.player.y = state.player.radius;
          state.player.vy *= -0.5;
        }
        if (state.player.y > height - state.player.radius) {
          state.player.y = height - state.player.radius;
          state.player.vy *= -0.5;
        }

        // --- Monolith Spawning & Updating ---
        state.spawnTimer++;
        if (state.spawnTimer > 60 - state.difficulty * 2) {
          state.spawnTimer = 0;
          state.difficulty = Math.min(20, state.difficulty + 0.1);
          
          state.monoliths.push({
            id: state.monolithIdCounter++,
            x: Math.random() * width,
            y: -height * 1.2, // Spawn high up so the shadow falls from the top edge
            r: Math.min(width, height) * (0.1 + Math.random() * 0.15),
            vx: (Math.random() - 0.5) * 1,
            vy: 2 + Math.random() * 2 + (state.difficulty * 0.2)
          });
        }

        for (let i = state.monoliths.length - 1; i >= 0; i--) {
          const m = state.monoliths[i];
          m.x += m.vx;
          m.y += m.vy;
          if (m.y > height + 500) {
            state.monoliths.splice(i, 1);
          }
        }

        // --- Shadow Math & Collision ---
        let isSafe = false;
        const projDist = height * 1.2; // Finite shadow length

        // Draw Shadows and Monoliths
        ctx.fillStyle = '#080808'; // Very dark grey for shadows
        
        state.monoliths.forEach(m => {
          // 1. Draw Shadow Polygon
          const angleC = Math.atan2(m.y - lightY, m.x - lightX);
          const tangentOffset = Math.PI / 2;
          
          const p1x = m.x + Math.cos(angleC + tangentOffset) * m.r;
          const p1y = m.y + Math.sin(angleC + tangentOffset) * m.r;
          const p2x = m.x + Math.cos(angleC - tangentOffset) * m.r;
          const p2y = m.y + Math.sin(angleC - tangentOffset) * m.r;
          
          const p3x = p2x + Math.cos(angleC) * projDist;
          const p3y = p2y + Math.sin(angleC) * projDist;
          
          ctx.beginPath();
          ctx.moveTo(p1x, p1y);
          ctx.lineTo(p2x, p2y);
          ctx.lineTo(p3x, p3y);
          // Rounded end cap for the shadow
          ctx.arc(m.x + Math.cos(angleC) * projDist, m.y + Math.sin(angleC) * projDist, m.r, angleC - tangentOffset, angleC + tangentOffset, false);
          ctx.fill();

          // 2. Draw Monolith (Solid Black)
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#080808'; // Reset for next shadow

          // 3. Check Safety (Math)
          if (!isSafe) {
            const dx = state.player.x - m.x;
            const dy = state.player.y - m.y;
            const distM2P = Math.hypot(dx, dy);
            
            if (distM2P <= m.r) {
              isSafe = true;
            } else {
              const sx = Math.cos(angleC);
              const sy = Math.sin(angleC);
              
              const proj = dx * sx + dy * sy;
              const perp = Math.abs(dx * (-sy) + dy * sx);
              
              if (proj > 0 && proj <= projDist && perp <= m.r) {
                isSafe = true;
              } else if (proj > projDist) {
                // Check rounded end cap
                const endX = m.x + sx * projDist;
                const endY = m.y + sy * projDist;
                if (Math.hypot(state.player.x - endX, state.player.y - endY) <= m.r) {
                  isSafe = true;
                }
              }
            }
          }
        });

        // --- Health & Score ---
        if (isSafe) {
          state.health = Math.min(100, state.health + 1);
          state.score += 1;
          if (state.score % 10 === 0) setScore(state.score); // Throttle React updates
        } else {
          state.health -= 1.5;
          
          // Burn particles
          if (Math.random() > 0.5) {
            state.particles.push({
              x: state.player.x + (Math.random() - 0.5) * 10,
              y: state.player.y + (Math.random() - 0.5) * 10,
              vx: (Math.random() - 0.5) * 2,
              vy: -1 - Math.random() * 2,
              life: 1.0
            });
          }

          if (state.health <= 0) {
            state.status = 'GAME_OVER';
            setGameState('GAME_OVER');
          }
        }

        // Update Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.05;
          if (p.life <= 0) state.particles.splice(i, 1);
        }
      } else {
        // Just draw the background monoliths if not playing
        ctx.fillStyle = '#080808';
        const projDist = height * 1.2;
        state.monoliths.forEach(m => {
          const angleC = Math.atan2(m.y - lightY, m.x - lightX);
          const tangentOffset = Math.PI / 2;
          const p1x = m.x + Math.cos(angleC + tangentOffset) * m.r;
          const p1y = m.y + Math.sin(angleC + tangentOffset) * m.r;
          const p2x = m.x + Math.cos(angleC - tangentOffset) * m.r;
          const p2y = m.y + Math.sin(angleC - tangentOffset) * m.r;
          
          const p3x = p2x + Math.cos(angleC) * projDist;
          const p3y = p2y + Math.sin(angleC) * projDist;
          
          ctx.beginPath();
          ctx.moveTo(p1x, p1y);
          ctx.lineTo(p2x, p2y);
          ctx.lineTo(p3x, p3y);
          ctx.arc(m.x + Math.cos(angleC) * projDist, m.y + Math.sin(angleC) * projDist, m.r, angleC - tangentOffset, angleC + tangentOffset, false);
          ctx.fill();
          
          ctx.fillStyle = '#000000';
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#080808';
        });
      }

      // --- Draw Particles ---
      state.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // --- Draw Joystick ---
      if (state.joystick.active && state.status === 'PLAYING') {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(state.joystick.startX, state.joystick.startY);
        ctx.lineTo(state.joystick.currentX, state.joystick.currentY);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.beginPath();
        ctx.arc(state.joystick.startX, state.joystick.startY, 30, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(state.joystick.currentX, state.joystick.currentY, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Draw Player ---
      if (state.status === 'PLAYING') {
        const isBurning = state.health < 100 && state.health % 10 < 5; // Flicker effect
        
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = isBurning ? '#FF0000' : '#FFFFFF';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(state.player.x, state.player.y, state.player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Health Bar
        const barWidth = 40;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(state.player.x - barWidth/2, state.player.y + 15, barWidth, 3);
        ctx.fillStyle = state.health > 30 ? '#000000' : '#FF0000';
        ctx.fillRect(state.player.x - barWidth/2, state.player.y + 15, barWidth * (state.health / 100), 3);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-white text-black font-sans select-none touch-none">
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full block"
      />

      {/* UI Overlays */}
      {gameState === 'START' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h1 className="text-4xl font-light text-black mb-2 tracking-[0.4em] ml-4">UMBRA</h1>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-16 uppercase">Reverse-Stealth</p>
          
          <div className="space-y-6 text-sm text-gray-600 font-light tracking-wide max-w-xs mb-16">
            <p className="text-center text-black mb-4 font-medium">The light will burn you.</p>
            <p className="flex items-center justify-between"><span className="text-black">Drag</span> <span>Apply Thrust</span></p>
            <p className="flex items-center justify-between"><span className="text-black">Release</span> <span>Drift</span></p>
            <div className="h-px w-full bg-black/10 my-4"></div>
            <p className="text-xs text-gray-400 italic text-center">Stay in the shadows of the monoliths.</p>
          </div>

          <button 
            onClick={startGame}
            className="px-10 py-3 border border-black/30 text-black text-xs tracking-[0.2em] rounded-full hover:bg-black hover:text-white transition-all duration-300"
          >
            BEGIN
          </button>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h2 className="text-2xl font-light text-red-600 mb-2 tracking-[0.3em] ml-3">INCINERATED</h2>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-12 uppercase">Score: {score}</p>
          <button 
            onClick={startGame}
            className="px-10 py-3 border border-black/30 text-black text-xs tracking-[0.2em] rounded-full hover:bg-black hover:text-white transition-all duration-300"
          >
            RETRY
          </button>
        </div>
      )}

      {/* HUD */}
      {gameState === 'PLAYING' && (
        <div className="absolute top-8 left-8 text-black/40 text-xs font-light tracking-[0.3em]">
          SCORE {score}
        </div>
      )}
    </div>
  );
}

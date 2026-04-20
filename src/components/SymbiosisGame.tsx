import React, { useEffect, useRef, useState, useCallback } from 'react';

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';
type EntityType = 'solid' | 'hollow';

interface Obstacle {
  id: number;
  lane: 0 | 1; // 0 for left, 1 for right
  y: number;
  type: EntityType;
  matched: boolean;
}

export default function SymbiosisGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem('arcade_symbiosis_highscore') || '0', 10));
  
  // Game State Refs for animation loop
  const stateRef = useRef({
    status: 'START' as GameState,
    score: 0,
    speed: 4,
    isSwapped: false, // false: Solid Left/Hollow Right. true: Hollow Left/Solid Right
    obstacles: [] as Obstacle[],
    spawnTimer: 0,
    spawnRate: 90, // Frames between spawns
    obstacleIdCounter: 0,
    particles: [] as { x: number, y: number, vx: number, vy: number, life: number, maxLife: number, type: EntityType }[]
  });

  const startGame = useCallback(() => {
    stateRef.current = {
      status: 'PLAYING',
      score: 0,
      speed: 5,
      isSwapped: false,
      obstacles: [],
      spawnTimer: 0,
      spawnRate: 100,
      obstacleIdCounter: 0,
      particles: []
    };
    setScore(0);
    setGameState('PLAYING');
  }, []);

  const handleSwap = useCallback(() => {
    if (stateRef.current.status === 'PLAYING') {
      stateRef.current.isSwapped = !stateRef.current.isSwapped;
    }
  }, []);

  // Input Handling
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      // Ignore clicks on the exit button
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      handleSwap();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        handleSwap();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    const preventDefault = (e: Event) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchmove', preventDefault);
    };
  }, [handleSwap]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const createParticles = (x: number, y: number, type: EntityType) => {
      for (let i = 0; i < 10; i++) {
        stateRef.current.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          life: 1.0,
          maxLife: 1.0,
          type
        });
      }
    };

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
      const laneWidth = width / 2;
      const entityY = height - 150;
      const entityRadius = Math.min(laneWidth * 0.15, 30);
      const obstacleSize = entityRadius * 1.5;

      // Clear screen
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Draw Center Divider (Minimal dashed line)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([10, 20]);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.setLineDash([]);

      if (state.status === 'PLAYING') {
        // Spawning logic
        state.spawnTimer++;
        if (state.spawnTimer >= state.spawnRate) {
          state.spawnTimer = 0;
          
          // Increase difficulty
          state.speed += 0.05;
          state.spawnRate = Math.max(30, state.spawnRate - 1);

          // Spawn 1 or 2 obstacles
          const numObstacles = Math.random() > 0.7 ? 2 : 1;
          
          if (numObstacles === 1) {
            state.obstacles.push({
              id: state.obstacleIdCounter++,
              lane: Math.random() > 0.5 ? 0 : 1,
              y: -50,
              type: Math.random() > 0.5 ? 'solid' : 'hollow',
              matched: false
            });
          } else {
            // Spawn both lanes
            const type1 = Math.random() > 0.5 ? 'solid' : 'hollow';
            const type2 = Math.random() > 0.5 ? 'solid' : 'hollow';
            
            let y1 = -50;
            let y2 = -50;

            // FIX: If both shapes are the same, it's impossible to catch them at the exact same time.
            // We MUST stagger them vertically so the player has time to swap back and forth.
            if (type1 === type2) {
              // Stagger distance scales with speed so you always have enough reaction time
              y2 = -50 - Math.max(180, state.speed * 25); 
            } else {
              // If they are different, they can fall together, but occasionally stagger for variety
              if (Math.random() > 0.5) {
                y2 = -50 - Math.max(180, state.speed * 25);
              }
            }

            // Randomize which lane gets the staggered (higher) obstacle
            if (Math.random() > 0.5) {
              state.obstacles.push({ id: state.obstacleIdCounter++, lane: 0, y: y1, type: type1, matched: false });
              state.obstacles.push({ id: state.obstacleIdCounter++, lane: 1, y: y2, type: type2, matched: false });
            } else {
              state.obstacles.push({ id: state.obstacleIdCounter++, lane: 0, y: y2, type: type1, matched: false });
              state.obstacles.push({ id: state.obstacleIdCounter++, lane: 1, y: y1, type: type2, matched: false });
            }
          }
        }

        // Update Obstacles
        for (let i = state.obstacles.length - 1; i >= 0; i--) {
          const obs = state.obstacles[i];
          obs.y += state.speed;

          // Collision Check
          if (!obs.matched && obs.y + obstacleSize / 2 >= entityY - entityRadius && obs.y - obstacleSize / 2 <= entityY + entityRadius) {
            // Determine which entity is in this lane
            const isLeftLane = obs.lane === 0;
            const entityInLane: EntityType = isLeftLane 
              ? (state.isSwapped ? 'hollow' : 'solid') 
              : (state.isSwapped ? 'solid' : 'hollow');

            if (obs.type === entityInLane) {
              // Match!
              obs.matched = true;
              state.score += 1;
              setScore(state.score);
              createParticles(isLeftLane ? laneWidth / 2 : laneWidth * 1.5, entityY, obs.type);
              state.obstacles.splice(i, 1);
            } else {
              // Mismatch! Game Over
              state.status = 'GAME_OVER';
              setGameState('GAME_OVER');
              setHighScore(prev => {
                const newHigh = Math.max(prev, state.score);
                localStorage.setItem('arcade_symbiosis_highscore', newHigh.toString());
                return newHigh;
              });
            }
          } else if (obs.y > height + 50) {
            // Missed an obstacle (shouldn't happen since they hit the entities, but just in case)
            state.obstacles.splice(i, 1);
          }
        }

        // Update Particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.05;
          if (p.life <= 0) {
            state.particles.splice(i, 1);
          }
        }
      }

      // Draw Particles
      state.particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        if (p.type === 'solid') {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1.0;

      // Draw Obstacles (Squares)
      state.obstacles.forEach(obs => {
        const x = obs.lane === 0 ? laneWidth / 2 : laneWidth * 1.5;
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#FFFFFF';

        if (obs.type === 'solid') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(x - obstacleSize / 2, obs.y - obstacleSize / 2, obstacleSize, obstacleSize);
        } else {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - obstacleSize / 2, obs.y - obstacleSize / 2, obstacleSize, obstacleSize);
        }
        ctx.shadowBlur = 0;
      });

      // Draw Entities (Circles)
      const leftType = state.isSwapped ? 'hollow' : 'solid';
      const rightType = state.isSwapped ? 'solid' : 'hollow';

      const drawEntity = (x: number, type: EntityType) => {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, entityY, entityRadius, 0, Math.PI * 2);
        
        if (type === 'solid') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        } else {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      };

      // Smooth horizontal animation could be added, but instant swap is better for flow-state gameplay
      drawEntity(laneWidth / 2, leftType);
      drawEntity(laneWidth * 1.5, rightType);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black text-white font-sans select-none touch-none">
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full block"
      />

      {/* UI Overlays */}
      {gameState === 'START' && (
        <div 
          onClick={startGame}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md z-20 p-6 text-center transition-all duration-700 cursor-pointer"
        >
          <h1 className="text-4xl font-light text-white mb-2 tracking-[0.4em] ml-4">SYMBIOSIS</h1>
          <p className="text-gray-400 text-xs tracking-[0.2em] mb-16 uppercase">Split-Brain Protocol</p>
          
          <div className="space-y-6 text-sm text-gray-400 font-light tracking-wide max-w-xs mb-16">
            <p className="flex items-center justify-between"><span className="text-white">Solid</span> <span>Absorbs Solid</span></p>
            <p className="flex items-center justify-between"><span className="text-white">Hollow</span> <span>Absorbs Hollow</span></p>
            <div className="h-px w-full bg-white/10 my-4"></div>
            <p className="text-xs text-gray-500 italic">Tap anywhere to swap positions.</p>
          </div>

          <p className="animate-pulse text-white/70 text-xs tracking-[0.3em] uppercase">
            TAP ANYWHERE TO BEGIN
          </p>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h2 className="text-2xl font-light text-red-400 mb-2 tracking-[0.3em] ml-3">SYNC LOST</h2>
          <p className="text-white text-xl tracking-[0.2em] mb-2 uppercase">Score: {score}</p>
          {highScore > 0 && <p className="text-gray-500 text-xs tracking-[0.2em] mb-12 uppercase">Best: {highScore}</p>}
          <button 
            onClick={startGame}
            className="px-10 py-3 border border-white/30 text-white text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            RESTART
          </button>
        </div>
      )}

      {/* HUD */}
      {gameState === 'PLAYING' && (
        <div className="absolute top-8 left-8 text-white/40 text-xs font-light tracking-[0.3em]">
          SCORE {score}
        </div>
      )}
    </div>
  );
}

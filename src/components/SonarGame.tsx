import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Game Constants & Types ---
const TILE_SIZE = 30; // Base tile size, will scale based on screen
const PING_SPEED = 8;
const PING_MAX_RADIUS = 300;
const ILLUMINATION_DECAY = 0.96;

type Point = { x: number; y: number };
type Ping = { x: number; y: number; radius: number; maxRadius: number };
type GameState = 'START' | 'PLAYING' | 'GAME_OVER' | 'LEVEL_COMPLETE';

// --- Maze Generation ---
function generateMaze(level: number) {
  // Increase size slightly with level, keep it odd for DFS maze
  let cols = 11 + Math.floor(level / 2) * 2;
  let rows = 15 + Math.floor(level / 2) * 2;
  
  // Cap size for mobile screens
  cols = Math.min(cols, 21);
  rows = Math.min(rows, 31);

  const grid = Array(rows).fill(0).map(() => Array(cols).fill(1));
  const stack: Point[] = [{ x: 1, y: 1 }];
  grid[1][1] = 0;

  const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const unvisited: { x: number; y: number; dx: number; dy: number }[] = [];

    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && grid[ny][nx] === 1) {
        unvisited.push({ x: nx, y: ny, dx, dy });
      }
    }

    if (unvisited.length > 0) {
      const next = unvisited[Math.floor(Math.random() * unvisited.length)];
      grid[current.y + next.dy / 2][current.x + next.dx / 2] = 0;
      grid[next.y][next.x] = 0;
      stack.push({ x: next.x, y: next.y });
    } else {
      stack.pop();
    }
  }

  // Remove more random walls to create loops and prevent hard blocking
  const loops = Math.floor((cols * rows) / 8);
  for (let i = 0; i < loops; i++) {
    const r = Math.floor(Math.random() * (rows - 2)) + 1;
    const c = Math.floor(Math.random() * (cols - 2)) + 1;
    grid[r][c] = 0;
  }

  // Set Exit
  grid[rows - 2][cols - 2] = 2;

  // Spawn Echoes (Enemies) based on level
  const echoes: Point[] = [];
  if (level > 1) {
    const numEchoes = Math.min(level - 1, 5);
    for (let i = 0; i < numEchoes; i++) {
      let ex, ey;
      do {
        ex = Math.floor(Math.random() * (cols - 2)) + 1;
        ey = Math.floor(Math.random() * (rows - 2)) + 1;
      } while (grid[ey][ex] !== 0 || (ex < 5 && ey < 5)); // Don't spawn on walls or near player
      echoes.push({ x: ex, y: ey });
    }
  }

  return { grid, cols, rows, echoes };
}

// --- Audio Context (Lazy loaded) ---
let audioCtx: AudioContext | null = null;
function playPingSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.6);
    
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    console.warn("Audio play failed", e);
  }
}

export default function SonarGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem('arcade_sonar_highscore') || '1', 10));
  
  // Game State Refs (to avoid dependency issues in animation loop)
  const stateRef = useRef({
    player: { x: 1, y: 1 },
    grid: [] as number[][],
    cols: 0,
    rows: 0,
    echoes: [] as Point[],
    pings: [] as Ping[],
    illumination: [] as number[][],
    tileSize: TILE_SIZE,
    offsetX: 0,
    offsetY: 0,
    status: 'START' as GameState
  });

  // Initialize Level
  const initLevel = useCallback((lvl: number) => {
    const { grid, cols, rows, echoes } = generateMaze(lvl);
    
    // Calculate tile size to fit screen
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const tSize = Math.min(Math.floor(screenW / cols), Math.floor(screenH / rows));
    
    stateRef.current = {
      ...stateRef.current,
      player: { x: 1, y: 1 },
      grid,
      cols,
      rows,
      echoes,
      pings: [],
      illumination: Array(rows).fill(0).map(() => Array(cols).fill(0)),
      tileSize: tSize,
      offsetX: Math.floor((screenW - cols * tSize) / 2),
      offsetY: Math.floor((screenH - rows * tSize) / 2),
      status: 'PLAYING'
    };
    
    setLevel(lvl);
    setGameState('PLAYING');
  }, []);

  // Handle Movement
  const movePlayer = useCallback((dx: number, dy: number) => {
    const state = stateRef.current;
    if (state.status !== 'PLAYING') return;

    const nx = state.player.x + dx;
    const ny = state.player.y + dy;

    if (nx >= 0 && nx < state.cols && ny >= 0 && ny < state.rows) {
      if (state.grid[ny][nx] !== 1) { // Not a wall
        state.player.x = nx;
        state.player.y = ny;

        // Check Exit
        if (state.grid[ny][nx] === 2) {
          state.status = 'LEVEL_COMPLETE';
          setGameState('LEVEL_COMPLETE');
        }

        // Check Echo Collision
        if (state.echoes.some(e => e.x === nx && e.y === ny)) {
          state.status = 'GAME_OVER';
          setGameState('GAME_OVER');
          setHighScore(prev => {
            const newHigh = Math.max(prev, level);
            localStorage.setItem('arcade_sonar_highscore', newHigh.toString());
            return newHigh;
          });
        }
      }
    }
  }, []);

  // Handle Ping
  const triggerPing = useCallback(() => {
    const state = stateRef.current;
    if (state.status !== 'PLAYING') return;

    playPingSound();

    // Ping always originates from player
    const px = state.offsetX + state.player.x * state.tileSize + state.tileSize / 2;
    const py = state.offsetY + state.player.y * state.tileSize + state.tileSize / 2;

    // Max radius covers most of the screen
    const maxR = Math.max(window.innerWidth, window.innerHeight) * 0.8;
    
    state.pings.push({ x: px, y: py, radius: 0, maxRadius: maxR });

    // Move Echoes
    state.echoes.forEach(echo => {
      const dx = state.player.x - echo.x;
      const dy = state.player.y - echo.y;
      const distance = Math.abs(dx) + Math.abs(dy); // Manhattan distance
      
      let moveX = 0;
      let moveY = 0;

      if (distance <= 10) {
        // If within 10 tiles, they hear exactly where you are and hunt you
        if (Math.abs(dx) > Math.abs(dy)) {
          moveX = Math.sign(dx);
        } else if (dy !== 0) {
          moveY = Math.sign(dy);
        } else if (dx !== 0) {
          moveX = Math.sign(dx);
        }
      } else {
        // If far away, the sound is muffled, they just wander randomly
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        moveX = dir[0];
        moveY = dir[1];
      }

      // Try moving
      if (moveX !== 0 && state.grid[echo.y][echo.x + moveX] !== 1) {
        echo.x += moveX;
      } else if (moveY !== 0 && state.grid[echo.y + moveY][echo.x] !== 1) {
        echo.y += moveY;
      }

      // Check collision after moving
      if (echo.x === state.player.x && echo.y === state.player.y) {
        state.status = 'GAME_OVER';
        setGameState('GAME_OVER');
        setHighScore(prev => {
          const newHigh = Math.max(prev, level);
          localStorage.setItem('arcade_sonar_highscore', newHigh.toString());
          return newHigh;
        });
      }
    });
  }, []);

  // Input Handling (Pointer & Keyboard)
  useEffect(() => {
    let pointerStartX = 0;
    let pointerStartY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (stateRef.current.status !== 'PLAYING') return;
      
      const dx = e.clientX - pointerStartX;
      const dy = e.clientY - pointerStartY;
      
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx < 15 && absDy < 15) {
        // It's a tap/click -> Ping from player
        triggerPing();
      } else {
        // It's a swipe/drag -> Move
        if (absDx > absDy) {
          movePlayer(dx > 0 ? 1 : -1, 0);
        } else {
          movePlayer(0, dy > 0 ? 1 : -1);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current.status !== 'PLAYING') return;
      switch (e.key) {
        case 'ArrowUp': case 'w': movePlayer(0, -1); break;
        case 'ArrowDown': case 's': movePlayer(0, 1); break;
        case 'ArrowLeft': case 'a': movePlayer(-1, 0); break;
        case 'ArrowRight': case 'd': movePlayer(1, 0); break;
        case ' ': triggerPing(); break; // Spacebar pings at player location
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    // Prevent default touch actions (scrolling/zooming)
    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchmove', preventDefault);
    };
  }, [movePlayer, triggerPing]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      // Resize canvas to window
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== window.innerWidth * dpr || canvas.height !== window.innerHeight * dpr) {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.scale(dpr, dpr);
      }

      const state = stateRef.current;
      
      // Clear screen
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (state.status === 'START') {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Update Pings
      state.pings.forEach(p => p.radius += PING_SPEED);
      state.pings = state.pings.filter(p => p.radius < p.maxRadius);

      // Decay Illumination
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          state.illumination[r][c] *= ILLUMINATION_DECAY;
        }
      }

      // Illuminate from pings
      state.pings.forEach(ping => {
        for (let r = 0; r < state.rows; r++) {
          for (let c = 0; c < state.cols; c++) {
            const tx = state.offsetX + c * state.tileSize + state.tileSize / 2;
            const ty = state.offsetY + r * state.tileSize + state.tileSize / 2;
            const dist = Math.sqrt((tx - ping.x) ** 2 + (ty - ping.y) ** 2);
            
            // If ping ring is touching the tile
            if (Math.abs(dist - ping.radius) < state.tileSize * 1.5) {
              // Intensity drops as ring gets larger
              const intensity = Math.max(0, 1.0 - (ping.radius / ping.maxRadius));
              state.illumination[r][c] = Math.max(state.illumination[r][c], intensity);
            }
          }
        }
      });

      // Draw Grid (Walls & Exit)
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const alpha = state.illumination[r][c];
          if (alpha > 0.05) {
            const tx = state.offsetX + c * state.tileSize;
            const ty = state.offsetY + r * state.tileSize;
            
            if (state.grid[r][c] === 1) {
              // Minimal White Lines for Walls
              ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
              ctx.lineWidth = 1;
              ctx.shadowBlur = 4 * alpha;
              ctx.shadowColor = '#FFFFFF';
              
              // Draw edges that touch a path (0) or exit (2)
              if (r > 0 && state.grid[r-1][c] !== 1) {
                ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + state.tileSize, ty); ctx.stroke();
              }
              if (r < state.rows - 1 && state.grid[r+1][c] !== 1) {
                ctx.beginPath(); ctx.moveTo(tx, ty + state.tileSize); ctx.lineTo(tx + state.tileSize, ty + state.tileSize); ctx.stroke();
              }
              if (c > 0 && state.grid[r][c-1] !== 1) {
                ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty + state.tileSize); ctx.stroke();
              }
              if (c < state.cols - 1 && state.grid[r][c+1] !== 1) {
                ctx.beginPath(); ctx.moveTo(tx + state.tileSize, ty); ctx.lineTo(tx + state.tileSize, ty + state.tileSize); ctx.stroke();
              }
              ctx.shadowBlur = 0;
            } else if (state.grid[r][c] === 2) {
              // Minimal Exit Portal
              ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
              ctx.lineWidth = 1.5;
              ctx.shadowBlur = 8 * alpha;
              ctx.shadowColor = '#FFFFFF';
              ctx.strokeRect(tx + 6, ty + 6, state.tileSize - 12, state.tileSize - 12);
              
              // Inner dot for exit
              ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
              ctx.beginPath();
              ctx.arc(tx + state.tileSize / 2, ty + state.tileSize / 2, 2, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }
        }
      }

      // Draw Ping Rings (Minimal Green)
      state.pings.forEach(ping => {
        const alpha = Math.max(0, 1.0 - (ping.radius / ping.maxRadius));
        ctx.strokeStyle = `rgba(57, 255, 20, ${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, ping.radius, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Draw Echoes (Enemies - Minimal Red Rings)
      state.echoes.forEach(echo => {
        const alpha = state.illumination[echo.y][echo.x];
        if (alpha > 0.05) {
          const tx = state.offsetX + echo.x * state.tileSize + state.tileSize / 2;
          const ty = state.offsetY + echo.y * state.tileSize + state.tileSize / 2;
          
          ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 8 * alpha;
          ctx.shadowColor = '#FF3333';
          ctx.beginPath();
          ctx.arc(tx, ty, state.tileSize * 0.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      });

      // Draw Player (Always visible, small bright white dot)
      const px = state.offsetX + state.player.x * state.tileSize + state.tileSize / 2;
      const py = state.offsetY + state.player.y * state.tileSize + state.tileSize / 2;
      
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, py, state.tileSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

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
          onClick={() => initLevel(1)}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md z-20 p-6 text-center transition-all duration-700 cursor-pointer"
        >
          <h1 className="text-4xl font-light text-white mb-2 tracking-[0.4em] ml-4">SONAR</h1>
          <p className="text-gray-400 text-xs tracking-[0.2em] mb-16 uppercase">Sensory Survival</p>
          
          <div className="space-y-6 text-sm text-gray-400 font-light tracking-wide max-w-xs mb-16">
            <p className="flex items-center justify-between"><span className="text-white">Swipe</span> <span>Move</span></p>
            <p className="flex items-center justify-between"><span className="text-white">Tap</span> <span>Echolocate</span></p>
            <div className="h-px w-full bg-white/10 my-4"></div>
            <p className="text-xs text-gray-500 italic">They hunt you if they hear you nearby.</p>
          </div>

          <p className="animate-pulse text-white/70 text-xs tracking-[0.3em] uppercase">
            TAP ANYWHERE TO BEGIN
          </p>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h2 className="text-2xl font-light text-red-400 mb-2 tracking-[0.3em] ml-3">DETECTED</h2>
          <p className="text-white text-xl tracking-[0.2em] mb-2 uppercase">Sector {level}</p>
          {highScore > 1 && <p className="text-gray-500 text-xs tracking-[0.2em] mb-12 uppercase">Max Sector: {highScore}</p>}
          <button 
            onClick={() => initLevel(1)}
            className="px-10 py-3 border border-white/30 text-white text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            RESTART
          </button>
        </div>
      )}

      {gameState === 'LEVEL_COMPLETE' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h2 className="text-2xl font-light text-white mb-2 tracking-[0.3em] ml-3">ESCAPED</h2>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-12 uppercase">Sector {level} Cleared</p>
          <button 
            onClick={() => initLevel(level + 1)}
            className="px-10 py-3 border border-white/30 text-white text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            PROCEED
          </button>
        </div>
      )}

      {/* HUD */}
      {gameState === 'PLAYING' && (
        <div className="absolute top-8 left-8 text-white/40 text-xs font-light tracking-[0.3em]">
          SECTOR {level}
        </div>
      )}
    </div>
  );
}

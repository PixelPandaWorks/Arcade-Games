import React, { useEffect, useRef, useState, useCallback } from 'react';

type GameState = 'START' | 'PLAYING' | 'GAME_OVER' | 'LEVEL_COMPLETE';
type ShapeType = 'circle' | 'square' | 'triangle';
type Phase = 'MEMORIZE' | 'INPUT' | 'SHATTER';

interface RingShape {
  id: number;
  type: ShapeType;
  angle: number;
  isTargeted: boolean;
  isShattered: boolean;
  shatterVelocity?: { x: number, y: number };
  shatterOffset?: { x: number, y: number };
}

export default function CipherGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);

  const stateRef = useRef({
    status: 'START' as GameState,
    phase: 'MEMORIZE' as Phase,
    radius: 0,
    targetRadius: 0,
    shrinkSpeed: 0,
    rotation: 0,
    rotationSpeed: 0.002,
    cipher: [] as ShapeType[],
    inputProgress: 0,
    ringShapes: [] as RingShape[],
    memorizeTimer: 0,
    maxMemorizeTime: 120, // 2 seconds at 60fps
    playerRadius: Math.max(10, Math.min(window.innerWidth, window.innerHeight) * 0.03),
    errorFlash: 0,
    shatterTimer: 0
  });

  const generateLevel = useCallback((lvl: number) => {
    const cipherLength = Math.min(8, 2 + lvl); // Starts at 3, maxes at 8
    const numRingShapes = Math.max(8, cipherLength * 2); // Ensure enough shapes
    
    const types: ShapeType[] = ['circle', 'square', 'triangle'];
    const newCipher: ShapeType[] = [];
    
    // Generate Cipher
    for (let i = 0; i < cipherLength; i++) {
      newCipher.push(types[Math.floor(Math.random() * types.length)]);
    }

    // Generate Ring Shapes (ensure all cipher shapes exist in the ring)
    const newRingShapes: RingShape[] = [];
    const angleStep = (Math.PI * 2) / numRingShapes;
    
    for (let i = 0; i < numRingShapes; i++) {
      // Force some shapes to match the cipher to guarantee it's possible
      let type = types[Math.floor(Math.random() * types.length)];
      if (i < cipherLength) {
        type = newCipher[i];
      }

      newRingShapes.push({
        id: i,
        type,
        angle: i * angleStep,
        isTargeted: false,
        isShattered: false,
        shatterOffset: { x: 0, y: 0 }
      });
    }

    // Shuffle the ring shapes so the guaranteed ones aren't all clustered
    for (let i = newRingShapes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tempType = newRingShapes[i].type;
      newRingShapes[i].type = newRingShapes[j].type;
      newRingShapes[j].type = tempType;
    }

    const startRadius = Math.max(window.innerWidth, window.innerHeight) * 0.6;

    stateRef.current = {
      ...stateRef.current,
      status: 'PLAYING',
      phase: 'MEMORIZE',
      radius: startRadius,
      targetRadius: startRadius,
      shrinkSpeed: 0.5 + (lvl * 0.15),
      rotation: 0,
      rotationSpeed: 0.002 + (lvl * 0.0005) * (Math.random() > 0.5 ? 1 : -1),
      cipher: newCipher,
      inputProgress: 0,
      ringShapes: newRingShapes,
      memorizeTimer: 120 - Math.min(60, lvl * 5), // Less time to memorize on higher levels
      maxMemorizeTime: 120 - Math.min(60, lvl * 5),
      errorFlash: 0,
      shatterTimer: 0
    };
    
    setLevel(lvl);
    setGameState('PLAYING');
  }, []);

  // Input Handling
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      const state = stateRef.current;
      if (state.status !== 'PLAYING' || state.phase !== 'INPUT') return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Calculate angle of click
      let clickAngle = Math.atan2(y - centerY, x - centerX);
      if (clickAngle < 0) clickAngle += Math.PI * 2;

      // Adjust for current ring rotation
      let adjustedClickAngle = (clickAngle - state.rotation) % (Math.PI * 2);
      if (adjustedClickAngle < 0) adjustedClickAngle += Math.PI * 2;

      // Find closest shape by angle
      let closestShape: RingShape | null = null;
      let minAngleDiff = Infinity;

      state.ringShapes.forEach(shape => {
        if (shape.isShattered) return;
        
        let diff = Math.abs(shape.angle - adjustedClickAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        
        if (diff < minAngleDiff) {
          minAngleDiff = diff;
          closestShape = shape;
        }
      });

      // Tolerance for clicking (about 20 degrees)
      if (closestShape && minAngleDiff < 0.35) {
        const targetType = state.cipher[state.inputProgress];
        
        if (closestShape.type === targetType) {
          // Correct!
          closestShape.isTargeted = true;
          state.inputProgress++;
          
          if (state.inputProgress >= state.cipher.length) {
            // Sequence complete!
            state.phase = 'SHATTER';
            state.shatterTimer = 60;
            state.score += level * 100;
            setScore(state.score);
            
            // Give shatter velocities
            state.ringShapes.forEach(s => {
              s.isShattered = true;
              const globalAngle = s.angle + state.rotation;
              s.shatterVelocity = {
                x: Math.cos(globalAngle) * (5 + Math.random() * 10),
                y: Math.sin(globalAngle) * (5 + Math.random() * 10)
              };
            });
          }
        } else {
          // Wrong! Penalty
          state.errorFlash = 1.0;
          state.inputProgress = 0; // Reset progress
          state.radius -= 40; // Shrink ring instantly
          state.ringShapes.forEach(s => s.isTargeted = false); // Reset visual targets
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [level]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const drawShape = (ctx: CanvasRenderingContext2D, type: ShapeType, x: number, y: number, size: number, isTargeted: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      
      ctx.strokeStyle = isTargeted ? '#00FF00' : '#FFFFFF';
      ctx.lineWidth = isTargeted ? 3 : 1.5;
      ctx.shadowBlur = isTargeted ? 15 : 0;
      ctx.shadowColor = '#00FF00';
      
      ctx.beginPath();
      if (type === 'circle') {
        ctx.arc(0, 0, size, 0, Math.PI * 2);
      } else if (type === 'square') {
        ctx.rect(-size, -size, size * 2, size * 2);
      } else if (type === 'triangle') {
        ctx.moveTo(0, -size * 1.2);
        ctx.lineTo(size * 1.1, size * 0.8);
        ctx.lineTo(-size * 1.1, size * 0.8);
        ctx.closePath();
      }
      ctx.stroke();
      
      if (isTargeted) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.fill();
      }
      
      ctx.restore();
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
      const centerX = width / 2;
      const centerY = height / 2;

      // Clear screen
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      if (state.status === 'PLAYING') {
        // --- Logic Update ---
        state.rotation += state.rotationSpeed;

        if (state.phase === 'MEMORIZE') {
          state.memorizeTimer--;
          if (state.memorizeTimer <= 0) {
            state.phase = 'INPUT';
          }
        } else if (state.phase === 'INPUT') {
          // Shrink ring
          state.radius -= state.shrinkSpeed;
          
          // Check death
          if (state.radius <= state.playerRadius + 10) {
            state.status = 'GAME_OVER';
            setGameState('GAME_OVER');
          }
        } else if (state.phase === 'SHATTER') {
          state.shatterTimer--;
          state.ringShapes.forEach(s => {
            if (s.shatterVelocity && s.shatterOffset) {
              s.shatterOffset.x += s.shatterVelocity.x;
              s.shatterOffset.y += s.shatterVelocity.y;
            }
          });

          if (state.shatterTimer <= 0) {
            state.status = 'LEVEL_COMPLETE';
            setGameState('LEVEL_COMPLETE');
          }
        }

        // Error Flash
        if (state.errorFlash > 0) {
          ctx.fillStyle = `rgba(255, 0, 0, ${state.errorFlash * 0.3})`;
          ctx.fillRect(0, 0, width, height);
          state.errorFlash -= 0.05;
        }

        // --- Drawing ---

        // Draw Player (Center Dot)
        ctx.fillStyle = state.phase === 'SHATTER' ? '#00FF00' : '#FFFFFF';
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(centerX, centerY, state.playerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw Ring
        if (state.phase !== 'SHATTER') {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(centerX, centerY, state.radius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw Ring Shapes
        const shapeSize = Math.max(10, Math.min(25, state.radius * 0.08));
        
        state.ringShapes.forEach(shape => {
          const globalAngle = shape.angle + state.rotation;
          const x = centerX + Math.cos(globalAngle) * state.radius + (shape.shatterOffset?.x || 0);
          const y = centerY + Math.sin(globalAngle) * state.radius + (shape.shatterOffset?.y || 0);
          
          ctx.save();
          // Rotate shape to face outward
          ctx.translate(x, y);
          ctx.rotate(globalAngle + Math.PI / 2);
          
          // Draw the actual shape
          drawShape(ctx, shape.type, 0, 0, shapeSize, shape.isTargeted);
          ctx.restore();
        });

        // Draw Cipher (Center Display)
        if (state.phase === 'MEMORIZE') {
          const alpha = Math.min(1, state.memorizeTimer / 20); // Fade out at end
          ctx.globalAlpha = alpha;
          
          const spacing = 40;
          const totalWidth = (state.cipher.length - 1) * spacing;
          const startX = centerX - totalWidth / 2;
          
          // Background pill
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(centerX - totalWidth/2 - 30, centerY - 80, totalWidth + 60, 60, 30);
          ctx.fill();
          ctx.stroke();

          state.cipher.forEach((type, i) => {
            drawShape(ctx, type, startX + i * spacing, centerY - 50, 12, false);
          });
          
          ctx.globalAlpha = 1.0;
          
          // Progress bar for memorize time
          const progressWidth = 100;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fillRect(centerX - progressWidth/2, centerY - 15, progressWidth, 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(centerX - progressWidth/2, centerY - 15, progressWidth * (state.memorizeTimer / state.maxMemorizeTime), 2);
        }

        // Draw Input Progress (HUD)
        if (state.phase === 'INPUT') {
          const spacing = 30;
          const totalWidth = (state.cipher.length - 1) * spacing;
          const startX = centerX - totalWidth / 2;
          
          state.cipher.forEach((type, i) => {
            const isCompleted = i < state.inputProgress;
            const isCurrent = i === state.inputProgress;
            
            ctx.save();
            ctx.translate(startX + i * spacing, centerY - 50);
            
            if (isCompleted) {
              ctx.strokeStyle = '#00FF00';
              ctx.shadowBlur = 10;
              ctx.shadowColor = '#00FF00';
            } else if (isCurrent) {
              ctx.strokeStyle = '#FFFFFF';
              ctx.shadowBlur = 5;
              ctx.shadowColor = '#FFFFFF';
            } else {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            }
            
            ctx.lineWidth = isCurrent ? 2 : 1;
            
            ctx.beginPath();
            if (type === 'circle') {
              ctx.arc(0, 0, 8, 0, Math.PI * 2);
            } else if (type === 'square') {
              ctx.rect(-8, -8, 16, 16);
            } else if (type === 'triangle') {
              ctx.moveTo(0, -10);
              ctx.lineTo(9, 6);
              ctx.lineTo(-9, 6);
              ctx.closePath();
            }
            ctx.stroke();
            
            if (isCompleted) {
              ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
              ctx.fill();
            }
            
            ctx.restore();
          });
        }
      }

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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h1 className="text-4xl font-light text-white mb-2 tracking-[0.4em] ml-4">CIPHER</h1>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-16 uppercase">Cognitive Overload</p>
          
          <div className="space-y-6 text-sm text-gray-400 font-light tracking-wide max-w-xs mb-16">
            <p className="text-center text-white mb-4">Memorize the sequence.</p>
            <p className="flex items-center justify-between"><span className="text-white">Tap Shapes</span> <span>Input Cipher</span></p>
            <p className="flex items-center justify-between"><span className="text-white">Wrong Input</span> <span>Penalty</span></p>
            <div className="h-px w-full bg-white/10 my-4"></div>
            <p className="text-xs text-gray-500 italic text-center">Break the ring before it crushes you.</p>
          </div>

          <button 
            onClick={() => generateLevel(1)}
            className="px-10 py-3 border border-white/30 text-white text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            BEGIN
          </button>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h2 className="text-2xl font-light text-red-500 mb-2 tracking-[0.3em] ml-3">CRUSHED</h2>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-4 uppercase">Level {level}</p>
          <p className="text-white text-sm tracking-[0.2em] mb-12 uppercase">Score: {score}</p>
          <button 
            onClick={() => generateLevel(1)}
            className="px-10 py-3 border border-white/30 text-white text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            RESTART
          </button>
        </div>
      )}

      {gameState === 'LEVEL_COMPLETE' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h2 className="text-2xl font-light text-green-400 mb-2 tracking-[0.3em] ml-3">CIPHER BROKEN</h2>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-12 uppercase">Level {level} Cleared</p>
          <button 
            onClick={() => generateLevel(level + 1)}
            className="px-10 py-3 border border-white/30 text-white text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            NEXT LEVEL
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

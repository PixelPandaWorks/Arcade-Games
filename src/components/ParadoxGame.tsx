import React, { useEffect, useRef, useState, useCallback } from 'react';

type GameState = 'START' | 'PLAYING' | 'GAME_OVER' | 'LEVEL_COMPLETE';
type ObstacleType = 'piston_top' | 'piston_bottom' | 'laser';

interface Obstacle {
  type: ObstacleType;
  baseX: number;
  width: number;
  phase: number;
  speed: number;
  amplitude: number;
  baseHeight: number;
  // Computed each frame
  currentHeight?: number;
  isOn?: boolean;
}

// --- Audio Engine ---
class ParadoxAudio {
  ctx: AudioContext | null = null;
  droneOsc: OscillatorNode | null = null;
  droneGain: GainNode | null = null;
  noiseBuffer: AudioBufferSourceNode | null = null;
  noiseGain: GainNode | null = null;

  init() {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Deep Drone
      this.droneOsc = this.ctx.createOscillator();
      this.droneOsc.type = 'sawtooth';
      this.droneOsc.frequency.value = 50;
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0.15;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;

      this.droneOsc.connect(filter);
      filter.connect(this.droneGain);
      this.droneGain.connect(this.ctx.destination);
      this.droneOsc.start();

      // VHS Scrubbing Noise
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = this.ctx.createBufferSource();
      this.noiseBuffer.buffer = buffer;
      this.noiseBuffer.loop = true;
      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 2000;

      this.noiseBuffer.connect(noiseFilter);
      noiseFilter.connect(this.noiseGain);
      this.noiseGain.connect(this.ctx.destination);
      this.noiseBuffer.start();
    } catch (e) {
      console.warn("Audio init failed", e);
    }
  }

  update(timeMultiplier: number) {
    if (!this.ctx || !this.droneOsc || !this.noiseGain) return;
    
    const absMult = Math.abs(timeMultiplier);
    
    // Pitch shifts with time speed
    const targetFreq = 50 + (absMult - 1) * 30;
    this.droneOsc.frequency.setTargetAtTime(Math.max(20, targetFreq), this.ctx.currentTime, 0.1);
    
    // Noise increases when scrubbing away from 1.0x
    const scrubIntensity = Math.min(1, Math.abs(timeMultiplier - 1) / 2);
    this.noiseGain.gain.setTargetAtTime(scrubIntensity * 0.08, this.ctx.currentTime, 0.1);
  }

  playDeath() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  stop() {
    if (!this.ctx) return;
    this.droneGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    this.noiseGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => {
      this.droneOsc?.stop();
      this.noiseBuffer?.stop();
      this.ctx?.close();
    }, 200);
  }
}

export default function ParadoxGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [level, setLevel] = useState(1);
  const audioRef = useRef<ParadoxAudio | null>(null);
  
  const stateRef = useRef({
    status: 'START' as GameState,
    realTime: 0, // Distance player has traveled
    worldTime: 0, // Animation phase of the world
    scrollSpeed: 3,
    timeMultiplier: 1.0,
    targetTimeMultiplier: 1.0,
    isScrubbing: false,
    obstacles: [] as Obstacle[],
    levelLength: 0,
    playerRadius: Math.max(6, window.innerHeight * 0.01)
  });

  const generateLevel = useCallback((lvl: number) => {
    const length = 2000 + lvl * 1500;
    const obstacles: Obstacle[] = [];
    
    let currentX = 800; // First obstacle starts here
    
    while (currentX < length - 500) {
      const typeRoll = Math.random();
      
      if (typeRoll < 0.4 || lvl === 1) {
        // Piston Top
        obstacles.push({
          type: 'piston_top',
          baseX: currentX,
          width: window.innerWidth * 0.05 + Math.random() * (window.innerWidth * 0.05),
          phase: Math.random() * Math.PI * 2,
          speed: 0.02 + Math.random() * 0.02 + (lvl * 0.005),
          amplitude: window.innerHeight * 0.2 + Math.random() * (window.innerHeight * 0.15),
          baseHeight: window.innerHeight * 0.08
        });
      } else if (typeRoll < 0.8) {
        // Piston Bottom
        obstacles.push({
          type: 'piston_bottom',
          baseX: currentX,
          width: window.innerWidth * 0.05 + Math.random() * (window.innerWidth * 0.05),
          phase: Math.random() * Math.PI * 2,
          speed: 0.02 + Math.random() * 0.02 + (lvl * 0.005),
          amplitude: window.innerHeight * 0.2 + Math.random() * (window.innerHeight * 0.15),
          baseHeight: window.innerHeight * 0.08
        });
      } else {
        // Laser
        obstacles.push({
          type: 'laser',
          baseX: currentX,
          width: Math.max(4, window.innerWidth * 0.01),
          phase: Math.random() * Math.PI * 2,
          speed: 0.03 + Math.random() * 0.02,
          amplitude: 0,
          baseHeight: 0
        });
      }
      
      // Gap between obstacles decreases as level increases
      currentX += 300 - Math.min(150, lvl * 20) + Math.random() * 100;
    }

    stateRef.current = {
      ...stateRef.current,
      status: 'PLAYING',
      realTime: 0,
      worldTime: 0,
      scrollSpeed: 2.5 + (lvl * 0.2),
      timeMultiplier: 1.0,
      targetTimeMultiplier: 1.0,
      isScrubbing: false,
      obstacles,
      levelLength: length
    };
    
    setLevel(lvl);
    setGameState('PLAYING');

    if (!audioRef.current) {
      audioRef.current = new ParadoxAudio();
      audioRef.current.init();
    }
  }, []);

  // Input Handling
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if (stateRef.current.status !== 'PLAYING') return;
      stateRef.current.isScrubbing = true;
      updateMultiplier(e.clientX);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!stateRef.current.isScrubbing) return;
      updateMultiplier(e.clientX);
    };

    const handlePointerUp = () => {
      stateRef.current.isScrubbing = false;
      stateRef.current.targetTimeMultiplier = 1.0;
    };

    const updateMultiplier = (clientX: number) => {
      const width = window.innerWidth;
      const centerX = width / 2;
      // Map screen X to a multiplier between -3x (rewind) and +4x (fast forward)
      let mult = ((clientX - centerX) / centerX) * 4;
      
      // Deadzone in the middle to easily snap back to 1.0x
      if (Math.abs(mult) < 0.3) {
        mult = 1.0;
      } else if (mult > 0) {
        mult = 1.0 + mult; // 1 to 5
      } else {
        mult = mult; // 0 to -4
      }
      
      stateRef.current.targetTimeMultiplier = mult;
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

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.stop();
      }
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
      
      const playerX = width * 0.2;
      const playerY = height / 2;

      // Clear screen
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      if (state.status === 'PLAYING') {
        // Smoothly interpolate time multiplier
        state.timeMultiplier += (state.targetTimeMultiplier - state.timeMultiplier) * 0.15;
        
        // Update audio
        if (audioRef.current) {
          audioRef.current.update(state.timeMultiplier);
        }

        // Advance Times
        state.realTime += state.scrollSpeed;
        state.worldTime += state.scrollSpeed * state.timeMultiplier;

        // Check Level Complete
        if (state.realTime > state.levelLength) {
          state.status = 'LEVEL_COMPLETE';
          setGameState('LEVEL_COMPLETE');
        }

        // Compute Obstacle States & Check Collisions
        let collision = false;

        state.obstacles.forEach(obs => {
          const screenX = obs.baseX - state.realTime;
          
          // Only process if somewhat on screen
          if (screenX > -200 && screenX < width + 200) {
            
            if (obs.type === 'piston_top' || obs.type === 'piston_bottom') {
              // Sine wave animation
              const anim = Math.sin(state.worldTime * obs.speed + obs.phase);
              // Map -1..1 to 0..1
              const normalizedAnim = (anim + 1) / 2;
              obs.currentHeight = obs.baseHeight + normalizedAnim * obs.amplitude;
            } else if (obs.type === 'laser') {
              // Square wave animation
              const anim = Math.sin(state.worldTime * obs.speed + obs.phase);
              obs.isOn = anim > 0;
            }

            // Collision Detection
            if (screenX < playerX + state.playerRadius && screenX + obs.width > playerX - state.playerRadius) {
              if (obs.type === 'piston_top' && obs.currentHeight !== undefined) {
                if (playerY - state.playerRadius < obs.currentHeight) collision = true;
              } else if (obs.type === 'piston_bottom' && obs.currentHeight !== undefined) {
                if (playerY + state.playerRadius > height - obs.currentHeight) collision = true;
              } else if (obs.type === 'laser' && obs.isOn) {
                collision = true;
              }
            }
          }
        });

        if (collision) {
          state.status = 'GAME_OVER';
          setGameState('GAME_OVER');
          if (audioRef.current) audioRef.current.playDeath();
        }
      }

      // --- Drawing ---

      // Draw Center Track Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 15]);
      ctx.beginPath();
      ctx.moveTo(0, playerY);
      ctx.lineTo(width, playerY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Function to draw all obstacles
      const drawObstacles = (offsetX: number, color: string, isGlitch: boolean) => {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        
        state.obstacles.forEach(obs => {
          const screenX = obs.baseX - state.realTime + offsetX;
          if (screenX < -200 || screenX > width + 200) return;

          if (obs.type === 'piston_top' && obs.currentHeight !== undefined) {
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX, 0, obs.width, obs.currentHeight);
            // Hatching pattern inside
            if (!isGlitch) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
              ctx.fillRect(screenX, 0, obs.width, obs.currentHeight);
            }
          } else if (obs.type === 'piston_bottom' && obs.currentHeight !== undefined) {
            ctx.lineWidth = 2;
            ctx.strokeRect(screenX, height - obs.currentHeight, obs.width, obs.currentHeight);
            if (!isGlitch) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
              ctx.fillRect(screenX, height - obs.currentHeight, obs.width, obs.currentHeight);
            }
          } else if (obs.type === 'laser') {
            if (obs.isOn) {
              ctx.lineWidth = obs.width;
              ctx.beginPath();
              ctx.moveTo(screenX + obs.width / 2, 0);
              ctx.lineTo(screenX + obs.width / 2, height);
              ctx.stroke();
            } else if (!isGlitch) {
              // Draw faint warning line when off
              ctx.lineWidth = 1;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.setLineDash([10, 10]);
              ctx.beginPath();
              ctx.moveTo(screenX + obs.width / 2, 0);
              ctx.lineTo(screenX + obs.width / 2, height);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.strokeStyle = color; // reset
            }
          }
        });

        // Draw Exit Line
        const exitX = state.levelLength - state.realTime + offsetX;
        if (exitX > -100 && exitX < width + 100) {
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(exitX, 0);
          ctx.lineTo(exitX, height);
          ctx.stroke();
        }
      };

      // Chromatic Aberration / Glitch Effect when scrubbing
      const scrubIntensity = Math.abs(state.timeMultiplier - 1.0);
      if (scrubIntensity > 0.1 && state.status === 'PLAYING') {
        ctx.globalCompositeOperation = 'screen';
        const offset = scrubIntensity * 3;
        drawObstacles(-offset, 'rgba(255, 0, 0, 0.8)', true);
        drawObstacles(offset, 'rgba(0, 255, 255, 0.8)', true);
        drawObstacles(0, 'rgba(255, 255, 255, 0.9)', false);
        ctx.globalCompositeOperation = 'source-over';
        
        // Add subtle scanlines
        ctx.fillStyle = `rgba(255, 255, 255, ${scrubIntensity * 0.03})`;
        for (let i = 0; i < height; i += 4) {
          ctx.fillRect(0, i, width, 1);
        }
      } else {
        drawObstacles(0, '#FFFFFF', false);
      }

      // Draw Player
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(playerX, playerY, state.playerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw UI Scrubber Bar
      if (state.status === 'PLAYING') {
        const barY = height - 40;
        const barWidth = width * 0.6;
        const barX = (width - barWidth) / 2;

        // Base line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(barX, barY);
        ctx.lineTo(barX + barWidth, barY);
        ctx.stroke();

        // Center tick
        ctx.beginPath();
        ctx.moveTo(width / 2, barY - 5);
        ctx.lineTo(width / 2, barY + 5);
        ctx.stroke();

        // Current multiplier indicator
        // Map -4..5 to 0..1 roughly for visual representation
        // Actually, let's just map the raw pointer position equivalent
        let visualX = width / 2;
        if (state.timeMultiplier > 1) {
          visualX = width / 2 + ((state.timeMultiplier - 1) / 4) * (barWidth / 2);
        } else {
          visualX = width / 2 + ((state.timeMultiplier - 1) / 5) * (barWidth / 2);
        }
        
        visualX = Math.max(barX, Math.min(barX + barWidth, visualX));

        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(visualX, barY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Text
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '2px';
        ctx.fillText(`WORLD TIME: ${state.timeMultiplier.toFixed(1)}x`, width / 2, barY - 20);
        
        // Progress text
        const progress = Math.min(100, Math.max(0, (state.realTime / state.levelLength) * 100));
        ctx.textAlign = 'left';
        ctx.fillText(`PROG: ${progress.toFixed(0)}%`, 20, 30);
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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h1 className="text-4xl font-light text-white mb-2 tracking-[0.4em] ml-4">PARADOX</h1>
          <p className="text-gray-400 text-xs tracking-[0.2em] mb-16 uppercase">Temporal Navigation</p>
          
          <div className="space-y-6 text-sm text-gray-400 font-light tracking-wide max-w-xs mb-16">
            <p className="text-center text-white mb-4">You move forward automatically.</p>
            <p className="flex items-center justify-between"><span className="text-white">Drag Left</span> <span>Rewind World</span></p>
            <p className="flex items-center justify-between"><span className="text-white">Drag Right</span> <span>Fast-Forward</span></p>
            <div className="h-px w-full bg-white/10 my-4"></div>
            <p className="text-xs text-gray-500 italic text-center">Bend time to clear the path.</p>
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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h2 className="text-2xl font-light text-red-400 mb-2 tracking-[0.3em] ml-3">TIMELINE COLLAPSED</h2>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-12 uppercase">Sector {level}</p>
          <button 
            onClick={() => generateLevel(level)}
            className="px-10 py-3 border border-white/30 text-white text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            RETRY
          </button>
        </div>
      )}

      {gameState === 'LEVEL_COMPLETE' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-10 p-6 text-center transition-all duration-700">
          <h2 className="text-2xl font-light text-white mb-2 tracking-[0.3em] ml-3">SURVIVED</h2>
          <p className="text-gray-500 text-xs tracking-[0.2em] mb-12 uppercase">Sector {level} Cleared</p>
          <button 
            onClick={() => generateLevel(level + 1)}
            className="px-10 py-3 border border-white/30 text-white text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            PROCEED
          </button>
        </div>
      )}
    </div>
  );
}

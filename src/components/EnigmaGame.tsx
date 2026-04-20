import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Delete } from 'lucide-react';

type GameState = 'START' | 'PLAYING' | 'WIN' | 'LOSE';

const COLORS = [
  { id: 'cyan', hex: '#06b6d4', darkHex: '#083344' },
  { id: 'magenta', hex: '#d946ef', darkHex: '#4a044e' },
  { id: 'yellow', hex: '#eab308', darkHex: '#422006' },
  { id: 'green', hex: '#22c55e', darkHex: '#052e16' },
  { id: 'orange', hex: '#f97316', darkHex: '#431407' },
  { id: 'purple', hex: '#8b5cf6', darkHex: '#2e1065' },
];

interface Feedback {
  exact: number;
  partial: number;
}

export default function EnigmaGame() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [secretCode, setSecretCode] = useState<string[]>([]);
  const [guesses, setGuesses] = useState<string[][]>([]);
  const [currentGuess, setCurrentGuess] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  
  const [historyHigh, setHistoryHigh] = useState(() => parseInt(localStorage.getItem('arcade_enigma_streak') || '0', 10));
  const [currentStreak, setCurrentStreak] = useState(0);

  const startNewGame = useCallback((keepStreak: boolean = false) => {
    // Generate new code
    const newCode = [];
    for (let i = 0; i < 4; i++) {
      newCode.push(COLORS[Math.floor(Math.random() * COLORS.length)].id);
    }
    setSecretCode(newCode);
    setGuesses([]);
    setCurrentGuess([]);
    setFeedback([]);
    setGameState('PLAYING');
    
    if (!keepStreak) {
      setCurrentStreak(0);
    }
  }, []);

  const addColor = (colorId: string) => {
    if (gameState !== 'PLAYING' || currentGuess.length >= 4) return;
    setCurrentGuess([...currentGuess, colorId]);
  };

  const removeColor = () => {
    if (gameState !== 'PLAYING' || currentGuess.length === 0) return;
    setCurrentGuess(currentGuess.slice(0, -1));
  };

  const submitGuess = () => {
    if (gameState !== 'PLAYING' || currentGuess.length !== 4) return;

    let exact = 0;
    let partial = 0;
    const secretCopy = [...secretCode];
    const guessCopy = [...currentGuess];

    // First pass: exact matches
    for (let i = 0; i < 4; i++) {
      if (guessCopy[i] === secretCopy[i]) {
        exact++;
        secretCopy[i] = null as any;
        guessCopy[i] = null as any;
      }
    }

    // Second pass: partial matches
    for (let i = 0; i < 4; i++) {
      if (guessCopy[i] !== null) {
        const matchIndex = secretCopy.indexOf(guessCopy[i]);
        if (matchIndex !== -1) {
          partial++;
          secretCopy[matchIndex] = null as any;
        }
      }
    }

    const newFeedback = [...feedback, { exact, partial }];
    const newGuesses = [...guesses, currentGuess];
    
    setFeedback(newFeedback);
    setGuesses(newGuesses);
    setCurrentGuess([]);

    if (exact === 4) {
      setGameState('WIN');
      setCurrentStreak(prev => {
        const newStreak = prev + 1;
        setHistoryHigh(high => {
          const newHigh = Math.max(high, newStreak);
          localStorage.setItem('arcade_enigma_streak', newHigh.toString());
          return newHigh;
        });
        return newStreak;
      });
    } else if (newGuesses.length >= 8) {
      setGameState('LOSE');
    }
  };

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING') return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        removeColor();
      } else if (e.key === 'Enter') {
        submitGuess();
      } else {
        // Map 1-6 to colors
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 6) {
          addColor(COLORS[num - 1].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentGuess, gameState]);


  // Helper to render feedback pegs
  const renderFeedback = (fb: Feedback) => {
    const pegs = [];
    for (let i = 0; i < fb.exact; i++) {
      pegs.push(<div key={`exact-${i}`} className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />);
    }
    for (let i = 0; i < fb.partial; i++) {
      pegs.push(<div key={`partial-${i}`} className="w-2 h-2 rounded-full border border-gray-400" />);
    }
    for (let i = pegs.length; i < 4; i++) {
      pegs.push(<div key={`empty-${i}`} className="w-2 h-2 rounded-full bg-white/5" />);
    }
    return (
      <div className="grid grid-cols-2 gap-1.5 w-6 h-6">
        {pegs}
      </div>
    );
  };

  const getColorHex = (id: string) => COLORS.find(c => c.id === id)?.hex || '#fff';
  const getDarkColorHex = (id: string) => COLORS.find(c => c.id === id)?.darkHex || '#000';

  return (
    <div className="flex flex-col h-full bg-black text-white font-sans w-full max-w-lg mx-auto p-4 md:p-8 relative">
      
      {/* Instructions Overlay */}
      {gameState === 'START' && (
        <div 
          onClick={() => startNewGame(true)}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-30 p-6 text-center cursor-pointer"
        >
          <h1 className="text-4xl md:text-5xl font-thin tracking-[0.4em] text-white mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">ENIGMA</h1>
          <p className="text-fuchsia-400 text-xs tracking-[0.2em] mb-12 uppercase">Cryptographic Decryption</p>
          
          <div className="max-w-xs border border-white/10 bg-black/50 p-6 rounded-2xl mb-12 space-y-4 text-sm text-gray-300 font-light">
            <p>Deduce the 4-node sequence.</p>
            <div className="flex items-center gap-3 text-left">
              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] shrink-0" />
              <span>Correct color & position.</span>
            </div>
            <div className="flex items-center gap-3 text-left">
              <div className="w-2 h-2 rounded-full border border-gray-400 shrink-0" />
              <span>Correct color, wrong position.</span>
            </div>
            <p className="text-xs text-gray-500 pt-2 border-t border-white/10">You have 8 attempts. System will lock on failure.</p>
          </div>

          <p className="animate-pulse text-cyan-400 text-xs tracking-[0.3em] uppercase">
            TAP ANYWHERE TO INITIALIZE
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-8 shrink-0 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-2xl font-light tracking-[0.3em] text-white/90">ENIGMA</h2>
        </div>
        <div className="text-right flex flex-col gap-1">
          <span className="text-xs text-gray-500 tracking-widest uppercase">Streak: {currentStreak}</span>
          {historyHigh > 0 && <span className="text-xs text-fuchsia-400 tracking-widest uppercase text-shadow-[0_0_8px_rgba(217,70,239,0.5)]">Max: {historyHigh}</span>}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-y-auto mb-6 flex flex-col justify-end gap-2 pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {/* Past Guesses */}
        {guesses.map((guess, idx) => (
          <div key={idx} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5">
            <div className="w-6 text-xs text-gray-600 font-mono">0{idx + 1}</div>
            <div className="flex gap-3">
              {guess.map((colorId, i) => (
                <div 
                  key={i} 
                  className="w-8 h-8 rounded-full border border-black"
                  style={{ 
                    backgroundColor: getColorHex(colorId),
                    boxShadow: `0 0 10px ${getColorHex(colorId)}40`
                  }}
                />
              ))}
            </div>
            <div className="w-px h-8 bg-white/10 mx-2" />
            <div className="flex items-center justify-center w-8">
              {renderFeedback(feedback[idx])}
            </div>
          </div>
        ))}

        {/* Current Guess Row */}
        {gameState === 'PLAYING' && (
          <div className="flex items-center justify-between bg-white/10 p-3 rounded-lg border border-white/20 shadow-lg mt-2">
            <div className="w-6 text-xs text-white/50 font-mono animate-pulse">&gt;_</div>
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((i) => {
                const colorId = currentGuess[i];
                return (
                  <div 
                    key={i} 
                    className={`w-8 h-8 rounded-full border transition-all duration-200 ${
                      colorId 
                        ? 'border-transparent' 
                        : 'border-white/20 border-dashed bg-black/50'
                    }`}
                    style={colorId ? { 
                      backgroundColor: getColorHex(colorId),
                      boxShadow: `0 0 15px ${getColorHex(colorId)}80`
                    } : {}}
                  />
                );
              })}
            </div>
            <div className="w-px h-8 bg-white/10 mx-2" />
            <div className="flex items-center justify-center w-8">
               <div className="grid grid-cols-2 gap-1.5 w-6 h-6 opacity-20">
                 {[...Array(4)].map((_, i) => <div key={i} className="w-2 h-2 rounded-full bg-white" />)}
               </div>
            </div>
          </div>
        )}
      </div>

      {/* End Game States */}
      {gameState === 'WIN' && (
        <div className="mb-6 p-6 bg-cyan-900/30 border border-cyan-400 rounded-xl text-center">
          <h3 className="text-xl text-cyan-400 tracking-[0.3em] mb-2 font-light">SYSTEM BREACHED</h3>
          <p className="text-xs text-cyan-200/70 uppercase tracking-widest mb-6">Code Decrypted in {guesses.length} attempts</p>
          <button 
            onClick={() => startNewGame(true)}
            className="px-8 py-3 bg-cyan-400 text-black text-xs tracking-[0.2em] uppercase rounded hover:bg-cyan-300 transition-colors"
          >
            NEXT NODE
          </button>
        </div>
      )}

      {gameState === 'LOSE' && (
        <div className="mb-6 p-6 bg-red-900/30 border border-red-500 rounded-xl text-center">
          <h3 className="text-xl text-red-500 tracking-[0.3em] mb-2 font-light">ACCESS DENIED</h3>
          <p className="text-xs text-red-200/70 uppercase tracking-widest mb-4">Correct Sequence:</p>
          <div className="flex justify-center gap-2 mb-6">
            {secretCode.map((colorId, i) => (
              <div 
                key={i} 
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: getColorHex(colorId) }}
              />
            ))}
          </div>
          <button 
            onClick={() => startNewGame(false)}
            className="px-8 py-3 border border-red-500 text-red-400 text-xs tracking-[0.2em] uppercase rounded hover:bg-red-500 hover:text-black transition-colors"
          >
            REBOOT SYSTEM
          </button>
        </div>
      )}

      {/* Controls */}
      <div className={`shrink-0 transition-opacity ${gameState !== 'PLAYING' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
        <div className="grid grid-cols-6 gap-2 mb-4">
          {COLORS.map((c, i) => (
            <button
              key={c.id}
              onClick={() => addColor(c.id)}
              disabled={currentGuess.length >= 4}
              className="aspect-square rounded-lg border border-white/10 active:scale-95 transition-transform flex flex-col items-center justify-center relative overflow-hidden group"
              style={{ backgroundColor: c.darkHex }}
            >
              <div 
                className="w-4 h-4 rounded-full relative z-10"
                style={{ backgroundColor: c.hex, boxShadow: `0 0 10px ${c.hex}80` }}
              />
              {/* Optional number hint for keyboard players */}
              <span className="absolute bottom-1 right-1.5 text-[8px] text-white/30 font-mono">{i+1}</span>
            </button>
          ))}
        </div>
        
        <div className="flex gap-2 h-12">
          <button 
            onClick={removeColor}
            disabled={currentGuess.length === 0}
            className="flex-1 bg-white/5 border border-white/10 rounded tracking-[0.2em] text-xs uppercase flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            <Delete size={14} /> Del
          </button>
          <button 
            onClick={submitGuess}
            disabled={currentGuess.length !== 4}
            className="flex-[2] bg-white text-black font-medium border border-white rounded tracking-[0.2em] text-xs uppercase hover:bg-cyan-100 disabled:opacity-50 disabled:bg-gray-700 disabled:text-gray-400 disabled:border-gray-700 transition-colors"
          >
            Execute
          </button>
        </div>
      </div>
      
    </div>
  );
}

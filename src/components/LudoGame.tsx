import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../firebase';
import { collection, doc, addDoc, onSnapshot, updateDoc, query, where, getDocs, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { Copy, Plus, Play, User as UserIcon, RefreshCcw, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Crown, Home } from 'lucide-react';

interface LudoGameData {
  id?: string;
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  playerIds: string[];
  playerNames: Record<string, string>;
  playerColors: Record<string, string>; // uid -> 'red' | 'green' | 'yellow' | 'blue'
  currentTurnIndex: number;
  tokens: Record<string, number[]>; // uid -> [pos0, pos1, pos2, pos3]. -1 = base, 0-50 = track, 51-56 = home path, 57 = completed
  diceValue: number;
  diceRolled: boolean;
  winnerId?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

const COLORS = ['red', 'green', 'yellow', 'blue'];
const COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
};

// Map each color to its starting position on the main track (0-51)
// We will consider the track as a circle from 0 to 51.
// Red starts at 0, Green at 13, Yellow at 26, Blue at 39.
const START_POSITIONS: Record<string, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39
};

const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

export default function LudoGame({ initialJoinId }: { initialJoinId?: string }) {
  const [user, setUser] = useState(auth.currentUser);
  const [alias, setAlias] = useState('');
  const [aliasSet, setAliasSet] = useState(false);
  const [gameId, setGameId] = useState<string | null>(initialJoinId || null);
  const [game, setGame] = useState<LudoGameData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u?.displayName) {
        setAlias(u.displayName);
        setAliasSet(true);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!gameId || !user || !aliasSet) return;
    
    const unsub = onSnapshot(doc(db, 'ludo_games', gameId), (doc) => {
      if (doc.exists()) {
        setGame({ id: doc.id, ...doc.data() } as LudoGameData);
      } else {
        setError('Game not found or ended.');
        setGameId(null);
      }
    });
    return () => unsub();
  }, [gameId, user, aliasSet]);

  const joinGame = async (code: string) => {
    if (!user) return;
    setError('');
    try {
      const gDoc = await getDoc(doc(db, 'ludo_games', code));
      if (!gDoc.exists()) {
        setError('Invalid game code.');
        return;
      }
      const gData = gDoc.data() as LudoGameData;
      if (gData.status !== 'waiting') {
        setError('Game already started.');
        return;
      }
      if (gData.playerIds.length >= 4) {
        setError('Lobby is full.');
        return;
      }
      
      const newPlayerIds = [...gData.playerIds];
      const newPlayerNames = { ...gData.playerNames };
      const newPlayerColors = { ...gData.playerColors };
      const newTokens = { ...gData.tokens };
      
      if (!newPlayerIds.includes(user.uid)) {
        newPlayerIds.push(user.uid);
        newPlayerNames[user.uid] = alias;
        newPlayerColors[user.uid] = COLORS[newPlayerIds.length - 1]; // assign next color
        newTokens[user.uid] = [-1, -1, -1, -1];
        
        await updateDoc(doc(db, 'ludo_games', code), {
          playerIds: newPlayerIds,
          playerNames: newPlayerNames,
          playerColors: newPlayerColors,
          tokens: newTokens,
          updatedAt: serverTimestamp()
        });
      }
      setGameId(code);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const hostGame = async () => {
    if (!user) return;
    setError('');
    const newGame: Partial<LudoGameData> = {
      status: 'waiting',
      hostId: user.uid,
      playerIds: [user.uid],
      playerNames: { [user.uid]: alias },
      playerColors: { [user.uid]: COLORS[0] },
      currentTurnIndex: 0,
      tokens: { [user.uid]: [-1, -1, -1, -1] },
      diceValue: 1,
      diceRolled: false,
      winnerId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    try {
      let code = '';
      let exists = true;
      let docRef;
      while (exists) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        docRef = doc(db, 'ludo_games', code);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          exists = false;
        }
      }
      await setDoc(docRef!, newGame);
      setGameId(code);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startGame = async () => {
    if (!game || game.hostId !== user?.uid || game.playerIds.length < 2) return;
    await updateDoc(doc(db, 'ludo_games', game.id!), {
      status: 'playing',
      updatedAt: serverTimestamp()
    });
  };

  const leaveGame = () => {
    setGameId(null);
    setGame(null);
  };

  const rollDice = async () => {
    if (!game || !user || game.status !== 'playing' || game.diceRolled || game.playerIds[game.currentTurnIndex] !== user.uid) return;
    
    const value = Math.floor(Math.random() * 6) + 1;
    
    let updates: Partial<LudoGameData> = {
      diceValue: value,
      diceRolled: true,
      updatedAt: serverTimestamp()
    };
    
    // Check if player has any valid moves
    const myColor = game.playerColors[user.uid];
    const myTokens = game.tokens[user.uid];
    let hasValidMove = false;
    
    for (let i = 0; i < 4; i++) {
      let pos = myTokens[i];
      if (pos === -1 && value === 6) { hasValidMove = true; break; }
      if (pos >= 0 && pos < 57) {
        if (pos + value <= 57) { hasValidMove = true; break; }
      }
    }
    
    if (!hasValidMove) {
      // automatically pass turn
      updates.diceRolled = false;
      updates.currentTurnIndex = (value === 6) ? game.currentTurnIndex : (game.currentTurnIndex + 1) % game.playerIds.length;
    }
    
    await updateDoc(doc(db, 'ludo_games', game.id!), updates);
  };

  const moveToken = async (tokenIdx: number) => {
    if (!game || !user || game.status !== 'playing' || !game.diceRolled || game.playerIds[game.currentTurnIndex] !== user.uid) return;
    
    const myColor = game.playerColors[user.uid];
    const myTokens = [...game.tokens[user.uid]];
    const startPosForColor = START_POSITIONS[myColor];
    
    let pos = myTokens[tokenIdx];
    let newTokens = { ...game.tokens };
    let newPos = pos;
    
    if (pos === -1) {
      if (game.diceValue !== 6) return; // Need 6 to get out
      newPos = 0; // Relative 0 means starting on their track part
    } else {
      if (pos + game.diceValue > 57) return; // Need exact roll
      newPos = pos + game.diceValue;
    }
    
    myTokens[tokenIdx] = newPos;
    newTokens[user.uid] = myTokens;
    
    // Process captures (only if on main track, not safe square)
    // Absolute position calculation: (startPosForColor + newPos) % 52
    // If newPos >= 51, it's in the home stretch, NO CAPTURES
    let madeCapture = false;
    if (newPos >= 0 && newPos <= 50) {
      const myAbsPos = (startPosForColor + newPos) % 52;
      
      if (!SAFE_SQUARES.includes(myAbsPos)) {
        for (const pid of game.playerIds) {
          if (pid !== user.uid) {
            const oppColor = game.playerColors[pid];
            const oppTokens = [...newTokens[pid]];
            const oppStartPos = START_POSITIONS[oppColor];
            
            for (let i = 0; i < 4; i++) {
              if (oppTokens[i] >= 0 && oppTokens[i] <= 50) {
                const oppAbsPos = (oppStartPos + oppTokens[i]) % 52;
                if (oppAbsPos === myAbsPos) {
                  // Captured!
                  oppTokens[i] = -1;
                  madeCapture = true;
                }
              }
            }
            newTokens[pid] = oppTokens;
          }
        }
      }
    }
    
    // Check win condition
    const hasWon = myTokens.every(t => t === 57);
    
    const updates: Partial<LudoGameData> = {
      tokens: newTokens,
      diceRolled: false,
      updatedAt: serverTimestamp()
    };
    
    if (hasWon) {
      updates.status = 'finished';
      updates.winnerId = user.uid;
    } else {
      // You get another turn if you roll a 6 OR you made a capture, OR if you reach home? 
      // Simplified: another turn on 6 or capture.
      const getsAnotherTurn = game.diceValue === 6 || madeCapture || newPos === 57;
      if (!getsAnotherTurn) {
        updates.currentTurnIndex = (game.currentTurnIndex + 1) % game.playerIds.length;
      }
    }
    
    await updateDoc(doc(db, 'ludo_games', game.id!), updates);
  };

  // --- RENDER HELPERS ---
  const boardCells = Array.from({ length: 15 * 15 }, (_, i) => {
    const r = Math.floor(i / 15);
    const c = i % 15;
    return { r, c, idx: i };
  });

  // Mapping 52 absolute track positions to logical (x,y)
  const trackPath = [
    // Red Start line to bottom
    {x:1, y:6},{x:2, y:6},{x:3, y:6},{x:4, y:6},{x:5, y:6},
    {x:6, y:5},{x:6, y:4},{x:6, y:3},{x:6, y:2},{x:6, y:1},{x:6, y:0},
    // Top Green section
    {x:7, y:0},{x:8, y:0},
    {x:8, y:1},{x:8, y:2},{x:8, y:3},{x:8, y:4},{x:8, y:5},
    {x:9, y:6},{x:10,y:6},{x:11,y:6},{x:12,y:6},{x:13,y:6},{x:14,y:6},
    // Right Yellow section
    {x:14,y:7},{x:14,y:8},
    {x:13,y:8},{x:12,y:8},{x:11,y:8},{x:10,y:8},{x:9, y:8},
    {x:8, y:9},{x:8, y:10},{x:8,y:11},{x:8,y:12},{x:8,y:13},{x:8,y:14},
    // Bottom Blue section
    {x:7, y:14},{x:6, y:14},
    {x:6, y:13},{x:6, y:12},{x:6, y:11},{x:6, y:10},{x:6, y:9},
    {x:5, y:8},{x:4, y:8},{x:3, y:8},{x:2, y:8},{x:1, y:8},{x:0, y:8},
    // Left Red start again
    {x:0, y:7},{x:0, y:6}
  ];

  const getAbsPosCoords = (absPos: number) => {
    return trackPath[absPos % 52];
  };

  const getHomePathCoords = (color: string, steps: number) => {
    // steps from 1 to 5
    if (color === 'red') return { x: steps, y: 7 };
    if (color === 'green') return { x: 7, y: steps };
    if (color === 'yellow') return { x: 14 - steps, y: 7 };
    if (color === 'blue') return { x: 7, y: 14 - steps };
    return { x: 7, y: 7 };
  };

  const getTokenCoords = (pid: string, tokenIdx: number) => {
    if (!game) return null;
    const color = game.playerColors[pid];
    const pos = game.tokens[pid][tokenIdx];
    
    if (pos === -1) {
      // Base positions
      let bx = 0, by = 0;
      if (color === 'red') { bx = 1; by = 1; }
      if (color === 'green') { bx = 10; by = 1; }
      if (color === 'yellow') { bx = 10; by = 10; }
      if (color === 'blue') { bx = 1; by = 10; }
      
      const offsets = [{dx: 1, dy: 1}, {dx: 3, dy: 1}, {dx: 1, dy: 3}, {dx: 3, dy: 3}];
      return { x: bx + offsets[tokenIdx].dx, y: by + offsets[tokenIdx].dy };
    }
    
    if (pos <= 50) {
      const absPos = (START_POSITIONS[color] + pos) % 52;
      return getAbsPosCoords(absPos);
    } else if (pos <= 55) {
      return getHomePathCoords(color, pos - 50);
    } else {
      // Center (completed)
      return { x: 7, y: 7 };
    }
  };

  if (!user || !aliasSet) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto p-6 space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center">
          <h1 className="text-4xl font-light tracking-[0.3em] mb-2 text-red-500">LUDO</h1>
          <p className="text-white/50 text-xs tracking-widest uppercase">Classic Board Game</p>
        </div>
        <div className="w-full space-y-4">
          <input 
            type="text" 
            placeholder="ENTER ALIAS" 
            value={alias}
            onChange={e => setAlias(e.target.value.toUpperCase())}
            maxLength={12}
            className="w-full bg-white/5 border border-white/20 p-4 rounded text-center text-white placeholder:text-white/30 tracking-[0.2em] focus:outline-none focus:border-red-500 transition-colors"
          />
          <button 
            onClick={() => setAliasSet(true)}
            disabled={!alias.trim()}
            className="w-full bg-red-600/20 border border-red-500 text-red-400 p-4 rounded hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 tracking-[0.2em]"
          >
            INITIALIZE
          </button>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto p-6 space-y-8">
        <h1 className="text-3xl font-light tracking-[0.3em] text-red-500 mb-8">LUDO LOBBY</h1>
        {error && <div className="text-red-400 text-sm tracking-widest">{error}</div>}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          <button onClick={hostGame} className="flex flex-col items-center gap-2 p-6 rounded-xl border border-white/20 hover:border-red-500 hover:bg-red-500/10 transition-colors text-white">
             <Plus size={24} />
             <span className="text-xs tracking-[0.2em]">HOST GAME</span>
          </button>
          
          <div className="flex flex-col gap-2">
            <input 
              id="joinCode"
              placeholder="ENTER CODE" 
              maxLength={6}
              className="bg-white/5 border border-white/20 p-4 rounded-xl text-center text-white placeholder:text-white/30 tracking-[0.2em] font-mono font-bold text-xl uppercase focus:outline-none focus:border-red-500"
              onKeyDown={(e) => {
                 if (e.key === 'Enter') {
                    joinGame(e.currentTarget.value.trim().toUpperCase());
                 }
              }}
            />
            <button 
               onClick={() => {
                 const el = document.getElementById('joinCode') as HTMLInputElement;
                 joinGame(el.value.trim().toUpperCase());
               }}
               className="p-4 rounded-xl border border-white/20 hover:border-red-500 bg-white/5 flex items-center justify-center gap-2 text-white"
            >
               <Play size={18} />
               <span className="text-xs tracking-[0.2em]">JOIN</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (game.status === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-8">
        <div className="text-center">
          <h2 className="text-red-500 tracking-[0.3em] font-light text-2xl mb-2">LUDO LOBBY</h2>
          <div className="bg-black/50 border border-white/10 px-6 py-3 rounded flex items-center gap-4 cursor-pointer hover:bg-white/5" onClick={() => navigator.clipboard.writeText(game.id!)}>
            <span className="font-mono text-xl text-cyan-400 tracking-wider font-bold">{game.id}</span>
            <Copy size={16} className="text-white/50" />
          </div>
        </div>

        <div className="w-full space-y-2">
          {game.playerIds.map((pid, idx) => (
             <div key={pid} className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded">
                <div className="w-3 h-3 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: COLOR_HEX[game.playerColors[pid]], color: COLOR_HEX[game.playerColors[pid]] }}></div>
                <span className="flex-1 tracking-widest text-sm uppercase text-white">{game.playerNames[pid]} {pid === user.uid && "(YOU)"}</span>
             </div>
          ))}
          {Array.from({ length: 4 - game.playerIds.length }).map((_, i) => (
             <div key={i} className="flex items-center gap-4 p-4 border border-dashed border-white/10 rounded opacity-30">
                <div className="w-3 h-3 rounded-full bg-white/20 animate-pulse"></div>
                <span className="tracking-widest text-sm text-white">WAITING...</span>
             </div>
          ))}
        </div>

        {game.hostId === user.uid && (
          <button 
            onClick={startGame}
            disabled={game.playerIds.length < 2}
            className="w-full p-4 tracking-[0.3em] font-bold bg-red-600/20 border border-red-500 text-red-100 rounded hover:bg-red-500 hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            START GAME
          </button>
        )}
        
        <button onClick={leaveGame} className="text-white/30 hover:text-white text-xs tracking-widest mt-4">LEAVE LOBBY</button>
      </div>
    );
  }

  const isMyTurn = game.status === 'playing' && game.playerIds[game.currentTurnIndex] === user.uid;
  const turnColor = game.playerColors[game.playerIds[game.currentTurnIndex]] || 'white';
  const myColor = game.playerColors[user.uid];

  const getDiceIcon = (val: number) => {
    switch(val) {
      case 1: return <Dice1 size={32} />;
      case 2: return <Dice2 size={32} />;
      case 3: return <Dice3 size={32} />;
      case 4: return <Dice4 size={32} />;
      case 5: return <Dice5 size={32} />;
      case 6: return <Dice6 size={32} />;
      default: return <Dice1 size={32} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-white font-sans w-full mx-auto relative overflow-hidden pb-8">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-white/5 shrink-0 z-10 w-full max-w-xl mx-auto">
         <div className="flex gap-4">
            {game.playerIds.map(pid => {
               const isActive = game.playerIds[game.currentTurnIndex] === pid;
               const pColor = game.playerColors[pid];
               return (
                 <div key={pid} className={`flex flex-col p-2 rounded border transition-all ${isActive ? 'bg-white/10 scale-110' : 'bg-black/40 opacity-50'} shadow-xl`} style={{ borderColor: COLOR_HEX[pColor] }}>
                    <span className="text-[10px] tracking-widest font-bold" style={{ color: COLOR_HEX[pColor] }}>{game.playerNames[pid]}</span>
                 </div>
               );
            })}
         </div>
      </div>

      {game.status === 'finished' && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur z-50 flex flex-col items-center justify-center p-6 text-center">
           <Crown size={48} className="mb-6 drop-shadow-[0_0_15px_currentColor]" style={{ color: COLOR_HEX[game.playerColors[game.winnerId!]] }} />
           <h2 className="text-4xl tracking-[0.3em] font-light mb-2">GAME OVER</h2>
           <p className="tracking-widest mb-12" style={{ color: COLOR_HEX[game.playerColors[game.winnerId!]] }}>Winner: {game.playerNames[game.winnerId!]}</p>
           <button onClick={leaveGame} className="px-8 py-3 border border-white/20 tracking-[0.2em] rounded hover:bg-white hover:text-black transition-colors">LEAVE</button>
        </div>
      )}

      {/* Board & Controls Area */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 w-full max-w-5xl mx-auto p-4 z-10">
        
        {/* LUDO BOARD */}
        <div className="relative w-[320px] h-[320px] sm:w-[450px] sm:h-[450px] bg-white border-2 border-white rounded shrink-0" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%, #eee), repeating-linear-gradient(45deg, #eee 25%, #fff 25%, #fff 75%, #eee 75%, #eee)', backgroundSize: '20px 20px' }}>
            
            {/* Draw grid cells overlay */}
            <div className="absolute inset-0 grid grid-cols-15 grid-rows-15">
              {boardCells.map(cell => {
                 let bg = 'transparent';
                 let border = 'border-black/10 border-[0.5px]';
                 
                 // Colored Bases
                 if (cell.r < 6 && cell.c < 6) bg = COLOR_HEX.red;
                 if (cell.r < 6 && cell.c > 8) bg = COLOR_HEX.green;
                 if (cell.r > 8 && cell.c > 8) bg = COLOR_HEX.yellow;
                 if (cell.r > 8 && cell.c < 6) bg = COLOR_HEX.blue;

                 // Safe zones & Paths
                 if ((cell.r === 6 && cell.c === 1) || (cell.r === 7 && cell.c > 0 && cell.c < 6)) bg = COLOR_HEX.red;
                 if ((cell.r === 1 && cell.c === 8) || (cell.c === 7 && cell.r > 0 && cell.r < 6)) bg = COLOR_HEX.green;
                 if ((cell.r === 8 && cell.c === 13) || (cell.r === 7 && cell.c > 8 && cell.c < 14)) bg = COLOR_HEX.yellow;
                 if ((cell.r === 13 && cell.c === 6) || (cell.c === 7 && cell.r > 8 && cell.r < 14)) bg = COLOR_HEX.blue;
                 
                 // Star / Safe Squares (approx)
                 if (cell.r === 8 && cell.c === 2) bg = '#e2e8f0'; // Red safe
                 if (cell.r === 2 && cell.c === 6) bg = '#e2e8f0'; // Green safe
                 if (cell.r === 6 && cell.c === 12) bg = '#e2e8f0'; // Yellow safe
                 if (cell.r === 12 && cell.c === 8) bg = '#e2e8f0'; // Blue safe
                 
                 // Center Home
                 if (cell.r >= 6 && cell.r <= 8 && cell.c >= 6 && cell.c <= 8) {
                    bg = 'transparent'; // Let CSS triangle handle it or just keep black
                    border = '';
                 }

                 return (
                   <div key={cell.idx} className={`w-full h-full ${border}`} style={{ backgroundColor: bg }}>
                      {/* Base white squares */}
                      {cell.r === 1 && cell.c === 1 && <div className="ml-1 mt-1 w-[400%] h-[400%] bg-white rounded-lg flex items-center justify-center p-3"><div className="w-full h-full rounded border-2 border-red-500"></div></div>}
                      {cell.r === 1 && cell.c === 10 && <div className="ml-1 mt-1 w-[400%] h-[400%] bg-white rounded-lg flex items-center justify-center p-3"><div className="w-full h-full rounded border-2 border-green-500"></div></div>}
                      {cell.r === 10 && cell.c === 10 && <div className="ml-1 mt-1 w-[400%] h-[400%] bg-white rounded-lg flex items-center justify-center p-3"><div className="w-full h-full rounded border-2 border-yellow-500"></div></div>}
                      {cell.r === 10 && cell.c === 1 && <div className="ml-1 mt-1 w-[400%] h-[400%] bg-white rounded-lg flex items-center justify-center p-3"><div className="w-full h-full rounded border-2 border-blue-500"></div></div>}
                      
                      {/* Home Triangles in Center */}
                      {cell.r === 6 && cell.c === 6 && (
                        <div className="absolute top-[40%] left-[40%] w-[20%] h-[20%] border-[2px] border-black/50 overflow-hidden transform rotate-45 z-0 bg-white">
                        </div>
                      )}
                   </div>
                 );
              })}
            </div>
            
            {/* Tokens Layer */}
            {game.playerIds.map(pid => {
               return [0, 1, 2, 3].map(tIdx => {
                  const coords = getTokenCoords(pid, tIdx);
                  if (!coords) return null;
                  
                  const pColor = game.playerColors[pid];
                  const tPos = game.tokens[pid][tIdx];

                  // is this token movable right now?
                  let isMovable = false;
                  if (isMyTurn && game.diceRolled && pid === user.uid) {
                    if (tPos === -1 && game.diceValue === 6) isMovable = true;
                    if (tPos >= 0 && tPos < 57 && tPos + game.diceValue <= 57) isMovable = true;
                  }

                  // calc position (percentage)
                  const left = `${(coords.x / 15) * 100}%`;
                  const top = `${(coords.y / 15) * 100}%`;

                  return (
                    <motion.div 
                      key={`${pid}-${tIdx}`}
                      className="absolute w-[6%] h-[6%] rounded-full shadow-[0_2px_5px_rgba(0,0,0,0.5)] border-2 border-white -translate-x-[10%] -translate-y-[10%] z-20 flex items-center justify-center"
                      style={{ 
                        backgroundColor: COLOR_HEX[pColor],
                        color: 'white',
                      }}
                      animate={{ left, top, scale: isMovable ? [1, 1.2, 1] : 1 }}
                      transition={{ duration: 0.3, scale: { repeat: isMovable ? Infinity : 0, duration: 1 } }}
                      onClick={() => { if (isMovable) moveToken(tIdx); }}
                    >
                       <div className="w-[40%] h-[40%] bg-white/30 rounded-full" />
                       {isMovable && <div className="absolute inset-0 rounded-full cursor-pointer hover:bg-white/20 transition-colors pointer-events-auto" />}
                    </motion.div>
                  );
               });
            })}
        </div>

        {/* Controls Panel */}
        <div className="flex flex-col gap-6 w-full max-w-sm">
           
           <div className={`p-6 rounded-xl border flex flex-col items-center justify-center transition-colors ${isMyTurn ? 'bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'bg-black/50 opacity-50'}`} style={{ borderColor: COLOR_HEX[turnColor] }}>
              <div className="text-xs tracking-[0.2em] mb-4 text-center">
                 {isMyTurn ? "YOUR TURN" : `${game.playerNames[game.playerIds[game.currentTurnIndex]]}'S TURN`}
              </div>
              
              <div className="flex items-center justify-center gap-4 text-4xl mb-6 font-bold" style={{ color: COLOR_HEX[turnColor] }}>
                 {game.diceRolled ? getDiceIcon(game.diceValue) : <div className="w-12 h-12 flex items-center justify-center border-2 border-dashed border-white/20 rounded-xl animate-pulse"><RefreshCcw size={20} className="text-white/50" /></div>}
              </div>

              {isMyTurn && !game.diceRolled && (
                <button 
                  onClick={rollDice}
                  className="px-8 py-3 bg-white/10 border border-white/30 rounded hover:bg-white hover:text-black transition-colors tracking-widest text-sm"
                  style={{ color: COLOR_HEX[myColor] }}
                >
                  ROLL DICE
                </button>
              )}

              {isMyTurn && game.diceRolled && (
                <div className="text-[10px] tracking-widest text-white/50 text-center uppercase animate-pulse">
                  Select a token to move
                </div>
              )}
           </div>

        </div>

      </div>
    </div>
  );
}

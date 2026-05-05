import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../firebase';
import { signInAnonymously, updateProfile } from 'firebase/auth';
import { collection, doc, addDoc, onSnapshot, updateDoc, query, where, getDocs, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { Copy, Plus, Play, User as UserIcon, RefreshCcw, Crown, Home, Star } from 'lucide-react';

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

const COLORS = ['yellow', 'green', 'red', 'blue'];
const COLOR_HEX: Record<string, string> = {
  red: '#de5b5b', // elegant rose
  green: '#54b57a', // elegant sage
  yellow: '#e6c35c', // elegant gold
  blue: '#5c8edd', // elegant steel blue
};

const adjustColor = (color: string, amount: number) => {
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
};

const hexToRgb = (hex: string) => {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
};

// Map each color to its starting position on the main track (0-51)
// Yellow starts Top-Left, Green Top-Right, Red Bottom-Right, Blue Bottom-Left
const START_POSITIONS: Record<string, number> = {
  yellow: 0,
  green: 13,
  red: 26,
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

  const handleLogin = async () => {
    if (!alias.trim()) return;
    setError('');
    try {
      let authUser = auth.currentUser;
      if (!authUser) {
        const result = await signInAnonymously(auth);
        authUser = result.user;
      }
      await updateProfile(authUser, { displayName: alias.trim() });
      setUser(authUser);
      setAliasSet(true);
    } catch (e: any) {
      setError(e.message);
    }
  };

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
  
  // Mapping 52 absolute track positions to logical (x,y) grid
  const trackPath = [
    // Yellow Start line to right
    {x:1, y:6},{x:2, y:6},{x:3, y:6},{x:4, y:6},{x:5, y:6}, // 0..4
    {x:6, y:5},{x:6, y:4},{x:6, y:3},{x:6, y:2},{x:6, y:1},{x:6, y:0}, // 5..10
    // Top Green section
    {x:7, y:0}, // 11
    {x:8, y:0}, // 12
    {x:8, y:1},{x:8, y:2},{x:8, y:3},{x:8, y:4},{x:8, y:5}, // 13..17
    {x:9, y:6},{x:10,y:6},{x:11,y:6},{x:12,y:6},{x:13,y:6},{x:14,y:6}, // 18..23
    // Right Red section
    {x:14,y:7}, // 24
    {x:14,y:8}, // 25
    {x:13,y:8},{x:12,y:8},{x:11,y:8},{x:10,y:8},{x:9, y:8}, // 26..30
    {x:8, y:9},{x:8, y:10},{x:8,y:11},{x:8,y:12},{x:8,y:13},{x:8,y:14}, // 31..36
    // Bottom Blue section
    {x:7, y:14}, // 37
    {x:6, y:14}, // 38
    {x:6, y:13},{x:6, y:12},{x:6, y:11},{x:6, y:10},{x:6, y:9}, // 39..43
    {x:5, y:8},{x:4, y:8},{x:3, y:8},{x:2, y:8},{x:1, y:8},{x:0, y:8}, // 44..49
    // Left Yellow start again
    {x:0, y:7}, // 50
    {x:0, y:6}  // 51
  ];

  const getAbsPosCoords = (absPos: number) => {
    return trackPath[absPos % 52];
  };

  const getHomePathCoords = (color: string, steps: number) => {
    // steps from 1 to 5
    if (color === 'yellow') return { x: steps, y: 7 };
    if (color === 'green') return { x: 7, y: steps };
    if (color === 'red') return { x: 14 - steps, y: 7 };
    if (color === 'blue') return { x: 7, y: 14 - steps };
    return { x: 7, y: 7 };
  };

  const getTokenCoordsPct = (pid: string, tokenIdx: number) => {
    if (!game) return null;
    const color = game.playerColors[pid];
    const pos = game.tokens[pid][tokenIdx];
    
    if (pos === -1) {
      // Base positions in percentages %
      let baseL = 0, baseT = 0;
      if (color === 'yellow') { baseL = 0; baseT = 0; }
      if (color === 'green') { baseL = 60; baseT = 0; }
      if (color === 'red') { baseL = 60; baseT = 60; }
      if (color === 'blue') { baseL = 0; baseT = 60; }
      
      const offsets = [
        { l: 11, t: 11 }, { l: 29, t: 11 },
        { l: 11, t: 29 }, { l: 29, t: 29 }
      ];
      return { x: baseL + offsets[tokenIdx].l, y: baseT + offsets[tokenIdx].t, isGrid: false };
    }
    
    let gx, gy;
    if (pos <= 50) {
      const absPos = (START_POSITIONS[color] + pos) % 52;
      const gc = getAbsPosCoords(absPos);
      gx = gc.x; gy = gc.y;
    } else if (pos <= 55) {
      const gc = getHomePathCoords(color, pos - 50);
      gx = gc.x; gy = gc.y;
    } else {
      // Center (completed)
      gx = 7; gy = 7;
    }
    
    return { x: (gx + 0.5) * (100 / 15), y: (gy + 0.5) * (100 / 15), isGrid: true };
  };

  const allTokens: Array<{ pid: string, tIdx: number, coords: { x: number, y: number, isGrid: boolean }, key: string }> = [];
  const gridOccupancy: Record<string, any[]> = {};

  if (game) {
    game.playerIds.forEach(pid => {
       [0,1,2,3].forEach(tIdx => {
          const coords = getTokenCoordsPct(pid, tIdx);
          if (!coords) return;
          const key = coords.isGrid ? `${coords.x.toFixed(2)}_${coords.y.toFixed(2)}` : `base_${pid}_${tIdx}`;
          
          if (!gridOccupancy[key]) gridOccupancy[key] = [];
          
          const tokenData = { pid, tIdx, coords, key };
          allTokens.push(tokenData);
          gridOccupancy[key].push(tokenData);
       });
    });
  }

  const BlackWhiteDice = ({ val, rolling, color }: { val: number, rolling: boolean, color: string }) => {
    const dots: string[] = [];
    if (val === 1) dots.push('1/2_1/2');
    if (val === 2) dots.push('1/4_1/4', '3/4_3/4');
    if (val === 3) dots.push('1/4_1/4', '1/2_1/2', '3/4_3/4');
    if (val === 4) dots.push('1/4_1/4', '3/4_1/4', '1/4_3/4', '3/4_3/4');
    if (val === 5) dots.push('1/4_1/4', '3/4_1/4', '1/2_1/2', '1/4_3/4', '3/4_3/4');
    if (val === 6) dots.push('1/4_1/4', '3/4_1/4', '1/4_1/2', '3/4_1/2', '1/4_3/4', '3/4_3/4');

    return (
      <motion.div 
         className="relative w-14 h-14 rounded-[14px] shadow-[0_8px_16px_rgba(0,0,0,0.6),_inset_0_2px_4px_rgba(255,255,255,0.4)]"
         style={{ background: `linear-gradient(135deg, ${COLOR_HEX[color]} 0%, ${adjustColor(COLOR_HEX[color], -40)} 100%)` }}
         animate={rolling ? { 
            scale: [1, 1.2, 0.9, 1.1, 1], 
            rotateX: [0, -180, 270, 720],
            rotateY: [0, 90, -360, 720]
         } : {}}
         transition={{ duration: 0.5, ease: "easeOut" }}
      >
         {dots.map(d => {
            const [x, y] = d.split('_');
            let l = x === '1/4' ? '25%' : x === '1/2' ? '50%' : '75%';
            let t = y === '1/4' ? '25%' : y === '1/2' ? '50%' : '75%';
            return <div key={d} className="absolute w-[22%] h-[22%] bg-white rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.3)]" style={{ left: l, top: t }} />
         })}
      </motion.div>
    );
  };

  const BaseOverlay = ({ color, top, left }: { color: string, top: string, left: string }) => {
    const hex = COLOR_HEX[color];
    const darkHex = adjustColor(hex, -30);
    return (
      <div className="absolute w-[40%] h-[40%] flex items-center justify-center p-[2%] rounded-xl" style={{ top, left, background: `radial-gradient(circle at top left, ${hex}, ${darkHex})`, zIndex: 10, boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.2)' }}>
         <div className="w-[85%] h-[85%] bg-[#121214] rounded-3xl border border-white/5 flex items-center justify-center relative shadow-[inset_0_4px_20px_rgba(0,0,0,0.8),_0_4px_8px_rgba(0,0,0,0.5)]">
            <div className="absolute top-[18%] left-[18%] w-[25%] h-[25%] rounded-full shadow-[inset_0_3px_6px_rgba(0,0,0,0.8)] bg-black/50" />
            <div className="absolute top-[18%] right-[18%] w-[25%] h-[25%] rounded-full shadow-[inset_0_3px_6px_rgba(0,0,0,0.8)] bg-black/50" />
            <div className="absolute bottom-[18%] left-[18%] w-[25%] h-[25%] rounded-full shadow-[inset_0_3px_6px_rgba(0,0,0,0.8)] bg-black/50" />
            <div className="absolute bottom-[18%] right-[18%] w-[25%] h-[25%] rounded-full shadow-[inset_0_3px_6px_rgba(0,0,0,0.8)] bg-black/50" />
         </div>
      </div>
    )
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
          {error && <div className="text-red-400 text-sm tracking-widest text-center">{error}</div>}
          <button 
            onClick={handleLogin}
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

  const pathCells = [];
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
       if ((r < 6 || r > 8) && (c < 6 || c > 8)) continue; // skip bases
       if (r >= 6 && r <= 8 && c >= 6 && c <= 8) continue; // skip center
       
       let bg = 'rgba(255,255,255,0.03)';
       if (r === 7 && c > 0 && c < 6) bg = `rgba(${hexToRgb(COLOR_HEX.yellow)}, 0.4)`;
       if (c === 7 && r > 0 && r < 6) bg = `rgba(${hexToRgb(COLOR_HEX.green)}, 0.4)`;
       if (r === 7 && c > 8 && c < 14) bg = `rgba(${hexToRgb(COLOR_HEX.red)}, 0.4)`;
       if (c === 7 && r > 8 && r < 14) bg = `rgba(${hexToRgb(COLOR_HEX.blue)}, 0.4)`;
       
       // Starting cells
       if (r === 6 && c === 1) bg = `rgba(${hexToRgb(COLOR_HEX.yellow)}, 0.85)`;
       if (r === 1 && c === 8) bg = `rgba(${hexToRgb(COLOR_HEX.green)}, 0.85)`;
       if (r === 8 && c === 13) bg = `rgba(${hexToRgb(COLOR_HEX.red)}, 0.85)`;
       if (r === 13 && c === 6) bg = `rgba(${hexToRgb(COLOR_HEX.blue)}, 0.85)`;

       let isStar = false;
       if (r === 8 && c === 2) isStar = true;
       if (r === 2 && c === 6) isStar = true;
       if (r === 6 && c === 12) isStar = true;
       if (r === 12 && c === 8) isStar = true;

       let arrow = null;
       if (r === 7 && c === 0) arrow = <span className="text-[#e6c35c] font-black text-xs drop-shadow-[0_0_8px_rgba(230,195,92,0.8)]">❯</span>;
       if (r === 0 && c === 7) arrow = <span className="text-[#54b57a] font-black text-xs drop-shadow-[0_0_8px_rgba(84,181,122,0.8)]">▼</span>;
       if (r === 7 && c === 14) arrow = <span className="text-[#de5b5b] font-black text-xs drop-shadow-[0_0_8px_rgba(222,91,91,0.8)]">❮</span>;
       if (r === 14 && c === 7) arrow = <span className="text-[#5c8edd] font-black text-xs drop-shadow-[0_0_8px_rgba(92,142,221,0.8)]">▲</span>;

       pathCells.push(
         <div key={`${r}-${c}`} className="absolute flex items-center justify-center" style={{ 
            left: `${c * 100 / 15}%`, top: `${r * 100 / 15}%`, width: `${100 / 15}%`, height: `${100 / 15}%`, 
            backgroundColor: bg,
            border: '0.5px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
            zIndex: 5
         }}>
            {isStar && <Star size={14} fill="rgba(255,255,255,0.15)" className="text-white/20" />}
            {arrow}
         </div>
       )
    }
  }

  const CenterTriangles = () => (
    <div className="absolute w-[20%] h-[20%] top-[40%] left-[40%] z-[6] filter drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]">
       <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
         <polygon points="0,0 100,0 50,50" fill={`rgba(${hexToRgb(COLOR_HEX.green)}, 0.8)`} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
         <polygon points="100,0 100,100 50,50" fill={`rgba(${hexToRgb(COLOR_HEX.red)}, 0.8)`} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
         <polygon points="0,100 100,100 50,50" fill={`rgba(${hexToRgb(COLOR_HEX.blue)}, 0.8)`} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
         <polygon points="0,0 0,100 50,50" fill={`rgba(${hexToRgb(COLOR_HEX.yellow)}, 0.8)`} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
       </svg>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-white font-sans w-full mx-auto relative overflow-hidden pb-8">
      {/* Header */}
      <div className="flex justify-center items-center p-6 shrink-0 z-10 w-full max-w-3xl mx-auto">
         <div className="flex gap-4 flex-wrap justify-center">
            {game.playerIds.map(pid => {
               const isActive = game.playerIds[game.currentTurnIndex] === pid;
               const pColor = game.playerColors[pid];
               return (
                 <div key={pid} className={`flex items-center gap-3 px-4 py-2 rounded-full border transition-all duration-500 ${isActive ? 'bg-[#18181a] shadow-[0_4px_15px_rgba(0,0,0,0.5)] scale-110' : 'bg-transparent border-transparent opacity-60'}`} style={{ borderColor: isActive ? COLOR_HEX[pColor] : 'transparent' }}>
                    <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: COLOR_HEX[pColor], color: COLOR_HEX[pColor] }} />
                    <span className="text-[10px] tracking-widest font-bold uppercase text-white">{game.playerNames[pid]}</span>
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
        <div className="relative w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] bg-[#0c0c0e] rounded-2xl border flex-shrink-0 select-none shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            
            <BaseOverlay color="yellow" top="0" left="0" />
            <BaseOverlay color="green" top="0" left="60%" />
            <BaseOverlay color="red" top="60%" left="60%" />
            <BaseOverlay color="blue" top="60%" left="0" />
            
            {pathCells}
            <CenterTriangles />
            
            {/* Tokens Layer */}
            {allTokens.map(tk => {
                  const pColor = game.playerColors[tk.pid];
                  const tPos = game.tokens[tk.pid][tk.tIdx];

                  let isMovable = false;
                  if (isMyTurn && game.diceRolled && tk.pid === user.uid) {
                    if (tPos === -1 && game.diceValue === 6) isMovable = true;
                    if (tPos >= 0 && tPos < 57 && tPos + game.diceValue <= 57) isMovable = true;
                  }

                  const ocArr = gridOccupancy[tk.key];
                  const subIdx = ocArr.findIndex(o => o.pid === tk.pid && o.tIdx === tk.tIdx);
                  const total = ocArr.length;

                  let transX = "-50%";
                  let transY = "-50%";
                  
                  if (tk.coords.isGrid && total > 1) {
                     let ox = 0, oy = 0;
                     if (total === 2) {
                        ox = subIdx === 0 ? -4 : 4;
                     } else if (total === 3) {
                        if (subIdx === 0) { ox = -4; oy = -4; }
                        if (subIdx === 1) { ox = 4; oy = -4; }
                        if (subIdx === 2) { ox = 0; oy = 4; }
                     } else {
                        ox = subIdx % 2 === 0 ? -4 : 4;
                        oy = subIdx < 2 ? -4 : 4;
                     }
                     transX = `calc(-50% + ${ox}px)`;
                     transY = `calc(-50% + ${oy}px)`;
                  }

                  const left = `${tk.coords.x}%`;
                  const top = `${tk.coords.y}%`;
                  
                  const isFinished = tPos >= 57;

                  return (
                    <motion.div 
                      key={`${tk.pid}-${tk.tIdx}`}
                      className="absolute w-[5%] h-[5%] rounded-full z-[20] flex items-center justify-center cursor-pointer pointer-events-auto"
                      style={{ 
                        background: `radial-gradient(circle at 30% 30%, ${COLOR_HEX[pColor]} 0%, ${adjustColor(COLOR_HEX[pColor], -50)} 90%)`,
                        boxShadow: `inset 0 2px 4px rgba(255,255,255,0.6), inset 0 -4px 6px rgba(0,0,0,0.6), 0 6px 10px rgba(0,0,0,0.6)`,
                        opacity: isFinished ? 0 : 1
                      }}
                      animate={{ left, top, x: transX, y: transY, scale: isMovable ? [1, 1.15, 1] : 1 }}
                      transition={{ duration: 0.4, scale: { repeat: isMovable ? Infinity : 0, duration: 1.2 } }}
                      onClick={() => { if (isMovable) moveToken(tk.tIdx); }}
                    >
                       <div className="w-[35%] h-[35%] rounded-full bg-white opacity-20 filter blur-[1px] translate-x-[-30%] translate-y-[-30%]" />
                       {isMovable && <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-70" />}
                    </motion.div>
                  );
            })}
        </div>

        {/* Controls Panel */}
        <div className="flex flex-col gap-6 w-full max-w-sm">
           
           <div className={`p-8 rounded-2xl border flex flex-col items-center justify-center transition-all duration-500 overflow-hidden relative ${isMyTurn ? 'bg-[#18181a] shadow-[0_10px_30px_rgba(0,0,0,0.5)]' : 'bg-black/20 opacity-50'}`} style={{ borderColor: isMyTurn ? COLOR_HEX[turnColor] : 'rgba(255,255,255,0.05)' }}>
              
              {isMyTurn && (
                <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: COLOR_HEX[turnColor] }} />
              )}

              <div className="text-xs tracking-[0.3em] mb-6 text-center text-white/50 uppercase">
                 {isMyTurn ? "Your Turn" : `${game.playerNames[game.playerIds[game.currentTurnIndex]]}'s Turn`}
              </div>
              
              <div className="flex items-center justify-center mb-8 relative z-10 w-24 h-24">
                 {game.diceRolled ? (
                   <BlackWhiteDice val={game.diceValue} rolling={false} color={turnColor} />
                 ) : (
                   <div className="relative">
                      {isMyTurn ? (
                        <BlackWhiteDice val={6} rolling={true} color={turnColor} />
                      ) : (
                        <div className="w-14 h-14 flex items-center justify-center border border-dashed border-white/20 rounded-xl animate-pulse">
                          <RefreshCcw size={20} className="text-white/30" />
                        </div>
                      )}
                   </div>
                 )}
              </div>

              <div className="h-12 w-full flex items-center justify-center">
                {isMyTurn && !game.diceRolled ? (
                  <button 
                    onClick={rollDice}
                    className="px-8 py-3 bg-[#222] border rounded-full hover:bg-white hover:text-black transition-all tracking-[0.2em] text-xs font-bold w-full shadow-lg"
                    style={{ borderColor: COLOR_HEX[myColor], color: COLOR_HEX[myColor] }}
                  >
                    ROLL DICE
                  </button>
                ) : isMyTurn && game.diceRolled ? (
                  <div className="text-xs tracking-[0.2em] text-white/50 text-center uppercase animate-pulse">
                    Select a token
                  </div>
                ) : null}
              </div>
           </div>

        </div>

      </div>
    </div>
  );
}

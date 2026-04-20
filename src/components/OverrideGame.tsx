import React, { useState, useEffect, useCallback } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInAnonymously, updateProfile, onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, onSnapshot, updateDoc, query, where, getDocs, serverTimestamp, getDoc } from 'firebase/firestore';
import { LogIn, Users, Play, Copy, Check, Crown, ArrowRight, ShieldAlert, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
type CardColor = 'cyan' | 'magenta' | 'yellow' | 'green' | 'black';
type CardAction = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'draw4';

interface CardData {
  id: string;
  color: CardColor;
  action: CardAction;
}

interface GameState {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  playerIds: string[];
  playerNames: Record<string, string>;
  currentTurnIndex: number;
  direction: 1 | -1;
  deck: string[];
  discardPile: string[];
  currentColor: CardColor; // The active suit
  hands: Record<string, string[]>;
  unoFlags: Record<string, boolean>;
  winnerId: string | null;
  pendingWildAction: {
    playerId: string;
    cardId: string;
  } | null;
}

// --- Deck Utils ---
const ALL_COLORS: CardColor[] = ['cyan', 'magenta', 'yellow', 'green'];

const createDeck = (): string[] => {
  const deck: string[] = [];
  ALL_COLORS.forEach(color => {
    deck.push(`${color}_0`);
    for (let i = 1; i <= 9; i++) {
        deck.push(`${color}_${i}_a`, `${color}_${i}_b`);
    }
    ['skip', 'reverse', 'draw2'].forEach(action => {
        deck.push(`${color}_${action}_a`, `${color}_${action}_b`);
    });
  });
  for(let i=0; i<4; i++) {
      deck.push(`black_wild_${i}`);
      deck.push(`black_draw4_${i}`);
  }
  return deck.sort(() => Math.random() - 0.5);
};

const parseCard = (cardId: string): CardData => {
  const parts = cardId.split('_');
  return {
    id: cardId,
    color: parts[0] as CardColor,
    action: parts[1] as CardAction
  };
};

const canPlayCard = (cardId: string, topCardId: string, currentColor: CardColor): boolean => {
  const card = parseCard(cardId);
  const top = parseCard(topCardId);
  if (card.color === 'black') return true;
  if (card.color === currentColor) return true;
  if (card.action === top.action) return true;
  return false;
};

// --- Main Component ---
export default function OverrideGame({ initialJoinId }: { initialJoinId?: string | null }) {
  const [user, setUser] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [game, setGame] = useState<GameState | null>(null);
  const [availableGames, setAvailableGames] = useState<GameState[]>([]);
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(initialJoinId || null);

  const [copiedLink, setCopiedLink] = useState(false);

  // Wild card selection state
  const [selectingColor, setSelectingColor] = useState<string | null>(null); // cardId that triggered it

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Lobby Listener
  useEffect(() => {
    if (!user || game) return;
    const q = query(collection(db, 'override_games'), where('status', '==', 'waiting'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const gamesData: GameState[] = [];
      snapshot.forEach(doc => {
        gamesData.push({ id: doc.id, ...doc.data() } as GameState);
      });
      setAvailableGames(gamesData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'override_games');
    });
    return () => unsubscribe();
  }, [user, game]);

  // Game Listener
  useEffect(() => {
    if (!game?.id) return;
    const unsubscribe = onSnapshot(doc(db, 'override_games', game.id), (docSnap) => {
      if (docSnap.exists()) {
        setGame({ id: docSnap.id, ...docSnap.data() } as GameState);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `override_games/${game.id}`);
    });
    return () => unsubscribe();
  }, [game?.id]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      setError("Please enter an alias.");
      return;
    }
    setError(null);
    try {
      const { user: authUser } = await signInAnonymously(auth);
      await updateProfile(authUser, { displayName: usernameInput.trim() });
      setUser({ ...authUser, displayName: usernameInput.trim() } as User);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createGame = async () => {
    if (!user) return;
    try {
      const newGameRef = doc(collection(db, 'override_games'));
      const newGame: Partial<GameState> & { createdAt: any, updatedAt: any } = {
        status: 'waiting',
        hostId: user.uid,
        playerIds: [user.uid],
        playerNames: { [user.uid]: user.displayName || 'Hacker 1' },
        currentTurnIndex: 0,
        direction: 1,
        deck: [],
        discardPile: [],
        currentColor: 'cyan',
        hands: { [user.uid]: [] },
        unoFlags: { [user.uid]: false },
        winnerId: null,
        pendingWildAction: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(newGameRef, newGame);
      setGame({ id: newGameRef.id, ...newGame } as GameState);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'override_games');
    }
  };

  const joinGame = async (gameId: string) => {
    if (!user) return;
    try {
      const gameRef = doc(db, 'override_games', gameId);
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) {
        setError("Network not found or closed.");
        return;
      }
      
      const data = gameSnap.data() as GameState;
      if (data.playerIds.includes(user.uid)) {
        setGame({ id: gameSnap.id, ...data } as GameState);
        return;
      }

      if (data.playerIds.length >= 4) {
        setError("Network is full.");
        return;
      }

      if (data.status !== 'waiting') {
        setError("Game already in progress.");
        return;
      }

      const updatedPlayerIds = [...data.playerIds, user.uid];
      const updatedPlayerNames = { ...data.playerNames, [user.uid]: user.displayName || `Hacker ${updatedPlayerIds.length}` };
      const updatedHands = { ...data.hands, [user.uid]: [] };
      const updatedUnos = { ...data.unoFlags, [user.uid]: false };

      await updateDoc(gameRef, {
        playerIds: updatedPlayerIds,
        playerNames: updatedPlayerNames,
        hands: updatedHands,
        unoFlags: updatedUnos,
        updatedAt: serverTimestamp()
      });
      
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `override_games/${gameId}`);
    }
  };

  useEffect(() => {
    if (user && pendingJoinId && !game) {
      joinGame(pendingJoinId);
      setPendingJoinId(null);
    }
  }, [user, pendingJoinId, game]);

  const leaveGame = async () => {
    setGame(null);
  };

  const copyInviteLink = () => {
    if (!game) return;
    const url = `${window.location.origin}${window.location.pathname}?game=override&join=${game.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const startGame = async () => {
    if (!game || game.hostId !== user?.uid) return;
    
    let deck = createDeck();
    let hands: Record<string, string[]> = {};
    game.playerIds.forEach(id => {
      hands[id] = deck.splice(0, 7);
    });

    // Flip first card (must not be wild, for simplicity keep drawing until number)
    let topCard = deck.pop()!;
    while(parseCard(topCard).color === 'black') {
      deck.unshift(topCard);
      topCard = deck.pop()!;
    }
    
    try {
      await updateDoc(doc(db, 'override_games', game.id), {
        status: 'playing',
        deck,
        discardPile: [topCard],
        currentColor: parseCard(topCard).color,
        hands,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `override_games/${game.id}`);
    }
  };

  // --- Gameplay Actions ---

  const drawCard = async (count: number = 1, forceSkip: boolean = false) => {
    if (!game || !user || game.playerIds[game.currentTurnIndex] !== user.uid) return;
    
    let currentDeck = [...game.deck];
    let discard = [...game.discardPile];
    let newHand = [...game.hands[user.uid]];
    
    for(let i=0; i<count; i++) {
      if (currentDeck.length === 0) {
        if (discard.length <= 1) break; // Not enough cards
        const top = discard.pop()!;
        currentDeck = discard.sort(() => Math.random() - 0.5);
        discard = [top];
      }
      newHand.push(currentDeck.pop()!);
    }

    const nextIndex = forceSkip ? 
      (game.currentTurnIndex + game.direction * 2 + game.playerIds.length) % game.playerIds.length :
      (game.currentTurnIndex + game.direction + game.playerIds.length) % game.playerIds.length;

    await updateDoc(doc(db, 'override_games', game.id), {
      deck: currentDeck,
      discardPile: discard,
      [`hands.${user.uid}`]: newHand,
      [`unoFlags.${user.uid}`]: false, // Drawing resets UNO flag
      currentTurnIndex: nextIndex,
      updatedAt: serverTimestamp()
    });
  };

  const playCard = async (cardId: string, chosenColor?: CardColor) => {
    if (!game || !user || game.playerIds[game.currentTurnIndex] !== user.uid) return;
    if (game.pendingWildAction) return;

    const topCardId = game.discardPile[game.discardPile.length - 1];
    if (!canPlayCard(cardId, topCardId, game.currentColor)) return;

    const card = parseCard(cardId);
    
    if (card.color === 'black' && !chosenColor) {
       setSelectingColor(cardId);
       return;
    }

    let nextDir = game.direction;
    let skipSteps = 1;
    let drawCountForNext = 0;

    if (card.action === 'reverse') {
      nextDir = game.playerIds.length === 2 ? nextDir : -nextDir as any;
      if (game.playerIds.length === 2) skipSteps = 2;
    } else if (card.action === 'skip') {
      skipSteps = 2;
    } else if (card.action === 'draw2') {
      skipSteps = 2;
      drawCountForNext = 2;
    } else if (card.action === 'draw4') {
      skipSteps = 2;
      drawCountForNext = 4;
    }

    const nextIndex = (game.currentTurnIndex + (nextDir * skipSteps) + game.playerIds.length * 2) % game.playerIds.length;
    const targetId = game.playerIds[(game.currentTurnIndex + nextDir + game.playerIds.length) % game.playerIds.length];

    const newHand = game.hands[user.uid].filter(c => c !== cardId);
    const newDiscard = [...game.discardPile, cardId];
    const newColor = card.color === 'black' ? chosenColor! : card.color;

    const updates: any = {
      discardPile: newDiscard,
      currentColor: newColor,
      [`hands.${user.uid}`]: newHand,
      direction: nextDir,
      updatedAt: serverTimestamp()
    };

    // If a player played 2nd to last card without hitting UNO -> they might be caught before we add auto-catch.
    // For now, if they don't have unoFlag true and have 1 card left, they shouldn't auto-flag, but we leave it.

    if (newHand.length === 0) {
      updates.status = 'finished';
      updates.winnerId = user.uid;
    } else {
      if (drawCountForNext > 0) {
         // Apply draw logic to victim immediately for simplicity, avoiding extra states
         let currentDeck = [...game.deck];
         let targetHand = [...game.hands[targetId]];
         let dPile = [...newDiscard];

         for(let i=0; i<drawCountForNext; i++) {
           if (currentDeck.length === 0) {
             const top = dPile.pop()!;
             currentDeck = dPile.sort(() => Math.random() - 0.5);
             dPile = [top];
           }
           targetHand.push(currentDeck.pop()!);
         }
         updates.deck = currentDeck;
         updates.discardPile = dPile;
         updates[`hands.${targetId}`] = targetHand;
         updates[`unoFlags.${targetId}`] = false;
      }
      updates.currentTurnIndex = nextIndex;
    }

    setSelectingColor(null);
    await updateDoc(doc(db, 'override_games', game.id), updates);
  };

  const callUno = async () => {
      if (!game || !user) return;
      await updateDoc(doc(db, 'override_games', game.id), {
          [`unoFlags.${user.uid}`]: true
      });
  };

  const catchUno = async (targetId: string) => {
     if (!game) return;
     if (game.hands[targetId].length === 1 && !game.unoFlags[targetId]) {
         // Penalize
         let currentDeck = [...game.deck];
         let dPile = [...game.discardPile];
         let targetHand = [...game.hands[targetId]];

         for(let i=0; i<2; i++) {
           if (currentDeck.length === 0) {
             const top = dPile.pop()!;
             currentDeck = dPile.sort(() => Math.random() - 0.5);
             dPile = [top];
           }
           if (currentDeck.length > 0) {
              targetHand.push(currentDeck.pop()!);
           }
         }

         await updateDoc(doc(db, 'override_games', game.id), {
             deck: currentDeck,
             discardPile: dPile,
             [`hands.${targetId}`]: targetHand,
             [`unoFlags.${targetId}`]: false
         });
     }
  };


  // --- UI Helpers ---

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <h2 className="text-3xl font-light tracking-[0.3em] text-white mb-2 text-center">OVERRIDE</h2>
        <p className="text-cyan-400 text-xs tracking-widest uppercase mb-12 text-center">Access Terminal</p>
        <form onSubmit={handleLogin} className="w-full max-w-sm flex flex-col gap-6 p-6 border border-white/10 bg-black/50 rounded-2xl">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-white/50 tracking-widest uppercase">Alias</label>
            <input 
              type="text" 
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              className="bg-transparent border-b border-white/20 px-0 py-2 text-white focus:outline-none focus:border-cyan-400 transition-colors placeholder:text-white/20"
              placeholder="e.g. Neo"
              required
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button 
            type="submit"
            className="flex items-center justify-center gap-3 w-full py-4 bg-white text-black font-medium tracking-[0.2em] rounded hover:bg-cyan-100 transition-colors mt-2"
          >
            <LogIn size={18} /> INITIATE LINK
          </button>
        </form>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-start h-full px-6 py-12 max-w-2xl mx-auto w-full">
        <div className="flex justify-between items-end w-full mb-12 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-4xl font-light tracking-[0.3em] text-white shrink-0">OVERRIDE</h2>
            <p className="text-cyan-400 text-xs tracking-widest uppercase mt-2">Active Hacker: <span className="text-white">{user.displayName}</span></p>
          </div>
        </div>

        <button 
          onClick={createGame}
          className="flex items-center justify-center gap-3 w-full py-6 border border-cyan-500/50 text-cyan-400 font-medium tracking-[0.2em] rounded-xl hover:bg-cyan-500 hover:text-black transition-all mb-12 group shadow-[0_0_20px_rgba(6,182,212,0.1)]"
        >
          <Play size={20} className="group-hover:animate-pulse" /> HOST A LOBBY
        </button>

        <div className="w-full">
          <h3 className="text-xs text-white/40 tracking-[0.2em] uppercase mb-4 pl-2 flex items-center gap-2">
            <ShieldAlert size={14} /> Open Networks
          </h3>
          <div className="flex flex-col gap-3">
            {availableGames.length === 0 ? (
              <div className="p-8 border border-white/5 rounded-xl text-center bg-white/5">
                 <p className="text-white/30 text-sm font-light">No open networks found.</p>
              </div>
            ) : (
              availableGames.map(g => (
                <div key={g.id} className="flex items-center justify-between p-4 border border-white/10 rounded-xl bg-black/40 hover:border-cyan-500/50 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-white/90">{g.playerNames[g.hostId]}'s Server</span>
                    <span className="text-xs text-white/40 mt-1">{g.playerIds.length} / 4 Connected</span>
                  </div>
                  <button 
                    onClick={() => joinGame(g.id)}
                    className="px-6 py-2 bg-white/10 text-xs tracking-[0.2em] rounded hover:bg-white hover:text-black transition-colors"
                  >
                    JOIN
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (game.status === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 max-w-lg mx-auto w-full text-center">
        <h2 className="text-2xl font-light tracking-[0.3em] text-white">LOBBY TERMINAL</h2>
        <p className="text-cyan-400 text-xs tracking-[0.2em] uppercase mb-12">Waiting for connections...</p>
        
        <div className="w-full border border-white/10 rounded-2xl bg-black/30 p-6 mb-8 flex flex-col gap-4 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
           {game.playerIds.map((pid, idx) => (
             <div key={pid} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
               <div className="flex items-center gap-3">
                 <Users size={16} className={pid === game.hostId ? "text-cyan-400" : "text-white/30"} />
                 <span className={`text-sm ${pid === user.uid ? "text-white font-medium" : "text-white/70"}`}>
                   {game.playerNames[pid]} {pid === user.uid && "(You)"}
                 </span>
               </div>
               {pid === game.hostId && <span className="text-[10px] bg-cyan-900/50 text-cyan-400 px-2 py-1 rounded tracking-widest uppercase">Admin</span>}
             </div>
           ))}
        </div>

        <div className="flex flex-col gap-4 w-full">
          <button 
            onClick={copyInviteLink}
            className="flex items-center justify-center gap-2 py-3 border border-white/20 text-white/70 text-xs tracking-[0.2em] uppercase rounded hover:bg-white/10 hover:text-white transition-colors"
          >
             {copiedLink ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
             {copiedLink ? 'Link Copied' : 'Invite Link'}
          </button>
          
          {user.uid === game.hostId ? (
            <button 
              onClick={startGame}
              disabled={game.playerIds.length < 2}
              className="flex items-center justify-center gap-3 w-full py-5 bg-cyan-500 text-black font-medium tracking-[0.3em] rounded uppercase disabled:opacity-50 disabled:bg-gray-700 disabled:text-gray-500 transition-colors shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:shadow-none"
            >
              RUN PROTOCOL
            </button>
          ) : (
            <div className="py-4 border border-dashed border-white/20 text-center rounded text-xs text-white/50 tracking-widest uppercase">
              Waiting for admin...
            </div>
          )}
          <button 
             onClick={leaveGame}
             className="text-xs text-white/30 tracking-widest uppercase hover:text-white mt-4"
          >
             Disconnect
          </button>
        </div>
      </div>
    );
  }

  // --- PLAYING STATE & RENDER HELPERS ---

  const isMyTurn = game.status === 'playing' && game.playerIds[game.currentTurnIndex] === user.uid;
  const tCard = game.discardPile[game.discardPile.length - 1];
  
  const getCardStyles = (cardId: string) => {
    const card = parseCard(cardId);
    let hex = '#333';
    let textHex = '#fff';
    switch (card.color) {
      case 'cyan': hex = '#06b6d4'; textHex = '#000'; break;
      case 'magenta': hex = '#d946ef'; textHex = '#000'; break;
      case 'yellow': hex = '#eab308'; textHex = '#000'; break;
      case 'green': hex = '#22c55e'; textHex = '#000'; break;
      case 'black': hex = '#111'; textHex = '#fff'; break;
    }
    
    // For wild cards that have been played, reflect chosen color
    const isPlayedWild = (cardId === tCard && card.color === 'black');
    if (isPlayedWild) {
      switch (game.currentColor) {
        case 'cyan': hex = '#06b6d4'; textHex = '#000'; break;
        case 'magenta': hex = '#d946ef'; textHex = '#000'; break;
        case 'yellow': hex = '#eab308'; textHex = '#000'; break;
        case 'green': hex = '#22c55e'; textHex = '#000'; break;
      }
    }

    const borderGlow = hex;

    return { bg: hex, text: textHex, border: borderGlow, card };
  };

  const getActionDisplay = (action: string) => {
    switch(action) {
      case 'skip': return 'SKIP';
      case 'reverse': return 'REV';
      case 'draw2': return '+2';
      case 'draw4': return '+4';
      case 'wild': return 'WILD';
      default: return action;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-white font-sans w-full mx-auto relative overflow-hidden pb-8 px-4">
      
      {/* Game Header: Opponents Stats */}
      <div className="flex justify-between items-center pt-8 pb-4 border-b border-white/5 shrink-0 z-10 w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-4 py-2 overflow-x-auto custom-scroll-behavior w-full">
           {game.playerIds.map((pid, idx) => {
             const active = game.playerIds[game.currentTurnIndex] === pid;
             const isMe = pid === user.uid;
             const hasUno = game.unoFlags[pid];
             return (
               <div key={pid} className={`flex flex-col min-w-[100px] p-2 rounded shrink-0 border transition-all ${active ? 'border-cyan-500/80 bg-cyan-900/20' : 'border-white/5 bg-black/40'}`}>
                 <span className="text-[10px] tracking-widest text-white/50 mb-1 flex justify-between items-center">
                    {game.playerNames[pid]} {isMe && "(You)"}
                    {hasUno && <span className="bg-fuchsia-600 text-white px-1 ml-1 rounded text-[8px] animate-pulse">UNO</span>}
                 </span>
                 <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                       <div className="w-5 h-7 bg-white/10 border border-white/20 rounded shadow"></div>
                    </div>
                    <span className="text-sm font-mono text-cyan-400">x{game.hands[pid].length}</span>
                 </div>
                 {!isMe && game.hands[pid].length === 1 && !hasUno && (
                    <button 
                      onClick={() => catchUno(pid)}
                      className="mt-2 text-[8px] bg-red-900/60 border border-red-500/50 text-red-200 py-1 rounded hover:bg-red-800"
                    >
                      CATCH UNO!
                    </button>
                 )}
               </div>
             )
           })}
        </div>
      </div>

      {game.status === 'finished' && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur z-50 flex flex-col items-center justify-center p-6 text-center">
           <Crown size={48} className="text-yellow-400 mb-6 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
           <h2 className="text-4xl tracking-[0.3em] font-light mb-2">SYSTEM SECURED</h2>
           <p className="text-cyan-400 tracking-widest mb-12">Winner: {game.playerNames[game.winnerId!]}</p>
           <button onClick={leaveGame} className="px-8 py-3 border border-white/20 tracking-[0.2em] rounded hover:bg-white hover:text-black transition-colors">ESCAPE</button>
        </div>
      )}

      {/* Play Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full max-w-4xl mx-auto py-8">
         <div className="flex gap-8 items-center z-10">
            {/* Draw Pile */}
            <button 
              onClick={() => drawCard(1, false)}
              disabled={!isMyTurn}
              className={`w-28 h-40 rounded-xl flex items-center justify-center border-2 bg-[#111] transition-transform ${isMyTurn ? 'border-cyan-500 hover:scale-105 shadow-[0_0_15px_rgba(6,182,212,0.3)] cursor-pointer' : 'border-white/10 opacity-70 cursor-not-allowed'}`}
            >
               <span className="text-white/20 rotate-45 text-2xl font-black">DECK</span>
            </button>

            {/* Discard Pile */}
            <div className="relative w-28 h-40">
               <AnimatePresence>
                 {game.discardPile.map((cId, idx) => {
                   // Only render top few to save DOM size
                   if (idx < game.discardPile.length - 4) return null;
                   const styles = getCardStyles(cId);
                   return (
                     <motion.div 
                       key={cId}
                       layoutId={`card-${cId}`}
                       initial={{ scale: 1.2, opacity: 0, rotate: Math.random() * 20 - 10 }}
                       animate={{ scale: 1, opacity: 1, rotate: (idx % 3 === 0) ? -5 : (idx % 2 === 0) ? 5 : 0 }}
                       className="absolute inset-0 rounded-xl border flex flex-col justify-between p-3 bg-[#111]"
                       style={{ 
                         backgroundColor: styles.bg, 
                         color: styles.text,
                         borderColor: styles.border,
                         boxShadow: `0 0 20px ${styles.border}40`,
                         zIndex: idx
                       }}
                     >
                        <span className="text-[10px] font-bold">{getActionDisplay(styles.card.action)}</span>
                        <div className="text-4xl font-black text-center">{getActionDisplay(styles.card.action)}</div>
                        <span className="text-[10px] font-bold self-end rotate-180">{getActionDisplay(styles.card.action)}</span>
                     </motion.div>
                   )
                 })}
               </AnimatePresence>
            </div>
         </div>
         
         {/* Center Indicator */}
         <div className="mt-8 flex flex-col items-center">
            {isMyTurn ? (
              <p className="text-cyan-400 tracking-widest text-sm animate-pulse border border-cyan-500/30 bg-cyan-900/20 px-8 py-2 rounded-full uppercase">YOUR TURN</p>
            ) : (
              <p className="text-white/50 tracking-widest text-sm uppercase">WAITING FOR NETWORK...</p>
            )}
            
            {/* Wild Color Selection Overlay */}
            {selectingColor && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/90 p-6 rounded-xl border border-white/20 z-50 flex flex-col items-center animate-in fade-in zoom-in w-72">
                 <p className="text-white tracking-widest mb-4">SELECT PROTOCOL COLOR</p>
                 <div className="grid grid-cols-2 gap-4 w-full">
                    <button onClick={() => playCard(selectingColor, 'cyan')} className="h-16 bg-[#06b6d4] rounded hover:scale-105 active:scale-95 transition-transform"></button>
                    <button onClick={() => playCard(selectingColor, 'magenta')} className="h-16 bg-[#d946ef] rounded hover:scale-105 active:scale-95 transition-transform"></button>
                    <button onClick={() => playCard(selectingColor, 'yellow')} className="h-16 bg-[#eab308] rounded hover:scale-105 active:scale-95 transition-transform"></button>
                    <button onClick={() => playCard(selectingColor, 'green')} className="h-16 bg-[#22c55e] rounded hover:scale-105 active:scale-95 transition-transform"></button>
                 </div>
              </div>
            )}
         </div>
      </div>

      {/* Hand */}
      <div className="mt-auto shrink-0 w-full max-w-4xl mx-auto z-20 flex flex-col items-center">
         <div className="flex justify-between w-full mb-4 items-end px-4">
             <div className="flex gap-2">
                 {game.hands[user.uid].length <= 2 && game.status === 'playing' && !game.unoFlags[user.uid] && (
                    <button 
                      onClick={callUno}
                      className="px-6 py-2 bg-fuchsia-600/20 border border-fuchsia-500 text-fuchsia-400 rounded-full tracking-[0.3em] font-bold text-sm uppercase hover:bg-fuchsia-600 hover:text-white transition-all shadow-[0_0_15px_rgba(217,70,239,0.5)] animate-pulse"
                    >
                      UNO!
                    </button>
                 )}
                 {game.unoFlags[user.uid] && (
                     <span className="px-6 py-2 bg-white/5 border border-white/10 text-white/50 rounded-full tracking-widest text-xs uppercase flex items-center gap-2">
                        <Check size={14} className="text-fuchsia-400"/> UNO SECURED
                     </span>
                 )}
             </div>
             <span className="text-white/30 text-xs tracking-widest">{game.hands[user.uid].length} MODULES REMAIN</span>
         </div>

         <div className="flex gap-[-20%] md:gap-2 px-4 py-8 overflow-x-auto custom-scroll-behavior w-full items-center pl-8 md:pl-0 snap-x justify-start md:justify-center relative min-h-[180px]">
            <AnimatePresence>
              {game.hands[user.uid].map((cId) => {
                const styles = getCardStyles(cId);
                const playable = isMyTurn && canPlayCard(cId, tCard, game.currentColor) && !selectingColor;
                
                return (
                  <motion.button
                    key={cId}
                    layoutId={`card-${cId}`}
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0, scale: 0.8 }}
                    onClick={() => playCard(cId)}
                    disabled={!playable}
                    className={`relative w-24 h-36 rounded-xl border flex flex-col justify-between p-2 shrink-0 transition-all cursor-pointer transform transform-gpu snap-center mx-[-15px] md:mx-0 ${playable ? 'hover:-translate-y-6 hover:rotate-2 shadow-[0_10px_20px_rgba(0,0,0,0.5)] z-30' : 'opacity-60 scale-95 z-20 cursor-not-allowed'} hover:z-40 bg-[#111]`}
                    style={{ 
                      backgroundColor: styles.bg, 
                      color: styles.text,
                      borderColor: styles.border
                    }}
                  >
                     {/* Overlay for non-playable cards on hover so it doesn't get confusing */}
                     {!playable && <div className="absolute inset-0 bg-black/50 rounded-xl" />}
                     
                     <span className="text-[10px] font-bold text-left drop-shadow-sm leading-none">{getActionDisplay(styles.card.action)}</span>
                     <div className="text-3xl font-black text-center drop-shadow-md z-10">{getActionDisplay(styles.card.action)}</div>
                     <span className="text-[10px] font-bold self-end rotate-180 drop-shadow-sm leading-none">{getActionDisplay(styles.card.action)}</span>
                  </motion.button>
                )
              })}
            </AnimatePresence>
         </div>
      </div>
    </div>
  );
}

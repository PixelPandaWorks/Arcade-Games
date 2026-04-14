import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, onSnapshot, updateDoc, query, where, getDocs, serverTimestamp, getDoc } from 'firebase/firestore';
import { LogIn, Plus, Users, Play, Dices, User as UserIcon } from 'lucide-react';

// --- Types ---
type Category = 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes' | 'threeOfAKind' | 'fourOfAKind' | 'fullHouse' | 'smallStraight' | 'largeStraight' | 'yahtzee' | 'chance';

type Scorecard = {
  [key in Category]?: number;
};

interface GameState {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  playerIds: string[];
  playerNames: Record<string, string>;
  currentTurnIndex: number;
  dice: number[];
  kept: boolean[];
  rollsLeft: number;
  scores: Record<string, Scorecard>;
  round: number;
}

// --- Scoring Logic ---
const calculateScore = (dice: number[], category: Category): number => {
  const counts = Array(7).fill(0);
  let sum = 0;
  dice.forEach(d => {
    counts[d]++;
    sum += d;
  });

  switch (category) {
    case 'ones': return counts[1] * 1;
    case 'twos': return counts[2] * 2;
    case 'threes': return counts[3] * 3;
    case 'fours': return counts[4] * 4;
    case 'fives': return counts[5] * 5;
    case 'sixes': return counts[6] * 6;
    case 'threeOfAKind': return counts.some(c => c >= 3) ? sum : 0;
    case 'fourOfAKind': return counts.some(c => c >= 4) ? sum : 0;
    case 'fullHouse': return counts.some(c => c === 3) && counts.some(c => c === 2) ? 25 : 0;
    case 'smallStraight': {
      const str = counts.map(c => c > 0 ? '1' : '0').join('');
      return str.includes('1111') ? 30 : 0;
    }
    case 'largeStraight': {
      const str = counts.map(c => c > 0 ? '1' : '0').join('');
      return str.includes('011111') || str.includes('111110') ? 40 : 0;
    }
    case 'yahtzee': return counts.some(c => c === 5) ? 50 : 0;
    case 'chance': return sum;
    default: return 0;
  }
};

const CATEGORIES: { id: Category, label: string }[] = [
  { id: 'ones', label: 'Ones' },
  { id: 'twos', label: 'Twos' },
  { id: 'threes', label: 'Threes' },
  { id: 'fours', label: 'Fours' },
  { id: 'fives', label: 'Fives' },
  { id: 'sixes', label: 'Sixes' },
  { id: 'threeOfAKind', label: '3 of a Kind' },
  { id: 'fourOfAKind', label: '4 of a Kind' },
  { id: 'fullHouse', label: 'Full House' },
  { id: 'smallStraight', label: 'Sm. Straight' },
  { id: 'largeStraight', label: 'Lg. Straight' },
  { id: 'yahtzee', label: 'YAHTZEE' },
  { id: 'chance', label: 'Chance' },
];

export default function YahtzeeGame() {
  const [user, setUser] = useState<User | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [availableGames, setAvailableGames] = useState<GameState[]>([]);
  const [error, setError] = useState<string | null>(null);

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

    const q = query(collection(db, 'games'), where('status', '==', 'waiting'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const gamesData: GameState[] = [];
      snapshot.forEach(doc => {
        gamesData.push({ id: doc.id, ...doc.data() } as GameState);
      });
      setAvailableGames(gamesData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'games');
    });

    return () => unsubscribe();
  }, [user, game]);

  // Game Listener
  useEffect(() => {
    if (!game?.id) return;

    const unsubscribe = onSnapshot(doc(db, 'games', game.id), (docSnap) => {
      if (docSnap.exists()) {
        setGame({ id: docSnap.id, ...docSnap.data() } as GameState);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `games/${game.id}`);
    });

    return () => unsubscribe();
  }, [game?.id]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createGame = async () => {
    if (!user) return;
    try {
      const newGameRef = doc(collection(db, 'games'));
      const newGame = {
        status: 'waiting',
        hostId: user.uid,
        playerIds: [user.uid],
        playerNames: { [user.uid]: user.displayName || 'Player 1' },
        currentTurnIndex: 0,
        dice: [1, 1, 1, 1, 1],
        kept: [false, false, false, false, false],
        rollsLeft: 3,
        scores: { [user.uid]: {} },
        round: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(newGameRef, newGame);
      setGame({ id: newGameRef.id, ...newGame } as GameState);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'games');
    }
  };

  const joinGame = async (gameId: string) => {
    if (!user) return;
    try {
      const gameRef = doc(db, 'games', gameId);
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) return;
      
      const data = gameSnap.data();
      if (data.playerIds.includes(user.uid)) {
        setGame({ id: gameSnap.id, ...data } as GameState);
        return;
      }

      if (data.playerIds.length >= 4) {
        setError("Game is full.");
        return;
      }

      const updatedPlayerIds = [...data.playerIds, user.uid];
      const updatedPlayerNames = { ...data.playerNames, [user.uid]: user.displayName || `Player ${updatedPlayerIds.length}` };
      const updatedScores = { ...data.scores, [user.uid]: {} };

      await updateDoc(gameRef, {
        playerIds: updatedPlayerIds,
        playerNames: updatedPlayerNames,
        scores: updatedScores,
        updatedAt: serverTimestamp()
      });
      
      setGame({ id: gameSnap.id, ...data, playerIds: updatedPlayerIds, playerNames: updatedPlayerNames, scores: updatedScores } as GameState);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `games/${gameId}`);
    }
  };

  const startGame = async () => {
    if (!game || game.hostId !== user?.uid) return;
    try {
      await updateDoc(doc(db, 'games', game.id), {
        status: 'playing',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `games/${game.id}`);
    }
  };

  const rollDice = async () => {
    if (!game || !user || game.playerIds[game.currentTurnIndex] !== user.uid || game.rollsLeft <= 0) return;

    const newDice = game.dice.map((d, i) => game.kept[i] ? d : Math.floor(Math.random() * 6) + 1);
    
    try {
      await updateDoc(doc(db, 'games', game.id), {
        dice: newDice,
        rollsLeft: game.rollsLeft - 1,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `games/${game.id}`);
    }
  };

  const toggleKeep = async (index: number) => {
    if (!game || !user || game.playerIds[game.currentTurnIndex] !== user.uid || game.rollsLeft === 3) return;

    const newKept = [...game.kept];
    newKept[index] = !newKept[index];

    try {
      await updateDoc(doc(db, 'games', game.id), {
        kept: newKept,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `games/${game.id}`);
    }
  };

  const scoreCategory = async (category: Category) => {
    if (!game || !user || game.playerIds[game.currentTurnIndex] !== user.uid || game.rollsLeft === 3) return;
    if (game.scores[user.uid][category] !== undefined) return; // Already scored

    const score = calculateScore(game.dice, category);
    const newScores = { ...game.scores };
    newScores[user.uid] = { ...newScores[user.uid], [category]: score };

    let nextTurnIndex = (game.currentTurnIndex + 1) % game.playerIds.length;
    let nextRound = game.round;
    let nextStatus = game.status;

    if (nextTurnIndex === 0) {
      nextRound++;
      if (nextRound > 13) {
        nextStatus = 'finished';
      }
    }

    try {
      await updateDoc(doc(db, 'games', game.id), {
        scores: newScores,
        currentTurnIndex: nextTurnIndex,
        round: nextRound,
        status: nextStatus,
        dice: [1, 1, 1, 1, 1],
        kept: [false, false, false, false, false],
        rollsLeft: 3,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `games/${game.id}`);
    }
  };

  const leaveGame = () => {
    setGame(null);
  };

  // --- Render Helpers ---
  const getTotalScore = (scorecard: Scorecard) => {
    return Object.values(scorecard).reduce((sum, val) => sum + (val || 0), 0);
  };

  // --- Views ---
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white font-sans">
        <h1 className="text-4xl font-light tracking-[0.4em] mb-8">YAHTZEE</h1>
        <button 
          onClick={handleLogin}
          className="flex items-center gap-3 px-8 py-4 border border-white/30 text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
        >
          <LogIn size={16} />
          <span>LOGIN WITH GOOGLE</span>
        </button>
        {error && <p className="text-red-500 mt-4 text-xs">{error}</p>}
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white font-sans w-full max-w-2xl mx-auto p-6">
        <div className="flex justify-between items-center w-full mb-12">
          <h1 className="text-2xl font-light tracking-[0.3em]">LOBBY</h1>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <UserIcon size={14} />
            <span>{user.displayName}</span>
          </div>
        </div>

        <button 
          onClick={createGame}
          className="flex items-center justify-center gap-3 w-full py-4 border border-white/30 text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300 mb-8"
        >
          <Plus size={16} />
          <span>CREATE NEW GAME</span>
        </button>

        <div className="w-full">
          <h2 className="text-xs text-gray-500 tracking-[0.2em] mb-4 uppercase">Available Games</h2>
          {availableGames.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-8">No games waiting. Create one!</p>
          ) : (
            <div className="flex flex-col gap-3">
              {availableGames.map(g => (
                <div key={g.id} className="flex justify-between items-center p-4 border border-white/10 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <Users size={16} className="text-gray-400" />
                    <span className="text-sm">{g.playerNames[g.hostId]}'s Game</span>
                    <span className="text-xs text-gray-500">({g.playerIds.length}/4)</span>
                  </div>
                  <button 
                    onClick={() => joinGame(g.id)}
                    className="px-4 py-2 bg-white text-black text-xs tracking-wider rounded hover:bg-gray-200 transition-colors"
                  >
                    JOIN
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (game.status === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white font-sans w-full max-w-md mx-auto p-6">
        <h2 className="text-xl font-light tracking-[0.3em] mb-8">WAITING ROOM</h2>
        
        <div className="w-full border border-white/20 rounded-lg p-6 mb-8 bg-white/5">
          <h3 className="text-xs text-gray-400 tracking-[0.2em] mb-4 uppercase">Players</h3>
          <div className="flex flex-col gap-3">
            {game.playerIds.map((pid, i) => (
              <div key={pid} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm">{game.playerNames[pid]} {pid === game.hostId ? '(Host)' : ''}</span>
              </div>
            ))}
          </div>
        </div>

        {game.hostId === user.uid ? (
          <button 
            onClick={startGame}
            className="flex items-center justify-center gap-3 w-full py-4 bg-white text-black text-xs tracking-[0.2em] rounded-full hover:bg-gray-200 transition-all duration-300"
          >
            <Play size={16} />
            <span>START GAME</span>
          </button>
        ) : (
          <p className="text-gray-500 text-sm animate-pulse">Waiting for host to start...</p>
        )}
        
        <button onClick={leaveGame} className="mt-6 text-xs text-gray-500 hover:text-white tracking-widest">LEAVE</button>
      </div>
    );
  }

  const isMyTurn = game.playerIds[game.currentTurnIndex] === user.uid;

  return (
    <div className="flex flex-col h-full text-white font-sans w-full max-w-4xl mx-auto p-4 md:p-8 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-xl font-light tracking-[0.3em]">YAHTZEE</h2>
          <p className="text-xs text-gray-500 tracking-widest uppercase mt-1">Round {game.round}/13</p>
        </div>
        <div className="text-right">
          <p className="text-sm">
            <span className="text-gray-500">Turn: </span>
            <span className={isMyTurn ? "text-green-400" : "text-white"}>{game.playerNames[game.playerIds[game.currentTurnIndex]]}</span>
          </p>
        </div>
      </div>

      {/* Game Area */}
      <div className="flex flex-col md:flex-row gap-8">
        
        {/* Dice Section */}
        <div className="flex-1 flex flex-col items-center justify-center border border-white/10 rounded-xl p-8 bg-white/5">
          <div className="flex gap-2 md:gap-4 mb-8">
            {game.dice.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleKeep(i)}
                disabled={!isMyTurn || game.rollsLeft === 3}
                className={`w-12 h-12 md:w-16 md:h-16 flex items-center justify-center text-2xl font-bold rounded-lg border-2 transition-all ${
                  game.kept[i] 
                    ? 'border-green-500 bg-green-500/20 text-green-400' 
                    : 'border-white/30 bg-black text-white hover:border-white/60'
                } ${(!isMyTurn || game.rollsLeft === 3) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {d}
              </button>
            ))}
          </div>

          <button
            onClick={rollDice}
            disabled={!isMyTurn || game.rollsLeft <= 0}
            className={`flex items-center gap-3 px-8 py-4 rounded-full text-xs tracking-[0.2em] transition-all ${
              isMyTurn && game.rollsLeft > 0
                ? 'bg-white text-black hover:bg-gray-200'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            <Dices size={16} />
            <span>ROLL ({game.rollsLeft} LEFT)</span>
          </button>
          
          {isMyTurn && game.rollsLeft < 3 && (
            <p className="text-xs text-gray-500 mt-4 tracking-widest">Select a category on your scorecard to score.</p>
          )}
        </div>

        {/* Scorecards */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr>
                <th className="p-2 border-b border-white/20 text-gray-400 font-normal tracking-wider text-xs uppercase">Category</th>
                {game.playerIds.map(pid => (
                  <th key={pid} className={`p-2 border-b border-white/20 font-normal tracking-wider text-xs text-center ${pid === user.uid ? 'text-white' : 'text-gray-500'}`}>
                    {game.playerNames[pid].split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => (
                <tr key={cat.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-2 text-gray-300">{cat.label}</td>
                  {game.playerIds.map(pid => {
                    const score = game.scores[pid][cat.id];
                    const isMe = pid === user.uid;
                    const canScore = isMe && isMyTurn && game.rollsLeft < 3 && score === undefined;
                    
                    return (
                      <td key={pid} className="p-1 text-center">
                        {score !== undefined ? (
                          <span className="text-white">{score}</span>
                        ) : canScore ? (
                          <button 
                            onClick={() => scoreCategory(cat.id)}
                            className="w-full py-1 text-xs text-green-400 border border-green-500/30 rounded hover:bg-green-500/20 transition-colors"
                          >
                            {calculateScore(game.dice, cat.id)}
                          </button>
                        ) : (
                          <span className="text-gray-700">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-white/10 font-bold">
                <td className="p-3 text-white tracking-widest uppercase text-xs">TOTAL</td>
                {game.playerIds.map(pid => (
                  <td key={pid} className="p-3 text-center text-white">
                    {getTotalScore(game.scores[pid])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {game.status === 'finished' && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center z-50">
          <h2 className="text-4xl font-light tracking-[0.4em] mb-8">GAME OVER</h2>
          <div className="flex flex-col gap-4 mb-12">
            {game.playerIds
              .map(pid => ({ name: game.playerNames[pid], score: getTotalScore(game.scores[pid]) }))
              .sort((a, b) => b.score - a.score)
              .map((p, i) => (
                <div key={i} className="flex justify-between w-64 text-lg">
                  <span className={i === 0 ? "text-green-400" : "text-white"}>{i + 1}. {p.name}</span>
                  <span className="text-white">{p.score}</span>
                </div>
              ))}
          </div>
          <button 
            onClick={leaveGame}
            className="px-8 py-4 border border-white/30 text-xs tracking-[0.2em] rounded-full hover:bg-white hover:text-black transition-all duration-300"
          >
            RETURN TO LOBBY
          </button>
        </div>
      )}
    </div>
  );
}

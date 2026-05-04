import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Users, Crown, Plus, Trash2, ShieldAlert, LogOut, Check, X, Timer, Trophy } from 'lucide-react';
import logoEsgrima from './assets/logo.ico';


const firebaseConfig = {
  apiKey: "AIzaSyCcLcV2IZ3ADpDuI28gCFI-3LR4nnH5oxc",
  authDomain: "esgrimajni.firebaseapp.com",
  projectId: "esgrimajni",
  storageBucket: "esgrimajni.firebasestorage.app",
  messagingSenderId: "268803383810",
  appId: "1:268803383810:web:0408e9798208e691283d1b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Contraseña por defecto para el administrador (MVP)
const ADMIN_PASSWORD = "admin";

// Colores estilo Kahoot para las opciones
const OPTION_COLORS = [
  'bg-red-500 hover:bg-red-600 border-red-700',
  'bg-blue-500 hover:bg-blue-600 border-blue-700',
  'bg-yellow-500 hover:bg-yellow-600 border-yellow-700',
  'bg-green-500 hover:bg-green-600 border-green-700'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home'); 
  const [errorMsg, setErrorMsg] = useState('');
  
  // Estado Global
  const [currentRoomCode, setCurrentRoomCode] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState([]);
  
  // Estado del Jugador
  const [playerName, setPlayerName] = useState('');

  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  };

 // --- 1. ESCUCHAR CAMBIOS DE AUTH Y RECUPERAR SESIÓN ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userFound) => {
      if (userFound) {
        setUser(userFound);

        const savedPlayer = localStorage.getItem('trivia_player_session');
        const savedAdmin = localStorage.getItem('trivia_admin_session');

        if (savedPlayer) {
          const data = JSON.parse(savedPlayer);
          setCurrentRoomCode(data.roomCode);
          setPlayerName(data.playerName);
          setView(data.view);
        } else if (savedAdmin) {
          const data = JSON.parse(savedAdmin);
          setCurrentRoomCode(data.roomCode);
          setView(data.view);
        }
      } else {
        // ESTA ES LA PIEZA QUE FALTA:
        // Si no hay usuario, lo creamos anónimamente de inmediato
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Error en auto-login:", err);
          showError("Error al conectar con el servidor.");
        }
      }
    });

    return () => unsubscribe();
  }, []);
  // --- 2. PROTECCIÓN CONTRA CIERRE O RECARGA ACCIDENTAL ---
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Solo mostramos el aviso si el usuario está en una sala activa
      if (currentRoomCode) {
        e.preventDefault();
        e.returnValue = ''; 
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentRoomCode]);

  // --- 3. ESCUCHADORES DE FIRESTORE ---
  useEffect(() => {
    if (!user || !currentRoomCode) return;

    const roomRef = doc(db, 'rooms', currentRoomCode);
    const unsubRoom = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        setRoomData(docSnap.data());
      } else {
        if (view !== 'adminDashboard') {
          showError("La sala ha sido cerrada.");
          setView('home');
          setCurrentRoomCode(null);
        }
      }
    }, (error) => console.error("Error al escuchar sala:", error));

    const playersRef = collection(db, 'players');
    const unsubPlayers = onSnapshot(playersRef, (snapshot) => {
      const allPlayers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const roomPlayers = allPlayers.filter(p => p.roomId === currentRoomCode);
      
      const sorted = roomPlayers.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.totalTime || 0) - (b.totalTime || 0);
      });
      setPlayers(sorted);
    }, (error) => console.error("Error al escuchar jugadores:", error));

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [user, currentRoomCode, view]);

  // --- FUNCIONES DE NAVEGACIÓN Y LÓGICA ---
  const handleAdminLogin = (password) => {
    if (password === ADMIN_PASSWORD) {
      setView('adminDashboard');
    } else {
      showError("Contraseña incorrecta.");
    }
  };

  const CreateRoom = async (questions) => {
  if (!user) return;
  if (questions.length === 0) return showError("Agrega preguntas.");

  // --- LÓGICA DE ALEATORIEDAD ---
  const shuffledQuestions = [...questions].sort(() => Math.random() - 0.5);
  // ------------------------------

  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  try {
    await setDoc(doc(db, 'rooms', code), {
      adminUid: user.uid,
      status: 'lobby',
      questions: shuffledQuestions, // <--- Guardamos las mezcladas
      createdAt: Date.now()
    });
    setCurrentRoomCode(code);

    // NUEVO: Guardar sesión para reconexión del Admin
    localStorage.setItem('trivia_admin_session', JSON.stringify({
      roomCode: code,
      view: 'adminRoom'
    }));


    setView('adminRoom');
  } catch (err) { 
  console.error(err); 
  showError("Error al crear sala"); 
}}

  const joinRoom = async (code, name) => {
    if (!user) return;
    const roomCode = code.toUpperCase();
    
    try {
      const playerRef = doc(db, 'players', user.uid);
      
      await setDoc(playerRef, {
        roomId: roomCode,
        name: name,
        score: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        totalTime: 0, 
        answers: {},
        finished: false
      });

      setCurrentRoomCode(roomCode);
      setPlayerName(name);

      // NUEVO: Guardar sesión para reconexión
      localStorage.setItem('trivia_player_session', JSON.stringify({
        roomCode: roomCode,
        playerName: name,
        view: 'playerRoom'
      }));

      setView('playerRoom');
    } catch (err) {
      console.error(err);
      showError("Error al unirse a la sala.");
    }
  };

  const leaveRoom = async () => {
    localStorage.removeItem('trivia_player_session');
    localStorage.removeItem('trivia_admin_session');
    if (!user) return;
    if (view === 'playerRoom') {
      const playerRef = doc(db, 'players', user.uid);
      await deleteDoc(playerRef).catch(console.error);
    }
    setCurrentRoomCode(null);
    setRoomData(null);
    setView('home');
  };

  if (!user) {
    return <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 font-sans text-slate-100 overflow-x-hidden selection:bg-indigo-500 selection:text-white relative">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] rounded-full bg-blue-600/20 blur-[120px]" />
      </div>

      <AnimatePresence>
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }} 
            animate={{ opacity: 1, y: 16 }} 
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-medium"
          >
            <ShieldAlert size={20} />
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 w-full h-full min-h-screen flex flex-col">
        {view !== 'home' && view !== 'adminLogin' && (
          <header className="p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-md border-b border-white/10">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
              <img 
                src={logoEsgrima} 
                className="w-14 h-14 object-contain" 
              />
              ESGRIMA JNI 2026
            </h1>
            <button onClick={leaveRoom} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium bg-white/5 px-3 py-1.5 rounded-lg">
              <LogOut size={16} /> Salir
            </button>
          </header>
        )}

        <main className="flex-1 flex flex-col p-4 md:p-8">
          <AnimatePresence mode="wait">
            {view === 'home' && <HomeView key="home" onSelect={setView} />}
            {view === 'adminLogin' && <AdminLoginView key="login" onLogin={handleAdminLogin} onBack={() => setView('home')} />}
            {view === 'adminDashboard' && <AdminDashboard key="dashboard" onCreate={CreateRoom} />}
            {view === 'adminRoom' && <AdminRoom key="adminRoom" roomCode={currentRoomCode} roomData={roomData} players={players} db={db}/>}
            {view === 'playerJoin' && <PlayerJoinView key="join" onJoin={joinRoom} onBack={() => setView('home')} />}
            {view === 'playerRoom' && <PlayerRoom key="playerRoom" user={user} roomData={roomData} players={players} db={db} playerName={playerName} />}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
function HomeView({ onSelect }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full"
    >
     <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl w-full text-center flex flex-col items-center">
    <img src={logoEsgrima} className="w-28 h-28 object-contain mb-4 mx-auto" alt="Logo Esgrima" />
    <h1 className="text-4xl md:text-5xl font-extrabold mb-2 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
      ESGRIMA JNI 2026
    </h1>
    <p className="text-slate-400 mb-10 text-lg">Aprendamos de Dios juntos!!!</p>
    <div className="space-y-4 w-full">
      <button 
        onClick={() => onSelect('playerJoin')}
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xl font-bold py-4 rounded-2xl shadow-lg hover:shadow-blue-500/25 transition-all transform hover:-translate-y-1 flex justify-center items-center gap-3"
      >
        <Play fill="currentColor" size={24} />
        Unirse a una sala
      </button>
      <button 
        onClick={() => onSelect('adminLogin')}
        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-2xl transition-colors flex justify-center items-center gap-2"
      >
        <ShieldAlert size={18} />
        Crear sala (Administrador)
      </button>
    </div>
</div>
    </motion.div>
  );
}

function AdminLoginView({ onLogin, onBack }) {
  const [password, setPassword] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(password);
  };
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
      <form onSubmit={handleSubmit} className="bg-slate-800/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl w-full">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white mb-6 text-sm flex items-center gap-1"><X size={16}/> Volver</button>
        <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2"><ShieldAlert className="text-purple-400"/> Acceso Admin</h2>
        <div className="mb-6">
          <label className="block text-slate-300 text-sm mb-2">Contraseña de Administrador</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-center text-lg tracking-widest"
            placeholder="••••••••"
            autoFocus
          />
        </div>
        <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-colors">
          Ingresar
        </button>
      </form>
    </motion.div>
  );
}

function PlayerJoinView({ onJoin, onBack }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    onJoin(code, name);
  };
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
      <form onSubmit={handleSubmit} className="bg-slate-800/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl w-full">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white mb-6 text-sm flex items-center gap-1"><X size={16}/> Volver</button>
        <h2 className="text-3xl font-extrabold mb-8 text-white text-center">¡Prepárate!</h2>
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-slate-400 text-sm mb-1 uppercase tracking-wider font-bold">Código de Sala</label>
            <input 
              type="text" 
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all text-center text-2xl font-bold tracking-widest uppercase"
              placeholder="ABCD"
              required
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-1 uppercase tracking-wider font-bold">Tu Nombre</label>
            <input 
              type="text" 
              maxLength={15}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all text-center text-xl font-bold"
              placeholder="❤ JESÚS ❤"
              required
            />
          </div>
        </div>
        <button 
          type="submit" 
          disabled={!code.trim() || !name.trim()}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg text-lg"
        >
          ENTRAR AL JUEGO
        </button>
      </form>
    </motion.div>
  );
}

function AdminDashboard({ onCreate }) {
  const [questions, setQuestions] = useState([
  
  ]);

  const [jsonInput, setJsonInput] = useState('');

  // FUNCIÓN PARA CARGAR DESDE BLOC DE NOTAS (JSON)
  const handleBulkLoad = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (Array.isArray(parsed)) {
        // Mapeamos para asegurar que tengan IDs únicos y no choquen con las manuales
        const newQuestions = parsed.map((q, i) => ({
          ...q,
          id: `bulk-${Date.now()}-${i}`,
          type: q.type || 'multiple',
          points: q.points || 100,
          timeLimit: q.timeLimit || 15
        }));
        
        setQuestions([...questions, ...newQuestions]); // Las une a las que ya tengas
        setJsonInput(''); // Limpia el área
        alert("¡Preguntas importadas con éxito!");
      } else {
        alert("El formato debe ser un arreglo [ ] de preguntas.");
      }
    }   catch (err) {
  console.error(err); // <--- Esto quita el error de ESLint
  alert("Error en el código JSON...");
}
  };

  const addQuestion = (type) => {
    const newQ = {
      id: `q${Date.now()}`,
      type,
      question: '',
      options: type === 'multiple' ? ['', '', '', ''] : ['Verdadero', 'Falso'],
      correct: 0,
      points: 100,
      timeLimit: 15
    };
    setQuestions([...questions, newQ]);
  };

  const updateQuestion = (index, field, value) => {
    const updated = [...questions];
    updated[index][field] = value;
    setQuestions(updated);
  };

  const updateOption = (qIndex, optIndex, value) => {
    const updated = [...questions];
    updated[qIndex].options[optIndex] = value;
    setQuestions(updated);
  };

  const removeQuestion = (index) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-4xl mx-auto w-full pb-20">
      
      {/* OPCIÓN 1: CARGA DESDE BLOCK DE NOTAS */}
      <div className="bg-slate-800/40 border border-blue-500/20 p-6 rounded-3xl mb-10 shadow-xl backdrop-blur-sm">
        <h3 className="text-blue-400 font-black text-sm uppercase mb-3 tracking-widest flex items-center gap-2">
           <Plus size={16}/> Importar desde Notas (Formato JSON)
        </h3>
        <textarea 
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder='Pega aquí tu código JSON...'
          className="w-full h-24 bg-slate-900/50 border border-slate-700 rounded-2xl p-4 text-xs font-mono text-blue-200 focus:border-blue-500 outline-none mb-4 transition-all"
        />
        <button 
          onClick={handleBulkLoad}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-xl text-sm transition-all shadow-lg shadow-blue-900/20"
        >
          Procesar y Cargar Preguntas
        </button>
      </div>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Crear Nueva Sala</h2>
          <p className="text-slate-400">Edita manualmente o revisa las cargadas.</p>
        </div>
        <button 
          onClick={() => onCreate(questions)}
          disabled={questions.length === 0}
          className="bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:shadow-green-500/25 transition-all"
        >
          Hostear Juego ({questions.length})
        </button>
      </div>

      {/* OPCIÓN 2: LISTADO Y EDICIÓN MANUAL (Se muestran todas aquí) */}
      <div className="space-y-6">
        <AnimatePresence>
          {questions.map((q, qIndex) => (
            <motion.div key={q.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-slate-800/80 border border-slate-700 p-6 rounded-2xl relative">
              <button onClick={() => removeQuestion(qIndex)} className="absolute top-4 right-4 text-slate-500 hover:text-red-400 transition-colors">
                <Trash2 size={20} />
              </button>
              <div className="flex gap-4 mb-4">
                <span className="bg-slate-700 text-slate-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide flex items-center">
                  Pregunta {qIndex + 1}
                </span>
                <span className="bg-blue-900/50 text-blue-300 border border-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide flex items-center">
                  {q.type === 'multiple' ? 'Opción Múltiple' : 'Verdadero / Falso'}
                </span>
              </div>
              <input
                type="text"
                placeholder="Escribe la pregunta aquí..."
                value={q.question}
                onChange={(e) => updateQuestion(qIndex, 'question', e.target.value)}
                className="w-full bg-slate-900 border-b-2 border-slate-700 px-4 py-3 text-white focus:outline-none focus:border-purple-500 text-xl font-medium mb-6 rounded-t-xl"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {q.options.map((opt, oIndex) => (
                  <div key={oIndex} className="flex items-center gap-3">
                    <button 
                      onClick={() => updateQuestion(qIndex, 'correct', oIndex)}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${q.correct === oIndex ? 'border-green-500 bg-green-500/20 text-green-500' : 'border-slate-600 hover:border-slate-400'}`}
                    >
                      {q.correct === oIndex && <Check size={16} strokeWidth={3} />}
                    </button>
                    {q.type === 'multiple' ? (
                      <input 
                        type="text" 
                        value={opt} 
                        onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                        className={`w-full bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl text-white focus:outline-none focus:border-blue-500 ${q.correct === oIndex ? 'border-green-500/50' : ''}`}
                        placeholder={`Opción ${oIndex + 1}`}
                      />
                    ) : (
                      <div className={`w-full bg-slate-900 border px-4 py-2 rounded-xl text-white font-medium ${q.correct === oIndex ? 'border-green-500/50 text-green-400' : 'border-slate-700'}`}>
                        {opt}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-4 border-t border-slate-700 pt-4">
                <div className="flex items-center gap-2">
                  <label className="text-slate-400 text-sm">Puntos:</label>
                  <select value={q.points} onChange={(e) => updateQuestion(qIndex, 'points', parseInt(e.target.value))} className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1 text-sm outline-none">
                    <option value={100}>100 Normal</option>
                    <option value={200}>200 Doble</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-slate-400 text-sm">Tiempo:</label>
                  <select value={q.timeLimit} onChange={(e) => updateQuestion(qIndex, 'timeLimit', parseInt(e.target.value))} className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1 text-sm outline-none">
                    <option value={10}>10 seg</option>
                    <option value={15}>15 seg</option>
                    <option value={20}>20 seg</option>
                    <option value={30}>30 seg</option>
                  </select>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        <div className="flex gap-4 justify-center mt-8">
          <button onClick={() => addQuestion('multiple')} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-semibold py-3 px-6 rounded-xl flex items-center gap-2 transition-colors">
            <Plus size={18} /> Añadir Opción Múltiple
          </button>
          <button onClick={() => addQuestion('boolean')} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-semibold py-3 px-6 rounded-xl flex items-center gap-2 transition-colors">
            <Plus size={18} /> Añadir Verdadero/Falso
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// LÓGICA DE JUEGO - ADMINISTRADOR (MONITOR DE CARRERA)
// ============================================================================

function AdminRoom({ roomCode, roomData, players, db }) {
  if (!roomData) return <div className="text-center text-white mt-20"><div className="animate-pulse">Cargando sala...</div></div>;

  const { status, questions } = roomData;

  const updateRoomStatus = async (newStatus) => {
    const roomRef = doc(db, 'rooms', roomCode);
    await updateDoc(roomRef, { status: newStatus });
  };

  if (status === 'lobby') {
    return (
      <div className="flex flex-col items-center max-w-4xl mx-auto w-full h-full">
        <div className="bg-slate-800 border-2 border-dashed border-slate-600 rounded-3xl p-8 w-full text-center mb-8">
          <h2 className="text-slate-400 text-xl mb-2 font-medium">Código para unirse:</h2>
          <div className="text-7xl font-black text-white tracking-widest">{roomCode}</div>
          <p className="mt-4 text-slate-500">Pide a los jugadores que ingresen este código.</p>
        </div>
        <div className="flex justify-between items-center w-full mb-6">
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <Users className="text-blue-400" /> Jugadores ({players.length})
          </h3>
          <button 
            onClick={() => updateRoomStatus('playing')}
            disabled={players.length === 0}
            className="bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-all text-lg"
          >
            Empezar Partida
          </button>
        </div>
        <div className="flex flex-wrap gap-4 justify-center w-full">
          <AnimatePresence>
            {players.map(p => (
              <motion.div key={p.id} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="bg-slate-700 px-6 py-3 rounded-full font-bold text-lg text-white shadow-md border border-slate-600">
                {p.name}
              </motion.div>
            ))}
          </AnimatePresence>
          {players.length === 0 && <p className="text-slate-500 italic w-full text-center py-10">Esperando jugadores...</p>}
        </div>
      </div>
    );
  }

  // VISTA ADMIN EN JUEGO (MONITOR)
  if (status === 'playing') {
    return (
      <div className="flex flex-col items-center max-w-5xl mx-auto w-full h-full px-4">
        <h2 className="text-3xl font-black text-white mb-8 italic uppercase tracking-tighter">Carrera en Vivo</h2>
        <div className="w-full grid gap-4">
          {players.map((p, idx) => {
            const answeredCount = Object.keys(p.answers || {}).length;
            const progressPercentage = (answeredCount / questions.length) * 100;
            return (
              <motion.div key={p.id} layout className="bg-slate-800 p-5 rounded-2xl border border-white/5 shadow-xl backdrop-blur-md">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600 font-black text-2xl italic">#{idx+1}</span>
                    <span className="text-2xl font-black text-white">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black text-blue-400">{p.score} <small className="text-xs uppercase">pts</small></span>
                  </div>
                </div>
                <div className="w-full bg-slate-950 h-4 rounded-full overflow-hidden border border-white/5 relative">
                  <motion.div 
                    animate={{ width: `${progressPercentage}%` }}
                    className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-black uppercase tracking-widest">
                  <span>Inició Carrera</span>
                  <span>Avance: {answeredCount} / {questions.length}</span>
                  <span>Meta: {p.totalTime?.toFixed(1)}s empleado</span>
                </div>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-12">
           <button onClick={() => updateRoomStatus('finished')} className="bg-red-600 hover:bg-red-500 text-white font-black py-3 px-10 rounded-xl transition-all shadow-lg text-xs uppercase italic">
             Finalizar Ronda
           </button>
        </div>
      </div>
    );
  }

  if (status === 'finished') {
    const top3 = players.slice(0, 3);
    const others = players.slice(3);

    // Función interna para no repetir código de la lista de revisión
    const RenderReview = (player) => (
      <details className="mt-2 bg-slate-900/50 rounded-xl overflow-hidden border border-white/5">
        <summary className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 p-3 cursor-pointer hover:bg-white/5 transition-colors list-none flex justify-between items-center">
          <span>📋 Auditoría de Respuestas</span>
          <span className="text-blue-500">Ver detalles</span>
        </summary>
        <div className="p-3 space-y-2 border-t border-white/5 max-h-60 overflow-y-auto">
          {roomData.questions.map((q, qIdx) => {
            const pAns = player.answers?.[qIdx];
            const isCorrect = pAns === q.correct;
            const isTimeout = pAns === -1 || pAns === undefined;

            return (
              <div key={qIdx} className={`p-2 rounded-lg text-[11px] border ${isCorrect ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                <p className="text-white font-bold mb-1">{qIdx + 1}. {q.question}</p>
                <p className={isCorrect ? 'text-green-400' : 'text-red-400'}>
                  {isTimeout ? '⌛ TIEMPO AGOTADO' : `Marcó: ${q.options[pAns]}`}
                  {!isCorrect && !isTimeout && <span className="text-slate-500 block">Correcta: {q.options[q.correct]}</span>}
                </p>
              </div>
            );
          })}
        </div>
      </details>
    );

    return (
      <div className="flex flex-col items-center justify-start min-h-screen pb-20 pt-10 px-4 overflow-y-auto">
        <img src={logoEsgrima} className="w-16 h-16 object-contain mb-4" alt="Logo" />
        <h2 className="text-4xl md:text-5xl font-black text-white mb-10 text-center uppercase italic">Ranking Final</h2>
        
        {/* PODIO (TOP 3) */}
        <div className="flex items-end justify-center gap-2 md:gap-8 h-80 mb-12 w-full">
          {top3[1] && (
            <div className="flex flex-col items-center">
              <span className="text-sm md:text-lg font-bold text-white mb-2 text-center w-20 md:w-32 truncate">{top3[1].name}</span>
              <div className="w-20 md:w-32 bg-slate-400 rounded-t-lg flex flex-col items-center pt-4 text-slate-800 h-32 shadow-lg">
                <span className="font-black text-3xl">2</span>
                <span className="text-xs font-bold">{top3[1].score} pts</span>
              </div>
            </div>
          )}
          {top3[0] && (
            <div className="flex flex-col items-center">
              <span className="text-lg md:text-2xl font-black text-yellow-400 mb-2 text-center w-24 md:w-40 truncate">{top3[0].name}</span>
              <div className="w-24 md:w-40 bg-yellow-400 rounded-t-lg flex flex-col items-center pt-4 text-yellow-900 h-48 shadow-[0_0_20px_rgba(250,204,21,0.4)]">
                <span className="font-black text-5xl">1</span>
                <span className="text-sm font-bold">{top3[0].score} pts</span>
              </div>
            </div>
          )}
          {top3[2] && (
            <div className="flex flex-col items-center">
              <span className="text-sm md:text-lg font-bold text-white mb-2 text-center w-20 md:w-32 truncate">{top3[2].name}</span>
              <div className="w-20 md:w-32 bg-amber-700 rounded-t-lg flex flex-col items-center pt-4 text-amber-100 h-24 shadow-lg">
                <span className="font-black text-2xl">3</span>
                <span className="text-xs font-bold">{top3[2].score} pts</span>
              </div>
            </div>
          )}
        </div>

        {/* LISTA COMPLETA CON REVISIÓN (Cambiado para auditar a TODOS) */}
<div className="w-full max-w-2xl space-y-4">
  <h3 className="text-xl font-bold text-slate-400 mb-4 text-center uppercase tracking-widest italic">
    Panel de Verificación Total
  </h3>
  
  {players.map((player, index) => ( // <--- Cambiamos 'others' por 'players'
    <div key={player.id} className="bg-slate-800/80 backdrop-blur-md rounded-3xl p-5 border border-white/10 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          {/* Badge dinámico para resaltar a los ganadores en la lista */}
          <span className={`text-2xl font-black italic ${
            index === 0 ? 'text-yellow-400' : 
            index === 1 ? 'text-slate-400' : 
            index === 2 ? 'text-amber-600' : 
            'text-slate-600'
          }`}>
            #{index + 1}
          </span>
          <span className="text-xl font-bold text-white">{player.name}</span>
        </div>
        <div className="text-right">
          <span className="block text-xl font-black text-blue-400">{player.score} pts</span>
          <span className="text-[10px] text-slate-500 uppercase">{player.totalTime?.toFixed(1)}s totales</span>
        </div>
      </div>
      
      {/* Ahora puedes auditar a los del podio también */}
      {RenderReview(player)}
    </div>
  ))}
</div>

        <button onClick={() => window.location.reload()} className="mt-10 px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-black/50">
          Cerrar Sala y Volver
        </button>
      </div>
    );
  }
}

// ============================================================================
// LÓGICA DE JUEGO - JUGADOR (CARRERA INDIVIDUAL)
// ============================================================================

function PlayerRoom({ user, roomData, players, db, playerName }) {
  // 1. ESTADOS Y HOOKS
  const [localIdx, setLocalIdx] = useState(0);
  const [startTime, setStartTime] = useState(() => Date.now());
  const [timeLeft, setTimeLeft] = useState(0);

  // 2. FUNCIÓN PARA ENVIAR RESPUESTAS (MEMORIZADA)
  const submitAnswer = useCallback(async (optionIndex, isTimeout = false) => {
    if (localIdx >= roomData.questions.length || roomData.status !== 'playing') return;

    const currentQ = roomData.questions[localIdx];
    const timeTaken = isTimeout ? currentQ.timeLimit : (Date.now() - startTime) / 1000;
    const isCorrect = !isTimeout && optionIndex === currentQ.correct;
    
    try {
      const playerRef = doc(db, 'players', user.uid);
      
      await updateDoc(playerRef, {
        [`answers.${localIdx}`]: isTimeout ? -1 : optionIndex,
        score: increment(isCorrect ? currentQ.points : 0),
        correctAnswers: increment(isCorrect ? 1 : 0),
        incorrectAnswers: increment(isCorrect ? 0 : 1),
        totalTime: increment(timeTaken)
      });

      if (localIdx < roomData.questions.length - 1) {
        setLocalIdx(prev => prev + 1);
        setStartTime(Date.now());
      } else {
        setLocalIdx(roomData.questions.length); 
        await updateDoc(playerRef, { finished: true });
      }
    } catch (error) { 
      console.error("Error al enviar respuesta:", error);
    }
  }, [localIdx, roomData, startTime, db, user.uid]);

  // 3. EFECTO DE TEMPORIZADOR
  useEffect(() => {
    if (!roomData || roomData.status !== 'playing') return;
    const questions = roomData.questions;
    const currentQ = questions[localIdx];
    
    if (!currentQ || localIdx >= questions.length) return;

    const timer = setTimeout(() => {
      submitAnswer(null, true); 
    }, currentQ.timeLimit * 1000);

    return () => clearTimeout(timer);
  }, [localIdx, roomData, submitAnswer]);

  // 4. LÓGICA DE TIEMPO VISUAL
  useEffect(() => {
    if (!roomData || roomData.status !== 'playing') return;
    const questions = roomData.questions;
    const currentQ = questions[localIdx];
    if (!currentQ) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remain = Math.max(0, currentQ.timeLimit - elapsed);
      setTimeLeft(Math.ceil(remain));
    }, 500);

    return () => clearInterval(interval);
  }, [localIdx, startTime, roomData]);

  // --- VALIDACIÓN DE DATOS ---
  if (!roomData) return <div className="text-center text-white mt-20"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-white mx-auto"></div></div>;

  const { status, questions } = roomData;
  const currentQ = questions[localIdx];
  const meData = players.find(p => p.id === user.uid);

  // 5. VISTA LOBBY
  if (status === 'lobby') {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto w-full text-center">
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="bg-slate-800 border border-slate-700 p-8 rounded-3xl shadow-2xl w-full">
          <h2 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">¡Estás dentro, {playerName}!</h2>
          <p className="text-slate-400 mb-8 font-bold">Espera a que el anfitrión inicie la competencia.</p>
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </motion.div>
      </div>
    );
  }

  // 6. VISTA DE ESPERA INDIVIDUAL / REVISIÓN / RANKING FINAL
  if (localIdx >= questions.length || status === 'finished') {
    const isRoomFinished = status === 'finished';
    const rank = players.findIndex(p => p.id === user.uid) + 1;

    return (
      <div className="flex flex-col items-center justify-start min-h-screen pb-20 pt-10 max-w-md mx-auto w-full text-center px-4 overflow-y-auto">
        <Trophy size={80} className="text-yellow-400 mb-6 mx-auto drop-shadow-lg" />
        
        <h2 className="text-4xl font-black text-white mb-6 italic uppercase tracking-tighter underline decoration-yellow-500 decoration-4">
          {isRoomFinished ? 'Ranking Final' : '¡Meta Alcanzada!'}
        </h2>
        
        {/* TARJETA DE ESTADÍSTICAS */}
        <div className="bg-slate-800 border-4 border-blue-600 rounded-[2.5rem] p-8 w-full shadow-2xl relative overflow-hidden mb-10">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-purple-600" />
          
          {isRoomFinished ? (
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
              <div className="text-8xl font-black text-white mb-2 italic">#{rank}</div>
              <div className="text-2xl font-black text-blue-400 uppercase mb-6">{meData?.score || 0} PTS</div>
            </motion.div>
          ) : (
            <div className="py-4">
              <span className="text-xs font-black text-blue-400 uppercase tracking-[0.3em] animate-pulse block mb-2">Calculando Posición Oficial</span>
              <div className="text-5xl font-black text-white mb-4 italic tracking-tighter">LISTO</div>
              <div className="text-xl font-black text-slate-400 uppercase">{meData?.score || 0} PUNTOS</div>
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-6">
            <div className="flex flex-col items-center">
              <span className="text-green-500 font-black text-2xl">{meData?.correctAnswers || 0}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter text-center">Buenas</span>
            </div>
            <div className="flex flex-col items-center border-x border-white/5 px-1">
              <span className="text-red-500 font-black text-2xl">{meData?.incorrectAnswers || 0}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter text-center">Malas</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-purple-500 font-black text-2xl">{meData?.totalTime?.toFixed(1)}s</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter text-center">Tiempo</span>
            </div>
          </div>
        </div>

        {/* --- SECCIÓN DE REVISIÓN DETALLADA (SIEMPRE VISIBLE AL TERMINAR SUS PREGUNTAS) --- */}
        <div className="w-full space-y-4 text-left">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-slate-500 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2">
              <Check size={14} className="text-green-500"/> Revisión de Carrera
            </h3>
            {!isRoomFinished && (
              <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-1 rounded-md font-bold uppercase animate-pulse">
                Analizando...
              </span>
            )}
          </div>
          
          {questions.map((q, idx) => {
            const pAns = meData?.answers?.[idx];
            const isCorrect = pAns === q.correct;
            const isTimeout = pAns === -1 || pAns === undefined;

            const cardColor = isCorrect ? 'border-green-500/20 bg-green-500/5' 
                            : isTimeout ? 'border-orange-500/20 bg-orange-500/5' 
                            : 'border-red-500/20 bg-red-500/5';
            
            const textColor = isCorrect ? 'text-green-400' 
                            : isTimeout ? 'text-orange-400' 
                            : 'text-red-400';

            return (
              <div key={idx} className={`p-4 rounded-2xl border-2 transition-all ${cardColor}`}>
                <div className="flex gap-3">
                  <span className={`font-black text-sm ${textColor}`}>{idx + 1}.</span>
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm leading-tight mb-2">{q.question}</p>
                    <div className="flex flex-col gap-1 text-xs">
                      <p className={`${textColor} font-medium`}>
                        {isTimeout ? '⌛ Límite de tiempo agotado' : `Tu respuesta: ${q.options[pAns]}`}
                      </p>
                      {!isCorrect && (
                        <p className="text-slate-400">
                          <span className="text-green-500 font-bold italic">Respuesta correcta:</span> {q.options[q.correct]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {!isRoomFinished && (
           <p className="mt-10 text-slate-600 font-bold italic text-[10px] uppercase tracking-[0.3em] text-center border-t border-white/5 pt-8 w-full">
             Mantente aquí para ver el podio final
           </p>
        )}
      </div>
    );
  }

  // 7. VISTA JUEGO ACTIVO
  return (
    <div className="flex flex-col h-full max-w-lg mx-auto w-full pt-4">
      <div className="flex justify-between items-center mb-6 px-2">
        <span className="bg-slate-800 text-slate-300 font-black px-4 py-2 rounded-xl text-lg border border-slate-700 italic">
          #{localIdx + 1} / {questions.length}
        </span>
        <div className="bg-red-900/40 px-6 py-2 rounded-xl text-white font-black border border-red-500/50 flex items-center gap-2">
          <Timer size={24} />
          <span className="text-2xl italic tracking-widest">{timeLeft}s</span>
        </div>
      </div>
      
      <div className="bg-white text-slate-900 p-10 rounded-[2.5rem] mb-10 text-center shadow-2xl border-b-8 border-slate-200 min-h-[180px] flex items-center justify-center">
         <h3 className="text-2xl md:text-3xl font-black italic uppercase leading-tight">{currentQ.question}</h3>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 pb-20 px-2">
        {currentQ.options.map((opt, idx) => (
          <motion.button 
            key={idx}
            whileTap={{ scale: 0.95 }}
            onClick={() => submitAnswer(idx)}
            className={`${OPTION_COLORS[idx]} border-b-8 rounded-2xl w-full h-full min-h-[120px] shadow-lg flex items-center justify-center p-4 active:border-b-0 active:translate-y-2 transition-all`}
          >
             <span className="text-white text-2xl font-black break-words italic uppercase tracking-tighter">{opt}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
// ============================================================================
// COMPONENTES REUTILIZABLES
// ============================================================================

function TimerComponent({ startTime, timeLimit, onTimeUp }) {
  const [timeLeft, setTimeLeft] = useState(timeLimit);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, timeLimit - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onTimeUp();
      }
    }, 100); 

    return () => clearInterval(interval);
  }, [startTime, timeLimit, onTimeUp]);

  const percentage = (timeLeft / timeLimit) * 100;
  let color = 'bg-blue-500';
  if (timeLeft <= 5) color = 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
  else if (timeLeft <= timeLimit / 2) color = 'bg-yellow-500';

  return (
    <div className="w-full max-w-3xl flex items-center gap-6 mb-12">
      <div className="bg-slate-800 rounded-2xl w-20 h-20 flex items-center justify-center shrink-0 border-b-8 border-slate-950 shadow-2xl text-3xl font-black text-white italic">
        {timeLeft}
      </div>
      <div className="flex-1 bg-slate-950 rounded-full h-8 overflow-hidden border-2 border-slate-800 p-1">
        <motion.div 
          className={`h-full rounded-full ${color} transition-colors duration-500`}
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.1, ease: "linear" }}
        />
      </div>
    </div>
  );
}
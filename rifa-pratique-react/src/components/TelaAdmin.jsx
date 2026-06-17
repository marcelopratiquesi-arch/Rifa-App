import { useState, useEffect } from 'react';
import {
  LockKey, SignOut, ChartLine, Receipt,
  Users, Gear, Ticket, RocketLaunch, CurrencyDollar
} from '@phosphor-icons/react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

// ─── IMPORTAÇÃO DAS ABAS ESPECIALISTAS ────────────────────────────
// NOTA: Confirme que os ficheiros estão na pasta src/components/admin/
import AbaValidacao from './admin/AbaValidacao';
import AbaSorteio   from './admin/AbaSorteio';
import AbaDashboard from './admin/AbaDashboard';
import AbaEquipe    from './admin/AbaEquipe';
import AbaConfig    from './admin/AbaConfig';
// 🚀 IMPORTANDO A NOVA ABA AQUI
import AbaFluxoCaixa from './admin/AbaFluxoCaixa'; 

export default function TelaAdmin() {
  // ─── ESTADOS GLOBAIS ────────────────────────────────────────────
  const [email,        setEmail]        = useState('');
  const [senha,        setSenha]        = useState('');
  const [adminLogado,  setAdminLogado]  = useState(false);
  const [loginErro,    setLoginErro]    = useState('');

  const [pedidos,      setPedidos]      = useState([]);
  const [vendedores,   setVendedores]   = useState([]);
  const [abaAtiva,     setAbaAtiva]     = useState('pedidos');

  // ─── AUTENTICAÇÃO E BUSCA DE DADOS (FIREBASE) ───────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAdminLogado(!!(user && !user.isAnonymous));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!adminLogado) return;
    const unsub = onSnapshot(collection(db, 'pedidos'), (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Ordenação de segurança (data de criação)
      lista.sort((a, b) => b.ts - a.ts);
      setPedidos(lista);
    });
    return () => unsub();
  }, [adminLogado]);

  useEffect(() => {
    if (!adminLogado) return;
    const unsub = onSnapshot(collection(db, 'vendedores'), (snap) => {
      setVendedores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [adminLogado]);

  // ─── HANDLERS DE LOGIN E LOGOUT ───────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginErro('');
    try {
      await signInWithEmailAndPassword(auth, email, senha);
      setSenha('');
    } catch {
      setLoginErro('E-mail ou senha incorretos.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.reload();
  };

  // Badge para a aba Validação
  const qtdPendentes = pedidos.filter(p => p.status === 'pendente').length;

  // ─── TELA DE LOGIN ─────────────────────────────────────────────
  if (!adminLogado) {
    return (
      <div className="max-w-sm mx-auto mt-10 bg-white dark:bg-zinc-900 p-8 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 transition-colors">
        <h2 className="text-xl font-bold mb-6 text-center text-zinc-900 dark:text-white flex justify-center gap-2">
          <LockKey size={24} className="text-orange-500" /> Acesso Restrito
        </h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />
          <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />
          {loginErro && <p className="text-red-500 text-sm text-center">{loginErro}</p>}
          <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-lg transition-colors">
            Entrar no Painel
          </button>
        </form>
      </div>
    );
  }

  // ─── TELA DE ADMINISTRAÇÃO (ORQUESTRADOR) ─────────────────────
  return (
    <div className="animate-fade-in max-w-5xl mx-auto mt-4 pb-16">

      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 gap-4 shadow-sm">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <RocketLaunch size={28} className="text-orange-500" weight="fill" /> Painel Admin
        </h2>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          <button onClick={handleLogout} className="text-red-500 hover:text-red-400 font-semibold flex items-center gap-1 text-sm transition-colors">
            <SignOut size={20} /> Sair
          </button>
        </div>
      </div>

      {/* MENU DE NAVEGAÇÃO DAS ABAS */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 mb-6 overflow-x-auto scrollbar-none">
        {[
          { key: 'pedidos',    label: 'Validação', icon: <Receipt size={17}/>,  cor: 'orange', badge: qtdPendentes },
          { key: 'sorteio',    label: 'Sorteio',   icon: <Ticket size={17}/>,    cor: 'purple', badge: 0 },
          { key: 'relatorios', label: 'Dashboard', icon: <ChartLine size={17}/>, cor: 'orange', badge: 0 },
          { key: 'fluxo',      label: 'Fluxo de Caixa', icon: <CurrencyDollar size={17}/>, cor: 'green', badge: 0 }, // 🚀 NOVA ABA ADICIONADA AQUI
          { key: 'equipe',     label: 'Equipe',    icon: <Users size={17}/>,     cor: 'orange', badge: 0 },
          { key: 'config',     label: 'Config',    icon: <Gear size={17}/>,      cor: 'red',    badge: 0 },
        ].map(({ key, label, icon, cor, badge }) => (
          <button key={key} onClick={() => setAbaAtiva(key)}
            className={`pb-3 px-3 font-bold text-sm border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              abaAtiva === key
                ? cor === 'red' ? 'border-red-500 text-red-500'
                : cor === 'purple' ? 'border-purple-500 text-purple-500'
                : cor === 'green' ? 'border-green-500 text-green-500' // Adicionei cor verde para o fluxo
                : 'border-orange-500 text-orange-500'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {icon} {label}
            {badge > 0 && (
              <span className="ml-1 bg-orange-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── RENDERIZAÇÃO CONDICIONAL DAS ABAS ─── */}
      <div className="min-h-[500px]">
        {abaAtiva === 'pedidos'    && <AbaValidacao pedidos={pedidos} vendedores={vendedores} />}
        {abaAtiva === 'sorteio'    && <AbaSorteio   pedidos={pedidos} />}
        {abaAtiva === 'relatorios' && <AbaDashboard pedidos={pedidos} vendedores={vendedores} />}
        {abaAtiva === 'fluxo'      && <AbaFluxoCaixa pedidos={pedidos} />} {/* 🚀 RENDERIZANDO A NOVA ABA AQUI */}
        {abaAtiva === 'equipe'     && <AbaEquipe    vendedores={vendedores} />}
        {abaAtiva === 'config'     && <AbaConfig    pedidos={pedidos} setAbaAtiva={setAbaAtiva} />}
      </div>

    </div>
  );
}
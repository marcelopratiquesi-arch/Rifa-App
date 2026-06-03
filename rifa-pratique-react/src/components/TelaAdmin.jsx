import { useState, useEffect } from 'react';
import {
  LockKey, RocketLaunch, SignOut, Broom, ChartLine, Receipt,
  DownloadSimple, FilePdf, Users, Trash, Trophy, Gear, Warning,
  Ticket, Gift, SpinnerGap, Storefront, Medal, MagnifyingGlass,
  WhatsappLogo, CheckCircle, XCircle, Clock
} from '@phosphor-icons/react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ─── CONFIG ───────────────────────────────────────────────
const EXPIRACAO_MS = 24 * 60 * 60 * 1000; // 24 horas
// ─────────────────────────────────────────────────────────

const fmtValor = (v) => Number(v).toFixed(2).replace('.', ',');
const fmtData  = (ts) => new Date(ts).toLocaleString('pt-BR');

function tempoRestantePedido(ts) {
  const diff = EXPIRACAO_MS - (Date.now() - ts);
  if (diff <= 0) return 'Expirando...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function TelaAdmin() {
  const [email,        setEmail]        = useState('');
  const [senha,        setSenha]        = useState('');
  const [adminLogado,  setAdminLogado]  = useState(false);
  const [loginErro,    setLoginErro]    = useState('');

  const [pedidos,      setPedidos]      = useState([]);
  const [vendedores,   setVendedores]   = useState([]);
  const [novoVendedor, setNovoVendedor] = useState('');
  const [novaUnidade,  setNovaUnidade]  = useState('Santa Inês 1');

  const [filtro,       setFiltro]       = useState('pendente');
  const [busca,        setBusca]        = useState('');
  const [modoTurbo,    setModoTurbo]    = useState(false);
  const [abaAtiva,     setAbaAtiva]     = useState('pedidos');
  const [zeladorFeito, setZeladorFeito] = useState(false);

  // Sorteio
  const [sorteando,  setSorteando]  = useState(false);
  const [ganhadores, setGanhadores] = useState(null);

  // ── Auth ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAdminLogado(!!(user && !user.isAnonymous));
    });
    return () => unsub();
  }, []);

  // ── Listener pedidos (AGORA COM SEGURANÇA DE ID) ─────────
  useEffect(() => {
    if (!adminLogado) return;
    const unsub = onSnapshot(collection(db, 'pedidos'), (snap) => {
      // ✅ Prioridade 1: Garante que o ID venha da raiz do Firestore
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => b.ts - a.ts);
      setPedidos(lista);
    });
    return () => unsub();
  }, [adminLogado]);

  // ── Listener vendedores ──────────────────────────────────
  useEffect(() => {
    if (!adminLogado) return;
    const unsub = onSnapshot(collection(db, 'vendedores'), (snap) => {
      setVendedores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [adminLogado]);

  // ── Zelador Invisível ────────────────────────────────────
  useEffect(() => {
    if (!adminLogado || pedidos.length === 0 || zeladorFeito) return;
    const agora  = Date.now();
    const velhos = pedidos.filter(
      (p) => p.status === 'pendente' && agora - p.ts > EXPIRACAO_MS
    );
    if (!velhos.length) { setZeladorFeito(true); return; }
    const batch = writeBatch(db);
    velhos.forEach((p) => batch.update(doc(db, 'pedidos', p.id), { status: 'expirado' }));
    batch.commit().then(() => {
      console.log(`🧹 Zelador: ${velhos.length} pedido(s) expirado(s).`);
      setZeladorFeito(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLogado, pedidos]);

  // ── Login / Logout ────────────────────────────────────────
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

  // ── Ações de pedido ──────────────────────────────────────
  const aprovarPedido = async (id) => {
    if (!modoTurbo && !window.confirm('Confirmar o PIX e aprovar?')) return;
    // ✅ Preparando o terreno para Auditoria (tsPago)
    await updateDoc(doc(db, 'pedidos', id), { status: 'pago', tsPago: Date.now() });
  };

  const expirarPedido = async (id) => {
    if (!window.confirm('Expirar este pedido e devolver os números?')) return;
    await updateDoc(doc(db, 'pedidos', id), { status: 'expirado' });
  };

  const cobrarWhatsApp = (p) => {
    const tel  = p.tel.replace(/\D/g, '');
    const nome = p.nome.split(' ')[0];
    const msgs =
      "Ola " + nome + "!\n" +
      "Aqui e o Marcelo da Rifa Pratique.\n\n" +
      "Vi que voce separou os numeros *" + (p.nums || []).join(', ') + "* " +
      "(Pedido #" + p.id + " - R$ " + fmtValor(p.valor) + ").\n\n" +
      "So falta o PIX para confirmar sua chance de ganhar!\n" +
      "Chave PIX: *lemosmjlp@gmail.com*\n\n" +
      "Posso te ajudar?";
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msgs)}`, '_blank');
  };

  // ── Sorteio (NOVO ALGORITMO CRIPTOGRÁFICO) ────────────────
  const executarSorteio = () => {
    const pool = [];
    pedidos.filter((p) => p.status === 'pago').forEach((p) => {
      (p.nums || []).forEach((num) => pool.push({ numero: num, pedido: p }));
    });
    
    if (pool.length < 2) {
      alert('Você precisa ter pelo menos 2 cotas PAGAS para sortear 1º e 2º lugar.');
      return;
    }
    
    setGanhadores(null);
    setSorteando(true);
    
    setTimeout(() => {
      // ✅ Prioridade 1: Algoritmo Criptográfico de Fisher-Yates
      const misturados = [...pool];
      for (let i = misturados.length - 1; i > 0; i--) {
        const randomBuffer = new Uint32Array(1);
        window.crypto.getRandomValues(randomBuffer);
        const j = randomBuffer[0] % (i + 1);
        [misturados[i], misturados[j]] = [misturados[j], misturados[i]];
      }

      const primeiro = misturados[0];
      const segundo  = misturados.find((i) => i.numero !== primeiro.numero);
      
      setGanhadores({ primeiro, segundo });
      setSorteando(false);
    }, 2000);
  };

  // ── Vendedores ────────────────────────────────────────────
  const handleAdicionarVendedor = async (e) => {
    e.preventDefault();
    if (!novoVendedor.trim()) return;
    try {
      await addDoc(collection(db, 'vendedores'), { nome: novoVendedor.trim(), unidade: novaUnidade });
      setNovoVendedor('');
    } catch { alert('Erro ao adicionar.'); }
  };

  const handleRemoverVendedor = async (id, nome) => {
    if (!window.confirm(`Remover ${nome}?`)) return;
    try { await deleteDoc(doc(db, 'vendedores', id)); } catch { alert('Erro ao remover.'); }
  };

  // ── Zerar banco (COM BACKUP E BATCH DELETE SEGURO) ─────────────
  const zerarBancoDeDados = async () => {
    if (!window.confirm('🚨 ATENÇÃO EXTREMA: Isso apaga TODOS os pedidos e libera a grelha. Tem certeza absoluta?')) return;
    if (window.prompt('Digite ZERAR para confirmar:') !== 'ZERAR') {
      alert('Operação cancelada.'); return;
    }
    
    try {
      // 1. Gerar e baixar arquivo de Backup JSON localmente
      const backupData = JSON.stringify(pedidos, null, 2);
      const blob = new Blob([backupData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_rifa_pratique_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url); // Limpa a memória

      // 2. Trava de segurança: Aguarda 1.5 segundos para garantir que o navegador iniciou o download
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 3. Exclusão segura em bloco (Batch)
      const batch = writeBatch(db);
      pedidos.forEach((p) => {
        batch.delete(doc(db, 'pedidos', p.id));
      });
      
      await batch.commit(); // Executa a exclusão de todos de uma só vez
      
      alert('✅ Backup iniciado e Banco zerado com segurança!');
      setGanhadores(null);
      setAbaAtiva('pedidos');
    } catch (error) { 
      console.error("Erro na limpeza:", error);
      alert('Erro ao limpar banco de dados. A operação foi abortada para proteger seus dados.'); 
    }
  };

  // ── Dashboard ─────────────────────────────────────────────
  const pedidosAprovados = pedidos.filter((p) => p.status === 'pago');
  const totalFaturado    = pedidosAprovados.reduce((s, p) => s + Number(p.valor), 0);
  const totalPendente    = pedidos.filter((p) => p.status === 'pendente').reduce((s, p) => s + Number(p.valor), 0);

  const mapaVendedores = Object.fromEntries(vendedores.map((v) => [v.nome, v.unidade || 'Desconhecida']));

  const calcularRanking = () => {
    const rv = {}, ru = { 'Santa Inês 1': { valor: 0, cotas: 0 }, 'Santa Inês 2': { valor: 0, cotas: 0 } };
    pedidosAprovados.forEach((p) => {
      const vend = p.vendedor || 'Venda Direta';
      const und  = mapaVendedores[vend] || 'Venda Direta';
      if (!rv[vend]) rv[vend] = { valor: 0, cotas: 0, unidade: und };
      rv[vend].valor += Number(p.valor);
      rv[vend].cotas += (p.nums || []).length;
      if (ru[und]) { ru[und].valor += Number(p.valor); ru[und].cotas += (p.nums || []).length; }
    });
    return {
      vendedores: Object.entries(rv).map(([n, d]) => ({ nome: n, ...d })).sort((a, b) => b.valor - a.valor),
      unidades:   Object.entries(ru).map(([n, d]) => ({ nome: n, ...d })).sort((a, b) => b.valor - a.valor),
    };
  };

  const { vendedores: rankVend, unidades: rankUnit } = calcularRanking();

  // ── Exportações ───────────────────────────────────────────
  const exportarExcel = () => {
    const dados = pedidos.map((p) => ({
      ID: p.id, Data: fmtData(p.ts), Nome: p.nome, Telefone: p.tel,
      Vendedor: p.vendedor || 'Direto', Unidade: mapaVendedores[p.vendedor] || 'Venda Direta',
      Status: p.status.toUpperCase(), Qtd: (p.nums || []).length,
      'Valor R$': Number(p.valor),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
    XLSX.writeFile(wb, `Rifa_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportarPDF = () => {
    const pdf = new jsPDF('landscape');
    pdf.text('Relatório — Rifa Pratique', 14, 15);
    pdf.autoTable({
      head: [['ID','Data','Nome','Vendedor','Unidade','Status','Qtd','Valor']],
      body: pedidos.map((p) => [
        p.id, fmtData(p.ts), p.nome, p.vendedor || '-',
        mapaVendedores[p.vendedor] || '-', p.status.toUpperCase(),
        (p.nums || []).length, `R$ ${fmtValor(p.valor)}`,
      ]),
      startY: 22, styles: { fontSize: 8 }, headStyles: { fillColor: [234, 88, 12] },
    });
    pdf.save(`Rifa_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const pedidosFiltrados = pedidos.filter((p) => {
    const q = busca.toLowerCase();
    return p.status === filtro && (
      !q || p.nome.toLowerCase().includes(q) || p.tel.includes(q) ||
      p.cpf?.includes(q) || p.id?.includes(q)
    );
  });

  // ════════════════════════════════════════════════════════
  // RENDER - TELA DE LOGIN
  // ════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════
  // RENDER - PAINEL ADMIN
  // ════════════════════════════════════════════════════════
  return (
    <div className="animate-fade-in max-w-5xl mx-auto mt-4 pb-16">

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 gap-4 shadow-sm">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <RocketLaunch size={28} className="text-orange-500" weight="fill" /> Painel Turbo
        </h2>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Turbo ⚡</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={modoTurbo} onChange={(e) => setModoTurbo(e.target.checked)} />
              <div className="w-11 h-6 bg-zinc-300 dark:bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
            </label>
          </div>
          <button onClick={handleLogout} className="text-red-500 hover:text-red-400 font-semibold flex items-center gap-1 text-sm transition-colors">
            <SignOut size={20} /> Sair
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 mb-6 overflow-x-auto scrollbar-none">
        {[
          { key: 'pedidos',   icon: <Receipt size={17}/>,   label: 'Validação',     cor: 'orange' },
          { key: 'sorteio',   icon: <Ticket size={17}/>,    label: 'Sorteio',       cor: 'purple' },
          { key: 'relatorios',icon: <ChartLine size={17}/>, label: 'Dashboard',     cor: 'orange' },
          { key: 'equipe',    icon: <Users size={17}/>,     label: 'Equipe',        cor: 'orange' },
          { key: 'config',    icon: <Gear size={17}/>,      label: 'Config',        cor: 'red'    },
        ].map(({ key, icon, label, cor }) => (
          <button
            key={key}
            onClick={() => setAbaAtiva(key)}
            className={`pb-3 px-3 font-bold text-sm border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              abaAtiva === key
                ? cor === 'red'    ? 'border-red-500 text-red-500'
                : cor === 'purple' ? 'border-purple-500 text-purple-500'
                :                   'border-orange-500 text-orange-500'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {abaAtiva === 'pedidos' && (
        <div className="animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Aprovados',       val: pedidos.filter(p=>p.status==='pago').length,     cor: 'text-green-500' },
              { label: 'Pendentes',       val: pedidos.filter(p=>p.status==='pendente').length, cor: 'text-yellow-500' },
              { label: 'Em caixa',        val: `R$ ${fmtValor(totalFaturado)}`,                 cor: 'text-orange-400' },
              { label: 'Aguard. PIX',     val: `R$ ${fmtValor(totalPendente)}`,                 cor: 'text-blue-400' },
            ].map(({ label, val, cor }) => (
              <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center">
                <p className={`text-xl font-black ${cor}`}>{val}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="flex gap-2">
              {[
                { key: 'pendente', label: 'Pendentes' },
                { key: 'pago',     label: 'Aprovados' },
                { key: 'expirado', label: 'Expirados' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFiltro(key)}
                  className={`px-4 py-2 font-semibold rounded-lg text-sm border capitalize whitespace-nowrap transition-colors ${
                    filtro === key ? 'bg-orange-600 border-orange-500 text-white' : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type="text" placeholder="Buscar por nome, telefone, CPF ou ID..."
                value={busca} onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-8 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            {pedidosFiltrados.length === 0 ? (
              <p className="text-center py-10 text-zinc-500 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                Nenhum pedido encontrado.
              </p>
            ) : (
              pedidosFiltrados.map((p) => (
                <div key={p.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors">
                  <div className={`h-1 w-full ${
                    p.status === 'pago' ? 'bg-green-500' :
                    p.status === 'pendente' ? 'bg-yellow-500' : 'bg-zinc-400'
                  }`} />
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-zinc-900 dark:text-white text-base leading-tight">{p.nome}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {fmtData(p.ts)}
                          {p.status === 'pendente' && (
                            <span className="ml-2 text-yellow-500 inline-flex items-center gap-1">
                              <Clock size={11} /> {tempoRestantePedido(p.ts)}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-orange-500 dark:text-orange-400 font-black text-xl shrink-0 ml-2">
                        R$ {fmtValor(p.valor)}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-500 mb-3 space-y-0.5">
                      <p>📞 {p.tel} &nbsp;·&nbsp; 📧 {p.email}</p>
                      {p.vendedor && <p>🏪 <span className="text-orange-500 font-semibold">{p.vendedor}</span></p>}
                      <p className="font-mono text-zinc-400">#{p.id}</p>
                    </div>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {(p.nums || []).map((n) => (
                        <span key={n} className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                          p.status === 'pago'
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : p.status === 'pendente'
                            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                        }`}>{n}</span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {p.status === 'pendente' && (
                        <button onClick={() => cobrarWhatsApp(p)}
                          className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe57] text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
                        >
                          <WhatsappLogo size={14} weight="fill" /> Cobrar
                        </button>
                      )}
                      {p.status === 'pendente' && (
                        <button onClick={() => aprovarPedido(p.id)}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
                        >
                          <CheckCircle size={14} weight="fill" /> Confirmar PIX
                        </button>
                      )}
                      {p.status === 'pendente' && (
                        <button onClick={() => expirarPedido(p.id)}
                          className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-red-500 text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700"
                        >
                          <XCircle size={14} weight="fill" /> Expirar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {abaAtiva === 'sorteio' && (
        <div className="animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center max-w-3xl mx-auto">
            <Gift size={56} weight="fill" className="text-purple-500 mx-auto mb-4" />
            <h2 className="text-3xl font-black text-zinc-900 dark:text-white mb-2">Sorteio das Cestas</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-sm">
              Apenas números com PIX <strong>confirmado e aprovado</strong> entram na roda.
            </p>
            <button onClick={executarSorteio} disabled={sorteando}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white font-black py-4 px-8 rounded-xl shadow-lg text-xl transition-all flex justify-center items-center gap-3 mx-auto w-full md:w-auto"
            >
              {sorteando
                ? <><SpinnerGap size={28} className="animate-spin" /> Misturando...</>
                : <><Ticket size={28} weight="fill" /> Realizar Sorteio Agora</>}
            </button>

            {ganhadores && !sorteando && (
              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 text-left animate-fade-in">
                <div className="bg-gradient-to-br from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-900/10 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-yellow-400 dark:bg-yellow-600 text-yellow-900 dark:text-white font-black text-xs px-3 py-1 rounded-bl-lg">1º LUGAR</div>
                  <h3 className="text-2xl font-black text-yellow-600 dark:text-yellow-500 mb-4 mt-2 flex items-center gap-2">
                    <Trophy weight="fill" /> Cesta Ouro
                  </h3>
                  <p className="text-5xl font-black text-zinc-900 dark:text-white mb-4">{ganhadores.primeiro.numero}</p>
                  <p className="text-zinc-900 dark:text-white font-bold text-lg">{ganhadores.primeiro.pedido.nome}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400"><strong>WhatsApp:</strong> {ganhadores.primeiro.pedido.tel}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400"><strong>Vendedor:</strong> {ganhadores.primeiro.pedido.vendedor || 'Venda Direta'}</p>
                </div>
                <div className="bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800/50 dark:to-zinc-900/50 border-2 border-zinc-300 dark:border-zinc-600 rounded-xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-zinc-300 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100 font-black text-xs px-3 py-1 rounded-bl-lg">2º LUGAR</div>
                  <h3 className="text-2xl font-black text-zinc-600 dark:text-zinc-400 mb-4 mt-2 flex items-center gap-2">
                    <Gift weight="fill" /> Cesta Prata
                  </h3>
                  <p className="text-5xl font-black text-zinc-900 dark:text-white mb-4">{ganhadores.segundo.numero}</p>
                  <p className="text-zinc-900 dark:text-white font-bold text-lg">{ganhadores.segundo.pedido.nome}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400"><strong>WhatsApp:</strong> {ganhadores.segundo.pedido.tel}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400"><strong>Vendedor:</strong> {ganhadores.segundo.pedido.vendedor || 'Venda Direta'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {abaAtiva === 'relatorios' && (
        <div className="animate-fade-in space-y-6">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="font-bold mb-6 flex items-center justify-center gap-2 text-xl text-zinc-900 dark:text-white">
              <Medal className="text-orange-500" size={28} weight="fill" /> Batalha das Unidades
            </h3>
            <div className="grid grid-cols-2 gap-4 md:gap-8 max-w-2xl mx-auto">
              {['Santa Inês 1', 'Santa Inês 2'].map((unidade) => {
                const dados    = rankUnit.find((u) => u.nome === unidade);
                const liderando = rankUnit[0]?.nome === unidade && rankUnit[0]?.valor > 0;
                return (
                  <div key={unidade} className={`p-4 rounded-xl border-2 text-center transition-all ${liderando ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10 scale-105 shadow-lg' : 'border-zinc-200 dark:border-zinc-800'}`}>
                    <Storefront size={32} className="mx-auto mb-2 text-zinc-400" />
                    <h4 className="font-bold text-zinc-900 dark:text-white">{unidade}</h4>
                    <p className="text-2xl font-black text-green-600 dark:text-green-400 mt-2">
                      R$ {fmtValor(dados?.valor || 0)}
                    </p>
                    <p className="text-sm text-zinc-500">{dados?.cotas || 0} cotas</p>
                    {liderando && (
                      <span className="inline-block mt-3 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-bounce">
                        🏆 LIDERANDO
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-500">Faturamento Aprovado</p>
              <h3 className="text-3xl font-black text-green-500">R$ {fmtValor(totalFaturado)}</h3>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-500">Aguardando Pagamento</p>
              <h3 className="text-3xl font-black text-yellow-500">R$ {fmtValor(totalPendente)}</h3>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col justify-center gap-3">
              <button onClick={exportarExcel}
                className="w-full bg-[#107C41] hover:bg-[#0d6535] text-white font-bold py-2.5 rounded-lg flex justify-center items-center gap-2 transition-colors">
                <DownloadSimple size={20} /> Baixar Excel
              </button>
              <button onClick={exportarPDF}
                className="w-full bg-[#E53E3E] hover:bg-[#c53030] text-white font-bold py-2.5 rounded-lg flex justify-center items-center gap-2 transition-colors">
                <FilePdf size={20} /> Baixar PDF
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="font-bold mb-4 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Trophy className="text-yellow-500" size={22} weight="fill" /> Ranking de Vendedores
            </h3>
            {rankVend.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">Nenhuma venda aprovada ainda.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                    <th className="pb-3">Pos</th>
                    <th className="pb-3">Vendedor</th>
                    <th className="pb-3">Unidade</th>
                    <th className="pb-3">Cotas</th>
                    <th className="pb-3">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {rankVend.map((v, i) => (
                    <tr key={v.nome} className="border-b border-zinc-100 dark:border-zinc-800/50">
                      <td className="py-3 font-black text-orange-500">#{i + 1}</td>
                      <td className="py-3 font-bold text-zinc-900 dark:text-white">{v.nome}</td>
                      <td className="py-3 text-xs font-semibold text-zinc-500">{v.unidade}</td>
                      <td className="py-3 text-zinc-700 dark:text-zinc-300">{v.cotas}</td>
                      <td className="py-3 font-bold text-green-600 dark:text-green-400">R$ {fmtValor(v.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {abaAtiva === 'equipe' && (
        <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 h-fit">
            <h3 className="font-bold mb-4 flex items-center gap-2 text-zinc-900 dark:text-white">
              <Users className="text-orange-500" /> Adicionar Vendedor
            </h3>
            <form onSubmit={handleAdicionarVendedor} className="flex flex-col gap-3">
              <input type="text" placeholder="Nome do Vendedor" value={novoVendedor}
                onChange={(e) => setNovoVendedor(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <select value={novaUnidade} onChange={(e) => setNovaUnidade(e.target.value)}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none"
                >
                  <option value="Santa Inês 1">Santa Inês 1</option>
                  <option value="Santa Inês 2">Santa Inês 2</option>
                </select>
                <button type="submit" className="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-lg transition-colors">
                  Salvar
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="font-bold mb-4 text-zinc-900 dark:text-white">
              Vendedores Cadastrados ({vendedores.length})
            </h3>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              {vendedores.length === 0 && (
                <p className="text-sm text-zinc-500">Nenhum vendedor cadastrado ainda.</p>
              )}
              {vendedores.map((v) => (
                <div key={v.id} className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 rounded-lg">
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-200 block">{v.nome}</span>
                    <span className="text-xs text-orange-500 font-bold">{v.unidade || 'Santa Inês 1'}</span>
                  </div>
                  <button onClick={() => handleRemoverVendedor(v.id, v.nome)} className="text-red-400 hover:text-red-600 transition-colors">
                    <Trash size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {abaAtiva === 'config' && (
        <div className="animate-fade-in bg-red-50 dark:bg-red-950/20 p-6 rounded-xl border border-red-200 dark:border-red-900/50">
          <h3 className="font-bold text-lg mb-2 text-red-600 flex items-center gap-2">
            <Warning size={24} weight="fill" /> Zona de Perigo
          </h3>
          <p className="text-zinc-700 dark:text-zinc-300 text-sm mb-6 max-w-2xl">
            Apaga <strong>TODOS os pedidos</strong> e libera todas as cotas para uma nova rifa.
            Um <strong>backup em JSON será baixado automaticamente</strong> no seu computador antes de deletar.
            Os vendedores não serão apagados.
          </p>
          <button onClick={zerarBancoDeDados}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition-colors">
            <Broom size={20} /> Limpar Banco de Dados
          </button>
        </div>
      )}

    </div>
  );
}
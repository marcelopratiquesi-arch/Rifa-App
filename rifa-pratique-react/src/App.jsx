import { useState, useEffect, useCallback } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { Sun, Moon, LockKey } from '@phosphor-icons/react';
import { auth, db } from './services/firebase';
import GradeNumeros from './components/GradeNumeros';
import TelaPagamento from './components/TelaPagamento';
import TelaAdmin from './components/TelaAdmin';

// ─── CONFIGURAÇÕES GLOBAIS ────────────────────────────────
const PRECO_UNITARIO = 10;
const EXPIRACAO_REAL = 24 * 60 * 60 * 1000; // 24 horas
// ─────────────────────────────────────────────────────────

function calcularValor(qtd) {
  let restante = qtd;
  let total = 0;
  const blocos = [];

  const b13 = Math.floor(restante / 13);
  total += b13 * 100;
  restante -= b13 * 13;
  if (b13 > 0) blocos.push(`${b13}x Pacote 13 (R$100)`);

  const b6 = Math.floor(restante / 6);
  total += b6 * 50;
  restante -= b6 * 6;
  if (b6 > 0) blocos.push(`${b6}x Pacote 6 (R$50)`);

  total += restante * PRECO_UNITARIO;
  if (restante > 0) blocos.push(`${restante}x Avulso (R$${restante * PRECO_UNITARIO})`);

  return { total, blocos };
}

export default function App() {
  const [telaAtiva, setTelaAtiva] = useState('comprar'); 
  const [modoCompra, setModoCompra] = useState('grelha');  
  const [temaEscuro, setTemaEscuro] = useState(true);
  const [numerosSelecionados, setNumerosSelecionados] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [usuarioId, setUsuarioId] = useState(null);

  // ─── AUTENTICAÇÃO ANÔNIMA ────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setUsuarioId(user.uid);
      else signInAnonymously(auth).catch(console.error);
    });
    return () => unsub();
  }, []);

  // ─── ESCUTA DO BANCO DE DADOS EM TEMPO REAL ──────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pedidos'), (snapshot) => {
      const lista = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPedidos(lista);
    });
    return () => unsub();
  }, []);

  // ─── LÓGICA RIGOROSA DE FILTRAGEM DE CORES ───────────────
  const pagos = [];
  const pendentes = [];
  const agora = Date.now();

  pedidos.forEach((p) => {
    // Garante que o pedido tem números atrelados
    if (!p.nums || !Array.isArray(p.nums)) return;

    if (p.status === 'pago') {
      // Se está pago, trava como verde
      pagos.push(...p.nums);
    } else if (p.status === 'pendente') {
      // Se está pendente E o relógio de 24h não estourou, trava como amarelo
      if (agora - p.ts < EXPIRACAO_REAL) {
        pendentes.push(...p.nums);
      }
    }
    // IMPORTANTE: Se o status for 'expirado', o código simplesmente IGNORA.
    // Como os números não entram nem na lista 'pagos' nem na 'pendentes',
    // a GradeNumeros entende que eles estão 100% livres e pinta de cinza!
  });

  const alternarNumero = useCallback((num) => {
    setNumerosSelecionados((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );
  }, []);

  const { total: valorCobrado } = calcularValor(numerosSelecionados.length);

  const irParaPagamento = () => {
    if (numerosSelecionados.length === 0) {
      alert('Selecione pelo menos 1 número para continuar!');
      return;
    }
    setModoCompra('pagamento');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const voltarParaGrelha = () => {
    setModoCompra('grelha');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finalizarCompra = () => {
    setNumerosSelecionados([]);
    setModoCompra('grelha');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const gerarSurpresinha = (quantidade) => {
    const todosOsNumeros = Array.from({ length: 1000 }, (_, i) => String(i + 1).padStart(3, '0'));
    // A Surpresinha também obedece à nova regra e não puxa números pendentes ou pagos
    const ocupados = new Set([...pagos, ...pendentes, ...numerosSelecionados]);
    const livres = todosOsNumeros.filter(n => !ocupados.has(n));

    if (livres.length < quantidade) {
      alert(`Desculpe, só temos ${livres.length} números disponíveis no momento.`);
      return;
    }

    const misturados = livres.sort(() => 0.5 - Math.random());
    setNumerosSelecionados(prev => [...prev, ...misturados.slice(0, quantidade)]);
  };

  const mostrarBarraRodape = telaAtiva === 'comprar' && modoCompra === 'grelha' && numerosSelecionados.length > 0;

  return (
    <div className={temaEscuro ? 'dark' : ''}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white transition-colors duration-300">

        {/* CABEÇALHO SUPERIOR */}
        <nav className="sticky top-0 z-50 bg-white/90 dark:bg-zinc-900/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex justify-between items-center shadow-sm dark:shadow-lg transition-colors">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setTelaAtiva('comprar'); setModoCompra('grelha'); }}>
            <span className="text-xl font-black text-orange-500">🎟️ Rifa Pratique</span>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={() => setTemaEscuro(!temaEscuro)}
              className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors"
              title="Alternar Tema"
            >
              {temaEscuro ? <Sun size={24} weight="bold" /> : <Moon size={24} weight="bold" />}
            </button>
            <button 
              onClick={() => setTelaAtiva('admin')}
              className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-colors"
              title="Painel Admin"
            >
              <LockKey size={24} weight="bold" />
            </button>
          </div>
        </nav>

        <main className={`max-w-4xl mx-auto px-4 py-6 ${mostrarBarraRodape ? "pb-32" : ""}`}>
          
          {/* ROTEAMENTO: TELA ADMIN */}
          {telaAtiva === 'admin' && <TelaAdmin />}

          {/* ROTEAMENTO: TELA COMPRAR (GRELHA DE NÚMEROS) */}
          {telaAtiva === 'comprar' && modoCompra === 'grelha' && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white mb-2 transition-colors">
                  🏆 Sorteio Oficial
                </h1>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">Escolha seus números ou aproveite nossas promoções</p>
              </div>

              {/* PACOTES PROMOCIONAIS */}
              <div className="mb-8">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { qtd: 1,  titulo: 'Avulso', desc: '1 Número', preco: 'R$ 10,00', color: 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white' },
                    { qtd: 6,  titulo: 'Pague 5, Leve 6', desc: '6 Números', preco: 'R$ 50,00', color: 'bg-orange-50 dark:bg-zinc-900 border-orange-200 dark:border-zinc-800 text-zinc-900 dark:text-white' },
                    { qtd: 13, titulo: 'Pague 10, Leve 13', desc: '13 Números', preco: 'R$ 100,00', color: 'bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-500/50 text-orange-900 dark:text-orange-100' },
                    { qtd: 26, titulo: 'Pague 20, Leve 26', desc: '26 Números', preco: 'R$ 200,00', color: 'bg-orange-500 dark:bg-orange-600 border-orange-600 dark:border-orange-400 text-white shadow-lg shadow-orange-500/30' },
                  ].map(({ qtd, titulo, desc, preco, color }) => (
                    <button
                      key={qtd}
                      onClick={() => gerarSurpresinha(qtd)}
                      className={`rounded-xl p-4 text-center transition-all hover:scale-[1.02] border shadow-sm ${color}`}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wider mb-1 opacity-80">{titulo}</p>
                      <p className="text-xl font-black mb-1">{desc}</p>
                      <p className="font-bold text-sm opacity-90">{preco}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* LEGENDA DE CORES */}
              <div className="flex flex-wrap justify-center gap-4 mb-6 text-xs font-semibold text-zinc-600 dark:text-zinc-300 transition-colors">
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 inline-block" /> Disponível</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-orange-500 dark:bg-orange-600 inline-block" /> Selecionado</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-yellow-400 dark:bg-yellow-500 inline-block" /> Reservado</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-500 dark:bg-green-600 inline-block" /> Pago</span>
              </div>

              {/* GRELHA RENDERIZADA AQUI */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm dark:shadow-lg transition-colors">
                <GradeNumeros 
                  selecionados={numerosSelecionados} 
                  onAlternarNumero={alternarNumero} 
                  pagos={pagos} 
                  pendentes={pendentes} 
                />
              </div>
            </div>
          )}

          {/* ROTEAMENTO: TELA DE CHECKOUT */}
          {telaAtiva === 'comprar' && modoCompra === 'pagamento' && (
            <TelaPagamento 
              numeros={numerosSelecionados} 
              valorCobrado={valorCobrado} 
              onVoltar={voltarParaGrelha} 
              onSucesso={finalizarCompra} 
            />
          )}
        </main>

        {/* BARRA FIXA NO RODAPÉ (CARRINHO FLUTUANTE) */}
        {mostrarBarraRodape && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-zinc-900/98 backdrop-blur border-t border-zinc-200 dark:border-zinc-700 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-2xl px-4 py-3 transition-colors">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-tight mb-1">
                  <span className="text-orange-500 dark:text-orange-400 font-black text-base">{numerosSelecionados.length}</span> selecionado(s)
                </p>
                <p className="text-green-600 dark:text-green-400 font-black text-2xl leading-tight">
                  R$ {valorCobrado.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button 
                  onClick={() => setNumerosSelecionados([])} 
                  className="text-xs font-bold text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors px-2 py-1"
                >
                  Limpar
                </button>
                <button 
                  onClick={irParaPagamento} 
                  className="bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black px-6 py-3.5 rounded-xl transition-all text-sm shadow-lg shadow-orange-900/30 whitespace-nowrap"
                >
                  Garantir agora &rarr;
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
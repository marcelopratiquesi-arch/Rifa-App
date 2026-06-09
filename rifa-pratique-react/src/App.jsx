import { useState, useEffect, useCallback, useMemo } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { Sun, Moon, LockKey, CalendarBlank, MapPin, Users, Ticket, Clock, CheckCircle, Trophy, Lightning, Fire } from '@phosphor-icons/react';
import { auth, db } from './services/firebase';
import GradeNumeros from './components/GradeNumeros';
import TelaPagamento from './components/TelaPagamento';
import TelaAdmin from './components/TelaAdmin';

// ─── CONFIGURAÇÕES GLOBAIS ────────────────────────────────
const PRECO_UNITARIO = 10;
const TOTAL_NUMEROS = 1000;
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

// ─── FUNÇÃO PARA MASCARAR O NOME (LGPD) ───────────────────
const mascararNome = (nome) => {
  if (!nome) return 'Alguém';
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[1].charAt(0)}.`;
};

export default function App() {
  const [telaAtiva, setTelaAtiva] = useState('comprar'); 
  const [modoCompra, setModoCompra] = useState('grelha');  
  const [temaEscuro, setTemaEscuro] = useState(true);
  const [numerosSelecionados, setNumerosSelecionados] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [usuarioId, setUsuarioId] = useState(null);
  const [tempoRestante, setTempoRestante] = useState({ dias: 0, horas: 0, minutos: 0, segundos: 0 });
  const [rifaStatus, setRifaStatus] = useState('aberta'); 
  const [numerosOcupados, setNumerosOcupados] = useState({ pagos: [], pendentes: [] });
  
  const [notificacaoAtiva, setNotificacaoAtiva] = useState(null);

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

  // ─── FONTE DA VERDADE SECUNDÁRIA: numerosReservados ──────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'numerosReservados'), (snapshot) => {
      const pagosSet = new Set();
      const pendentesSet = new Set();
      const agora = Date.now();
      const EXPIRACAO_MS = 24 * 60 * 60 * 1000; 
      
      snapshot.docs.forEach(d => {
        const data = d.data();
        const numeroLimpo = parseInt(d.id, 10);
        if (isNaN(numeroLimpo)) return; 
        
        const numeroFormatado = String(numeroLimpo).padStart(3, '0');
        
        if (data.status === 'pago') {
          pagosSet.add(numeroFormatado);
        } else if (data.status === 'reservado' || data.status === 'pendente') {
          if (agora - (data.ts || 0) < EXPIRACAO_MS) {
            pendentesSet.add(numeroFormatado);
          }
        }
      });
      
      const pagosArr = Array.from(pagosSet);
      const pendentesArr = Array.from(pendentesSet).filter(n => !pagosSet.has(n));
      
      setNumerosOcupados({ pagos: pagosArr, pendentes: pendentesArr });
    });
    return () => unsub();
  }, []);

  // ─── ESCUTA STATUS GLOBAL DA RIFA ────────────────────────
  useEffect(() => {
    const docRef = doc(db, 'configuracoes', 'sistema');
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().rifaStatus) {
        setRifaStatus(docSnap.data().rifaStatus);
      }
    });
    return () => unsub();
  }, []);

  // ─── CRONÔMETRO DE CONTAGEM REGRESSIVA ───────────────────
  useEffect(() => {
    const dataSorteio = new Date('2026-07-22T20:00:00-03:00').getTime();

    const atualizarCronometro = () => {
      const agora = new Date().getTime();
      const diferenca = dataSorteio - agora;

      if (diferenca > 0) {
        setTempoRestante({
          dias: Math.floor(diferenca / (1000 * 60 * 60 * 24)),
          horas: Math.floor((diferenca % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutos: Math.floor((diferenca % (1000 * 60 * 60)) / (1000 * 60)),
          segundos: Math.floor((diferenca % (1000 * 60)) / 1000)
        });
      } else {
        setTempoRestante({ dias: 0, horas: 0, minutos: 0, segundos: 0 });
      }
    };

    atualizarCronometro(); 
    const intervalo = setInterval(atualizarCronometro, 1000);
    return () => clearInterval(intervalo);
  }, []);

  // 🚀 BLINDAGEM MÁXIMA DE DADOS (Cruzamento de Recibos)
  const { pagos, pendentes } = useMemo(() => {
    const pSet = new Set(numerosOcupados.pagos);
    const rSet = new Set(numerosOcupados.pendentes);

    // Varre todos os RECIBOS na coleção de pedidos.
    // Se o pedido consta como PAGO lá, ele trava o número IMEDIATAMENTE,
    // garantindo que falhas na trava de 24h nunca causem dupla venda.
    pedidos.forEach(p => {
      if (p.status === 'pago') {
        (p.nums || []).forEach(n => {
          const numFmt = String(n).padStart(3, '0');
          pSet.add(numFmt);
          rSet.delete(numFmt); // Se por acaso estava na fila de reserva, expulsa
        });
      }
    });

    return {
      pagos: Array.from(pSet),
      pendentes: Array.from(rSet)
    };
  }, [numerosOcupados, pedidos]);

  const qtdPagos       = pagos.length;
  const qtdReservados  = pendentes.length;
  const qtdDisponiveis = TOTAL_NUMEROS - qtdPagos - qtdReservados;

  const pctVendida = ((qtdPagos + qtdReservados) / TOTAL_NUMEROS) * 100;

  const ultimosCompradores = pedidos
    .filter((p) => p.status === 'pago' && p.nums && p.nums.length > 0)
    .sort((a, b) => (b.tsPago || b.ts) - (a.tsPago || a.ts))
    .slice(0, 10); 

  useEffect(() => {
    if (ultimosCompradores.length === 0 || telaAtiva !== 'comprar' || modoCompra !== 'grelha') return;
    
    const interval = setInterval(() => {
      const randomBuyer = ultimosCompradores[Math.floor(Math.random() * ultimosCompradores.length)];
      setNotificacaoAtiva(randomBuyer);
      
      setTimeout(() => setNotificacaoAtiva(null), 4000);
    }, 12000);

    return () => clearInterval(interval);
  }, [ultimosCompradores, telaAtiva, modoCompra]);

  const alternarNumero = useCallback((num) => {
    if (rifaStatus !== 'aberta') return; 
    setNumerosSelecionados((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );
  }, [rifaStatus]);

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
    if (rifaStatus !== 'aberta') return;
    const todosOsNumeros = Array.from({ length: TOTAL_NUMEROS }, (_, i) => String(i + 1).padStart(3, '0'));
    
    // O surpresinha agora também usa a blindagem máxima para excluir os números pagos
    const ocupados = new Set([...pagos, ...pendentes, ...numerosSelecionados]);
    const livres = todosOsNumeros.filter(n => !ocupados.has(n));

    if (livres.length < quantidade) {
      alert(`Desculpe, só temos ${livres.length} números disponíveis no momento.`);
      return;
    }
    const misturados = livres.sort(() => 0.5 - Math.random());
    setNumerosSelecionados(prev => [...prev, ...misturados.slice(0, quantidade)]);
  };

  const mostrarBarraRodape = telaAtiva === 'comprar' && modoCompra === 'grelha' && numerosSelecionados.length > 0 && rifaStatus === 'aberta';

  return (
    <div className={`${temaEscuro ? 'dark' : ''} antialiased selection:bg-orange-500/30 overflow-hidden`}>
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 transition-colors duration-500 font-sans pb-32 relative">

        {notificacaoAtiva && (
          <div className="fixed bottom-32 left-4 sm:bottom-6 sm:left-6 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl p-4 rounded-2xl flex items-center gap-4 animate-slide-up max-w-[300px]">
            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full flex-shrink-0">
              <Fire size={24} weight="fill" className="text-green-600 dark:text-green-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 leading-tight">
                <strong className="text-zinc-900 dark:text-white uppercase">{mascararNome(notificacaoAtiva.nome)}</strong> acabou de garantir
              </p>
              {/* 🚀 TROCADO COTA POR RIFA AQUI */}
              <p className="text-base font-black text-orange-500 tracking-tight mt-0.5">
                {notificacaoAtiva.nums.length} Rifa{notificacaoAtiva.nums.length > 1 ? 's' : ''}!
              </p>
            </div>
          </div>
        )}

        <nav className="sticky top-0 z-50 bg-white/80 dark:bg-[#09090B]/80 backdrop-blur-lg border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 py-3 flex justify-between items-center transition-colors">
          <div className="max-w-5xl mx-auto w-full flex justify-between items-center">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setTelaAtiva('comprar'); setModoCompra('grelha'); }}>
              <span className="text-xl font-black bg-gradient-to-r from-orange-500 to-orange-400 bg-clip-text text-transparent tracking-tight">
                🎟️ Rifa Pratique
              </span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setTemaEscuro(!temaEscuro)}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-all"
              >
                {temaEscuro ? <Sun size={22} weight="bold" /> : <Moon size={22} weight="bold" />}
              </button>
              <button 
                onClick={() => setTelaAtiva('admin')}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 transition-all"
              >
                <LockKey size={22} weight="bold" />
              </button>
            </div>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-4 py-8">
          
          {telaAtiva === 'admin' && <TelaAdmin />}

          {telaAtiva === 'comprar' && modoCompra === 'grelha' && (
            <div className="animate-fade-in space-y-12">
              
              <div className="relative bg-zinc-900 dark:bg-zinc-900/80 rounded-[2rem] p-6 sm:p-10 overflow-hidden shadow-2xl border border-zinc-800">
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-500/20 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center justify-between">
                  <div className="text-center md:text-left flex-1">
                    <span className="inline-block py-1 px-3 rounded-full bg-orange-500/10 text-orange-400 text-xs font-bold uppercase tracking-wider mb-4 border border-orange-500/20">
                      Sorteio Oficial 🏆
                    </span>
                    <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 leading-tight tracking-tight">
                      Garanta sua chance <br className="hidden sm:block"/> de ganhar!
                    </h1>
                    <div className="flex flex-col gap-2 text-zinc-400 text-sm">
                      <div className="flex items-center justify-center md:justify-start gap-2">
                        <CalendarBlank size={18} className="text-orange-500" />
                        <strong className="text-zinc-200">22 de Julho (22/07) às 20h</strong>
                      </div>
                      <div className="flex items-start justify-center md:justify-start gap-2">
                        <MapPin size={18} className="text-orange-500 shrink-0 mt-0.5" />
                        <span>Pratique Fitness Santa Inês II <br/> <span className="text-xs opacity-70">Av. José Cândido da Silveira, 2790</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-auto flex flex-col gap-4">
                    <div className="bg-black/40 backdrop-blur-md border border-white/10 p-5 rounded-2xl shrink-0">
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <Clock size={16} className="text-orange-500" />
                        <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">O tempo está acabando</span>
                      </div>
                      <div className="flex justify-center gap-3 sm:gap-4 text-center">
                        {[
                          { valor: tempoRestante.dias, label: 'Dias' },
                          { valor: tempoRestante.horas, label: 'Horas' },
                          { valor: tempoRestante.minutos, label: 'Min' },
                          { valor: tempoRestante.segundos, label: 'Seg' }
                        ].map((item, idx) => (
                          <div key={idx} className="flex flex-col items-center">
                            <div className="bg-white/5 border border-white/10 w-12 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center shadow-inner">
                              <span className="text-2xl sm:text-3xl font-black text-white font-mono">{String(item.valor).padStart(2, '0')}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-2">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-black/40 backdrop-blur-md border border-white/10 p-4 rounded-2xl">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-xs font-bold text-orange-400 uppercase flex items-center gap-1">
                          <Lightning weight="fill" /> Ação entre amigos
                        </span>
                        <span className="text-xs font-black text-white">{pctVendida.toFixed(1)}% Esgotada</span>
                      </div>
                      <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-orange-600 via-orange-400 to-yellow-400 transition-all duration-1000" 
                          style={{ width: `${pctVendida}%` }} 
                        />
                      </div>
                      {/* 🚀 TROCADO COTA POR RIFA AQUI */}
                      <p className="text-[10px] text-zinc-400 mt-2 text-center uppercase tracking-widest">
                        Apenas <strong>{qtdDisponiveis} rifas</strong> restantes!
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {rifaStatus !== 'aberta' ? (
                <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-10 shadow-xl text-center animate-fade-in mt-8">
                  {rifaStatus === 'encerrada' ? (
                    <>
                      <LockKey size={72} weight="fill" className="text-yellow-500 mx-auto mb-6 animate-pulse" />
                      <h2 className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-white mb-4">Vendas Encerradas!</h2>
                      <p className="text-zinc-500 dark:text-zinc-400 text-lg max-w-xl mx-auto">
                        Estamos auditando os últimos pagamentos e preparando a roleta oficial. O sorteio vai começar a qualquer momento!
                      </p>
                    </>
                  ) : (
                    <>
                      <Trophy size={72} weight="fill" className="text-purple-500 mx-auto mb-6" />
                      <h2 className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-white mb-4">Sorteio Realizado!</h2>
                      <p className="text-zinc-500 dark:text-zinc-400 text-lg max-w-xl mx-auto">
                        Esta edição da Rifa Pratique foi finalizada com sucesso. Obrigado a todos que participaram! Fique de olho na recepção e em nossas redes sociais para conhecer os grandes ganhadores.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">Escolha seus números</h2>
                      <div className="h-px flex-1 bg-gradient-to-r from-zinc-200 to-transparent dark:from-zinc-800" />
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {[
                        { qtd: 1,  titulo: 'Para começar', desc: '1 Número', preco: 'R$ 10,00', precoOriginal: null, destaque: false, badge: null },
                        { qtd: 3,  titulo: 'Básico', desc: '3 Números', preco: 'R$ 30,00', precoOriginal: null, destaque: false, badge: null },
                        { qtd: 6,  titulo: '6x Mais Chances', desc: '6 Números', preco: 'R$ 50,00', precoOriginal: 'R$ 60,00', destaque: false, badge: 'Popular' },
                        { qtd: 7,  titulo: 'Sorte Simples', desc: '7 Números', preco: 'R$ 70,00', precoOriginal: null, destaque: false, badge: null },
                        { qtd: 13, titulo: '13x Mais Chances', desc: '13 Números', preco: 'R$ 100,00', precoOriginal: 'R$ 130,00', destaque: false, badge: 'Recomendado' },
                        { qtd: 26, titulo: 'Chances Máximas', desc: '26 Números', preco: 'R$ 200,00', precoOriginal: 'R$ 260,00', destaque: true, badge: '🔥 Mais Vendido' },
                      ].map(({ qtd, titulo, desc, preco, precoOriginal, destaque, badge }) => (
                        <button
                          key={qtd}
                          onClick={() => gerarSurpresinha(qtd)}
                          className={`relative flex flex-col items-center justify-center p-5 rounded-3xl transition-all duration-300 hover:-translate-y-1 ${
                            destaque 
                              ? 'bg-gradient-to-b from-orange-500 to-orange-600 shadow-[0_8px_30px_rgb(249,115,22,0.3)] border-0 text-white transform scale-[1.02]' 
                              : 'bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-orange-500/50 hover:shadow-md text-zinc-900 dark:text-white'
                          }`}
                        >
                          {badge && (
                            <div className={`absolute -top-3.5 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg border whitespace-nowrap ${
                              destaque ? 'bg-zinc-900 text-white border-zinc-700' : 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'
                            }`}>
                              {badge}
                            </div>
                          )}

                          <span className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${destaque ? 'text-orange-100' : 'text-zinc-500'}`}>
                            {titulo}
                          </span>
                          
                          <strong className="text-2xl sm:text-3xl font-black mb-1">{desc}</strong>
                          
                          <div className="flex flex-col items-center mb-3">
                            {precoOriginal && (
                              <span className={`text-xs line-through font-semibold ${destaque ? 'text-orange-200' : 'text-zinc-400'}`}>
                                De {precoOriginal}
                              </span>
                            )}
                            <span className={`text-lg font-black ${destaque ? 'text-white' : 'text-green-600 dark:text-green-500'}`}>
                              {precoOriginal ? 'Por ' : ''}{preco}
                            </span>
                          </div>

                          {precoOriginal && (
                            <div className={`text-[11px] font-black px-3 py-1.5 rounded-lg w-full uppercase tracking-wider border border-dashed ${
                              destaque ? 'bg-black/20 text-white border-white/30' : 'bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-500 border-green-300 dark:border-green-800'
                            }`}>
                              Você economiza R$ {Number(precoOriginal.replace(/\D/g, '')) / 100 - Number(preco.replace(/\D/g, '')) / 100}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                    <div className="flex flex-col gap-4 h-full">
                      <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 flex flex-col items-center justify-center flex-1 shadow-sm">
                        <p className="text-5xl font-black text-zinc-900 dark:text-white leading-none">{qtdDisponiveis}</p>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-2">Disponíveis</p>
                      </div>
                      
                      <div className="flex gap-4">
                        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-3xl p-5 flex flex-col items-center justify-center flex-1 shadow-sm">
                          <p className="text-3xl font-black text-yellow-600 dark:text-yellow-500 leading-none">{qtdReservados}</p>
                          <p className="text-[10px] font-bold text-yellow-700 dark:text-yellow-600 uppercase tracking-widest mt-2">Reservados</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 rounded-3xl p-5 flex flex-col items-center justify-center flex-1 shadow-sm">
                          <p className="text-3xl font-black text-green-600 dark:text-green-500 leading-none">{qtdPagos}</p>
                          <p className="text-[10px] font-bold text-green-700 dark:text-green-600 uppercase tracking-widest mt-2">Pagos</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm h-full flex flex-col">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Últimas Participações</h3>
                      </div>
                      {ultimosCompradores.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-sm text-zinc-400 italic">Seja o primeiro a garantir seus números!</p>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-between gap-2">
                          {ultimosCompradores.slice(0, 5).map((p) => (
                            <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors">
                              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full shrink-0">
                                <CheckCircle weight="fill" className="text-green-600 dark:text-green-500 text-lg" />
                              </div>
                              <div className="flex-1 min-w-0">
                                {/* 🚀 TROCADO COTA POR RIFA AQUI */}
                                <p className="text-sm text-zinc-900 dark:text-white truncate">
                                  <strong className="font-black uppercase">{mascararNome(p.nome)}</strong> garantiu <strong className="text-orange-500">{p.nums.length} rifa{p.nums.length > 1 ? 's' : ''}</strong>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-center gap-6 mb-8 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700" /> Disponível
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]" /> Selecionado
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-400" /> Reservado
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500" /> Pago
                      </div>
                    </div>

                    <GradeNumeros 
                      selecionados={numerosSelecionados} 
                      onAlternarNumero={alternarNumero} 
                      pagos={pagos} 
                      pendentes={pendentes} 
                    />
                  </div>
                </>
              )}

            </div>
          )}

          {telaAtiva === 'comprar' && modoCompra === 'pagamento' && (
            <TelaPagamento 
              numeros={numerosSelecionados} 
              valorCobrado={valorCobrado} 
              onVoltar={voltarParaGrelha} 
              onSucesso={finalizarCompra} 
            />
          )}
        </main>

        {/* 🚀 BARRA FLUTUANTE DE COMPRA AGORA GIGANTE E COM A PALAVRA "RIFA" */}
        {mostrarBarraRodape && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] dark:shadow-2xl px-4 py-4 sm:py-5 transition-colors animate-slide-up">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 font-black uppercase tracking-widest mb-0.5">
                  <span className="text-orange-600 dark:text-orange-500 text-2xl sm:text-3xl mr-1">{numerosSelecionados.length}</span> Rifa{numerosSelecionados.length > 1 ? 's' : ''}
                </p>
                <p className="text-green-600 dark:text-green-400 font-black text-3xl sm:text-4xl leading-none drop-shadow-sm">
                  R$ {valorCobrado.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:gap-6">
                <button 
                  onClick={() => setNumerosSelecionados([])} 
                  className="text-xs sm:text-sm font-bold text-zinc-400 hover:text-red-500 transition-colors px-2 py-2"
                >
                  Limpar
                </button>
                <button 
                  onClick={irParaPagamento} 
                  className="bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black px-6 sm:px-10 py-4 sm:py-5 rounded-2xl transition-all shadow-lg shadow-orange-600/30 flex items-center gap-2 text-base sm:text-lg"
                >
                  <Ticket size={24} weight="fill" className="hidden sm:block" />
                  Garantir agora
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
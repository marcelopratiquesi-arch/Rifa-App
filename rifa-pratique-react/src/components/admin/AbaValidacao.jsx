import { useState } from 'react';
import {
  MagnifyingGlass, FunnelSimple, Storefront, CalendarBlank,
  WhatsappLogo, CheckCircle, XCircle, Clock, Receipt
} from '@phosphor-icons/react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

const EXPIRACAO_MS = 24 * 60 * 60 * 1000;

const fmtValor = (v) => Number(v).toFixed(2).replace('.', ',');
const fmtData  = (ts) => new Date(ts).toLocaleString('pt-BR');

function tempoRestantePedido(ts) {
  const diff = EXPIRACAO_MS - (Date.now() - ts);
  if (diff <= 0) return 'Expirando...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function AbaValidacao({ pedidos, vendedores }) {
  // ─── ESTADOS DOS FILTROS ──────────────────────────────────────
  const [filtro,          setFiltro]          = useState('pendente');
  const [filtroTempo,     setFiltroTempo]     = useState('todos'); 
  const [busca,           setBusca]           = useState('');
  const [filtroVendedor,  setFiltroVendedor]  = useState('');
  const [filtroUnidade,   setFiltroUnidade]   = useState('');

  // ─── AÇÕES DE BANCO DE DADOS (FIREBASE) ───────────────────────
  const aprovarPedido = async (id) => {
    if (!window.confirm('Confirmar o PIX e aprovar a venda?')) return;
    try {
      await updateDoc(doc(db, 'pedidos', id), { status: 'pago', tsPago: Date.now() });
    } catch (e) {
      alert("Erro ao aprovar pedido.");
    }
  };

  const expirarPedido = async (id) => {
    if (!window.confirm('Tem certeza que deseja expirar e liberar os números?')) return;
    try {
      await updateDoc(doc(db, 'pedidos', id), { status: 'expirado' });
    } catch (e) {
      alert("Erro ao expirar pedido.");
    }
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

  // ─── CÁLCULOS DO CABEÇALHO ────────────────────────────────────
  const pedidosAprovados = pedidos.filter((p) => p.status === 'pago');
  const pedidosPendentes = pedidos.filter((p) => p.status === 'pendente');
  
  const totalFaturado = pedidosAprovados.reduce((s, p) => s + Number(p.valor), 0);
  const totalPendente = pedidosPendentes.reduce((s, p) => s + Number(p.valor), 0);

  // ─── LÓGICA DE FILTRAGEM AVANÇADA ─────────────────────────────
  const mapaVendedores = Object.fromEntries(vendedores.map((v) => [v.nome, v.unidade || 'Desconhecida']));
  
  const hojeTs = new Date().setHours(0, 0, 0, 0);
  const ontemTs = hojeTs - 86400000;

  const pedidosFiltrados = pedidos.filter((p) => {
    const q = busca.toLowerCase();
    
    // Status
    const matchStatus = p.status === filtro;
    
    // Busca Textual
    const matchBusca = !q || p.nome.toLowerCase().includes(q) || p.tel.includes(q) || p.cpf?.includes(q) || p.id?.includes(q);
    
    // Vendedor
    const matchVendedor = !filtroVendedor || (filtroVendedor === 'DIRETO' ? !p.vendedor : p.vendedor === filtroVendedor);
    
    // Unidade
    const unidadeDoPedido = p.vendedor ? (mapaVendedores[p.vendedor] || 'Desconhecida') : 'Venda Direta';
    const matchUnidade = !filtroUnidade || (filtroUnidade === 'DIRETO' ? !p.vendedor : unidadeDoPedido === filtroUnidade);
    
    // Tempo
    let matchTempo = true;
    if (filtroTempo === 'hoje') {
      matchTempo = p.ts >= hojeTs;
    } else if (filtroTempo === 'ontem') {
      matchTempo = p.ts >= ontemTs && p.ts < hojeTs;
    }

    return matchStatus && matchBusca && matchVendedor && matchUnidade && matchTempo;
  });

  // Lista de Vendedores para o Select (excluindo os inativos para novos filtros, mas mantendo histórico visualizável)
  const vendedoresAtivos = vendedores.filter(v => v.ativo !== false);

  return (
    <div className="animate-fade-in">
      
      {/* ─── PAINEL DE MÉTRICAS RÁPIDAS ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Aprovados',   val: pedidosAprovados.length,     cor: 'text-green-500' },
          { label: 'Pendentes',   val: pedidosPendentes.length,     cor: 'text-yellow-500' },
          { label: 'Em caixa',    val: `R$ ${fmtValor(totalFaturado)}`, cor: 'text-orange-400' },
          { label: 'Aguard. PIX', val: `R$ ${fmtValor(totalPendente)}`, cor: 'text-blue-400' },
        ].map(({ label, val, cor }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center shadow-sm">
            <p className={`text-xl font-black ${cor}`}>{val}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ─── PAINEL DE FILTROS E BUSCA ─── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm mb-6 flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row justify-between gap-4">
          
          {/* Status do Pedido */}
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block tracking-wider">Status do Pedido</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'pendente', label: 'Pendentes' },
                { key: 'pago',     label: 'Aprovados' },
                { key: 'expirado', label: 'Expirados' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFiltro(key)}
                  className={`px-4 py-2 font-semibold rounded-lg text-xs border whitespace-nowrap transition-all ${
                    filtro === key ? 'bg-orange-600 border-orange-500 text-white shadow-md' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro de Tempo */}
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block tracking-wider">Data da Compra</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'todos', label: 'Todas' },
                { key: 'hoje',  label: 'Hoje' },
                { key: 'ontem', label: 'Ontem' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFiltroTempo(key)}
                  className={`px-4 py-2 font-semibold rounded-lg text-xs border whitespace-nowrap transition-all ${
                    filtroTempo === key ? 'bg-zinc-800 dark:bg-zinc-100 border-zinc-900 dark:border-white text-white dark:text-zinc-900 shadow-md' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <hr className="border-zinc-200 dark:border-zinc-800" />

        {/* Inputs de Busca e Selects */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" placeholder="Buscar por Nome, Telefone, CPF ou ID..."
              value={busca} onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>

          {vendedores.length > 0 && (
            <div className="relative min-w-[180px]">
              <FunnelSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <select
                value={filtroVendedor}
                onChange={(e) => setFiltroVendedor(e.target.value)}
                className="pl-9 pr-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none appearance-none w-full cursor-pointer"
              >
                <option value="">Equipe (Todos)</option>
                <option value="DIRETO">— Venda Direta</option>
                {vendedoresAtivos.map((v) => (
                  <option key={v.id} value={v.nome}>{v.nome}</option>
                ))}
              </select>
            </div>
          )}

          <div className="relative min-w-[180px]">
            <Storefront size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <select
              value={filtroUnidade}
              onChange={(e) => setFiltroUnidade(e.target.value)}
              className="pl-9 pr-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none appearance-none w-full cursor-pointer"
            >
              <option value="">Unidades (Todas)</option>
              <option value="Santa Inês 1">Santa Inês 1</option>
              <option value="Santa Inês 2">Santa Inês 2</option>
              <option value="DIRETO">— Venda Direta</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── GRID DE CARDS ─── */}
      {pedidosFiltrados.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <Receipt size={48} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">Nenhum pedido encontrado nessa filtragem.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pedidosFiltrados.map((p) => (
            <div key={p.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden hover:border-orange-500/50 hover:shadow-md transition-all flex flex-col">
              <div className={`h-1 w-full shrink-0 ${p.status === 'pago' ? 'bg-green-500' : p.status === 'pendente' ? 'bg-yellow-500' : 'bg-zinc-400'}`} />

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900 dark:text-white text-base truncate leading-tight" title={p.nome}>{p.nome}</p>
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                      <CalendarBlank size={14} /> {fmtData(p.ts).split(' ')[0]} às {fmtData(p.ts).split(' ')[1]}
                    </p>
                  </div>
                  <span className="text-orange-600 dark:text-orange-400 font-black text-base whitespace-nowrap bg-orange-50 dark:bg-orange-900/20 px-3 py-1 rounded border border-orange-100 dark:border-orange-800/30">
                    R$ {fmtValor(p.valor)}
                  </span>
                </div>

                <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-4 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/50 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium flex items-center gap-1.5"><WhatsappLogo size={14} /> {p.tel}</span>
                    <span className="font-mono text-[11px] text-zinc-400 bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">#{p.id.slice(-6)}</span>
                  </div>
                  {p.cpf && (
                    <div className="font-medium flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                      <Receipt size={14} /> {p.cpf}
                    </div>
                  )}
                  {p.vendedor && (
                    <p className="text-orange-600 dark:text-orange-500 font-semibold mt-1 flex items-center gap-1.5">
                      <Storefront size={14} /> Vend: {p.vendedor}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4 max-h-[60px] overflow-y-auto scrollbar-thin">
                  {(p.nums || []).map((n) => (
                    <span key={n} className={`text-xs font-mono font-bold px-2 py-1 rounded border ${
                      p.status === 'pago' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/30' :
                      p.status === 'pendente' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 border-yellow-200 dark:border-yellow-800/30' :
                      'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                    }`}>{n}</span>
                  ))}
                </div>

                {p.status === 'pendente' && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-500 font-bold mb-4 flex items-center gap-1.5">
                    <Clock size={14} weight="bold" /> {tempoRestantePedido(p.ts)}
                  </p>
                )}

                <div className="mt-auto" />

                {p.status === 'pendente' && (
                  <div className="grid grid-cols-12 gap-2 mt-2">
                    <button onClick={() => cobrarWhatsApp(p)} className="col-span-5 flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe57] text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-sm">
                      <WhatsappLogo size={16} weight="fill" /> Cobrar
                    </button>
                    <button onClick={() => aprovarPedido(p.id)} className="col-span-5 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-sm">
                      <CheckCircle size={16} weight="fill" /> Aprovar
                    </button>
                    <button onClick={() => expirarPedido(p.id)} className="col-span-2 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 text-xs font-bold py-2 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700" title="Expirar Pedido">
                      <XCircle size={18} weight="fill" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
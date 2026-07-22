import { useState } from 'react';
import {
  MagnifyingGlass, FunnelSimple, Storefront, CalendarBlank,
  WhatsappLogo, CheckCircle, XCircle, Clock, Receipt,
  PencilSimple, CheckSquare, Square, WarningCircle, Trash
} from '@phosphor-icons/react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import toast from 'react-hot-toast';

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
  const [filtro,         setFiltro]         = useState('pendente');
  const [filtroTempo,    setFiltroTempo]    = useState('todos');
  const [busca,          setBusca]          = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroUnidade,  setFiltroUnidade]  = useState('');

  // ─── ESTADOS DE AÇÃO EM MASSA E EDIÇÃO ───────────────────────
  const [selecionados,       setSelecionados]       = useState(new Set());
  const [editandoVendedorId, setEditandoVendedorId] = useState(null);
  const [novoVendedorLocal,  setNovoVendedorLocal]  = useState('');
  const [editandoNumerosId,  setEditandoNumerosId]  = useState(null);
  const [numerosInput,       setNumerosInput]       = useState('');

  // Novo estado para edição de cliente
  const [editandoClienteId,  setEditandoClienteId]  = useState(null);
  const [clienteForm,        setClienteForm]        = useState({ nome: '', tel: '', cpf: '' });

  const vendedoresAtivos = vendedores.filter(v => v.ativo !== false);

  // ─── AÇÕES DO FIREBASE ────────────────────────────────────────

  // Editar vendedor de um pedido
  const salvarNovoVendedor = async (id) => {
    try {
      await updateDoc(doc(db, 'pedidos', id), { vendedor: novoVendedorLocal });
      setEditandoVendedorId(null);
      toast.success('Vendedor atualizado!');
    } catch (e) {
      toast.error('Erro ao atualizar vendedor.');
    }
  };

  // ✅ Iniciar edição de Nome, Telefone e CPF
  const iniciarEdicaoCliente = (p) => {
    setEditandoClienteId(p.id);
    setClienteForm({ nome: p.nome || '', tel: p.tel || '', cpf: p.cpf || '' });
  };

  // ✅ Salvar edição do Cliente
  const salvarEdicaoCliente = async (id) => {
    if (!clienteForm.nome || !clienteForm.tel) {
      toast.error('Nome e telefone são obrigatórios.');
      return;
    }
    try {
      await updateDoc(doc(db, 'pedidos', id), {
        nome: clienteForm.nome,
        tel: clienteForm.tel,
        cpf: clienteForm.cpf
      });
      setEditandoClienteId(null);
      toast.success('Dados do cliente atualizados com sucesso!');
    } catch (e) {
      toast.error('Erro ao atualizar dados do cliente.');
    }
  };

  // ✅ Excluir pedido definitivamente (limpa pedido e libera números)
  const deletarPedido = async (id) => {
    if (!window.confirm('🚨 TEM CERTEZA? Isso vai excluir totalmente o pedido e liberar os números!')) return;
    try {
      const pedido = pedidos.find(p => p.id === id);
      const batch  = writeBatch(db);

      // Deleta o documento do pedido
      batch.delete(doc(db, 'pedidos', id));

      // Libera as reservas vinculadas a este pedido
      if (pedido && pedido.nums) {
        pedido.nums.forEach(num => {
          batch.delete(doc(db, 'numerosReservados', String(num).padStart(3, '0')));
        });
      }

      await batch.commit();
      toast.success('Pedido excluído e números liberados!');
    } catch (e) {
      toast.error('Erro ao excluir pedido.');
    }
  };

  // ✅ Corrigir números duplicados com Proteção Cruzada e formato 3 dígitos
  const salvarNovosNumeros = async (id) => {
    const pedido = pedidos.find(p => p.id === id);

    const novosNums = numerosInput
      .split(',')
      .map(n => parseInt(n.trim(), 10))
      .filter(n => !isNaN(n));

    if (novosNums.length === 0) {
      toast.error('Insira pelo menos um número válido.');
      return;
    }

    try {
      const batch = writeBatch(db);
      const agora = Date.now();

      if (pedido && pedido.nums) {
        pedido.nums.forEach(numAntigo => {
          const outroPedidoUsando = pedidos.find(p =>
            p.id !== id &&
            p.status !== 'expirado' &&
            (p.nums || []).includes(numAntigo)
          );

          const numStr = String(numAntigo).padStart(3, '0');

          if (outroPedidoUsando) {
            batch.set(
              doc(db, 'numerosReservados', numStr),
              { status: outroPedidoUsando.status, pedidoId: outroPedidoUsando.id, ts: outroPedidoUsando.ts || agora },
              { merge: true }
            );
          } else {
            batch.delete(doc(db, 'numerosReservados', numStr));
          }
        });
      }

      novosNums.forEach(num => {
        batch.set(
          doc(db, 'numerosReservados', String(num).padStart(3, '0')),
          { status: pedido?.status || 'pendente', pedidoId: id, ts: agora },
          { merge: true }
        );
      });

      batch.update(doc(db, 'pedidos', id), { nums: novosNums, ts: agora });

      await batch.commit();
      setEditandoNumerosId(null);
      toast.success('Números corrigidos e validade renovada!');
    } catch (e) {
      toast.error('Erro ao atualizar números.');
    }
  };

  // ✅ Aprovar pedido (formato 3 dígitos)
  const aprovarPedidoUnico = async (id) => {
    try {
      const pedido = pedidos.find(p => p.id === id);
      const batch  = writeBatch(db);

      batch.update(doc(db, 'pedidos', id), { status: 'pago', tsPago: Date.now() });

      if (pedido && pedido.nums) {
        pedido.nums.forEach(num => {
          batch.set(
            doc(db, 'numerosReservados', String(num).padStart(3, '0')),
            { status: 'pago', pedidoId: id },
            { merge: true }
          );
        });
      }

      await batch.commit();
      toast.success('Pedido aprovado!');
    } catch (e) {
      toast.error('Erro ao aprovar pedido.');
    }
  };

  // ✅ Expirar pedido (formato 3 dígitos)
  const expirarPedido = async (id) => {
    if (!window.confirm('Tem certeza que deseja expirar e liberar os números?')) return;
    try {
      const pedido = pedidos.find(p => p.id === id);
      const batch  = writeBatch(db);

      batch.update(doc(db, 'pedidos', id), { status: 'expirado' });

      if (pedido && pedido.nums) {
        pedido.nums.forEach(num => {
          batch.delete(doc(db, 'numerosReservados', String(num).padStart(3, '0')));
        });
      }

      await batch.commit();
      toast.success('Pedido expirado e números liberados.');
    } catch (e) {
      toast.error('Erro ao expirar pedido.');
    }
  };

  // ✅ Aprovação em massa (formato 3 dígitos)
  const aprovarSelecionadosMassa = async () => {
    if (selecionados.size === 0) return;
    if (!window.confirm(`Confirma a aprovação de ${selecionados.size} pedidos de uma só vez?`)) return;

    const toastId = toast.loading(`Aprovando ${selecionados.size} pedidos...`);
    try {
      const batch = writeBatch(db);
      const agora = Date.now();

      selecionados.forEach(id => {
        const pedido = pedidos.find(p => p.id === id);
        batch.update(doc(db, 'pedidos', id), { status: 'pago', tsPago: agora });
        if (pedido && pedido.nums) {
          pedido.nums.forEach(num => {
            batch.set(
              doc(db, 'numerosReservados', String(num).padStart(3, '0')),
              { status: 'pago', pedidoId: id },
              { merge: true }
            );
          });
        }
      });

      await batch.commit();
      toast.success(`${selecionados.size} pedidos aprovados!`, { id: toastId });
      setSelecionados(new Set());
    } catch (e) {
      toast.error('Erro ao processar aprovação em massa.', { id: toastId });
    }
  };

  const toggleSelecao = (id) => {
    setSelecionados(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  // ─── 🚀 TEMPLATES DE WHATSAPP ─────────────────────────────────

  const cobrarWhatsApp = (p) => {
    const tel  = p.tel.replace(/\D/g, '');
    const nome = p.nome.split(' ')[0];
    const msgs =
      "Olá " + nome + "!\n" +
      "Aqui é o Marcelo da Rifa Pratique.\n\n" +
      "Vi que você separou os números *" + (p.nums || []).join(', ') + "* " +
      "(Pedido #" + p.id.slice(-6) + " - R$ " + fmtValor(p.valor) + ").\n\n" +
      "Só falta o PIX para confirmar sua chance de ganhar!\n" +
      "Chave PIX: *lemosmjlp@gmail.com*\n\n" +
      "Posso te ajudar?";
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msgs)}`, '_blank');
  };

  const notificarAprovadoWhatsApp = (p) => {
    const tel  = p.tel.replace(/\D/g, '');
    const nome = p.nome.split(' ')[0];
    const msgs =
      "Olá " + nome + "!\n" +
      "Aqui é o Marcelo da Rifa Pratique.\n\n" +
      "✅ *PAGAMENTO APROVADO!*\n" +
      "Recebemos o seu PIX de R$ " + fmtValor(p.valor) + " com sucesso.\n\n" +
      "Suas rifas estão confirmadíssimas: *" + (p.nums || []).join(', ') + "*\n\n" +
      "Muito obrigado por participar e boa sorte no sorteio oficial!";
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msgs)}`, '_blank');
  };

  const recuperarExpiradoWhatsApp = (p) => {
    const tel  = p.tel.replace(/\D/g, '');
    const nome = p.nome.split(' ')[0];
    const msgs =
      "Olá " + nome + "!\n" +
      "Aqui é o Marcelo da Rifa Pratique.\n\n" +
      "Vi que a sua reserva para os números acabou passando do prazo e foi cancelada pelo sistema. 😔\n\n" +
      "Ainda temos algumas rifas disponíveis! Quer ajuda para escolher novos números e garantir sua participação?";
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msgs)}`, '_blank');
  };

  // ─── RADAR DE CONFLITOS ───────────────────────────────────────
  const conflitosAtivos = (() => {
    const mapa = {};
    pedidos
      .filter(p => p.status !== 'expirado')
      .forEach(p => {
        (p.nums || []).forEach(n => {
          if (!mapa[n]) mapa[n] = [];
          mapa[n].push({ id: p.id, nome: p.nome });
        });
      });
    return Object.entries(mapa).filter(([, lista]) => lista.length > 1);
  })();

  // ─── FILTRAGEM ────────────────────────────────────────────────
  const pedidosAprovados = pedidos.filter(p => p.status === 'pago');
  const pedidosPendentes = pedidos.filter(p => p.status === 'pendente');
  const totalFaturado    = pedidosAprovados.reduce((s, p) => s + Number(p.valor), 0);
  const totalPendente    = pedidosPendentes.reduce((s, p) => s + Number(p.valor), 0);

  const mapaVendedores = Object.fromEntries(vendedores.map(v => [v.nome, v.unidade || 'Desconhecida']));

  const hojeTs  = new Date().setHours(0, 0, 0, 0);
  const ontemTs = hojeTs - 86400000;

  const pedidosFiltrados = pedidos.filter(p => {
    const q             = busca.toLowerCase();
    const matchStatus   = p.status === filtro;
    const matchBusca    = !q || p.nome.toLowerCase().includes(q) || p.tel.includes(q) || p.cpf?.includes(q) || p.id?.includes(q);
    const matchVendedor = !filtroVendedor || (filtroVendedor === 'DIRETO' ? !p.vendedor : p.vendedor === filtroVendedor);
    const unidade       = p.vendedor ? (mapaVendedores[p.vendedor] || 'Desconhecida') : 'Venda Direta';
    const matchUnidade  = !filtroUnidade || (filtroUnidade === 'DIRETO' ? !p.vendedor : unidade === filtroUnidade);
    let matchTempo      = true;
    if (filtroTempo === 'hoje')  matchTempo = p.ts >= hojeTs;
    if (filtroTempo === 'ontem') matchTempo = p.ts >= ontemTs && p.ts < hojeTs;
    return matchStatus && matchBusca && matchVendedor && matchUnidade && matchTempo;
  });

  const selecionarTodos = () => {
    setSelecionados(
      selecionados.size === pedidosFiltrados.length
        ? new Set()
        : new Set(pedidosFiltrados.map(p => p.id))
    );
  };

  // ─── RENDER ──────────────────────────────────────────────────
  return (
    <div className="animate-fade-in pb-24">

      {/* ALERTA DE CONFLITO */}
      {conflitosAtivos.length > 0 && (
        <div className="bg-red-600 text-white p-4 rounded-xl shadow-lg mb-6 flex flex-col gap-2 border-2 border-red-800 animate-pulse-slow">
          <h3 className="font-black flex items-center gap-2 text-lg">
            <WarningCircle size={24} weight="bold" /> ALERTA: NÚMEROS DUPLICADOS
          </h3>
          <p className="text-sm font-medium">Corrija clicando no lápis de números nos cards abaixo:</p>
          <div className="mt-1 space-y-1">
            {conflitosAtivos.map(([numero, clientes]) => (
              <div key={numero} className="bg-red-800/50 p-2 rounded text-sm">
                Número <strong className="text-xl px-1">{numero}</strong> — 
                {clientes.map(c => ` ${c.nome.split(' ')[0]} (#${c.id.slice(-4)})`).join(' | ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MÉTRICAS RÁPIDAS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Aprovados',   val: pedidosAprovados.length,         cor: 'text-green-500'  },
          { label: 'Pendentes',   val: pedidosPendentes.length,         cor: 'text-yellow-500' },
          { label: 'Em caixa',    val: `R$ ${fmtValor(totalFaturado)}`, cor: 'text-orange-400' },
          { label: 'Aguard. PIX', val: `R$ ${fmtValor(totalPendente)}`, cor: 'text-blue-400'   },
        ].map(({ label, val, cor }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-center shadow-sm">
            <p className={`text-xl font-black ${cor}`}>{val}</p>
            <p className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm mb-6 flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block tracking-wider">Status</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'pendente', label: 'Pendentes' },
                { key: 'pago',     label: 'Aprovados' },
                { key: 'expirado', label: 'Expirados' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => { setFiltro(key); setSelecionados(new Set()); }}
                  className={`px-4 py-2 font-semibold rounded-lg text-xs border whitespace-nowrap transition-all ${
                    filtro === key
                      ? 'bg-orange-600 border-orange-500 text-white shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-500 mb-2 block tracking-wider">Data</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'todos', label: 'Todas' },
                { key: 'hoje',  label: 'Hoje'  },
                { key: 'ontem', label: 'Ontem' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => { setFiltroTempo(key); setSelecionados(new Set()); }}
                  className={`px-4 py-2 font-semibold rounded-lg text-xs border whitespace-nowrap transition-all ${
                    filtroTempo === key
                      ? 'bg-zinc-800 dark:bg-zinc-100 border-zinc-900 dark:border-white text-white dark:text-zinc-900 shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <hr className="border-zinc-200 dark:border-zinc-800" />

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" placeholder="Buscar por Nome, Telefone, CPF ou ID..."
              value={busca} onChange={e => setBusca(e.target.value)}
              className="w-full pl-9 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>
          {vendedores.length > 0 && (
            <div className="relative min-w-[180px]">
              <FunnelSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                className="pl-9 pr-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg py-2.5 text-zinc-900 dark:text-white text-sm focus:border-orange-500 focus:outline-none appearance-none w-full cursor-pointer uppercase font-semibold"
              >
                <option value="">EQUIPE (TODOS)</option>
                <option value="DIRETO">— VENDA DIRETA</option>
                {vendedoresAtivos.map(v => <option key={v.id} value={v.nome}>{v.nome}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* GRID DE CARDS */}
      {pedidosFiltrados.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <Receipt size={48} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">Nenhum pedido encontrado nessa filtragem.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pedidosFiltrados.map(p => {
            const isSelecionado = selecionados.has(p.id);
            return (
              <div key={p.id} className={`bg-white dark:bg-zinc-900 rounded-xl border overflow-hidden flex flex-col relative transition-all ${
                isSelecionado
                  ? 'border-orange-500 shadow-md ring-1 ring-orange-500'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-orange-300 dark:hover:border-orange-900/50'
              }`}>

                {/* Checkbox de seleção em massa (Apenas para pendentes) */}
                {p.status === 'pendente' && (
                  <button onClick={() => toggleSelecao(p.id)}
                    className="absolute top-3 right-3 z-10 p-1 bg-white/80 dark:bg-zinc-900/80 backdrop-blur rounded text-zinc-400 hover:text-orange-500 transition-colors"
                  >
                    {isSelecionado
                      ? <CheckSquare size={24} weight="fill" className="text-orange-500" />
                      : <Square size={24} />}
                  </button>
                )}

                <div className={`h-1.5 w-full shrink-0 ${
                  p.status === 'pago' ? 'bg-green-500' : p.status === 'pendente' ? 'bg-yellow-500' : 'bg-zinc-400'
                }`} />

                <div className="p-5 flex-1 flex flex-col">
                  
                  {/* SEÇÃO DE EDIÇÃO DE CLIENTE OU EXIBIÇÃO NORMAL */}
                  {editandoClienteId === p.id ? (
                    <div className="mb-4 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
                      <label className="text-[10px] font-bold uppercase text-zinc-500">Editar Dados do Cliente</label>
                      <input type="text" value={clienteForm.nome} onChange={e => setClienteForm({...clienteForm, nome: e.target.value})} placeholder="Nome completo" className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm font-bold text-zinc-900 dark:text-white" />
                      <input type="text" value={clienteForm.tel} onChange={e => setClienteForm({...clienteForm, tel: e.target.value})} placeholder="Telefone" className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-900 dark:text-white" />
                      <input type="text" value={clienteForm.cpf} onChange={e => setClienteForm({...clienteForm, cpf: e.target.value})} placeholder="CPF" className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-900 dark:text-white" />
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => salvarEdicaoCliente(p.id)} className="flex-1 bg-green-500 hover:bg-green-600 transition-colors text-white py-1.5 rounded flex items-center justify-center gap-1 font-bold text-xs"><CheckCircle size={16} weight="bold" /> Salvar</button>
                        <button onClick={() => setEditandoClienteId(null)} className="flex-1 bg-red-500 hover:bg-red-600 transition-colors text-white py-1.5 rounded flex items-center justify-center gap-1 font-bold text-xs"><XCircle size={16} weight="bold" /> Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Cabeçalho do card */}
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div className="flex-1">
                          <div className="flex items-start gap-2">
                            <p className="font-black text-zinc-900 dark:text-white text-base leading-tight uppercase break-words">{p.nome}</p>
                            <button onClick={() => iniciarEdicaoCliente(p)} className="text-zinc-400 hover:text-orange-600 mt-0.5 transition-colors shrink-0" title="Editar Nome, CPF e Telefone">
                              <PencilSimple size={16} weight="bold" />
                            </button>
                          </div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1 mt-1">
                            <CalendarBlank size={12} /> {fmtData(p.ts)}
                          </p>
                        </div>
                        <span className="text-orange-600 dark:text-orange-400 font-black text-base whitespace-nowrap bg-orange-50 dark:bg-orange-900/20 px-3 py-1 rounded border border-orange-100 dark:border-orange-800/30 shrink-0">
                          R$ {fmtValor(p.valor)}
                        </span>
                      </div>

                      {/* Info do cliente */}
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-4 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/50 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-medium flex items-center gap-1.5"><WhatsappLogo size={14} /> {p.tel}</span>
                          <span className="font-mono text-[11px] font-bold text-zinc-400">#{p.id.slice(-6)}</span>
                        </div>
                        {p.cpf && (
                          <div className="font-medium flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                            <Receipt size={14} /> {p.cpf}
                          </div>
                        )}

                        {/* Edição de vendedor */}
                        <div className="mt-2 flex items-center justify-between gap-2 bg-orange-50/50 dark:bg-orange-900/10 p-1.5 rounded border border-orange-100 dark:border-orange-900/30">
                          {editandoVendedorId === p.id ? (
                            <div className="flex w-full items-center gap-1">
                              <select value={novoVendedorLocal} onChange={e => setNovoVendedorLocal(e.target.value)}
                                className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded p-1 text-xs font-bold uppercase text-zinc-900 dark:text-white focus:outline-none"
                              >
                                <option value="">— VENDA DIRETA —</option>
                                {vendedoresAtivos.map(v => <option key={v.id} value={v.nome}>{v.nome}</option>)}
                              </select>
                              <button onClick={() => salvarNovoVendedor(p.id)} className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded"><CheckCircle size={14} weight="bold" /></button>
                              <button onClick={() => setEditandoVendedorId(null)} className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded"><XCircle size={14} weight="bold" /></button>
                            </div>
                          ) : (
                            <>
                              <p className="text-orange-600 dark:text-orange-500 font-bold text-xs flex items-center gap-1.5 truncate uppercase">
                                <Storefront size={14} className="shrink-0" />
                                <span className="truncate">{p.vendedor || 'VENDA DIRETA'}</span>
                              </p>
                              <button onClick={() => { setEditandoVendedorId(p.id); setNovoVendedorLocal(p.vendedor || ''); }}
                                className="text-zinc-400 hover:text-orange-600 p-1 transition-colors shrink-0" title="Editar Vendedor"
                              >
                                <PencilSimple size={14} weight="bold" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Edição de números */}
                  <div className="mb-4">
                    {editandoNumerosId === p.id ? (
                      <div className="flex flex-col gap-2 bg-orange-50 dark:bg-orange-900/10 p-2 rounded border border-orange-200 dark:border-orange-900/50">
                        <label className="text-[10px] font-bold uppercase text-orange-600">Alterar Números (separe por vírgula):</label>
                        <div className="flex gap-2">
                          <input type="text" value={numerosInput} onChange={e => setNumerosInput(e.target.value)}
                            placeholder="Ex: 12, 45, 89"
                            className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-sm font-mono focus:outline-none"
                          />
                          <button onClick={() => salvarNovosNumeros(p.id)} className="bg-green-500 text-white p-1.5 rounded hover:bg-green-600"><CheckCircle size={16} weight="bold" /></button>
                          <button onClick={() => setEditandoNumerosId(null)} className="bg-red-500 text-white p-1.5 rounded hover:bg-red-600"><XCircle size={16} weight="bold" /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto flex-1">
                          {(p.nums || []).map(n => (
                            <span key={n} className={`text-[11px] font-mono font-black px-2 py-1 rounded border ${
                              p.status === 'pago'
                                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/30'
                                : p.status === 'pendente'
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-500 border-yellow-200 dark:border-yellow-800/30'
                                : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                            }`}>{n}</span>
                          ))}
                        </div>
                        <button
                          onClick={() => { setEditandoNumerosId(p.id); setNumerosInput((p.nums || []).join(', ')); }}
                          className="text-zinc-400 hover:text-orange-600 p-1 bg-zinc-50 dark:bg-zinc-800 rounded transition-colors shrink-0"
                          title="Editar Números"
                        >
                          <PencilSimple size={14} weight="bold" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Timer de expiração */}
                  {p.status === 'pendente' && (
                    <p className="text-[11px] uppercase tracking-widest text-yellow-600 dark:text-yellow-500 font-black mb-4 flex items-center gap-1.5 mt-auto">
                      <Clock size={14} weight="bold" /> {tempoRestantePedido(p.ts)}
                    </p>
                  )}

                  {/* 🚀 AÇÕES COM MENSAGENS DO WHATSAPP E EXCLUSÕES DE ACORDO COM O STATUS */}
                  <div className="grid grid-cols-1 gap-2 mt-auto pt-2">
                    
                    {p.status === 'pendente' && (
                      <div className="grid grid-cols-12 gap-2">
                        <button onClick={() => cobrarWhatsApp(p)}
                          className="col-span-5 flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe57] text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-sm uppercase"
                        >
                          <WhatsappLogo size={16} weight="fill" /> Cobrar
                        </button>
                        <button onClick={() => aprovarPedidoUnico(p.id)}
                          className="col-span-5 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-sm uppercase"
                        >
                          <CheckCircle size={16} weight="fill" /> Aprovar
                        </button>
                        <button onClick={() => expirarPedido(p.id)}
                          className="col-span-2 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 text-xs font-bold py-2 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700"
                          title="Expirar Pedido"
                        >
                          <XCircle size={18} weight="fill" />
                        </button>
                      </div>
                    )}

                    {p.status === 'pago' && (
                      <div className="grid grid-cols-12 gap-2">
                        <button onClick={() => notificarAprovadoWhatsApp(p)}
                          className="col-span-10 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white text-xs font-bold py-2.5 rounded-lg transition-colors shadow-sm uppercase"
                        >
                          <WhatsappLogo size={18} weight="fill" /> Enviar Recibo de Compra
                        </button>
                        {/* Botão de excluir aprovação errada */}
                        <button onClick={() => deletarPedido(p.id)}
                          className="col-span-2 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 text-xs font-bold py-2.5 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700"
                          title="Excluir pedido e liberar números"
                        >
                          <Trash size={18} weight="fill" />
                        </button>
                      </div>
                    )}

                    {p.status === 'expirado' && (
                      <div className="grid grid-cols-12 gap-2">
                        <button onClick={() => recuperarExpiradoWhatsApp(p)}
                          className="col-span-10 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-2.5 rounded-lg transition-colors shadow-sm uppercase"
                        >
                          <WhatsappLogo size={18} weight="fill" /> Tentar Recuperar Venda
                        </button>
                        {/* Botão de limpar sujeira (excluir expirado definitivamente) */}
                        <button onClick={() => deletarPedido(p.id)}
                          className="col-span-2 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 text-xs font-bold py-2.5 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700"
                          title="Excluir pedido do histórico"
                        >
                          <Trash size={18} weight="fill" />
                        </button>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BARRA FLUTUANTE DE APROVAÇÃO EM MASSA */}
      {selecionados.size > 0 && filtro === 'pendente' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 border border-zinc-700 dark:border-zinc-300">
          <div className="flex items-center gap-3">
            <span className="bg-orange-500 text-white font-black w-8 h-8 flex items-center justify-center rounded-full">
              {selecionados.size}
            </span>
            <span className="font-bold text-sm uppercase tracking-wider hidden sm:block">Selecionados</span>
          </div>
          <div className="w-px h-6 bg-zinc-700 dark:bg-zinc-300" />
          <button onClick={selecionarTodos}
            className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white dark:text-zinc-500 dark:hover:text-zinc-900 transition-colors"
          >
            {selecionados.size === pedidosFiltrados.length ? 'Desmarcar' : 'Selecionar Tudo'}
          </button>
          <button onClick={aprovarSelecionadosMassa}
            className="bg-green-500 hover:bg-green-400 text-white font-black px-6 py-2 rounded-full flex items-center gap-2 shadow-lg shadow-green-500/30 transition-all active:scale-95"
          >
            <CheckCircle size={20} weight="fill" />
            <span className="uppercase text-sm tracking-wider">Aprovar PIX</span>
          </button>
        </div>
      )}
    </div>
  );
}
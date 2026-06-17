import { useState, useRef, useMemo } from 'react';
import { Users, Trash, WarningCircle, SpinnerGap, MagnifyingGlass, ArrowCounterClockwise, PencilSimple, Check } from '@phosphor-icons/react';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function AbaEquipe({ vendedores }) {
  const [novoVendedor, setNovoVendedor] = useState('');
  const [novaUnidade,  setNovaUnidade]  = useState('Santa Inês 1');
  const [busca,        setBusca]        = useState('');
  const [salvando,     setSalvando]     = useState(false);
  const [erroInline,   setErroInline]   = useState('');
  
  // 🚀 NOVO: Estado para gerenciar a Edição
  const [vendedorEmEdicao, setVendedorEmEdicao] = useState(null);
  
  const inputRef = useRef(null);

  // ─── FUNÇÕES UTILITÁRIAS ─────────────────────────────────────
  const normalizarNome = (str) => {
    return String(str || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  };

  const gerarCanonical = (str) => {
    return normalizarNome(str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s/g, '-');
  };

  // ─── HANDLERS DE AÇÃO ────────────────────────────────────────
  const handleSalvarVendedor = async (e) => {
    e.preventDefault();
    setErroInline('');

    const nomeTratado = normalizarNome(novoVendedor);
    if (!nomeTratado) {
      setErroInline('Por favor, digite um nome válido.');
      inputRef.current?.focus();
      return;
    }

    const canonical = gerarCanonical(nomeTratado);

    // Verifica duplicidade APENAS se não for o próprio vendedor sendo editado
    const duplicado = vendedores.find(v => 
      (v.canonicalName || gerarCanonical(v.nome)) === canonical && v.id !== vendedorEmEdicao?.id
    );

    if (duplicado) {
      if (duplicado.ativo === false) {
        setErroInline(`O vendedor "${nomeTratado}" existe, mas está inativo. Busque-o na lista e clique em Reativar.`);
      } else {
        setErroInline(`O vendedor "${nomeTratado}" já está cadastrado na equipe.`);
      }
      return;
    }

    setSalvando(true);
    try {
      if (vendedorEmEdicao) {
        // 🚀 LÓGICA DE ATUALIZAÇÃO (EDIÇÃO)
        await updateDoc(doc(db, 'vendedores', vendedorEmEdicao.id), {
          nome: nomeTratado,
          canonicalName: canonical,
          unidade: novaUnidade,
          atualizadoEm: Date.now()
        });
        cancelarEdicao();
      } else {
        // LÓGICA DE CRIAÇÃO
        await addDoc(collection(db, 'vendedores'), { 
          nome: nomeTratado, 
          canonicalName: canonical,
          unidade: novaUnidade,
          ativo: true,
          criadoEm: Date.now()
        });
        setNovoVendedor('');
        inputRef.current?.focus();
      }
    } catch { 
      setErroInline('Falha de conexão ao salvar. Tente novamente.'); 
    } finally {
      setSalvando(false);
    }
  };

  const iniciarEdicao = (vendedor) => {
    setNovoVendedor(vendedor.nome);
    setNovaUnidade(vendedor.unidade || 'Santa Inês 1');
    setVendedorEmEdicao(vendedor);
    setErroInline('');
    inputRef.current?.focus();
  };

  const cancelarEdicao = () => {
    setNovoVendedor('');
    setNovaUnidade('Santa Inês 1');
    setVendedorEmEdicao(null);
    setErroInline('');
  };

  const handleAlternarStatus = async (vendedor) => {
    const acao = vendedor.ativo !== false ? 'INATIVAR' : 'REATIVAR';
    
    if (!window.confirm(`Deseja ${acao} o vendedor ${vendedor.nome}?`)) return;
    
    try { 
      await updateDoc(doc(db, 'vendedores', vendedor.id), { 
        ativo: vendedor.ativo === false ? true : false,
        [vendedor.ativo === false ? 'reativadoEm' : 'inativadoEm']: Date.now()
      }); 
      // Se inativou o cara que estava editando, limpa o form
      if (vendedorEmEdicao?.id === vendedor.id) cancelarEdicao();
    } catch { 
      alert(`Erro ao tentar ${acao.toLowerCase()} vendedor.`); 
    }
  };

  // ─── LISTAGEM E FILTROS (COM USEMEMO PARA PERFORMANCE) ───────
  const { vendedoresS1, vendedoresS2 } = useMemo(() => {
    const buscaCanonical = gerarCanonical(busca); // Ignora acentos na busca!
    
    const filtrados = vendedores
      .filter(v => {
        if (!buscaCanonical) return true;
        const nomeCanon = v.canonicalName || gerarCanonical(v.nome);
        return nomeCanon.includes(buscaCanonical);
      })
      .sort((a, b) => {
        const ativoA = a.ativo !== false;
        const ativoB = b.ativo !== false;
        if (ativoA && !ativoB) return -1;
        if (!ativoA && ativoB) return 1;
        return a.nome.localeCompare(b.nome);
      });

    return {
      vendedoresS1: filtrados.filter(v => v.unidade !== 'Santa Inês 2'),
      vendedoresS2: filtrados.filter(v => v.unidade === 'Santa Inês 2')
    };
  }, [vendedores, busca]);

  // Função auxiliar para renderizar cada coluna de unidade
  const renderColunaUnidade = (lista, titulo, sigla, corSigla) => (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-w-[200px]">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{titulo}</h4>
        <span className="text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">
          {lista.filter(v => v.ativo !== false).length} ativos
        </span>
      </div>
      
      <div className="space-y-2 overflow-y-auto pr-2 scrollbar-thin flex-1 pb-4">
        {lista.length === 0 ? (
          <p className="text-sm text-zinc-500 italic mt-2 text-center">Nenhum vendedor.</p>
        ) : (
          lista.map((v) => {
            const inativo = v.ativo === false;
            const sendoEditado = vendedorEmEdicao?.id === v.id;

            return (
              <div 
                key={v.id} 
                className={`flex justify-between items-center border p-2.5 rounded-lg transition-all ${
                  sendoEditado 
                    ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-800 shadow-sm'
                    : inativo 
                      ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 opacity-60 grayscale' 
                      : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-orange-200 dark:hover:border-orange-900/50'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <span className={`font-semibold flex items-center gap-2 text-sm truncate ${inativo ? 'line-through text-zinc-500' : sendoEditado ? 'text-orange-700 dark:text-orange-400' : 'text-zinc-900 dark:text-zinc-200'}`}>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 shadow-sm ${inativo ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500' : corSigla}`}>
                      {sigla}
                    </span>
                    <span className="truncate">{String(v.nome).toUpperCase()}</span>
                  </span>
                  {inativo && <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider mt-1 block">Inativo</span>}
                </div>
                
                <div className="flex items-center gap-1 shrink-0">
                  {/* BOTÃO DE EDITAR */}
                  {!inativo && (
                    <button 
                      onClick={() => iniciarEdicao(v)} 
                      title="Editar Vendedor"
                      className={`p-1.5 rounded-md transition-colors ${sendoEditado ? 'text-orange-600 bg-orange-100 dark:bg-orange-900/50' : 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`}
                    >
                      <PencilSimple size={18} weight={sendoEditado ? "fill" : "bold"} />
                    </button>
                  )}

                  {/* BOTÃO DE STATUS (LIXEIRA / REATIVAR) */}
                  <button 
                    onClick={() => handleAlternarStatus(v)} 
                    title={inativo ? 'Reativar Vendedor' : 'Inativar Vendedor'}
                    className={`p-1.5 rounded-md transition-colors shrink-0 ${
                      inativo 
                        ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30' 
                        : 'text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                    }`}
                  >
                    {inativo ? <ArrowCounterClockwise size={18} weight="bold" /> : <Trash size={18} weight="bold" />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* ─── COLUNA 1: CADASTRO / EDIÇÃO ─── */}
      <div className={`p-6 rounded-xl border h-fit shadow-sm lg:col-span-1 transition-colors ${vendedorEmEdicao ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
        <h3 className="font-bold mb-4 flex items-center gap-2 text-zinc-900 dark:text-white uppercase tracking-wide">
          {vendedorEmEdicao ? (
            <><PencilSimple className="text-orange-500" size={20} weight="fill" /> Editando Vendedor</>
          ) : (
            <><Users className="text-orange-500" size={20} weight="fill" /> Novo Vendedor</>
          )}
        </h3>
        
        <form onSubmit={handleSalvarVendedor} className="flex flex-col gap-3">
          <input 
            type="text" 
            ref={inputRef}
            autoFocus
            placeholder="NOME COMPLETO DO VENDEDOR" 
            value={novoVendedor} 
            onChange={(e) => setNovoVendedor(e.target.value.toUpperCase())}
            disabled={salvando}
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none disabled:opacity-50 font-bold" 
          />
          
          <select 
            value={novaUnidade} 
            onChange={(e) => setNovaUnidade(e.target.value)}
            disabled={salvando}
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none disabled:opacity-50 uppercase font-bold"
          >
            <option value="Santa Inês 1">SI1 - SANTA INÊS 1</option>
            <option value="Santa Inês 2">SI2 - SANTA INÊS 2</option>
          </select>
          
          <div className="flex gap-2 mt-1">
            {vendedorEmEdicao && (
              <button 
                type="button" 
                onClick={cancelarEdicao}
                disabled={salvando}
                className="flex-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-lg transition-colors uppercase text-sm"
              >
                Cancelar
              </button>
            )}
            <button 
              type="submit" 
              disabled={salvando || novoVendedor.trim() === ''}
              className={`flex-[2] text-white font-bold py-3 rounded-lg transition-all shadow-md flex items-center justify-center gap-2 uppercase text-sm ${vendedorEmEdicao ? 'bg-orange-600 hover:bg-orange-500' : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200'}`}
            >
              {salvando ? (
                <><SpinnerGap size={18} className="animate-spin" /> Aguarde</>
              ) : vendedorEmEdicao ? (
                <><Check size={18} weight="bold" /> Atualizar</>
              ) : (
                'Salvar Vendedor'
              )}
            </button>
          </div>

          {/* Feedback Visual Inline */}
          {erroInline && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm border border-red-200 dark:border-red-800/30 mt-2 animate-fade-in">
              <WarningCircle size={18} weight="fill" className="shrink-0 mt-0.5" />
              <p>{erroInline}</p>
            </div>
          )}
        </form>
      </div>

      {/* ─── COLUNAS 2 E 3: GERENCIAMENTO LADO A LADO ─── */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col h-[600px] lg:col-span-2">
        
        {/* Busca Global */}
        <div className="relative mb-6 shrink-0">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input 
            type="text" 
            placeholder="BUSCAR VENDEDOR (SEM ACENTOS TBM FUNCIONA)..." 
            value={busca}
            onChange={(e) => setBusca(e.target.value.toUpperCase())}
            className="w-full pl-9 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none shadow-sm uppercase font-bold"
          />
        </div>

        {/* Divisão das Listas SI1 e SI2 */}
        <div className="flex flex-col sm:flex-row gap-6 flex-1 overflow-hidden">
          {renderColunaUnidade(
            vendedoresS1, 
            'SANTA INÊS 1', 
            'SI1', 
            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
          )}
          
          {/* Divisória Vertical (apenas em telas maiores) */}
          <div className="w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>
          {/* Divisória Horizontal (apenas no celular) */}
          <div className="h-px w-full bg-zinc-200 dark:bg-zinc-800 sm:hidden"></div>

          {renderColunaUnidade(
            vendedoresS2, 
            'SANTA INÊS 2', 
            'SI2', 
            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          )}
        </div>

      </div>

    </div>
  );
}
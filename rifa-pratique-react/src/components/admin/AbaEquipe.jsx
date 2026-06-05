import { useState, useRef } from 'react';
import { Users, Trash, WarningCircle, SpinnerGap, MagnifyingGlass, ArrowCounterClockwise } from '@phosphor-icons/react';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function AbaEquipe({ vendedores }) {
  const [novoVendedor, setNovoVendedor] = useState('');
  const [novaUnidade,  setNovaUnidade]  = useState('Santa Inês 1');
  const [busca,        setBusca]        = useState('');
  const [salvando,     setSalvando]     = useState(false);
  const [erroInline,   setErroInline]   = useState('');
  
  const inputRef = useRef(null);

  // ─── FUNÇÕES UTILITÁRIAS ─────────────────────────────────────
  const normalizarNome = (str) => {
    return str
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
  const handleAdicionarVendedor = async (e) => {
    e.preventDefault();
    setErroInline('');

    const nomeTratado = normalizarNome(novoVendedor);
    if (!nomeTratado) {
      setErroInline('Por favor, digite um nome válido.');
      inputRef.current?.focus();
      return;
    }

    const canonical = gerarCanonical(nomeTratado);

    const duplicado = vendedores.find(v => 
      (v.canonicalName || gerarCanonical(v.nome)) === canonical
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
      await addDoc(collection(db, 'vendedores'), { 
        nome: nomeTratado, 
        canonicalName: canonical,
        unidade: novaUnidade,
        ativo: true,
        criadoEm: Date.now()
      });
      
      setNovoVendedor('');
      inputRef.current?.focus();
    } catch { 
      setErroInline('Falha de conexão ao salvar. Tente novamente.'); 
    } finally {
      setSalvando(false);
    }
  };

  const handleAlternarStatus = async (vendedor) => {
    const acao = vendedor.ativo !== false ? 'INATIVAR' : 'REATIVAR';
    
    if (!window.confirm(`Deseja ${acao} o vendedor ${vendedor.nome}?`)) return;
    
    try { 
      await updateDoc(doc(db, 'vendedores', vendedor.id), { 
        ativo: vendedor.ativo === false ? true : false,
        [vendedor.ativo === false ? 'reativadoEm' : 'inativadoEm']: Date.now()
      }); 
    } catch { 
      alert(`Erro ao tentar ${acao.toLowerCase()} vendedor.`); 
    }
  };

  // ─── LISTAGEM E FILTROS ──────────────────────────────────────
  const vendedoresFiltrados = vendedores
    .filter(v => normalizarNome(v.nome).includes(busca.toUpperCase()))
    .sort((a, b) => {
      const ativoA = a.ativo !== false;
      const ativoB = b.ativo !== false;
      if (ativoA && !ativoB) return -1;
      if (!ativoA && ativoB) return 1;
      return a.nome.localeCompare(b.nome);
    });

  // Separa as equipes para as duas colunas
  const vendedoresS1 = vendedoresFiltrados.filter(v => v.unidade !== 'Santa Inês 2');
  const vendedoresS2 = vendedoresFiltrados.filter(v => v.unidade === 'Santa Inês 2');

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
            return (
              <div 
                key={v.id} 
                className={`flex justify-between items-center border p-2.5 rounded-lg transition-all ${
                  inativo 
                    ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 opacity-60 grayscale' 
                    : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-orange-200 dark:hover:border-orange-900/50'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <span className={`font-semibold flex items-center gap-2 text-sm truncate ${inativo ? 'line-through text-zinc-500' : 'text-zinc-900 dark:text-zinc-200'}`}>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 shadow-sm ${inativo ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500' : corSigla}`}>
                      {sigla}
                    </span>
                    <span className="truncate">{String(v.nome).toUpperCase()}</span>
                  </span>
                  {inativo && <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider mt-1 block">Inativo</span>}
                </div>
                
                <button 
                  onClick={() => handleAlternarStatus(v)} 
                  title={inativo ? 'Reativar Vendedor' : 'Inativar Vendedor'}
                  className={`p-1.5 rounded-md transition-colors shrink-0 ${
                    inativo 
                      ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30' 
                      : 'text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                  }`}
                >
                  {inativo ? <ArrowCounterClockwise size={18} weight="bold" /> : <Trash size={16} weight="bold" />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* ─── COLUNA 1: CADASTRO ─── */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 h-fit shadow-sm lg:col-span-1">
        <h3 className="font-bold mb-4 flex items-center gap-2 text-zinc-900 dark:text-white">
          <Users className="text-orange-500" size={20} weight="fill" /> Novo Vendedor
        </h3>
        
        <form onSubmit={handleAdicionarVendedor} className="flex flex-col gap-3">
          <input 
            type="text" 
            ref={inputRef}
            autoFocus
            placeholder="NOME COMPLETO DO VENDEDOR" 
            value={novoVendedor} 
            onChange={(e) => setNovoVendedor(e.target.value.toUpperCase())}
            disabled={salvando}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none disabled:opacity-50" 
          />
          
          <select 
            value={novaUnidade} 
            onChange={(e) => setNovaUnidade(e.target.value)}
            disabled={salvando}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none disabled:opacity-50 uppercase"
          >
            <option value="Santa Inês 1">SI1 - SANTA INÊS 1</option>
            <option value="Santa Inês 2">SI2 - SANTA INÊS 2</option>
          </select>
          
          <button 
            type="submit" 
            disabled={salvando || novoVendedor.trim() === ''}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-400 text-white font-bold py-3 mt-1 rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
          >
            {salvando ? <><SpinnerGap size={18} className="animate-spin" /> Salvando</> : 'Salvar Vendedor'}
          </button>

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
            placeholder="BUSCAR EM QUALQUER UNIDADE..." 
            value={busca}
            onChange={(e) => setBusca(e.target.value.toUpperCase())}
            className="w-full pl-9 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none shadow-sm"
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
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
  // Normaliza: "  felipe   SILVA " -> "Felipe Silva"
  const normalizarNome = (str) => {
    return str
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
      .join(' ');
  };

  // Canonical para o banco: "Felipe Silva" -> "felipe-silva"
  const gerarCanonical = (str) => {
    return normalizarNome(str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
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

    // Validação de Duplicidade (Cross-check com Canonical Name)
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
    .filter(v => normalizarNome(v.nome).toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => {
      // 1º Regra: Ativos primeiro
      const ativoA = a.ativo !== false;
      const ativoB = b.ativo !== false;
      if (ativoA && !ativoB) return -1;
      if (!ativoA && ativoB) return 1;
      
      // 2º Regra: Ordem alfabética
      return a.nome.localeCompare(b.nome);
    });

  return (
    <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* ─── COLUNA 1: CADASTRO ─── */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 h-fit shadow-sm">
        <h3 className="font-bold mb-4 flex items-center gap-2 text-zinc-900 dark:text-white">
          <Users className="text-orange-500" size={20} weight="fill" /> Novo Vendedor
        </h3>
        
        <form onSubmit={handleAdicionarVendedor} className="flex flex-col gap-3">
          <input 
            type="text" 
            ref={inputRef}
            autoFocus
            placeholder="Nome Completo do Vendedor" 
            value={novoVendedor} 
            onChange={(e) => setNovoVendedor(e.target.value)}
            disabled={salvando}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none disabled:opacity-50" 
          />
          
          <div className="flex flex-col xl:flex-row gap-2">
            <select 
              value={novaUnidade} 
              onChange={(e) => setNovaUnidade(e.target.value)}
              disabled={salvando}
              className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none disabled:opacity-50"
            >
              <option value="Santa Inês 1">Santa Inês 1</option>
              <option value="Santa Inês 2">Santa Inês 2</option>
            </select>
            
            <button 
              type="submit" 
              disabled={salvando || novoVendedor.trim() === ''}
              className="bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-400 text-white font-bold px-8 py-3 rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
            >
              {salvando ? <><SpinnerGap size={18} className="animate-spin" /> Salvando</> : 'Salvar'}
            </button>
          </div>

          {/* Feedback Visual Inline */}
          {erroInline && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm border border-red-200 dark:border-red-800/30 mt-1 animate-fade-in">
              <WarningCircle size={18} weight="fill" className="shrink-0 mt-0.5" />
              <p>{erroInline}</p>
            </div>
          )}
        </form>
      </div>

      {/* ─── COLUNA 2: GERENCIAMENTO ─── */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col h-[500px]">
        
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-zinc-900 dark:text-white">
            Equipe ({vendedores.filter(v => v.ativo !== false).length} ativos)
          </h3>
        </div>

        {/* Busca Local */}
        <div className="relative mb-4 shrink-0">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Buscar na equipe..." 
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none"
          />
        </div>

        {/* Lista Scrollável */}
        <div className="space-y-2 overflow-y-auto pr-1 scrollbar-thin flex-1">
          {vendedoresFiltrados.length === 0 ? (
            <p className="text-sm text-zinc-500 italic text-center mt-6">Nenhum vendedor encontrado.</p>
          ) : (
            vendedoresFiltrados.map((v) => {
              const inativo = v.ativo === false;
              
              return (
                <div 
                  key={v.id} 
                  className={`flex justify-between items-center border p-3 rounded-lg transition-all ${
                    inativo 
                      ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 opacity-60 grayscale' 
                      : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:border-orange-200 dark:hover:border-orange-900/50'
                  }`}
                >
                  <div>
                    <span className={`font-semibold block ${inativo ? 'line-through text-zinc-500' : 'text-zinc-900 dark:text-zinc-200'}`}>
                      {v.nome}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${inativo ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600'}`}>
                        {v.unidade || 'Santa Inês 1'}
                      </span>
                      {inativo && <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Inativo</span>}
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => handleAlternarStatus(v)} 
                    title={inativo ? 'Reativar Vendedor' : 'Inativar Vendedor'}
                    aria-label={`${inativo ? 'Reativar' : 'Inativar'} vendedor ${v.nome}`}
                    className={`p-2 rounded-md transition-colors ${
                      inativo 
                        ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30' 
                        : 'text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                    }`}
                  >
                    {inativo ? <ArrowCounterClockwise size={20} weight="bold" /> : <Trash size={18} weight="bold" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
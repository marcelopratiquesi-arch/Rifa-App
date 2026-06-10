import { useState, useEffect } from 'react';
import { ArrowLeft, Copy, CheckCircle, WhatsappLogo, UserList, Timer, WarningCircle, Storefront, Info, CalendarPlus } from '@phosphor-icons/react';
import { doc, updateDoc, collection, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../services/firebase';
import Confetti from 'react-confetti';

export default function TelaPagamento({ numeros, valorCobrado, onVoltar, onSucesso }) {
  const [etapa, setEtapa]               = useState('formulario');
  const [pedidoIdGerado, setPedidoIdGerado] = useState(null);
  const [aCarregar, setACarregar]       = useState(false);
  const [tempoRestante, setTempoRestante] = useState(900);
  const [tempoEsgotado, setTempoEsgotado] = useState(false);
  const [vendedores, setVendedores]     = useState([]);
  const [numerosConflito, setNumerosConflito] = useState([]);
  
  // Gatilho para fazer o botão do WhatsApp piscar/pulsar
  const [pixCopiado, setPixCopiado]     = useState(false);

  // ESTADO PARA O TAMANHO DA TELA (CONFETES)
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [dados, setDados] = useState({
    nome: '', cpf: '', telefone: '', email: '', endereco: '', vendedor: ''
  });

  const CHAVE_PIX             = "lemosmjlp@gmail.com";
  const NUMERO_WHATSAPP_ADMIN = "5531973483934";

  // ─── MONITORAR TAMANHO DA TELA PARA OS CONFETES ───────────
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ─── VENDEDORES ATIVOS ──────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vendedores'), (snapshot) => {
      const lista = snapshot.docs
        .map(d => d.data())
        .filter(d => d.ativo !== false)
        .map(d => ({
          nome:    String(d.nome).toUpperCase(),
          unidade: String(d.unidade || 'SANTA INÊS 1').toUpperCase()
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setVendedores(lista);
    });
    return () => unsub();
  }, []);

  // ─── TIMER DO PIX ─────────────────────────────────────────────
  useEffect(() => {
    if (etapa !== 'pagamento_pix' || tempoEsgotado) return;
    if (tempoRestante <= 0) { setTempoEsgotado(true); return; }
    const id = setInterval(() => setTempoRestante(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [etapa, tempoRestante, tempoEsgotado]);

  const tempoFormatado = `${String(Math.floor(tempoRestante / 60)).padStart(2, '0')}:${String(tempoRestante % 60).padStart(2, '0')}`;

  const formatarCPF       = (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
  const formatarTelefone  = (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{4})\d+?$/, '$1');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDados(prev => ({
      ...prev,
      [name]: name === 'cpf' ? formatarCPF(value) : name === 'telefone' ? formatarTelefone(value) : value
    }));
  };

  // ─── RESERVA COM TRANSAÇÃO ATÔMICA CONTRA DUPLICIDADE ───────────
  const handleGerarReserva = async (e) => {
    e.preventDefault();
    if (dados.cpf.length < 14 || dados.telefone.length < 14) {
      alert("Preencha CPF e WhatsApp corretamente.");
      return;
    }
    if (!dados.vendedor) {
      alert("Selecione quem indicou a rifa.");
      return;
    }

    setACarregar(true);
    setNumerosConflito([]);
    const novoPedidoId = 'P' + Date.now();
    const EXPIRACAO_MS = 24 * 60 * 60 * 1000;

    try {
      await runTransaction(db, async (tx) => {
        const refs  = numeros.map(n => doc(db, 'numerosReservados', String(n).padStart(3, '0')));
        const snaps = await Promise.all(refs.map(r => tx.get(r)));
        const agora = Date.now();

        const ocupados = snaps
          .map((snap, i) => ({ snap, numero: numeros[i] }))
          .filter(({ snap }) => {
            if (!snap.exists()) return false;
            const data = snap.data();
            if (data.status === 'pago') return true; 
            if (data.status === 'reservado' && (agora - (data.ts || 0) < EXPIRACAO_MS)) {
              return true; 
            }
            return false;
          })
          .map(({ numero }) => numero);

        if (ocupados.length > 0) {
          const err = new Error('conflito');
          err.ocupados = ocupados;
          throw err;
        }

        tx.set(doc(db, 'pedidos', novoPedidoId), {
          id: novoPedidoId,
          nome: dados.nome,
          cpf: dados.cpf,
          tel: dados.telefone,
          email: dados.email,
          endereco: dados.endereco,
          vendedor: dados.vendedor,
          nums: numeros,
          valor: valorCobrado,
          status: 'pendente',
          temComprovante: false,
          ts: agora
        });

        refs.forEach((ref, i) => {
          tx.set(ref, {
            numero:   String(numeros[i]).padStart(3, '0'),
            status:   'reservado',
            pedidoId: novoPedidoId,
            ts:       agora
          });
        });
      });

      setPedidoIdGerado(novoPedidoId);
      setEtapa('pagamento_pix');
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      if (err.ocupados) {
        setNumerosConflito(err.ocupados);
      } else {
        alert("Erro ao registrar. Tente novamente.");
        console.error(err);
      }
    } finally {
      setACarregar(false);
    }
  };

  const copiarPix = async () => {
    await navigator.clipboard.writeText(CHAVE_PIX);
    setPixCopiado(true);
  };

  // 🚀 ADICIONADA A OPÇÃO DE ENTRAR NO GRUPO DA FESTA NA MENSAGEM PADRÃO
  const getWhatsAppUrl = () => {
    const valor = Number(valorCobrado).toFixed(2).replace('.', ',');
    const msg = 
      `Olá Marcelo!\n` +
      `Sou *${dados.nome}* e acabei de fazer minha reserva na Rifa Pratique.\n\n` +
      `*DADOS DA RESERVA*\n` +
      `- *Pedido:* #${pedidoIdGerado}\n` +
      `- *Nome:* ${dados.nome}\n` +
      `- *CPF:* ${dados.cpf}\n` +
      `- *Indicado por:* ${dados.vendedor}\n` +
      `- *Números:* ${numeros.join(", ")}\n` +
      `- *Valor:* R$ ${valor}\n\n` +
      `*SOBRE O SORTEIO:*\n` +
      `- *Data:* 22/07 às 20h\n` +
      `- *Local:* Pratique Fitness Santa Inês II\n` +
      `- *Endereço:* Av. José Cândido da Silveira, 2790\n\n` +
      `*Acesse este link para entrar no meu grupo do WhatsApp e ficar por dentro das novidades também:*\n` +
      `https://chat.whatsapp.com/Lfr9XwUhud6BhhY5dK58N8?s=sh&p=a&mlu=2&amv=0\n\n` +
      `Segue em anexo o meu comprovante PIX!`;

    return `https://wa.me/${NUMERO_WHATSAPP_ADMIN}?text=${encodeURIComponent(msg)}`;
  };

  const handleEnviarWhatsApp = async () => {
    setACarregar(true);
    try {
      const url = getWhatsAppUrl();
      window.open(url, '_blank');
      await updateDoc(doc(db, 'pedidos', pedidoIdGerado), { temComprovante: true });
      setEtapa('sucesso');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      setEtapa('sucesso'); 
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setACarregar(false);
    }
  };

  const handleSalvarAgenda = () => {
    const titulo = encodeURIComponent('Sorteio Oficial - Rifa Pratique');
    const detalhes = encodeURIComponent('Chegou o grande dia do sorteio oficial da Rifa Pratique! Boa sorte!');
    const local = encodeURIComponent('Pratique Fitness Santa Inês II - Av. José Cândido da Silveira, 2790');
    const datas = '20260722T230000Z/20260723T000000Z'; 
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${datas}&details=${detalhes}&location=${local}`;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl transition-colors">

      {/* ══════════ ETAPA 1: FORMULÁRIO ══════════ */}
      {etapa === 'formulario' && (
        <>
          <button onClick={onVoltar} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-6 flex items-center gap-1 text-sm">
            <ArrowLeft size={16} /> Voltar
          </button>

          <h2 className="text-2xl font-bold mb-2 text-center text-zinc-900 dark:text-white flex items-center justify-center gap-2">
            <UserList size={24} className="text-orange-500" /> Cadastro Oficial
          </h2>
          <p className="text-center text-zinc-500 mb-6 text-sm">
            Total: <span className="text-green-600 font-black text-lg">R$ {valorCobrado.toFixed(2)}</span>
          </p>

          {numerosConflito.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-lg p-4 mb-4 text-center">
              <p className="text-red-700 dark:text-red-300 font-bold text-sm mb-1">
                Número(s) esgotado(s) agora mesmo
              </p>
              <p className="text-red-600 dark:text-red-400 text-xs mb-2">
                Os números <strong>{numerosConflito.join(', ')}</strong> foram reservados por outra pessoa no mesmo instante.
              </p>
              <p className="text-red-500 text-xs">Volte e escolha outros números.</p>
            </div>
          )}

          <form onSubmit={handleGerarReserva} className="space-y-3">
            <input required type="text" name="nome" placeholder="Nome Completo"
              value={dados.nome} onChange={handleChange}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />

            <input required type="text" name="cpf" placeholder="CPF"
              value={dados.cpf} onChange={handleChange} maxLength="14"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />

            <input required type="tel" name="telefone" placeholder="WhatsApp"
              value={dados.telefone} onChange={handleChange} maxLength="15"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />

            <input required type="email" name="email" placeholder="E-mail"
              value={dados.email} onChange={handleChange}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />

            {vendedores.length > 0 && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Storefront size={20} className="text-zinc-500" />
                </div>
                <select required name="vendedor" value={dados.vendedor} onChange={handleChange}
                  className="w-full pl-10 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none appearance-none">
                  <option value="" disabled hidden>QUEM TE INDICOU? (OBRIGATÓRIO)</option>
                  {[...new Set(vendedores.map(v => v.unidade))].sort().map(unidade => (
                    <optgroup key={unidade} label={unidade}>
                      {vendedores.filter(v => v.unidade === unidade).map(v => (
                        <option key={v.nome} value={v.nome}>{v.nome}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            <textarea required name="endereco" placeholder="Endereço Completo"
              value={dados.endereco} onChange={handleChange} rows="2"
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none resize-none" />

            <button type="submit" disabled={aCarregar}
              className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-400 text-white font-bold py-3.5 rounded-lg mt-6 shadow-lg text-lg">
              {aCarregar ? 'Verificando...' : 'Prosseguir para o PIX'}
            </button>

            {numerosConflito.length > 0 && (
              <button type="button" onClick={onVoltar}
                className="w-full border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-lg text-sm">
                Voltar e escolher outros números
              </button>
            )}
          </form>
        </>
      )}

      {/* ══════════ ETAPA 2: PIX E ENVIO DE COMPROVANTE ══════════ */}
      {etapa === 'pagamento_pix' && (
        <div className="animate-fade-in">
          
          <div className="bg-red-600 border-2 border-red-800 rounded-xl p-4 mb-6 shadow-lg relative overflow-hidden text-center">
             <div className="absolute top-0 right-0 p-2 opacity-20"><WarningCircle size={64} weight="fill" /></div>
             <p className="text-white font-black uppercase text-sm tracking-widest mb-1 relative z-10 flex justify-center items-center gap-2">
               <Info size={18} weight="bold" /> Atenção!
             </p>
             <p className="text-red-100 font-medium text-sm relative z-10">
               Sua reserva <strong>SÓ SERÁ CONFIRMADA</strong> após você enviar o comprovante no WhatsApp. Siga os 2 passos abaixo!
             </p>
          </div>

          {/* CRONÔMETRO VERMELHO GIGANTE */}
          {!tempoEsgotado ? (
            <div className="flex flex-col justify-center items-center gap-1 text-zinc-800 dark:text-zinc-200 mb-6 font-black text-lg bg-red-50 dark:bg-red-900/10 py-5 rounded-2xl border-2 border-red-200 dark:border-red-900/40 shadow-inner">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-500 uppercase tracking-widest text-xs sm:text-sm">
                <Timer size={20} weight="bold" /> Pague e confirme em:
              </div>
              <span className="text-red-600 dark:text-red-500 text-5xl sm:text-6xl font-black drop-shadow-sm tracking-tighter animate-pulse">{tempoFormatado}</span>
            </div>
          ) : (
            <div className="text-center text-red-500 font-bold mb-6 flex flex-col items-center bg-red-50 dark:bg-red-900/10 py-4 rounded-xl border border-red-200 dark:border-red-900/30">
              <WarningCircle size={32} weight="fill" className="mb-2" /> Tempo esgotado! Corra para não perder a reserva.
            </div>
          )}

          {/* 1º PASSO: APENAS COPIE A CHAVE PIX */}
          <div className={`p-5 rounded-2xl border-2 transition-all duration-300 mb-5 ${pixCopiado ? 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 opacity-60' : 'bg-orange-50 dark:bg-orange-950/20 border-orange-500 shadow-md'}`}>
            <h3 className="font-black text-orange-600 dark:text-orange-500 uppercase tracking-widest text-sm sm:text-base mb-2">
              1º Passo: Apenas copie a chave PIX
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Valor a transferir:</p>
            <p className="text-3xl font-black text-green-600 mb-4">R$ {valorCobrado.toFixed(2)}</p>
            
            <button onClick={copiarPix}
              className="bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-black py-4 px-4 rounded-xl w-full flex justify-center items-center gap-2 transition-all text-base uppercase tracking-wide">
              <Copy size={20} weight="bold" /> {pixCopiado ? 'CHAVE COPIADA COM SUCESSO!' : 'COPIAR CHAVE PIX'}
            </button>
          </div>

          {/* 2º PASSO: INSTRUÇÃO DO WHATSAPP */}
          <div className={`p-5 rounded-2xl border-2 transition-all duration-300 ${pixCopiado ? 'bg-[#25D366]/10 border-[#25D366] shadow-lg shadow-[#25D366]/20' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}>
            <h3 className="font-black text-[#25D366] uppercase tracking-widest text-sm sm:text-base mb-2">
              2º Passo:
            </h3>
            <p className="text-sm sm:text-base font-bold text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed">
              Envie agora para esse número para confirmar o seu número da rifa e também para enviar o comprovante.
            </p>
            
            <button onClick={handleEnviarWhatsApp} disabled={aCarregar}
              className={`w-full text-white font-black py-4 rounded-xl flex justify-center items-center gap-2 text-lg transition-all shadow-md uppercase tracking-wider ${pixCopiado ? 'bg-[#25D366] hover:bg-[#1ebe57] animate-pulse scale-[1.02] shadow-xl shadow-[#25D366]/40' : 'bg-zinc-400 dark:bg-zinc-700 hover:bg-[#25D366]'}`}>
              <WhatsappLogo size={26} weight="fill" /> CLIQUE AQUI PARA ENVIAR
            </button>
          </div>
        </div>
      )}

      {/* ══════════ ETAPA 3: SUCESSO E RESGATE ══════════ */}
      {etapa === 'sucesso' && (
        <div className="text-center animate-fade-in py-8 relative">
          
          <Confetti 
            width={windowSize.width} 
            height={windowSize.height} 
            recycle={false} 
            numberOfPieces={600}
            gravity={0.15}
            style={{ position: 'fixed', top: 0, left: 0, zIndex: 99999, pointerEvents: 'none' }}
          />

          <CheckCircle size={72} weight="fill" className="text-green-500 mx-auto mb-4 relative z-10" />
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2 relative z-10">Tudo Certo!</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8 relative z-10">Agora aguarde a nossa validação no WhatsApp.</p>

          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-500 p-5 rounded-2xl mb-8 shadow-xl animate-pulse relative z-10">
            <h3 className="text-red-600 dark:text-red-400 font-black uppercase text-lg mb-2 flex items-center justify-center gap-2">
              <WarningCircle size={24} weight="bold" /> Faltou enviar o PIX?
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4 font-medium">
              Se a tela do seu WhatsApp não abriu no passo anterior, não se preocupe! Clique no botão abaixo para enviar o comprovante agora, ou sua reserva não será validada.
            </p>
            <a 
              href={getWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#25D366] hover:bg-[#1ebe57] text-white font-black py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/40 text-[16px] sm:text-lg uppercase tracking-wide hover:scale-[1.02]"
            >
              <WhatsappLogo size={28} weight="fill" /> ENVIE SEU COMPROVANTE AQUI
            </a>
          </div>
          
          <button onClick={handleSalvarAgenda}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-lg transition-colors flex items-center justify-center gap-2 mb-4 shadow-lg shadow-blue-600/20 relative z-10">
            <CalendarPlus size={24} weight="bold" /> Salvar Sorteio na Agenda
          </button>

          <button onClick={onSucesso}
            className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold py-3 rounded-lg transition-colors relative z-10">
            Voltar ao Início
          </button>
        </div>
      )}
    </div>
  );
}
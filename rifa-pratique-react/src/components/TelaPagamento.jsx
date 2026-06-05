import { useState, useEffect } from 'react';
import { ArrowLeft, Copy, CheckCircle, WhatsappLogo, UserList, Receipt, Timer, WarningCircle, Storefront } from '@phosphor-icons/react';
import { doc, setDoc, updateDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

export default function TelaPagamento({ numeros, valorCobrado, onVoltar, onSucesso }) {
  const [etapa, setEtapa] = useState('formulario');
  const [pedidoIdGerado, setPedidoIdGerado] = useState(null);
  const [aCarregar, setACarregar] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(900); 
  const [tempoEsgotado, setTempoEsgotado] = useState(false);
  const [vendedores, setVendedores] = useState([]);

  const [dados, setDados] = useState({
    nome: '', cpf: '', telefone: '', email: '', endereco: '', vendedor: ''
  });

  const CHAVE_PIX = "lemosmjlp@gmail.com";
  const NUMERO_WHATSAPP_ADMIN = "5531973483934"; 

// ─── BUSCA VENDEDORES ATIVOS ─────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vendedores'), (snapshot) => {
      const lista = snapshot.docs
        .map(doc => doc.data())
        .filter(data => data.ativo !== false) // Só puxa os ativos
        .map(data => ({
          nome: String(data.nome).toUpperCase(),
          unidade: String(data.unidade || 'SANTA INÊS 1').toUpperCase()
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome)); // Ordena A-Z
      
      setVendedores(lista);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (etapa !== 'pagamento_pix' || tempoEsgotado) return;
    if (tempoRestante <= 0) { setTempoEsgotado(true); return; }
    const intervalo = setInterval(() => setTempoRestante(p => p - 1), 1000);
    return () => clearInterval(intervalo);
  }, [etapa, tempoRestante, tempoEsgotado]);

  const minutos = Math.floor(tempoRestante / 60);
  const segundos = tempoRestante % 60;
  const tempoFormatado = `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;

  const formatarCPF = (valor) => valor.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1');
  const formatarTelefone = (valor) => valor.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{4})\d+?$/, '$1');

  const handleChange = (e) => {
    const { name, value } = e.target;
    let formatado = value;
    if (name === 'cpf') formatado = formatarCPF(value);
    if (name === 'telefone') formatado = formatarTelefone(value);
    setDados({ ...dados, [name]: formatado });
  };

  const handleGerarReserva = async (e) => {
    e.preventDefault();
    if (dados.cpf.length < 14 || dados.telefone.length < 14) {
      alert("Preencha CPF e WhatsApp corretamente.");
      return;
    }
    if (!dados.vendedor) {
      alert("Por favor, selecione quem indicou a rifa.");
      return;
    }

    setACarregar(true);
    const novoPedidoId = 'P' + Date.now();

    try {
      await setDoc(doc(db, 'pedidos', novoPedidoId), {
        id: novoPedidoId, nome: dados.nome, cpf: dados.cpf, tel: dados.telefone, 
        email: dados.email, endereco: dados.endereco, vendedor: dados.vendedor,
        nums: numeros, valor: valorCobrado, status: 'pendente', temComprovante: false, ts: Date.now()
      });
      setPedidoIdGerado(novoPedidoId);
      setEtapa('pagamento_pix');
    } catch (err) { alert("Erro ao registar."); } 
    finally { setACarregar(false); }
  };

  const copiarPix = async () => {
    await navigator.clipboard.writeText(CHAVE_PIX);
    alert("Chave PIX copiada!");
  };

  const handleEnviarWhatsApp = async () => {
    setACarregar(true);
    try {
      await updateDoc(doc(db, 'pedidos', pedidoIdGerado), { temComprovante: true });

      const valor = Number(valorCobrado).toFixed(2).replace('.', ',');
      const mensagem =
        "Ola Marcelo!\n" +
        "Sou *" + dados.nome + "* e acabei de fazer minha reserva na Rifa Pratique.\n\n" +
        "*Pedido:* #" + pedidoIdGerado + "\n" +
        "*CPF:* " + dados.cpf + "\n" +
        "*Numeros reservados:* " + numeros.join(", ") + "\n" +
        "*Valor pago:* R$ " + valor + "\n\n" +
        "Segue o comprovante do PIX em anexo.";

      window.open(`https://wa.me/${NUMERO_WHATSAPP_ADMIN}?text=${encodeURIComponent(mensagem)}`, '_blank');
      setEtapa('sucesso');
    } finally { setACarregar(false); }
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl transition-colors">
      
      {etapa === 'formulario' && (
        <>
          <button onClick={onVoltar} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-6 flex items-center gap-1 text-sm"><ArrowLeft size={16} /> Voltar</button>
          <h2 className="text-2xl font-bold mb-2 text-center text-zinc-900 dark:text-white flex items-center justify-center gap-2"><UserList size={24} className="text-orange-500" /> Cadastro Oficial</h2>
          <p className="text-center text-zinc-500 mb-6 text-sm">Total: <span className="text-green-600 font-black text-lg">R$ {valorCobrado.toFixed(2)}</span></p>
          
          <form onSubmit={handleGerarReserva} className="space-y-3">
            <input required type="text" name="nome" placeholder="Nome Completo" value={dados.nome} onChange={handleChange} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />
            <input required type="text" name="cpf" placeholder="CPF" value={dados.cpf} onChange={handleChange} maxLength="14" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />
            <input required type="tel" name="telefone" placeholder="WhatsApp" value={dados.telefone} onChange={handleChange} maxLength="15" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />
            <input required type="email" name="email" placeholder="E-mail" value={dados.email} onChange={handleChange} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none" />
            
            {vendedores.length > 0 && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Storefront size={20} className="text-zinc-500" />
                </div>
                <select required name="vendedor" value={dados.vendedor} onChange={handleChange} className="w-full pl-10 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none appearance-none">
                  <option value="" disabled hidden>QUEM TE INDICOU? (OBRIGATÓRIO)</option>
                  
                  {/* Agrupa as unidades dinamicamente em ordem alfabética */}
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

            <textarea required name="endereco" placeholder="Endereço Completo" value={dados.endereco} onChange={handleChange} rows="2" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-white focus:border-orange-500 focus:outline-none resize-none"></textarea>
            
            <button type="submit" disabled={aCarregar} className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-400 text-white font-bold py-3.5 rounded-lg mt-6 shadow-lg text-lg">
              {aCarregar ? 'A processar...' : 'Prosseguir para o PIX'}
            </button>
          </form>
        </>
      )}

      {etapa === 'pagamento_pix' && (
        <div className="text-center animate-fade-in">
          {!tempoEsgotado ? (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-6 flex flex-col items-center">
              <span className="flex items-center gap-2 text-red-600 font-bold mb-1"><Timer size={20} weight="fill" /> Pagamento Pendente</span>
              <span className="text-red-800 dark:text-red-200 text-sm">Pague em <strong className="text-xl text-white bg-red-600 px-2 rounded mx-1">{tempoFormatado}</strong> para não perder!</span>
            </div>
          ) : (
             <div className="bg-orange-50 dark:bg-orange-950/50 border border-orange-300 dark:border-orange-900 rounded-lg p-3 mb-6 flex flex-col items-center">
              <span className="flex items-center gap-2 text-orange-600 font-bold mb-1"><WarningCircle size={24} weight="fill" /> Tempo Esgotado!</span>
              <span className="text-orange-800 dark:text-orange-200 text-sm">Sua reserva pode expirar. <strong>Pague agora</strong> para garantir!</span>
            </div>
          )}
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Efetue o Pagamento</h2>
          <div className="bg-zinc-50 dark:bg-zinc-950 p-5 rounded-lg border border-zinc-200 dark:border-zinc-800 mb-8">
            <p className="text-sm text-zinc-500 mb-1">Valor a pagar agora:</p>
            <p className="text-3xl font-black text-green-600 mb-6">R$ {valorCobrado.toFixed(2)}</p>
            <p className="text-sm text-zinc-500 mb-1">Chave PIX</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-white mb-3 break-all">{CHAVE_PIX}</p>
            <button onClick={copiarPix} className="bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-900 dark:text-white font-bold py-3 px-4 rounded-lg w-full flex justify-center gap-2 border"><Copy size={18} /> Copiar Chave</button>
          </div>
          <button onClick={handleEnviarWhatsApp} disabled={aCarregar} className="w-full bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold py-4 rounded-lg flex justify-center gap-2 text-lg shadow-lg"><WhatsappLogo size={28} weight="fill" /> Enviar Comprovante</button>
        </div>
      )}

      {etapa === 'sucesso' && (
        <div className="text-center animate-fade-in py-8">
          <CheckCircle size={72} weight="fill" className="text-green-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-3">Tudo Certo!</h2>
          <button onClick={onSucesso} className="w-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold py-3 rounded-lg">Voltar ao Início</button>
        </div>
      )}
    </div>
  );
}
require('dotenv').config();
 
const express = require('express');
const OpenAI = require('openai');
const { db, gerarCodigo } = require('./db');
 
const app = express();
app.use(express.json());
 
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
 
const PORT = process.env.PORT || 3000;
 
app.get('/', (req, res) => {
  res.send('Bot financeiro rodando.');
});
 
// Verificação do webhook da Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
 
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
 
  return res.sendStatus(403);
});
 
// Recebe mensagens do WhatsApp
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
 
  try {
    console.log('📨 Webhook recebido:', JSON.stringify(req.body, null, 2));
 
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
 
    if (!msg || msg.type !== 'text') {
      console.log('⚠️ Mensagem ignorada (não é texto ou não tem mensagem)');
      return;
    }
 
    const from = msg.from;
    const texto = msg.text?.body?.trim();
 
    console.log(`📩 Mensagem de ${from}: "${texto}"`);
 
    if (!texto) return;
 
    const resposta = await processarMensagem(texto);
    console.log(`📤 Enviando resposta: "${resposta}"`);
 
    await enviarMensagem(from, resposta);
  } catch (error) {
    console.error('Erro no webhook:', error);
  }
});
 
async function processarMensagem(texto) {
  const textoNormalizado = texto.trim().toLowerCase();
 
  if (/^resumo$/.test(textoNormalizado)) {
    return gerarResumoHoje();
  }
 
  if (/^resumo mes$|^resumo mês$/.test(textoNormalizado)) {
    return gerarResumoMes();
  }
 
  if (/^historico$|^histórico$/.test(textoNormalizado)) {
    return listarUltimosGastos();
  }
 
  if (/^apagar ultimo$|^apagar último$/.test(textoNormalizado)) {
    return apagarUltimoGasto();
  }
 
  // Tenta cancelar pelo código: "cancelar L003"
  const cancelarMatch = textoNormalizado.match(/^cancelar\s+(l\d+)$/);
  if (cancelarMatch) {
    return cancelarPorCodigo(cancelarMatch[1].toUpperCase());
  }
 
  // Tenta interpretar como gasto via IA
  const resultado = await interpretarGasto(texto);
 
  if (!resultado) {
    return (
      '⚠️ Não consegui identificar esse gasto.\n\n' +
      'Tente escrever assim:\n' +
      '• pizza 45\n' +
      '• gasolina 60\n' +
      '• mercado 120,50\n\n' +
      'Ou escolha um comando:\n' +
      '📊 resumo\n' +
      '📅 resumo mês\n' +
      '🧾 histórico\n' +
      '🗑️ apagar último'
    );
  }
 
  // Salva o gasto
  const codigo = gerarCodigo();
  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString('pt-BR'); // ex: 10/04/2025
 
  try {
    db.prepare(`
      INSERT INTO gastos (codigo, descricao, categoria, valor)
      VALUES (?, ?, ?, ?)
    `).run(codigo, resultado.descricao, resultado.categoria, resultado.valor);
  } catch (err) {
    console.error('Erro ao salvar no banco:', err);
    return '❌ Erro ao salvar o gasto. Tente novamente.';
  }
 
  return (
    `✅ Gasto confirmado\n` +
    `${resultado.descricao} (${resultado.categoria})\n` +
    `R$ ${resultado.valor.toFixed(2).replace('.', ',')}\n` +
    `${dataFormatada} - #${codigo}`
  );
}
 
async function interpretarGasto(texto) {
  try {
    const resposta = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `
Você interpreta mensagens de gastos pessoais em português.
Responda APENAS JSON válido, sem explicações, sem markdown.
Se não for claramente um gasto com valor, responda somente: null
 
Categorias permitidas (use exatamente assim):
Alimentação
Transporte
Investimentos
Bebidas Alcoólicas
Mercado
Saúde
Lazer
Casa
Outros
 
Formato exato (sem aspas extras, sem comentários):
{"descricao":"Pizza","categoria":"Alimentação","valor":45.00}
 
Exemplos:
"pizza 45" → {"descricao":"Pizza","categoria":"Alimentação","valor":45.00}
"gasolina 60" → {"descricao":"Gasolina","categoria":"Transporte","valor":60.00}
"remédio 32,50" → {"descricao":"Remédio","categoria":"Saúde","valor":32.50}
"oi tudo bem" → null
`
        },
        {
          role: 'user',
          content: texto
        }
      ]
    });
 
    const conteudo = resposta.choices[0].message.content.trim();
 
    if (conteudo === 'null') return null;
 
    // Remove possíveis blocos markdown da resposta
    const limpo = conteudo.replace(/```json|```/g, '').trim();
    const json = JSON.parse(limpo);
 
    if (
      !json ||
      typeof json.descricao !== 'string' ||
      typeof json.categoria !== 'string' ||
      typeof json.valor !== 'number'
    ) {
      return null;
    }
 
    return {
      descricao: json.descricao.trim(),
      categoria: json.categoria.trim(),
      valor: Number(json.valor)
    };
  } catch (error) {
    console.error('Erro ao interpretar gasto:', error);
    return null;
  }
}
 
function gerarResumoHoje() {
  const hoje = new Date().toISOString().split('T')[0];
 
  const gastos = db.prepare(`
    SELECT categoria, SUM(valor) AS total
    FROM gastos
    WHERE data = ?
    GROUP BY categoria
    ORDER BY total DESC
  `).all(hoje);
 
  if (!gastos.length) {
    return '📭 Nenhum gasto registrado hoje.';
  }
 
  const total = gastos.reduce((acc, item) => acc + item.total, 0);
 
  let mensagem = '📊 Hoje você gastou:\n\n';
  for (const gasto of gastos) {
    mensagem += `• ${gasto.categoria}: R$ ${gasto.total.toFixed(2).replace('.', ',')}\n`;
  }
  mensagem += `\n💸 Total: R$ ${total.toFixed(2).replace('.', ',')}`;
 
  return mensagem;
}
 
function gerarResumoMes() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
 
  const gastos = db.prepare(`
    SELECT categoria, SUM(valor) AS total
    FROM gastos
    WHERE data LIKE ?
    GROUP BY categoria
    ORDER BY total DESC
  `).all(`${ano}-${mes}%`);
 
  if (!gastos.length) {
    return '📭 Nenhum gasto registrado neste mês.';
  }
 
  const total = gastos.reduce((acc, item) => acc + item.total, 0);
 
  let mensagem = '📅 Resumo do mês:\n\n';
  for (const gasto of gastos) {
    mensagem += `• ${gasto.categoria}: R$ ${gasto.total.toFixed(2).replace('.', ',')}\n`;
  }
  mensagem += `\n💸 Total do mês: R$ ${total.toFixed(2).replace('.', ',')}`;
 
  return mensagem;
}
 
function listarUltimosGastos() {
  const gastos = db.prepare(`
    SELECT codigo, descricao, categoria, valor, data
    FROM gastos
    ORDER BY id DESC
    LIMIT 10
  `).all();
 
  if (!gastos.length) {
    return '📭 Nenhum gasto registrado.';
  }
 
  let mensagem = '🧾 Últimos gastos:\n\n';
  for (const gasto of gastos) {
    const data = new Date(gasto.data + 'T00:00:00').toLocaleDateString('pt-BR');
    mensagem += `#${gasto.codigo} - ${gasto.descricao} - R$ ${gasto.valor.toFixed(2).replace('.', ',')} (${gasto.categoria}) - ${data}\n`;
  }
  mensagem += '\nPara cancelar: cancelar L001';
 
  return mensagem;
}
 
function apagarUltimoGasto() {
  const ultimo = db.prepare(`
    SELECT id, codigo, descricao, valor
    FROM gastos
    ORDER BY id DESC
    LIMIT 1
  `).get();
 
  if (!ultimo) {
    return '📭 Não há gasto para apagar.';
  }
 
  db.prepare(`DELETE FROM gastos WHERE id = ?`).run(ultimo.id);
 
  return `🗑️ Gasto apagado:\n#${ultimo.codigo} - ${ultimo.descricao} - R$ ${ultimo.valor.toFixed(2).replace('.', ',')}`;
}
 
function cancelarPorCodigo(codigo) {
  const gasto = db.prepare(`
    SELECT id, codigo, descricao, valor
    FROM gastos
    WHERE codigo = ?
  `).get(codigo);
 
  if (!gasto) {
    return `❌ Não encontrei nenhum gasto com o código #${codigo}.\n\nUse "histórico" para ver os códigos disponíveis.`;
  }
 
  db.prepare(`DELETE FROM gastos WHERE id = ?`).run(gasto.id);
 
  return `🗑️ Gasto cancelado:\n#${gasto.codigo} - ${gasto.descricao} - R$ ${gasto.valor.toFixed(2).replace('.', ',')}`;
}
 
async function enviarMensagem(para, texto) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: para,
          type: 'text',
          text: { body: texto }
        })
      }
    );
 
    const data = await response.json();
 
    if (!response.ok) {
      console.error('❌ Erro ao enviar mensagem:', JSON.stringify(data, null, 2));
    } else {
      console.log('✅ Mensagem enviada com sucesso!');
    }
  } catch (error) {
    console.error('❌ Erro de envio:', error);
  }
}
 
app.listen(PORT, () => {
  console.log(`Bot rodando na porta ${PORT}`);
});
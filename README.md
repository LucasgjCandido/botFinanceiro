Bot Financeiro WhatsApp
Este projeto é um bot pessoal para controle de gastos diretamente pelo WhatsApp. Ele permite registrar despesas, consultar históricos e gerar resumos financeiros de forma rápida usando mensagens simples.
Funcionalidades
Registro de gastos por mensagem
Resumo de gastos do dia
Resumo de gastos do mês
Consulta dos últimos gastos registrados
Exclusão do último gasto
Cancelamento de gasto pelo código
Exemplos de uso


pizza 45 → registra gasto


resumo → mostra resumo do dia


resumo mês → mostra resumo do mês


histórico → mostra últimos 10 gastos


apagar último → apaga último gasto


cancelar L003 → cancela gasto pelo código


Tecnologias utilizadas
Node.js
Express
WhatsApp Cloud API (Meta)
OpenAI GPT-4o-mini
SQLite
Objetivo
Praticar integração com APIs, uso de inteligência artificial para interpretar mensagens e desenvolvimento de um sistema simples de controle financeiro automatizado via WhatsApp.
Estrutura do projeto
server.js → servidor principal
database.db → banco de dados com os gastos
routes → rotas da aplicação
services → processamento das mensagens
controllers → controle das requisições
utils → funções auxiliares

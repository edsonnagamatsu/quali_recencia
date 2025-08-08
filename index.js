require('dotenv').config();  // Carregar variáveis de ambiente

const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Conexão com PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'ngdbpost01.co5s88m0usk0.us-east-1.rds.amazonaws.com',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'nivus2022ram2025',
  database: process.env.DB_NAME || 'ngdbqlc_01',
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false } // Para RDS
});

// Middleware de autenticação simples
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

  const token = authHeader.split(' ')[1];
  if (token !== process.env.AUTH_TOKEN) {
    return res.status(403).json({ error: 'Token inválido' });
  }
  next();
}

// Função para garantir valores booleanos
function toBoolean(value) {
  return value === 'true' || value === true;
}

// Inserir nova interação
app.post('/interacoes', authMiddleware, async (req, res) => {
  const {
    data,
    ani,
    callid,
    cpf,
    solicitou_fatura,
    solicitou_recibo,
    solicitou_ir,
    solicitou_carteirinha
  } = req.body;

  try {
    const sql = `
      INSERT INTO interacoes (
        data, ani, callid, cpf,
        solicitou_fatura, solicitou_recibo,
        solicitou_ir, solicitou_carteirinha
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const values = [
      data,
      ani,
      callid,
      cpf,
      toBoolean(solicitou_fatura),
      toBoolean(solicitou_recibo),
      toBoolean(solicitou_ir),
      toBoolean(solicitou_carteirinha)
    ];

    await pool.query(sql, values);
    res.status(201).json({ message: 'Interação inserida com sucesso' });
  } catch (error) {
    console.error('Erro ao inserir interação:', error);
    res.status(500).json({ error: 'Erro ao inserir' });
  }
});

// Atualizar campos booleanos dinamicamente com base no callid
app.patch('/interacoes/:callid', authMiddleware, async (req, res) => {
  const { callid } = req.params;
  const campos = ['solicitou_fatura', 'solicitou_recibo', 'solicitou_ir', 'solicitou_carteirinha'];
  const atualizacoes = [];
  const valores = [];

  campos.forEach((campo, idx) => {
    if (req.body.hasOwnProperty(campo)) {
      // Garantir que o valor seja booleano
      const valor = toBoolean(req.body[campo]);
      atualizacoes.push(`${campo} = $${idx + 1}`);
      valores.push(valor);
    }
  });

  if (atualizacoes.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });
  }

  try {
    const sql = `UPDATE interacoes SET ${atualizacoes.join(', ')} WHERE callid = $${valores.length + 1}`;
    valores.push(callid); // Adicionar o valor do callid no final
    await pool.query(sql, valores);
    res.json({ message: 'Interação atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar interação:', error);
    res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

// Buscar interações com filtros
app.get('/interacoes', authMiddleware, async (req, res) => {
  const { cpf, tipo, horas } = req.query;
  const campos = {
    fatura: 'solicitou_fatura',
    recibo: 'solicitou_recibo',
    ir: 'solicitou_ir',
    carteirinha: 'solicitou_carteirinha'
  };

  const filtros = [];
  const valores = [];
  let idx = 1;

  if (cpf) {
    filtros.push(`cpf = $${idx++}`);
    valores.push(cpf);
  }

  if (tipo && campos[tipo]) {
    filtros.push(`${campos[tipo]} = true`);
  }

  if (horas) {
    filtros.push(`data >= NOW() - INTERVAL '${horas} HOURS'`);
  }

  const sql = `
    SELECT cpf, ${Object.values(campos).join(', ')}, data
    FROM interacoes
    ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
  `;

  try {
    const result = await pool.query(sql, valores);
    res.json({ registros: result.rows });
  } catch (error) {
    console.error('Erro ao buscar interações:', error);
    res.status(500).json({ error: 'Erro ao buscar interações' });
  }
});

app.listen(port, () => {
  console.log(`API rodando na porta ${port}`);
});

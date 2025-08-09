import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(bodyParser.json());

// Configuração do banco
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Middleware simples de autenticação por token
app.use((req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
});

// Rota para inserir ou atualizar interações
app.post('/interacoes', async (req, res) => {
  try {
    const { id, descricao } = req.body;
    if (!id || !descricao) {
      return res.status(400).json({ error: 'Campos obrigatórios: id, descricao' });
    }

    const result = await pool.query(
      `INSERT INTO interacoes (id, descricao)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET descricao = EXCLUDED.descricao
       RETURNING *`,
      [id, descricao]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Iniciar servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API rodando na porta ${port}`);
});

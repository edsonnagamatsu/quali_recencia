require('dotenv').config(); // Carregar variáveis de ambiente

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
  if (token !== 'jxmVZ2P9atWHVOxWtLVkbLeGouxxXTEUyMb5ZTVQw9U=') {
    return res.status(403).json({ error: 'Token inválido' });
  }
  next();
}

// Função para garantir valores booleanos
function toBoolean(value) {
  return value === 'true' || value === true || value === 1 || value === '1';
}

// ===================== ROTAS =====================

// Atualizar flags pelo callid (PATCH) — agora só confirma sucesso se a linha existir
app.patch('/interacoes/:callid', authMiddleware, async (req, res) => {
  const { callid } = req.params;
  const campos = ['solicitou_fatura', 'solicitou_recibo', 'solicitou_ir', 'solicitou_carteirinha'];
  const atualizacoes = [];
  const valores = [];

  let paramIndex = 1;

  campos.forEach(campo => {
    if (Object.prototype.hasOwnProperty.call(req.body, campo)) {
      const valor = toBoolean(req.body[campo]);
      atualizacoes.push(`${campo} = $${paramIndex}`);
      valores.push(valor);
      paramIndex++;
    }
  });

  if (atualizacoes.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo válido para atualizar.' });
  }

  try {
    const sql = `
      UPDATE interacoes
      SET ${atualizacoes.join(', ')}
      WHERE callid = $${paramIndex}
      RETURNING callid, ${campos.join(', ')}
    `;
    valores.push(callid);
    const result = await pool.query(sql, valores);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'callid não encontrado. Use POST /interacoes/:callid para criá-lo.' });
    }

    res.json({ message: 'Interação atualizada com sucesso', updated: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar interação:', error);
    res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

// Buscar interações (GET)
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
    ORDER BY data DESC NULLS LAST
  `;

  try {
    const result = await pool.query(sql, valores);
    res.json({ registros: result.rows });
  } catch (error) {
    console.error('Erro ao buscar interações:', error);
    res.status(500).json({ error: 'Erro ao buscar interações' });
  }
});

// Contar interações (GET /interacoes/count)
app.get('/interacoes/count', authMiddleware, async (req, res) => {
  const { cpf, solicitou_fatura, solicitou_recibo, solicitou_ir, solicitou_carteirinha, dias } = req.query;

  const filtros = [];
  const valores = [];
  let idx = 1;

  if (cpf) {
    filtros.push(`cpf = $${idx++}`);
    valores.push(cpf);
  }
  if (solicitou_fatura !== undefined) {
    filtros.push(`solicitou_fatura = $${idx++}`);
    valores.push(toBoolean(solicitou_fatura));
  }
  if (solicitou_recibo !== undefined) {
    filtros.push(`solicitou_recibo = $${idx++}`);
    valores.push(toBoolean(solicitou_recibo));
  }
  if (solicitou_ir !== undefined) {
    filtros.push(`solicitou_ir = $${idx++}`);
    valores.push(toBoolean(solicitou_ir));
  }
  if (solicitou_carteirinha !== undefined) {
    filtros.push(`solicitou_carteirinha = $${idx++}`);
    valores.push(toBoolean(solicitou_carteirinha));
  }
  if (dias) {
    filtros.push(`data >= NOW() - INTERVAL '${dias} DAYS'`);
  }

  const sql = `
    SELECT COUNT(*) AS total
    FROM interacoes
    ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
  `;

  try {
    const result = await pool.query(sql, valores);
    res.json({ total: parseInt(result.rows[0].total, 10) });
  } catch (error) {
    console.error('Erro ao contar interações:', error);
    res.status(500).json({ error: 'Erro ao contar interações' });
  }
});

// Upsert usando callid no PATH (/interacoes/:callid)
app.post('/interacoes/:callid', authMiddleware, async (req, res) => {
  const { callid } = req.params;
  const {
    ani = null,
    cpf = null,
    solicitou_fatura,
    solicitou_recibo,
    solicitou_ir,
    solicitou_carteirinha
  } = req.body || {};

  if (!callid) {
    return res.status(400).json({ error: 'callid é obrigatório' });
  }

  // normaliza strings vazias -> null
  const aniNorm = typeof ani === 'string' && ani.trim() === '' ? null : ani;
  const cpfNorm = typeof cpf === 'string' && cpf.trim() === '' ? null : cpf;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const exists = await client.query(
        'SELECT 1 FROM interacoes WHERE callid = $1 LIMIT 1',
        [callid]
      );

      if (exists.rowCount === 0) {
        // cria registro novo com data no fuso America/Sao_Paulo
        const insertSql = `
          INSERT INTO interacoes (
            data, ani, callid, cpf,
            solicitou_fatura, solicitou_recibo,
            solicitou_ir, solicitou_carteirinha
          )
          VALUES (
            (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
            $1, $2, $3, $4, $5, $6, $7
          )
          RETURNING callid, ani, cpf, solicitou_fatura, solicitou_recibo, solicitou_ir, solicitou_carteirinha, data
        `;
        const insertVals = [
          aniNorm,
          callid,
          cpfNorm,
          toBoolean(solicitou_fatura),
          toBoolean(solicitou_recibo),
          toBoolean(solicitou_ir),
          toBoolean(solicitou_carteirinha),
        ];
        const created = await client.query(insertSql, insertVals);
        await client.query('COMMIT');
        return res.status(201).json({ message: 'Criado com sucesso (callid novo).', created: created.rows[0] });
      } else {
        // atualiza apenas campos enviados (não altera a data)
        const sets = [];
        const vals = [];
        let i = 1;

        if (ani !== undefined) { sets.push(`ani = $${i++}`); vals.push(aniNorm); }
        if (cpf !== undefined) { sets.push(`cpf = $${i++}`); vals.push(cpfNorm); }

        const flags = {
          solicitou_fatura,
          solicitou_recibo,
          solicitou_ir,
          solicitou_carteirinha,
        };

        for (const k of Object.keys(flags)) {
          if (Object.prototype.hasOwnProperty.call(req.body, k)) {
            sets.push(`${k} = $${i++}`);
            vals.push(toBoolean(flags[k]));
          }
        }

        if (sets.length === 0) {
          await client.query('ROLLBACK');
          return res.status(200).json({ message: 'Já existia; nada para atualizar.' });
        }

        const updateSql = `UPDATE interacoes SET ${sets.join(', ')} WHERE callid = $${i} RETURNING callid, ani, cpf, solicitou_fatura, solicitou_recibo, solicitou_ir, solicitou_carteirinha, data`;
        vals.push(callid);
        const updated = await client.query(updateSql, vals);
        await client.query('COMMIT');
        return res.json({ message: 'Atualizado (callid já existente).', updated: updated.rows[0] });
      }
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Erro upsert /interacoes/:callid:', e);
      return res.status(500).json({ error: 'Erro ao processar /interacoes/:callid' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro de conexão:', err);
    return res.status(500).json({ error: 'Erro de conexão com banco' });
  }
});

// (compat) Upsert por body segue disponível
app.post('/interacoes/chamada1234551', authMiddleware, async (req, res) => {
  const {
    callid,
    ani = null,
    cpf = null,
    solicitou_fatura,
    solicitou_recibo,
    solicitou_ir,
    solicitou_carteirinha
  } = req.body || {};

  if (!callid) {
    return res.status(400).json({ error: 'callid é obrigatório' });
  }

  const aniNorm = typeof ani === 'string' && ani.trim() === '' ? null : ani;
  const cpfNorm = typeof cpf === 'string' && cpf.trim() === '' ? null : cpf;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const exists = await client.query('SELECT 1 FROM interacoes WHERE callid = $1 LIMIT 1', [callid]);

      if (exists.rowCount === 0) {
        const insertSql = `
          INSERT INTO interacoes (
            data, ani, callid, cpf,
            solicitou_fatura, solicitou_recibo,
            solicitou_ir, solicitou_carteirinha
          )
          VALUES (
            (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
            $1, $2, $3, $4, $5, $6, $7
          )
          RETURNING callid, ani, cpf, solicitou_fatura, solicitou_recibo, solicitou_ir, solicitou_carteirinha, data
        `;
        const insertVals = [
          aniNorm,
          callid,
          cpfNorm,
          toBoolean(solicitou_fatura),
          toBoolean(solicitou_recibo),
          toBoolean(solicitou_ir),
          toBoolean(solicitou_carteirinha),
        ];
        const created = await client.query(insertSql, insertVals);
        await client.query('COMMIT');
        return res.status(201).json({ message: 'Criado com sucesso (callid novo).', created: created.rows[0] });
      } else {
        const sets = [];
        const vals = [];
        let i = 1;

        sets.push(`ani = $${i++}`); vals.push(aniNorm);
        sets.push(`cpf = $${i++}`); vals.push(cpfNorm);

        const flags = { solicitou_fatura, solicitou_recibo, solicitou_ir, solicitou_carteirinha };
        for (const k of Object.keys(flags)) {
          if (Object.prototype.hasOwnProperty.call(req.body, k)) {
            sets.push(`${k} = $${i++}`);
            vals.push(toBoolean(flags[k]));
          }
        }

        const updateSql = `UPDATE interacoes SET ${sets.join(', ')} WHERE callid = $${i} RETURNING callid, ani, cpf, solicitou_fatura, solicitou_recibo, solicitou_ir, solicitou_carteirinha, data`;
        vals.push(callid);
        const updated = await client.query(updateSql, vals);
        await client.query('COMMIT');
        return res.json({ message: 'Atualizado (callid já existente).', updated: updated.rows[0] });
      }
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Erro upsert chamada1234551:', e);
      return res.status(500).json({ error: 'Erro ao processar chamada1234551' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erro de conexão:', err);
    return res.status(500).json({ error: 'Erro de conexão com banco' });
  }
});

app.listen(port, () => {
  console.log(`API rodando na porta ${port}`);
});

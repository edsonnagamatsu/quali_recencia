# API Express + PostgreSQL

API RESTful em Node.js usando Express e PostgreSQL. Permite:
- Inserção de interações
- Atualização dinâmica de campos booleanos
- Busca com filtro por CPF, tipo (fatura, recibo, IR, carteirinha) e intervalo de horas

## Executar localmente

```bash
npm install
npm start
```

## Executar com Docker

```bash
docker build -t api-express-postgresql .
docker run -p 3000:3000 api-express-postgresql
```
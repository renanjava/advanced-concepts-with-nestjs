# Sistema de Pagamentos Avançado - Simulação Educacional

## 📋 Visão Geral do Projeto

Este projeto implementa uma **simulação realista de um sistema de pagamentos** com ênfase em **corretude, consistência e auditabilidade**. Não é uma solução de interface (UI), mas sim uma implementação backend que demonstra padrões arquiteturais avançados utilizados em sistemas de processamento de pagamentos de classe empresarial.

### O Que Este Sistema Faz

O sistema simula o fluxo completo de processamento de um pagamento:

1. **Recebe uma solicitação de pagamento** de um usuário
2. **Reserva fundos** de uma conta bancária
3. **Processa o pagamento** através de um gateway simulado
4. **Confirma a transação** ou **compensa falhas** através de um padrão Saga
5. **Registra todos os eventos** em um armazenamento de eventos imutável
6. **Mantém projeções** (read models) sincronizadas com o histórico de eventos
7. **Garante idempotência** para evitar processamento duplicado

### Por Que Existe Este Projeto

Este projeto foi criado para **demonstrar na prática** como sistemas de pagamento reais lidam com:

- **Transações distribuídas** sem coordenador global (padrão Saga)
- **Auditoria completa** através de Event Sourcing
- **Recuperação de falhas** com compensação automática
- **Consistência sem ACID tradicional** em múltiplos agregados
- **Idempotência** para garantir que requisições duplicadas não produzem efeitos duplicados
- **Separação de responsabilidades** entre escrita (commands) e leitura (queries)

### Problemas Reais que Simula

1. **Falhas em cascata**: O que acontece se o gateway de pagamento falha no meio da transação?
2. **Requisições duplicadas**: Como evitar cobranças duplicadas se um cliente retenta a requisição?
3. **Inconsistência de dados**: Como manter o ledger consistente quando múltiplas operações devem estar todas sincronizadas?
4. **Auditoria e conformidade**: Como provar exatamente o que aconteceu com cada pagamento?
5. **Circuit breaking**: Como proteger o sistema quando um serviço externo fica indisponível?

---

## 🏗️ Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│                      PAYMENT CONTROLLER                     │
│                    (POST /payments)                          │
└────────────────────────────┬────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────────┐  ┌──────────────────┐  ┌────────────────┐
   │ PAYMENT     │  │ IDEMPOTENCY      │  │ LEDGER         │
   │ SERVICE     │  │ SERVICE          │  │ SERVICE        │
   └─────────────┘  └──────────────────┘  └────────────────┘
        │                                        │
        └────────────────┬─────────────────────┘
                         │
        ┌────────────────┼────────────────────┐
        │                │                    │
        ▼                ▼                    ▼
   ┌──────────────┐ ┌──────────────┐  ┌─────────────────┐
   │ SAGA         │ │ ACCOUNT      │  │ EVENT STORE     │
   │ ORCHESTRATOR │ │ SERVICE      │  │ (Append-only)   │
   └──────────────┘ └──────────────┘  └─────────────────┘
        │
        ▼
   ┌──────────────────────────────────────┐
   │ PAYMENT GATEWAY SERVICE              │
   │ + Circuit Breaker                    │
   └──────────────────────────────────────┘
        │
        ▼
   ┌──────────────────────────────────────┐
   │ Gateway Simulator (externo)          │
   └──────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                      │
├─────────────────────────────────────────────────────────────┤
│ • Payments           • DomainEvents (Event Store)           │
│ • Accounts           • PaymentProjections (Read Model)      │
│ • FundReservations   • AccountBalanceProjections            │
│ • IdempotencyRecords • SagaExecutions & SagaSteps          │
└─────────────────────────────────────────────────────────────┘
```

### Por Que Usar Saga Orchestrator?

Em um sistema com múltiplas operações (reservar fundos, processar pagamento, confirmar), é impossível usar ACID traditionais:

- **Não existe coordenador global** que possa garantir atomicidade
- As operações podem ser locais (Account) ou remotas (Gateway)
- Falhas parciais devem ser compensadas manualmente

O **Saga Orchestrator** resolve isto orquestrando uma sequência de passos locais, onde cada passo:

1. Executa uma ação
2. Se falhar, inicia a **compensação** (desfaz ações anteriores)
3. Registra cada transição em eventos

### Por Que Event Sourcing Apenas no Ledger?

Este projeto usa **Event Sourcing seletivamente**:

- ✅ **Ledger**: Usa Event Sourcing completo (armazenamento append-only imutável)
  - Razão: Conformidade, auditoria, e precisão contábil
  - Não pode ser alterado ou deletado

- ❌ **Payment, Account, Reservation**: Usam estado tradicional no banco
  - Razão: Simplicidade operacional para casos de uso mais diretos
  - Event Sourcing completo seria overhead desnecessário

---

## 🔧 Componentes Principais

### 1. **Payment Service**

Responsável pelo fluxo principal de criação e processamento de pagamentos.

**Arquivo**: [src/payment/payment.service.ts](src/payment/payment.service.ts)

**Responsabilidades**:

- Receber requisições de pagamento
- Verificar idempotência
- Orquestrar o Saga de pagamento
- Registrar eventos no Ledger
- Atualizar status de pagamento

**Fluxo Básico**:

```typescript
1. checkOrCreate(idempotencyKey)
   └─> Garante que requisições duplicadas retornam mesmo resultado

2. create Payment (status: PENDING)
   └─> Cria registro transiente

3. recordEvent(PAYMENT_INITIATED)
   └─> Registra no Event Store para auditoria

4. startPaymentSaga(context)
   └─> Inicia a orquestração

5. Sagacompletada? Atualizar status para COMPLETED
   └─> Confirmação final
```

---

### 2. **Account Service**

Gerencia contas e reservas de fundos.

**Arquivo**: [src/account/account.service.ts](src/account/account.service.ts)

**Responsabilidades**:

- Criar contas bancárias
- Verificar saldo disponível
- **Reservar fundos** (sem debitar imediatamente)
- Liberar reservas se pagamento falhar
- Confirmar débitos quando pagamento sucede

**Mecanismo de Reserva**:

A reserva funciona em dois estágios para evitar overselling:

```
Balance: 1000
ReservedBalance: 0
AvailableBalance: 1000

[Pagamento de 300 iniciado]
→ Reserva 300
  Balance: 1000
  ReservedBalance: 300
  AvailableBalance: 700

[Outro pagamento tenta reservar 800]
→ FALHA (pois 800 > 700)

[Primeiro pagamento completa]
→ Débito confirmado (atualiza Balance)
  Balance: 700
  ReservedBalance: 0
  AvailableBalance: 700
```

---

### 3. **Payment Gateway Service**

Simula uma integração com gateway de pagamento externo (ex: Stripe, PayPal).

**Arquivo**: [src/gateway/payment-gateway.service.ts](src/gateway/payment-gateway.service.ts)

**Características**:

- Processa transações através do Gateway Simulator
- Implementa **Circuit Breaker** para proteção
- Oferece estratégia de fallback quando gateway está indisponível
- Coleta métricas de sucesso/falha

**Circuit Breaker States**:

```
         [CLOSED] (normal)
           │  ↑
    falhas │  │ sucesso
           ▼  │
         [OPEN] (rejeitando)
           │  ↑
    timeout│  │ tentativa
           ▼  │
      [HALF_OPEN] (testando)
```

---

### 4. **Ledger Service**

Implementa o **Event Store** - armazenamento imutável de eventos.

**Arquivo**: [src/ledger/ledger.service.ts](src/ledger/ledger.service.ts)

**Responsabilidades**:

- Registrar eventos de domínio
- Manter histórico completo e imutável
- Suportar replay de eventos
- Reconstruir estado através de snapshots
- Projections para read models

---

## 💾 Ledger & Event Sourcing

### O Event Store (Append-Only)

Diferente de um banco de dados tradicional, o Event Store **nunca deleta ou modifica**:

```
DomainEvent Model:
├─ id (PK)
├─ aggregateId (ex: payment-123)
├─ aggregateType (PAYMENT, ACCOUNT, RESERVATION)
├─ eventType (PAYMENT_INITIATED, PAYMENT_COMPLETED, etc)
├─ version (1, 2, 3... sequencial por agregado)
├─ eventData (JSON blob com dados específicos)
├─ userId (auditoria)
├─ metadata (timestamps, requestId, etc)
└─ timestamp (imutável)
```

**Exemplo de sequência**:

```
Event 1 (v1): PAYMENT_INITIATED
  aggregateId: pay-456
  eventData: { paymentId, userId, amount, idempotencyKey }

Event 2 (v2): FUNDS_RESERVED
  aggregateId: pay-456
  eventData: { reservationId, amount }

Event 3 (v3): PAYMENT_PROCESSING
  aggregateId: pay-456
  eventData: { gatewayTransactionId }

Event 4 (v4): PAYMENT_COMPLETED
  aggregateId: pay-456
  eventData: { authorizationCode, completedAt }
```

### Versionamento e Imutabilidade

Cada agregado tem uma **versão sequencial**:

- v1, v2, v3... nunca são reutilizadas
- Impossível alterar event anterior (histórico congelado)
- Detecta concorrência: se versão muda inesperadamente = conflito

### Snapshots (Por Que e Quando)

Para não ter que reprocessar **milhões de eventos** toda vez:

```
Sem snapshots:
  Pedir estado de agregado →
    ler todos os 1.000.000 eventos →
    reprocessar cada um →
    tomar 30 segundos

Com snapshots:
  Pedir estado →
    encontrar snapshot mais recente (v999.990) →
    carregar snapshot state →
    reprocessar últimos 10 eventos →
    tomar 10ms
```

**Quando usar**:

- Agregados com histórico muito longo (>1000 eventos)
- Performance crítica em consultas frequentes

**Neste projeto**: Snapshots são opcionais (implementação em `snapshot.service.ts`)

### Event Replay

Reconstruir estado completo reprocessando todos os eventos:

```typescript
async rebuildPaymentState(paymentId: string) {
  const events = await eventStore.getEventsByAggregate(paymentId);

  let state = { status: 'PENDING' };

  for (const event of events) {
    state = applyEvent(state, event);
    // PAYMENT_INITIATED → status = PENDING
    // FUNDS_RESERVED → reservationId = xyz
    // PAYMENT_COMPLETED → status = COMPLETED
  }

  return state; // Estado atualizado!
}
```

---

## 🔄 CQRS & Projeções

### Por Que Projeções Existem

O Event Store é otimizado para **escrita** (append), mas não para **leitura**:

```
Ler "todos os pagamentos completados em dezembro para relatório":
  ❌ Sem projeção: varrer todos os milhões de eventos
  ✅ Com projeção: SELECT * FROM paymentProjection WHERE status=COMPLETED
```

### Read Models vs Write Models

| Aspecto          | Write Model (Event Store)              | Read Model (Projection)                         |
| ---------------- | -------------------------------------- | ----------------------------------------------- |
| **O que faz**    | Registra o que aconteceu               | Mostra o estado atual                           |
| **Estrutura**    | Lista de eventos imutável              | Tabelas desnormalizadas                         |
| **Performance**  | Otimizado para escrita                 | Otimizado para leitura                          |
| **Consistência** | Imediata                               | Eventual (lag possível)                         |
| **Exemplo**      | `PAYMENT_INITIATED, PAYMENT_COMPLETED` | `PaymentProjection(id, status, userId, amount)` |

### Rebuilding Projections

Se uma projeção fica corrompida ou precisa de alteração:

```typescript
async rebuildProjections() {
  // 1. Limpar projeções antigas
  await deleteAllProjections();

  // 2. Ler todos os eventos em ordem
  const events = await getEventsOrdered();

  // 3. Reprocessar cada evento
  for (const event of events) {
    await projectEvent(event);  // Recriar projeção a partir do zero
  }
}
```

**Seguro porque**: O Event Store é imutável e completo.

---

## 🎬 Fluxo de Orquestração Saga

### Happy Path (Sucesso)

```
[1. Client POST /payments]
         ↓
[2. Payment Service - Check Idempotency]
  ✓ Nunca visto este key antes
         ↓
[3. Create Payment Record] (status: PENDING)
         ↓
[4. Record Event: PAYMENT_INITIATED]
  → Event Store recebe evento
         ↓
[5. Start Saga Orchestrator]
  ├─ Step 1: RESERVE_FUNDS
  │    └─ Account Service reserva 300 da conta
  │    └─ Sucesso: Record Event FUNDS_RESERVED
  │
  ├─ Step 2: PROCESS_PAYMENT
  │    └─ Payment Gateway (com Circuit Breaker)
  │    └─ Sucesso: Record Event PAYMENT_PROCESSING
  │
  └─ Step 3: CONFIRM_PAYMENT
       └─ Débito efetivo da conta
       └─ Sucesso: Record Event PAYMENT_COMPLETED
         ↓
[6. Saga Mark as COMPLETED]
         ↓
[7. Payment Status → COMPLETED]
         ↓
[8. Return Response to Client]
```

**Tempo**: ~1-2 segundos (com latência do gateway)

---

### Failure Path com Compensações

```
[1-3. Mesmo do happy path até Step 2]
         ↓
[4. PROCESS_PAYMENT Step]
  ❌ Gateway timeout/rejected
         ↓
[5. Saga Orchestrator Detects Failure]
  → Record Event: PAYMENT_FAILED
         ↓
[6. Start Compensation (Rollback)]

  Step 2 Compensação: cancelPayment()
    → Nada a cancelar (não foi processado)

  Step 1 Compensação: releaseFunds()
    → Remover reserva de 300
    → Account.reservedBalance -= 300
    → Record Event: RESERVATION_RELEASED

  Step 3: Não é compensável (não foi iniciada)
         ↓
[7. Saga Status → FAILED_COMPENSATED]
         ↓
[8. Payment Status → FAILED]
         ↓
[9. Return Error Response]
```

**Resultado final**: Conta volta ao estado original, nenhum débito indevido.

---

### Idempotência Garantida

Cliente retenta o mesmo pagamento (mesmo `idempotencyKey`):

```
[1º Request] POST /payments with key="abc-123"
  → Cria Payment, inicia Saga, retorna sucesso
  → IdempotencyRecord(key="abc-123", status=COMPLETED, response=...)

[2º Request] POST /payments with key="abc-123"
  → checkOrCreate(key) encontra registro COMPLETED
  → Retorna RESPONSE IDÊNTICA do primeiro request
  → Nenhuma lógica de negócio é reexecutada

[Resultado]: Dois requests = uma transação real ✓
```

---

## 📊 Consistência de Dados & Transações

### Como Prisma Transactions São Usadas

Prisma oferece `$transaction()` para operações que devem ser atômicas:

```typescript
// Exemplo: Reserva de fundos DEVE debit e update account atomicamente
async reserveFunds(dto: ReserveFundsDto) {
  return this.prisma.$transaction(async (tx) => {
    // Lê account (locked)
    const account = await tx.account.findUnique({ where });

    // Verifica saldo
    if (account.balance - account.reserved < amount) {
      throw new Error('Insufficient');
    }

    // Cria reservation
    const reservation = await tx.fundReservation.create({...});

    // Atualiza balance
    await tx.account.update({
      where: { id: account.id },
      data: { reservedBalance: { increment: amount } }
    });

    // TUDO OU NADA: Se alguma etapa falhar, todo $transaction reverte
  });
}
```

### Limites de Consistência

Nem toda operação usa `$transaction`:

| Operação                 | Transação  | Razão                              |
| ------------------------ | ---------- | ---------------------------------- |
| **Reserva de fundos**    | ✅ Sim     | Deve ser atômico (check + reserve) |
| **Criação de pagamento** | ❌ Não     | Apenas INSERT, impossível falhar   |
| **Saga step**            | ⚠️ Parcial | Grava em múltiplas tabelas         |
| **Idempotência check**   | ✅ Sim     | Evitar duplicação                  |

### Por Que Strong Consistency em Alguns Lugares

Algumas operações **não podem** ser Eventually Consistent:

```
Scenario: Account com 1000
  Requisição 1: Reservar 700
  Requisição 2: Reservar 700

❌ SEM Strong Consistency:
  Requisição 1 (Eventual): Vê 1000, reserva 700
  Requisição 2 (Eventual): Vê 1000, reserva 700 (deveria falhar!)
  Resultado: 1400 reservado de 1000 = ERRO CRÍTICO

✅ COM $transaction (Strong Consistency):
  Requisição 1 (Locked): Vê 1000, reserva 700, atualiza DB
  Requisição 2 (Locked): Vê 300 disponível, falha na reserva 700
  Resultado: Correto!
```

---

## ⚠️ Tratamento de Erros & Resiliência

### Cenários de Falha

#### 1. **Gateway Timeout**

```
timeout (10s) no circuitBreaker.execute()
→ Saga detecta erro em PROCESS_PAYMENT
→ Inicia compensação (libera reserva)
→ Payment.status = FAILED
→ Cliente recebe erro (pode retentar com mesmo key)
```

#### 2. **Conta com Saldo Insuficiente**

```
reserveFunds() falha (insufficient funds)
→ RESERVE_FUNDS step falha
→ Nenhuma compensação necessária (nunca saiu do estado anterior)
→ Payment.status = FAILED
```

#### 3. **Idempotency Key Duplicada**

```
2º request com mesmo idempotencyKey
→ IdempotencyService.checkOrCreate() retorna response cacheada
→ Nenhuma lógica é reexecutada
→ Resultado é idêntico ao 1º request
```

#### 4. **Circuit Breaker OPEN**

```
Gateway sofre 5 falhas consecutivas
→ CircuitBreaker.state = OPEN
→ Próximas requisições são rejeitadas imediatamente (sem chamar gateway)
→ Após 60 segundos, tenta HALF_OPEN
→ Se sucesso, volta a CLOSED
→ Se falha, volta a OPEN
```

### Estratégias de Retry

**Automático** (via Saga):

```
Step falha → Log erro → Saga marca como FAILED e inicia compensação
Não há retry automático dentro da Saga
```

**Manual** (via Cliente):

```
Cliente recebe erro
→ Se for erro transiente (timeout, gateway indisponível)
→ Cliente retenta com MESMO idempotencyKey
→ IdempotencyService garante result é idêntico (não duplica transação)
```

---

## 🚀 Como Executar o Projeto

### Requisitos

- **Node.js**: v22+
- **PostgreSQL**: v15+ (ou banco compatível)
- **npm**: v10+

### Setup de Ambiente

1. **Clone/Extraia o projeto**

```bash
cd payment-system
```

2. **Instale dependências**

```bash
npm install
```

3. **Configure variáveis de ambiente**

```bash
cp .env.example .env
```

Edite `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/payment_db"
NODE_ENV=development
PORT=3000
```

4. **Setup do Banco de Dados**

Crie o banco:

```bash
createdb payment_db  # ou via sua GUI PostgreSQL
```

Execute as migrações:

```bash
npm run prisma migrate deploy
```

5. **Inicie a aplicação**

```bash
# Modo desenvolvimento (com hot-reload)
npm run start:dev

# Ou modo produção
npm run build
npm run start:prod
```

A API estará disponível em: `http://localhost:3000`

---

## 🧪 Como Testar o Sistema

### Verificação Rápida (Health Check)

```bash
curl http://localhost:3000/health
```

### Fluxo Básico com HTTP Requests

#### 1. Criar uma conta

```bash
curl -X POST http://localhost:3000/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "initialBalance": 5000
  }'

# Response:
# {
#   "id": "acc-456",
#   "userId": "user-123",
#   "balance": 5000,
#   "reservedBalance": 0
# }
```

#### 2. Processar um pagamento

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "amount": 100,
    "idempotencyKey": "pay-req-2025-12-26-001"
  }'

# Response:
# {
#   "id": "pay-789",
#   "userId": "user-123",
#   "amount": 100,
#   "status": "PENDING" (ou COMPLETED/FAILED)
# }
```

#### 3. Consultar status do pagamento

```bash
curl http://localhost:3000/payments/pay-789
```

#### 4. Verificar execução da Saga

```bash
curl http://localhost:3000/payments/pay-789/saga

# Response mostra cada step e seu status:
# {
#   "id": "saga-001",
#   "paymentId": "pay-789",
#   "status": "COMPLETED",
#   "steps": [
#     { "name": "RESERVE_FUNDS", "status": "COMPLETED" },
#     { "name": "PROCESS_PAYMENT", "status": "COMPLETED" },
#     { "name": "CONFIRM_PAYMENT", "status": "COMPLETED" }
#   ]
# }
```

---

### Verificar Event Sourcing

#### Listar todos os eventos de um pagamento

```bash
curl http://localhost:3000/ledger/events?aggregateId=pay-789&aggregateType=Payment

# Response (exemplo):
# [
#   {
#     "version": 1,
#     "eventType": "PAYMENT_INITIATED",
#     "eventData": { "paymentId": "pay-789", ... },
#     "timestamp": "2025-12-26T10:30:00Z"
#   },
#   {
#     "version": 2,
#     "eventType": "FUNDS_RESERVED",
#     "eventData": { "reservationId": "res-123", ... },
#     "timestamp": "2025-12-26T10:30:01Z"
#   },
#   ...
# ]
```

#### Replaçar evento e reconstruir estado

```bash
curl -X POST http://localhost:3000/ledger/replay \
  -H "Content-Type: application/json" \
  -d '{
    "aggregateId": "pay-789",
    "aggregateType": "Payment"
  }'

# Reconstrói o estado do pagamento reprocessando todos os eventos
```

---

### Verificar Projeções

#### Listar projeção de pagamento

```bash
curl http://localhost:3000/ledger/projections/payments/pay-789

# Response:
# {
#   "paymentId": "pay-789",
#   "userId": "user-123",
#   "amount": 100,
#   "status": "COMPLETED",
#   "totalEvents": 4,
#   "lastEventType": "PAYMENT_COMPLETED",
#   "lastEventAt": "2025-12-26T10:30:02Z"
# }
```

#### Reconstruir todas as projeções

```bash
curl -X POST http://localhost:3000/ledger/rebuild-projections

# Deleta projeções antigas e reprocessa todos os eventos
# ⚠️ Operação pesada em databases grandes
```

---

### Testar Falhas

#### Simular falha no Gateway

```bash
# Deixar gateway indisponível
curl -X POST http://localhost:3000/gateway/make-unhealthy

# Tentar processar pagamento
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "amount": 100, "idempotencyKey": "fail-test"}'

# Resultado: PAYMENT_FAILED com compensação automática
# Os fundos reservados são liberados

# Deixar gateway saudável novamente
curl -X POST http://localhost:3000/gateway/make-healthy
```

#### Testar Circuit Breaker

```bash
# Aumentar latência para forçar timeouts
curl -X POST http://localhost:3000/gateway/increase-latency/15000

# Fazer 6 requisições → 5ª falha e abre circuit
# Requisições 6+ são rejeitadas imediatamente

# Resetar circuit
curl -X POST http://localhost:3000/gateway/reset-circuit-breaker
```

#### Testar Idempotência

```bash
# 1º request
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "amount": 100,
    "idempotencyKey": "idem-test-001"
  }' > response1.json

# 2º request idêntico (simulando retry)
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "amount": 100,
    "idempotencyKey": "idem-test-001"
  }' > response2.json

# Comparar respostas
diff response1.json response2.json
# Output: (vazio = respostas idênticas ✓)
```

---

## 📝 Testes Automatizados

```bash
# Testes unitários
npm run test

# Testes com cobertura
npm run test:cov

# Watch mode (reexecuta ao salvar)
npm run test:watch

# E2E tests
npm run test:e2e
```

---

## 🎯 Decisões de Design Importantes

### 1. Por Que Saga Pattern?

| Abordagem                  | Prós                          | Contras                              |
| -------------------------- | ----------------------------- | ------------------------------------ |
| **ACID Distribuído (2PC)** | Atomicidade garantida         | Locking, performance, acoplamento    |
| **Saga Coreography**       | Simples descentralizado       | Lógica espalhada, difícil de debugar |
| **Saga Orchestrator** ✅   | Lógica centralizada, controle | Mais código, SPOF se não HA          |

Escolhemos **Orchestrator** porque:

- Controlador central (SagaOrchestratorService)
- Fácil de debugar e entender fluxo
- Compensação explícita

### 2. Por Que Event Sourcing Apenas no Ledger?

| Modelo                      | Caso de Uso      | Razão                            |
| --------------------------- | ---------------- | -------------------------------- |
| **Event Sourcing Completo** | Ledger           | Auditoria imutável, conformidade |
| **Snapshot + Replay**       | Opcionalmente    | Performance em agregados antigos |
| **State Tradicional**       | Payment, Account | CRUD direto, performance         |

Mesclar oferece best of both worlds.

### 3. Por Que PostgreSQL (Vs. NoSQL)?

```
Requisitos:
• Transações ACID ✓ (necessário para reserva de fundos)
• Integridade referencial ✓ (relationships)
• Queries complexas ✓ (projeções)
• Relatórios analíticos ✓ (ledger)

NoSQL:
✗ Transações limitadas
✗ Sem referential integrity nativa
✗ Queries complexas podem ser lerdas
```

PostgreSQL é superior para pagamentos.

### 4. Por Que Circuit Breaker?

Sem Circuit Breaker:

```
Gateway fica lento
→ Requests acumulam timeout (10s cada)
→ Thread pool esgota
→ Aplicação inteira fica travada
→ Clientes não conseguem pagar
→ Cascata de falhas
```

Com Circuit Breaker:

```
Gateway fica lento
→ 5 timeouts consecutivos
→ Circuit.state = OPEN
→ Próximas requisições rejeitadas em <1ms
→ Threads liberadas
→ Aplicação responsiva
→ Clientes veem erro clara: "gateway indisponível"
```

---

## ⚡ Trade-offs e Limitações

### Consistência Eventual

As **projeções** (read models) podem estar atrasadas:

```
Evento criado em Event Store (t=0ms)
→ EventProjectionService processa em background (t=50ms)
→ Query na projection pode retornar estado "desatualizado" por 50ms

Para operações críticas → leia direto do Event Store
Para relatórios → use projeções (pequeno lag é aceitável)
```

### Sem Distributed Consensus

Este sistema não implementa Raft/Paxos. Se houver split-brain (network partition):

```
Nó 1: Processa pagamento
Nó 2: Processa mesmo pagamento (não vê Nó 1)

Resultado: 2 transações reais

Solução: Usar idempotencyKey + distributed lock (Redis/Postgres Advisory Lock)
```

Neste projeto: Assumimos single instance ou load balanced com sticky sessions.

### Sem Rollback de Event Store

Uma vez escrito um evento, é permanente:

```
Event criado com dados errados
→ Impossível deletar

Solução: Emitir evento de compensação
  PAYMENT_COMPLETED (errado)
  → PAYMENT_REVERSAL (desfaz)
```

---

## 👥 Para Quem É Este Projeto

### ✅ Ideal para:

- **Backend engineers** querendo aprender Saga Pattern na prática
- **Arquitetos** estudando Event Sourcing em operações críticas
- **Entusiastas de distributed systems** querendo ver CQRS aplicado
- **Desenvolvedores Java/TypeScript** migrando para padrões avançados
- **Candidatos em entrevistas** querendo código para portfólio

### ❌ Não é para:

- Produção (é simulado)
- Projeto de UI/Frontend
- Quem quer aprender Node.js básico (pule para NestJS tutorials)
- Sistema de pagamentos real (faltam muitas coisas: KYC, AML, conformidade)

---

## 📂 Estrutura de Arquivos

```
payment-system/
├── src/
│   ├── app.module.ts              # Módulo raiz NestJS
│   ├── main.ts                    # Entry point
│   │
│   ├── payment/                   # Domínio de Pagamentos
│   │   ├── payment.service.ts     # Lógica de pagamento
│   │   ├── payment.controller.ts  # API endpoints
│   │   ├── idempotency.service.ts # Garantia de idempotência
│   │   ├── payment.module.ts
│   │   ├── dto/
│   │   │   └── create-payment.dto.ts
│   │   └── saga/
│   │       ├── saga-orchestrator.service.ts  # Orquestração
│   │       └── saga.config.ts                # Definição de steps
│   │
│   ├── account/                   # Domínio de Contas
│   │   ├── account.service.ts     # Gestão de contas e reservas
│   │   ├── account.controller.ts
│   │   ├── account.module.ts
│   │   └── dto/
│   │       ├── create-account.dto.ts
│   │       └── reserve-funds.dto.ts
│   │
│   ├── gateway/                   # Integração com Gateway
│   │   ├── payment-gateway.service.ts        # Gateway wrapper
│   │   ├── payment-gateway-simulator.service.ts # Simulador
│   │   ├── circuit-breaker.service.ts        # Proteção
│   │   ├── gateway.controller.ts
│   │   ├── gateway.module.ts
│   │   └── types/
│   │       └── gateway.types.ts
│   │
│   ├── ledger/                    # Event Sourcing & CQRS
│   │   ├── event-store.service.ts           # Armazena eventos
│   │   ├── event-projection.service.ts      # Cria read models
│   │   ├── ledger.service.ts                # API pública
│   │   ├── snapshot.service.ts              # Otimização
│   │   ├── ledger.controller.ts
│   │   ├── ledger.module.ts
│   │   └── events/
│   │       └── domain-events.ts             # Tipos de eventos
│   │
│   └── prisma/                    # ORM & Database
│       ├── prisma.service.ts
│       └── prisma.module.ts
│
├── prisma/
│   ├── schema.prisma              # Definição do banco
│   └── migrations/                # Histórico de migrações
│       ├── 20251224225237_init/
│       ├── 20251224233006_add_idempotency/
│       ├── 20251225174922_add_account_service/
│       ├── 20251225220327_add_saga_pattern/
│       └── 20251226171627_add_event_sourcing/
│
├── test/
│   ├── jest-e2e.json
│   └── load-test.sh               # Teste de carga
│
├── .env.example                   # Template de config
├── docker-compose.yml             # PostgreSQL + adminer
├── package.json
├── tsconfig.json
└── README.md (este arquivo)
```

---

## 🔗 Referências e Leitura Adicional

### Padrões Utilizados

- **Saga Pattern**: https://microservices.io/patterns/data/saga.html
- **Event Sourcing**: https://martinfowler.com/eaaDev/EventSourcing.html
- **CQRS**: https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf
- **Circuit Breaker**: https://martinfowler.com/bliki/CircuitBreaker.html

### Livros

- "Building Microservices" - Sam Newman
- "Designing Data-Intensive Applications" - Martin Kleppmann
- "Enterprise Integration Patterns" - Gregor Hohpe

---

## 📞 Suporte e Contribuições

Este é um **projeto educacional**. Sinta-se livre para:

- ✅ Estudar o código
- ✅ Fazer pull requests com melhorias
- ✅ Criar issues com sugestões
- ✅ Usar como base para aprendizado

---

## 📄 Licença

Este projeto é fornecido como-está para fins educacionais.

---

**Última atualização**: 26 de dezembro de 2025

**Versão**: 1.0.0

Construído com ❤️ para aprender padrões avançados de backend.

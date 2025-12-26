# Sistema de Notificações com RabbitMQ

## 📋 Visão Geral do Projeto

Este projeto implementa um **sistema de notificações por email com base em fila de mensagens**, desenvolvido como um estudo prático de filas de mensagens e sistemas distribuídos.

### O Que Este Sistema Faz

O sistema simula o envio de notificações por email de forma **assíncrona e confiável**:

1. **Recebe requisições HTTP** de clientes querendo enviar email
2. **Publica mensagens** em uma fila RabbitMQ (não envia imediatamente)
3. **Retorna sucesso** ao cliente ~imediatamente (202 Accepted)
4. **Processadores (workers)** consomem mensagens em background
5. **Tentam enviar email**, com **retries automáticos** se falhar
6. **Movem mensagens permanentemente falhadas** para Dead Letter Queue (DLQ)
7. **Expõe métricas** para monitoramento (Prometheus)

### Por Que Este Projeto Existe

Desenvolvido para entender na prática:

- **Como filas de mensagens funcionam** (não apenas teoria)
- **Padrões de resiliência** em sistemas distribuídos
- **Tratamento de falhas** sem perder mensagens
- **Exponential backoff** em retries
- **Dead Letter Queues** para mensagens irrecuperáveis
- **Rastreabilidade** de mensagens através de `correlationId`
- **Observabilidade** com Prometheus

### Problemas Reais que Simula

1. **Falhas transientes**: Email service temporariamente indisponível
   - ✅ Sistema retenta automaticamente
   - ✅ Mensagem não é perdida

2. **Falhas permanentes**: Email inválido ou serviço morto
   - ✅ Após N retries, mensagem vai para DLQ
   - ✅ Pode ser investigada later

3. **Carga alta**: Muitas requisições de email simultaneamente
   - ✅ Fila armazena e processa em background
   - ✅ Cliente não espera pelo envio

4. **Rastreabilidade**: "Por que esse email não foi entregue?"
   - ✅ Cada mensagem tem `correlationId` único
   - ✅ Pode acompanhar em DLQ

---

## 🏗️ Arquitetura de Alto Nível

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENT (HTTP)                         │
│  POST /notifications                                     │
│  { email: "user@test.com", message: "Hello" }           │
└────────────────────────┬─────────────────────────────────┘
                         │
        ┌────────────────▼──────────────────┐
        │                                   │
        ▼                                   ▼
┌──────────────────────┐          ┌───────────────────────┐
│ NOTIFICATIONS       │          │ METRICS SERVICE       │
│ CONTROLLER          │          │ (Prometheus)          │
│                     │          │                       │
│ POST /notifications │          │ • total_received      │
│ GET /notifications/dlq
│                     │          │ • total_processed     │
│                     │          │ • total_failed        │
└──────────┬──────────┘          │ • processing_duration │
           │                     └───────────────────────┘
           │
        ┌──▼──────────────────────────────────────┐
        │                                         │
        │     NOTIFICATIONS SERVICE              │
        │  (Publica mensagens)                   │
        │                                         │
        │ • Gera correlationId                   │
        │ • Envelopa mensagem                    │
        │ • Publica em RabbitMQ                  │
        │                                         │
        └──┬──────────────────────────────────────┘
           │
           │ publish('notification', message)
           │
    ┌──────▼──────────────────────────────────────┐
    │           RABBITMQ (BROKER)                 │
    │                                             │
    │  ┌─────────────────────────────────────┐   │
    │  │ Direct Exchange (notifications.ex)  │   │
    │  │ (routing_key: "notification")       │   │
    │  └────┬────────────────────────────────┘   │
    │       │                                    │
    │       ├──────────────────┬────────────────┤
    │       │                  │                │
    │  ┌────▼──────────┐   ┌───▼────────────┐  │
    │  │ MAIN QUEUE    │   │ DLQ (Dead      │  │
    │  │ (notifications│   │ Letter Queue)  │  │
    │  │ .queue)       │   │ (notifications │  │
    │  │               │   │ .dlq)          │  │
    │  │ • durable: ✓  │   │                │  │
    │  │ • x-dlx: ✓    │   │ • durable: ✓   │  │
    │  └────┬──────────┘   │ • ttl: 300s    │  │
    │       │              └────┬───────────┘  │
    │  ┌────▼────────────────────┐             │
    │  │ DLX Exchange (DLX)       │             │
    │  │ (x-dead-letter-exchange) │             │
    │  └──────────────────────────┘             │
    │                                             │
    └──────────┬──────────────────────────────────┘
               │
               │ consume(notifications.queue)
               │
        ┌──────▼────────────────────────┐
        │    WORKER SERVICE            │
        │ (Consumer/Processador)       │
        │                             │
        │ • Consome da fila            │
        │ • Processa cada mensagem    │
        │ • Tenta enviar email         │
        │ • Retenta com backoff       │
        │ • Envia para DLQ se exhaust  │
        │ • Atualiza métricas          │
        └──────────────────────────────┘
```

### Fluxo Síncrono vs Assíncrono

| Aspecto | Síncrono ❌ | Assíncrono ✅ |
|---------|----------|------------|
| **Como funciona** | Client espera resposta | Client recebe 202 e sai |
| **Latência percebida** | ~5s (timeout do email) | ~100ms |
| **Falha no email** | Cliente vê erro | Retry automático |
| **Pico de requisições** | Trava a aplicação | Fila absorve carga |
| **Rastreabilidade** | Imediata | Via correlationId |

### Por Que Messaging Foi Escolhido

```
Requisito: Enviar 1000 emails por segundo

Abordagem Síncrona:
  POST /sendEmail → Email Service (5s) → Response
  
  Resultado:
  • 5 threads bloqueadas por email
  • 5 * 1000 = 5000 threads necessárias
  • Memory explosion
  • Cliente espera 5 segundos

Abordagem com Messaging:
  POST /sendEmail → Message Queue → Response (5ms)
  → Worker consume e processa em background (async)
  
  Resultado:
  • 10 workers processam os 1000 emails
  • Fila absorve picos
  • Cliente vê resposta imediatamente
  • Retries automáticos
  • Scale horizontal (add mais workers)
```

---

## 🐰 Arquitetura RabbitMQ

### O Direct Exchange

RabbitMQ oferece diferentes tipos de exchanges:

| Tipo | Routing | Uso |
|------|---------|-----|
| **Fanout** | Broadcast | Enviar para todos |
| **Topic** | Pattern matching | Rotas complexas |
| **Headers** | Atributos | Matching avançado |
| **Direct** ✅ | 1-para-1 exato | Rotas simples |

**Neste projeto**: Direct Exchange porque:
- Apenas 1 tipo de notificação (email)
- Routing key simples: `"notification"`
- Sem padrões complexos

```
┌─────────────────────────────┐
│ Direct Exchange             │
│ (notifications.exchange)    │
│                             │
│ routing_key = "notification"│
│         │                   │
│         ├─→ notifications.queue  (main)
│         │
│         └─→ notifications.dlq    (dlx)
└─────────────────────────────┘
```

Se fosse multi-tipo (SMS, Push, Email):
```
Topic Exchange: "notifications.#"

  notifications.email.*
  notifications.sms.*
  notifications.push.*
```

### Filas Envolvidas

#### 1. **Main Queue** (`notifications.queue`)

```typescript
assertQueue('notifications.queue', {
  durable: true,                    // Persiste em restart
  arguments: {
    'x-dead-letter-exchange': 'notifications.dlx',  // Rota fallida aqui
    'x-dead-letter-routing-key': 'notification'
  }
})
```

**Características**:
- **Durable**: Se broker morrer, fila não é perdida
- **Conectada ao Direct Exchange**
- **Configurada com x-dlx**: Mensagens rejeitadas vão para DLX

**Fluxo de mensagem**:
```
Publicar → Exchange → Main Queue → Worker consume
                         │
                    (se rejeitar)
                         ▼
                    DLX Exchange → DLQ
```

#### 2. **Dead Letter Queue (DLQ)** (`notifications.dlq`)

```typescript
assertQueue('notifications.dlq', {
  durable: true,
  arguments: {
    'x-message-ttl': 300000  // TTL: 5 minutos
  }
})
```

**Por que existe**:
- Armazena mensagens que não conseguem ser processadas
- Preserva para investigação
- TTL impede que acumule forever

**Quando uma mensagem vai para DLQ**:
```
1. Worker tenta processar 3 vezes
2. Todas as 3 falham
3. Worker executa: channel.nack(msg, false, false)
   └─ (false, false) = não requeue, enviar para DLX
4. RabbitMQ roteia para DLQ
```

### Routing Keys e Message Flow

```typescript
const message = {
  correlationId: 'abc-123',
  timestamp: '2025-12-26T10:30:00Z',
  data: {
    email: 'user@test.com',
    message: 'Bem-vindo!'
  }
}

// Publicação
await rabbitMQ.publish('notification', message)
                        ↑
                   routing_key

// No RabbitMQ:
Direct Exchange (notifications.exchange)
  ├─ queue binding (routing_key: 'notification')
  └─ procura mensagens com routing_key='notification'
     └─ entrega para notifications.queue

// Worker consome
await channel.consume('notifications.queue', ...)
```

**Se não houvesse binding**:
```
Mensagem publicada com routing_key='notification'
Exchange olha para bindings
Nenhum binding para 'notification'
Mensagem é DISCARDADA (sem erro!)
```

### Por Que Direct em Vez de Fanout?

```
Direct Exchange:
• Publisher → Exchange → Queue (específica)
• Eficiente (1 fila por tipo)
• Sem overhead

Fanout Exchange:
• Publisher → Exchange → Todas as filas conectadas
• Útil para pub/sub (múltiplos subscribers)
• Overhead (envia para todas mesmo que não queira)

Neste projeto:
• 1 tipo de notificação (email)
• 1 fila de destino
• → Direct é perfeito
```

---

## 📨 Fluxo de Mensagem (Passo a Passo)

### 1️⃣ Cliente Envia POST Request

```bash
curl -X POST http://localhost:3000/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "message": "Bem-vindo ao sistema!"
  }'
```

**Validações** (DTO):
- ✅ `email`: Deve ser email válido
- ✅ `message`: Deve ser string não-vazia

---

### 2️⃣ Notifications Controller Recebe

```typescript
@Post()
@HttpCode(202)  // Retorna 202 Accepted (não 200)
async create(@Body() dto: CreateNotificationDto) {
  const correlationId = 
    await this.notificationsService.sendNotification(dto);
  
  return {
    message: 'Notification queued successfully',
    correlationId
  };
}
```

**Response imediata** (~5ms):
```json
{
  "message": "Notification queued successfully",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Nota: O cliente **não espera** pelo envio do email!

---

### 3️⃣ Envelopamento de Mensagem

```typescript
async sendNotification(dto: CreateNotificationDto): Promise<string> {
  const correlationId = randomUUID();  // Único por requisição
  
  const message = {
    correlationId,                     // Para rastreamento
    timestamp: new Date().toISOString(),
    data: dto                         // {email, message}
  };
  
  await this.rabbitMQService.publish('notification', message);
  
  return correlationId;  // Retorna ao cliente
}
```

**Estrutura final da mensagem**:
```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-12-26T10:30:15.123Z",
  "data": {
    "email": "user@example.com",
    "message": "Bem-vindo ao sistema!"
  }
}
```

---

### 4️⃣ Publicação em RabbitMQ

```typescript
async publish(routingKey: string, message: any) {
  await this.channelWrapper.publish(
    EXCHANGES.NOTIFICATIONS,      // notifications.exchange
    routingKey,                   // "notification"
    message,
    {
      persistent: true            // Persiste em disco
    }
  );
}
```

**No RabbitMQ**:
```
1. Message chega em Direct Exchange
2. Exchange procura bindings para routing_key="notification"
3. Encontra: notifications.queue
4. Entrega mensagem à fila
5. Mensagem fica em disco (persistent: true)
```

---

### 5️⃣ Worker Consome da Fila

```typescript
async startConsuming() {
  const channel = this.rabbitMQService.getChannel();
  
  await channel.addSetup(async (ch: any) => {
    await ch.consume(
      QUEUES.NOTIFICATIONS,  // notifications.queue
      async (msg: any) => {
        if (msg) {
          const content = JSON.parse(msg.content.toString());
          await this.processNotification(content, msg, ch);
        }
      },
      { noAck: false }       // Require manual acknowledgement
    );
  });
  
  this.logger.log('Worker listening...');
}
```

**Características**:
- **noAck: false**: Exige confirmação manual (importante!)
- **consume()**: Loop que fica escutando
- **Async**: Pode processar enquanto escuta outras

---

### 6️⃣ Processamento de Notificação

```typescript
private async processNotification(message: any, msg: any, channel: any) {
  const { correlationId, data } = message;
  const retryCount = msg.properties.headers?.['x-retry-count'] || 0;
  
  try {
    this.logger.log(
      `[${correlationId}] Processing (attempt ${retryCount + 1})`
    );
    
    // Tenta enviar email
    await this.sendEmail(data.email, data.message);
    
    this.logger.log(`[${correlationId}] Sent successfully`);
    
    // ✅ SUCESSO: Remove da fila
    channel.ack(msg);
    
  } catch (error) {
    this.logger.error(
      `[${correlationId}] Error (attempt ${retryCount + 1})`,
      error.message
    );
    
    if (retryCount < 3) {
      // ⏳ RETRY: Requeue com backoff
      await this.retryMessage(message, retryCount, channel, msg);
    } else {
      // ❌ FALHA: Enviar para DLQ
      this.logger.error(`[${correlationId}] Max retries, → DLQ`);
      channel.nack(msg, false, false);
    }
  }
}
```

**Estados possíveis**:
```
1️⃣ ack(msg)
   └─ Mensagem remove da fila (sucesso)
   
2️⃣ retryMessage()
   └─ Acknowledge atual msg
   └─ Publica novamente com x-retry-count++
   └─ Aguarda backoff
   
3️⃣ nack(msg, false, false)
   └─ Rejeita mensagem
   └─ false, false = não requeue, enviar para DLX
   └─ RabbitMQ roteia para DLQ
```

---

### 7️⃣ Envio de Email (Simulado)

```typescript
private async sendEmail(email: string, message: string): Promise<void> {
  // Simula 50% de falha
  if (Math.random() > 0.5) {
    throw new Error('Simulated email sending error');
  }
  
  // Simula latência (500ms)
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  console.log(`Email sent to ${email}: ${message}`);
}
```

**Cenários**:
- 50% das vezes: Falha (erro aleatório)
- 50% das vezes: Sucesso (após 500ms)

Isso permite testar retry e DLQ naturalmente!

---

### 8️⃣ Acknowledgement / Rejection

#### Sucesso (ACK)

```typescript
channel.ack(msg)
```

**Resultado**:
```
1. Marca mensagem como processada
2. Remove da fila
3. Cliente nunca vê erro
4. Fim da história
```

#### Retry (Requeue com Backoff)

```typescript
// Acknowledge msg atual (remove da fila)
channel.ack(originalMsg);

// Aguarda
await new Promise(resolve => setTimeout(resolve, delay));

// Republica com retry count++
await channel.sendToQueue(QUEUES.NOTIFICATIONS, buffer, {
  persistent: true,
  headers: {
    'x-retry-count': retryCount + 1
  }
});
```

**Resultado**:
```
1. Msg atual é removida
2. Aguarda backoff (exponencial)
3. Republica com mesmo correlationId
4. Worker consome novamente
5. Retry counter incrementa
```

#### Falha Permanente (NACK com DLX)

```typescript
channel.nack(msg, false, false)
           ↑    ↑    ↑
       reject   │    └─ não requeue (go to DLX)
                └─ não requeue múltiplas
```

**Resultado**:
```
1. Rejeita mensagem
2. RabbitMQ vê 'x-dead-letter-exchange' header
3. Roteia para DLQ (Dead Letter Queue)
4. Fica em DLQ por TTL (5 minutos)
5. Pode ser investigada via GET /notifications/dlq
```

---

## 🔄 Estratégia de Retry

### Como Retries São Implementados

#### Exponential Backoff

```typescript
private calculateBackoff(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000;
}
```

**Cálculo**:

| Tentativa | retryCount | Backoff Calculado |
|-----------|-----------|-------------------|
| 1ª | 0 | 2^0 * 1000 = 1 segundo |
| 2ª | 1 | 2^1 * 1000 = 2 segundos |
| 3ª | 2 | 2^2 * 1000 = 4 segundos |
| 4ª | ❌ Max atingido | Vai para DLQ |

**Total de tempo**: 1 + 2 + 4 = 7 segundos antes de DLQ

### Por Que Exponential Backoff Importa

```
Cenário 1: Email service timeout (temporário)
  Tentativa 1 (t=0s): Falha (ainda travado)
  Tentativa 2 (t=1s): Falha (rebootando)
  Tentativa 3 (t=3s): Falha (quase pronto)
  Tentativa 4 (t=7s): ✅ Sucesso! (service online)
  
  Resultado: Mensagem é entregue!

Cenário 2: Email service dead (permanente)
  Tentativa 1 (t=0s): Erro
  Tentativa 2 (t=1s): Erro
  Tentativa 3 (t=3s): Erro
  Tentativa 4 (t=7s): Erro → DLQ
  
  Resultado: Mensagem em DLQ para investigação

Cenário 3: Sem backoff (retry imediato)
  Tentativa 1 (t=0s): Erro
  Tentativa 2 (t=0ms): Erro  (service ainda travado)
  Tentativa 3 (t=1ms): Erro  (spam do service)
  Tentativa 4 (t=2ms): Erro  (pior, aumenta carga)
  
  Resultado: Cascata de falhas! 😱
```

### Diferença Entre Retryable e Permanent Failures

#### Erros Retryable (Passageiros)

```
• Timeout de conexão
• Gateway temporariamente indisponível
• Rate limit (429)
• Erro de DNS transiente
• Cache miss (retry hit cache)

Ação: ✅ Retry com backoff
Resultado: Frequentemente sucesso
```

**Neste projeto**: Simula com `Math.random() > 0.5`

#### Erros Permanentes (Não Vai Melhorar)

```
• Email inválido (formato errado)
• Autenticação falhou (credencial errada)
• Database constraint violation (schema mismatch)
• Permissão negada (403)

Ação: ❌ Não retry, enviar direto para DLQ
Resultado: Precisa de ação humana
```

**Neste projeto**: Depois de 3 retries, assume permanente

---

## 💀 Dead Letter Queue (DLQ)

### O Que É Uma DLQ

Uma **Dead Letter Queue** é uma fila especial para mensagens que:

1. Foram rejeitadas pelo consumer
2. Ou excederam o TTL
3. Ou violaram uma constraint

**Propósito**: Preservar dados para investigação sem descartar

```
Sem DLQ:
  Mensagem falha → Descartada → Perdida para sempre
  
Com DLQ:
  Mensagem falha → Armazenada em DLQ → Pode ser investigada
```

### Quando Mensagem É Enviada para DLQ

```typescript
if (retryCount < 3) {
  // Retry
  await this.retryMessage(message, retryCount, channel, msg);
} else {
  // Max retries atingido
  this.logger.error(`[${correlationId}] Max retries, → DLQ`);
  channel.nack(msg, false, false);  // ← Vai para DLQ
}
```

**Sequência**:
```
1. Worker tenta processar
2. Falha na 1ª tentativa → Retenta em 1s
3. Falha na 2ª tentativa → Retenta em 2s
4. Falha na 3ª tentativa → Retenta em 4s
5. Falha na 4ª tentativa (retryCount=3) → nack(msg)
6. RabbitMQ vê x-dead-letter-exchange header
7. Roteia para DLX (Dead Letter Exchange)
8. DLX entrega para DLQ
9. Mensagem fica em DLQ por TTL (5 minutos)
10. Pode ser lida via GET /notifications/dlq
```

### Como x-dead-letter-exchange É Usado

```typescript
// Setup da fila principal
await channel.assertQueue(QUEUES.NOTIFICATIONS, {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': EXCHANGES.NOTIFICATIONS_DLX,
    'x-dead-letter-routing-key': 'notification'
  }
});

// Setup da DLQ
await channel.assertQueue(QUEUES.NOTIFICATIONS_DLQ, {
  durable: true,
  arguments: {
    'x-message-ttl': 300000  // 5 minutos
  }
});

// Bind DLQ ao DLX
await channel.bindQueue(
  QUEUES.NOTIFICATIONS_DLQ,
  EXCHANGES.NOTIFICATIONS_DLX,
  'notification'
);
```

**Fluxo**:
```
Main Queue (notifications.queue)
├─ x-dead-letter-exchange: 'notifications.dlx'
└─ x-dead-letter-routing-key: 'notification'

[Mensagem rejeitada]
         ↓
[RabbitMQ procura DLX]
         ↓
Dead Letter Exchange (notifications.dlx)
├─ Routing key: 'notification'
└─ Procura bindings
         ↓
[Encontra binding para 'notification']
         ↓
Dead Letter Queue (notifications.dlq)
         ↓
[Mensagem pode ser lida, investigada e replay]
```

### Por Que DLQ É Crítica

#### Reliability (Confiabilidade)

```
❌ Sem DLQ:
  Mensagem falha → Perdida → Usuário não recebe notificação
  
✅ Com DLQ:
  Mensagem falha → Em DLQ → Pode ser reprocessada later
```

#### Debugging (Investigação)

```
Pergunta: "Por que o email do user@example.com não foi entregue?"

Sem DLQ:
  Resposta: "Não sabemos, foi perdido"
  
Com DLQ:
  Resposta: "Tá aqui em DLQ com x-retry-count=3"
  → Olha os logs de erro
  → "SMTP connection timeout"
  → Descobre que SMTP server tá down
  → Corrige e reprocessa
```

#### Audit Trail (Trilha de Auditoria)

```
GET /notifications/dlq

Resposta:
{
  "total": 5,
  "messages": [
    {
      "correlationId": "abc-123",
      "content": {
        "email": "invalid@",
        "message": "..."
      },
      "retryCount": 3
    }
  ]
}
```

Cada mensagem em DLQ conta a história de falha!

---

## 📊 Observabilidade & Monitoramento

### Prometheus Integration

O projeto expõe métricas via endpoint `/metrics` no formato Prometheus:

```typescript
@Injectable()
export class MetricsService {
  private notificationsReceived: Counter;
  private notificationsProcessed: Counter;
  private notificationsFailed: Counter;
  private processingDuration: Histogram;
  
  constructor() {
    this.notificationsReceived = new Counter({
      name: 'notifications_received_total',
      help: 'Total notifications received'
    });
    // ... mais métricas
  }
}
```

### Métricas Expostas

#### 1. **notifications_received_total** (Counter)

```
# HELP notifications_received_total Total notifications received
# TYPE notifications_received_total counter
notifications_received_total 1000
```

**O que mede**: Quantas requisições POST chegaram ao servidor

**Usa**: Detectar queda de requisições

#### 2. **notifications_processed_total** (Counter)

```
notifications_processed_total 950
```

**O que mede**: Quantas notificações foram processadas com sucesso

**Usa**: Calcular taxa de sucesso = 950/1000 = 95%

#### 3. **notifications_failed_total** (Counter)

```
notifications_failed_total 50
```

**O que mede**: Quantas notificações falharam permanentemente (foram para DLQ)

**Usa**: Taxa de falha = 50/1000 = 5%

#### 4. **notification_processing_duration_seconds** (Histogram)

```
notification_processing_duration_seconds_bucket{le="0.1"} 100
notification_processing_duration_seconds_bucket{le="0.5"} 500
notification_processing_duration_seconds_bucket{le="1"} 800
notification_processing_duration_seconds_bucket{le="2"} 900
notification_processing_duration_seconds_bucket{le="5"} 950
notification_processing_duration_seconds_sum 1500
notification_processing_duration_seconds_count 950
```

**O que mede**: Distribuição de tempo de processamento

**Buckets**:
- < 0.1s: 100 emails
- < 0.5s: 500 emails (rápido)
- < 1s: 800 emails
- < 2s: 900 emails
- < 5s: 950 emails

**Usa**: Identificar gargalos (muita latência no envio)

### Grafana Dashboards

Exemplo de queries Grafana:

```promql
# Taxa de requisições por segundo
rate(notifications_received_total[1m])

# Taxa de sucesso (%)
(notifications_processed_total / notifications_received_total) * 100

# P95 de latência
histogram_quantile(0.95, rate(notification_processing_duration_seconds_bucket[1m]))

# Taxa de falha
rate(notifications_failed_total[1m])
```

**Dashboard exemplo**:
```
┌─────────────────────────────────────┐
│ Notifications System Dashboard      │
├─────────────────────────────────────┤
│                                     │
│ Requests/sec: [=====>] 500 req/s   │
│ Success Rate: [===>] 95%           │
│ P95 Latency:  [==>] 750ms          │
│ Failed (DLQ): [>] 50 messages      │
│                                     │
│ [Graph: Requests over time]         │
│ [Graph: Success rate trend]         │
│ [Graph: Latency histogram]          │
│                                     │
└─────────────────────────────────────┘
```

### Por Que Observabilidade É Essencial

```
Sistema de notificações SEM métricas:
  "Por que os emails não estão sendo entregues?"
  → Debug cego (logs apenas)
  → Leva horas para descobrir

Sistema de notificações COM métricas:
  "Por que os emails não estão sendo entregues?"
  → Olha dashboard
  → "Ata, success_rate caiu de 99% para 2% às 10:30"
  → "E processamento_duration subiu para 30s"
  → "SMTP server tá lento!"
  → Corrige em 5 minutos
```

---

## 🔍 Rastreabilidade de Mensagem

### correlationId

Cada mensagem recebe um **UUID único**:

```typescript
const correlationId = randomUUID();
// Exemplo: "550e8400-e29b-41d4-a716-446655440000"

const message = {
  correlationId,
  timestamp: new Date().toISOString(),
  data: dto
};
```

### Rastreamento da Requisição até Processamento

```
1️⃣ Cliente faz POST
   POST /notifications
   { email: "user@example.com", message: "..." }

2️⃣ Controller gera correlationId
   correlationId = "550e8400-e29b-41d4-a716-446655440000"
   
3️⃣ Message publica em RabbitMQ
   Message { correlationId, data }
   
4️⃣ Worker consome e processa
   Logger.log(`[${correlationId}] Processing notification (attempt 1)`)
   
5️⃣ Se falha, retenta
   Logger.error(`[${correlationId}] Error (attempt 2)`)
   Logger.log(`[${correlationId}] Retrying in 1000ms...`)
   
6️⃣ Se sucesso
   Logger.log(`[${correlationId}] Notification sent successfully`)
   
7️⃣ Se falha permanente, vai para DLQ
   GET /notifications/dlq
   Retorna: { correlationId, retryCount: 3, ... }
```

### Tracking Through Logs

Todos os logs incluem `[correlationId]` para fácil rastreamento:

```
2025-12-26T10:30:15.123Z [550e8400] Processing notification (attempt 1)
2025-12-26T10:30:15.623Z [550e8400] Error processing notification (attempt 1): SMTP timeout
2025-12-26T10:30:15.624Z [550e8400] Retrying in 1000ms...
2025-12-26T10:30:16.125Z [550e8400] Processing notification (attempt 2)
2025-12-26T10:30:16.625Z [550e8400] Error processing notification (attempt 2): SMTP timeout
2025-12-26T10:30:16.626Z [550e8400] Retrying in 2000ms...
2025-12-26T10:30:18.127Z [550e8400] Processing notification (attempt 3)
2025-12-26T10:30:18.627Z [550e8400] Error processing notification (attempt 3): SMTP timeout
2025-12-26T10:30:18.628Z [550e8400] Retrying in 4000ms...
2025-12-26T10:30:22.129Z [550e8400] Processing notification (attempt 4)
2025-12-26T10:30:22.629Z [550e8400] Error processing notification (attempt 4): SMTP timeout
2025-12-26T10:30:22.630Z [550e8400] Max retries reached, sending to DLQ
```

Com `grep "[550e8400]" logs.txt`, vê o fluxo completo!

---

## 🔌 API Endpoints

### POST /notifications

**Descrição**: Envia uma notificação por email

**Request**:
```bash
curl -X POST http://localhost:3000/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "message": "Bem-vindo ao sistema!"
  }'
```

**Response** (202 Accepted):
```json
{
  "message": "Notification queued successfully",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Status Code**: `202` (Accepted, não 200)

**Por que 202?**
- 200 OK = "Processado imediatamente"
- 202 Accepted = "Aceito para processamento assíncrono"

---

### GET /notifications/dlq

**Descrição**: Lista mensagens na Dead Letter Queue

**Request**:
```bash
curl http://localhost:3000/notifications/dlq
```

**Response**:
```json
{
  "total": 2,
  "messages": [
    {
      "correlationId": "abc-123",
      "content": {
        "correlationId": "abc-123",
        "timestamp": "2025-12-26T10:30:00Z",
        "data": {
          "email": "invalid@",
          "message": "Test"
        }
      },
      "retryCount": 3
    },
    {
      "correlationId": "def-456",
      "content": {
        "correlationId": "def-456",
        "timestamp": "2025-12-26T10:31:00Z",
        "data": {
          "email": "user@test.com",
          "message": "Another failed one"
        }
      },
      "retryCount": 3
    }
  ]
}
```

**Uso**: Investigar por que emails não foram entregues

---

### GET /metrics

**Descrição**: Expõe métricas Prometheus

**Request**:
```bash
curl http://localhost:3000/metrics
```

**Response**:
```
# HELP notifications_received_total Total notifications received
# TYPE notifications_received_total counter
notifications_received_total 1000

# HELP notifications_processed_total Total notifications processed successfully
# TYPE notifications_processed_total counter
notifications_processed_total 950

# HELP notifications_failed_total Total notifications failed
# TYPE notifications_failed_total counter
notifications_failed_total 50

# HELP notification_processing_duration_seconds Duration of notification processing
# TYPE notification_processing_duration_seconds histogram
notification_processing_duration_seconds_bucket{le="0.1"} 100
notification_processing_duration_seconds_bucket{le="0.5"} 500
notification_processing_duration_seconds_bucket{le="1"} 800
notification_processing_duration_seconds_bucket{le="2"} 900
notification_processing_duration_seconds_bucket{le="5"} 950
notification_processing_duration_seconds_sum 1500
notification_processing_duration_seconds_count 950
```

**Uso**: Alimentar Grafana/Prometheus

---

## 🔥 Load Testing

### Teste de Carga com ~1000 Requisições Concorrentes

**Script**: [test/load-test.sh](test/load-test.sh)

```bash
#!/bin/bash

echo "Iniciando teste de carga..."
echo "Enviando 100 notificações em 10 segundos"

for i in {1..100}
do
  curl -X POST http://localhost:3000/notifications \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"user$i@test.com\", \"message\": \"Test $i\"}" \
    -s -o /dev/null &
done

wait
echo "✅ Teste concluído!"
```

**Executar**:
```bash
bash test/load-test.sh
```

### Observações Sob Alta Carga

#### Antes do teste:

```
notifications_received_total: 0
notifications_processed_total: 0
notifications_failed_total: 0
queue size: 0
```

#### Durante o teste (100 requisições concorrentes):

```
notifications_received_total: 100
notifications_processed_total: 45  (ainda processando)
notifications_failed_total: 0
queue size: 55 (esperando processamento)

Latência média: 100ms (resposta HTTP)
```

#### Após 30 segundos:

```
notifications_received_total: 100
notifications_processed_total: 95  (sucesso)
notifications_failed_total: 5     (para DLQ)
queue size: 0

Taxa de sucesso: 95/100 = 95%
Taxa de falha: 5%
```

### Impacto de Retries na Taxa de Sucesso

**Com retries (backoff exponencial)**:
```
1º consumo: 50% falha → 50% sucesso
2º consumo (dos 50% que falharam):
  → 50% % 50 = 25% sucesso
3º consumo (dos restantes):
  → 50% × 25% = 12.5% sucesso
4º consumo:
  → 50% × 12.5% = 6.25% sucesso
  
Total de sucesso: 50 + 25 + 12.5 + 6.25 = 93.75%
```

**Sem retries**:
```
1º consumo: 50% sucesso, 50% vai para DLQ
Total de sucesso: 50%
```

**Diferença**: +43.75% de taxa de sucesso apenas com retries!

### Resultado DLQ Esperado

Com 100 requisições e 50% de falha em cada retry:

```
Original (100): 50 sucesso, 50 falha
Retry 1 (50): 25 sucesso, 25 falha
Retry 2 (25): 12.5 sucesso, 12.5 falha
Retry 3 (12.5): 6.25 sucesso, 6.25 falha

DLQ final: ~6.25% (aproximadamente 6 mensagens)
Success rate: ~93.75%
```

---

## ⚠️ Cenários de Falha

### 1. Falha no Envio de Email

**Causa**: Email service temporariamente indisponível

```
Tentativa 1 (t=0s): sendEmail() → throw "SMTP timeout"
  ↓ Worker pega exceção
  ↓ retryCount < 3 → retry
  ↓ Aguarda 1000ms

Tentativa 2 (t=1s): sendEmail() → throw "SMTP timeout"
  ↓ retryCount < 3 → retry
  ↓ Aguarda 2000ms

Tentativa 3 (t=3s): sendEmail() → throw "SMTP timeout"
  ↓ retryCount < 3 → retry
  ↓ Aguarda 4000ms

Tentativa 4 (t=7s): sendEmail() → throw "SMTP timeout"
  ↓ retryCount >= 3 → PARAR
  ↓ nack(msg, false, false)
  ↓ RabbitMQ roteia para DLQ
```

**Resultado**: Mensagem em DLQ após 7 segundos de tentativas

**Recuperação**: Email service volta online
- Alguém investi a DLQ
- Identifica que foi SMTP timeout
- Republica manualmente
- Sucesso na tentativa 5

---

### 2. Exhaustão de Retries

**Causa**: Email service está permanentemente morto

```
Tentativa 1-4: Todas falham com "Connection refused"
  ↓ Após 4ª falha
  ↓ nack(msg, false, false)
  ↓ → DLQ

Resultado em DLQ:
{
  "correlationId": "abc-123",
  "retryCount": 3,
  "error": "Connection refused"
}

Ação necessária:
1. Investigar por que SMTP está down
2. Fixar SMTP service
3. Manualmente reprocessar mensagens de DLQ
```

---

### 3. Roteamento para DLQ

**Fluxo detalhado**:

```
Worker executa:
  channel.nack(msg, false, false)
           ↓
RabbitMQ processa nack:
  1. Vê que é um NACK
  2. Lê header 'x-dead-letter-exchange'
  3. Encontra: 'notifications.dlx'
  4. Publica para notifications.dlx
  5. DLX procura bindings para routing_key
  6. Encontra: notifications.dlq
  7. Entrega mensagem ao DLQ
  8. Mensagem fica em DLQ
  9. TTL de 5 minutos começa
  10. Após 5 min: mensagem é deletada automaticamente
           ↓
GET /notifications/dlq
  → Retorna a mensagem antes de TTL expirar
```

---

### 4. Comportamento do Sistema Sob Falhas Parciais

**Cenário**: SMTP server fica intermitentemente indisponível

```
t=0-2s:   SMTP ↓ (down)
t=2-5s:   SMTP ↑ (up)
t=5-7s:   SMTP ↓ (down)
t=7-10s:  SMTP ↑ (up)

Requisição 1 (chega em t=0.5s):
  1º try (t=0.5s): SMTP down → falha
  2º try (t=1.5s): SMTP down → falha
  3º try (t=3.5s): SMTP up ✅ → sucesso!
  
Requisição 2 (chega em t=5.5s):
  1º try (t=5.5s): SMTP down → falha
  2º try (t=6.5s): SMTP down → falha
  3º try (t=8.5s): SMTP up ✅ → sucesso!
  
Requisição 3 (chega em t=9.5s):
  1º try (t=9.5s): SMTP up ✅ → sucesso!
```

**Resultado**: Mesmos com falhas intermitentes, sistema recupera!

---

## 🚀 Como Executar o Projeto

### Requisitos

- **Node.js**: v18+ (ou v22)
- **Docker**: Para RabbitMQ
- **npm**: v10+

### Setup de Ambiente

#### 1. Clone/Extraia o Projeto

```bash
cd notification-system
```

#### 2. Instale Dependências

```bash
npm install
```

#### 3. Inicie RabbitMQ

```bash
docker-compose up -d
```

**Verificar se está rodando**:
```bash
docker ps
# Vê "rabbitmq" container ativo
```

**Acessar Management UI** (opcional):
```
http://localhost:15672
User: admin
Password: admin
```

#### 4. Inicie a Aplicação

```bash
# Desenvolvimento (watch mode)
npm run start:dev

# Ou produção
npm run build
npm run start:prod
```

**Output esperado**:
```
[Nest] 12345 - 12/26/2025, 10:30:00 AM   LOG [NestFactory] Starting Nest application...
[Nest] 12345 - 12/26/2025, 10:30:00 AM   LOG [InstanceLoader] RabbitMQModule dependencies initialized
[Nest] 12345 - 12/26/2025, 10:30:01 AM   LOG [RabbitMQService] Connected to RabbitMQ
[Nest] 12345 - 12/26/2025, 10:30:01 AM   LOG [RabbitMQService] Queues, exchange and DLQ configured
[Nest] 12345 - 12/26/2025, 10:30:01 AM   LOG [WorkerService] Worker listening for notifications...
[Nest] 12345 - 12/26/2025, 10:30:01 AM   LOG [NestFactory] Nest application successfully started on port 3000
```

#### 5. Testar a Aplicação

```bash
# Enviar uma notificação
curl -X POST http://localhost:3000/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "message": "Hello World!"
  }'

# Ver DLQ (se houver falhas)
curl http://localhost:3000/notifications/dlq

# Ver métricas
curl http://localhost:3000/metrics
```

---

## 🧪 Testes Automatizados

```bash
# Testes unitários
npm run test

# Testes com cobertura
npm run test:cov

# Watch mode
npm run test:watch

# E2E tests
npm run test:e2e
```

---

## 🎯 Aprendizados Principais

### O Que Este Projeto Demonstra

#### 1. Filas de Mensagens Não São Opcionais

```
Sem fila:
  • Cliente espera pelo envio (5s)
  • Server fica bloqueado
  • Picos causam crash

Com fila:
  • Cliente sai em 100ms
  • Messages processam assincronamente
  • Picos são absorvidos
```

#### 2. Retries + Exponential Backoff = Resiliência

```
Sem retry:
  50% falha permanente (metade perdida)

Com retry:
  Falhas transientes → 93% sucesso
  Falhas permanentes → DLQ para investigação
```

#### 3. Dead Letter Queue É Segurança

```
Sem DLQ:
  Falhas → Perdidas para sempre
  
Com DLQ:
  Falhas → Preservadas para investigação
```

#### 4. Observabilidade via Métricas

```
Sem métricas:
  "Por que falhou?" → Debug cego

Com métricas:
  "Taxa de sucesso caiu" → Achado em 2 minutos
```

#### 5. Rastreabilidade com correlationId

```
Sem correlationId:
  "Qual requisição foi este email?" → Impossível saber

Com correlationId:
  "Qual requisição foi este email?" → grep [id] logs.txt
```

### Trade-offs de Processamento Assíncrono

#### ✅ Vantagens

- Baixa latência percebida (cliente vê 202 rápido)
- Desacoplamento entre publicador e consumidor
- Escalabilidade (add mais workers)
- Resiliência a falhas

#### ❌ Desvantagens

- Consistência eventual (pode ter delay)
- Complexidade operacional (filas para monitorar)
- Debugging mais difícil (processo não é síncrono)
- Reprocessamento necessário (for DLQ items)

### Por Que Retries + DLQ São Não-Opcionais

Em qualquer sistema que processa mensagens:

```
Cenário sem retry + DLQ:
  • Falhas transientes → Perdidas
  • Clientes não recebem notificações
  • Sem forma de investigar
  → Sistema não é confiável

Cenário com retry + DLQ:
  • Falhas transientes → Retentam e recuperam
  • Falhas permanentes → DLQ para ação humana
  • 99%+ de mensagens entregues
  → Sistema é confiável
```

---

## ⚡ Limitações & Futuras Melhorias

### O Que Este Projeto Propositalmente NÃO Faz

| Feature | Por Que Não | Próximo Passo |
|---------|----------|--------------|
| **Múltiplos consumidores** | Simplicidade | Usar scaled replicas |
| **Priority Queues** | Scope reduzido | x-max-priority |
| **Delayed Exchange** | Complexidade | rabbitmq-delayed-exchange |
| **Dead Letter TTL cleanup** | Manual learning | Cron job para limpar |
| **Persisted Metrics** | Out of scope | InfluxDB + Grafana |
| **Distributed Tracing** | Overkill para exemplo | Jaeger integration |
| **Encryption** | Desenvolvimento | TLS/SSL |

### Possíveis Próximos Passos

#### 1. Múltiplos Consumidores

```bash
# Escape: roda 1 worker
npm run start

# Com scaling:
docker-compose scale worker=5
# → 5 workers processam em paralelo
```

#### 2. Priority Queues

```typescript
// Email de confirmação de pagamento = high priority
// Newsletter = low priority

await channel.assertQueue('notifications.queue', {
  arguments: {
    'x-max-priority': 10
  }
});

// High priority message
await publish('notification', message, { priority: 10 });

// Low priority message
await publish('notification', message, { priority: 1 });
```

#### 3. Delayed Exchange

```typescript
// Enviar email após 1 hora
await delayedExchange.publish('notification', message, {
  delay: 3600000  // 1 hora em ms
});
```

#### 4. Multiple Message Types

```
Notification Types:
• email
• sms
• push
• slack

Topic Exchange:
  notifications.email.*
  notifications.sms.*
  notifications.push.*
```

#### 5. Persistent Metrics

```
Prometheus → InfluxDB → Grafana
  
Benefício:
  • Histórico de métricas (não apenas atual)
  • Alertas baseados em trends
  • SLA tracking
```

---

## 📂 Estrutura de Arquivos

```
notification-system/
├── src/
│   ├── app.module.ts              # Módulo raiz
│   ├── main.ts                    # Entry point
│   │
│   ├── rabbitmq/                  # Integração RabbitMQ
│   │   ├── rabbitmq.service.ts    # Cliente AMQP
│   │   ├── rabbitmq.module.ts
│   │   └── rabbitmq.constants.ts  # Config (queues, exchanges)
│   │
│   ├── notifications/             # API de notificações
│   │   ├── notifications.service.ts   # Publica mensagens
│   │   ├── notifications.controller.ts # HTTP endpoints
│   │   ├── notifications.module.ts
│   │   └── dto/
│   │       └── create-notification.dto.ts
│   │
│   ├── worker/                    # Consumidor de mensagens
│   │   ├── worker.service.ts      # Processa emails
│   │   └── worker.module.ts
│   │
│   └── metrics/                   # Observabilidade
│       ├── metrics.service.ts     # Prometheus metrics
│       ├── metrics.controller.ts  # GET /metrics
│       └── metrics.module.ts
│
├── test/
│   └── load-test.sh              # Teste de carga
│
├── docker-compose.yml            # RabbitMQ setup
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔗 Referências & Leitura Adicional

### Conceitos RabbitMQ

- **AMQP 0.9.1 Specification**: https://www.rabbitmq.com/amqp-0-9-1-protocol.html
- **RabbitMQ Tutorials**: https://www.rabbitmq.com/getstarted.html
- **Dead Letter Exchanges**: https://www.rabbitmq.com/dlx.html
- **Consumer Acknowledgments**: https://www.rabbitmq.com/confirms.html

### Padrões de Resiliência

- "The Release It!: Design and Deploy Production-Ready Software" - Michael Nygard
- "Building Reliable Systems" - Martin Kleppmann
- "https://www.c3.cx/" - Circuit Breaker Pattern

### Observabilidade

- **Prometheus**: https://prometheus.io/docs/introduction/overview/
- **Grafana**: https://grafana.com/docs/grafana/latest/
- **OpenTelemetry**: https://opentelemetry.io/

---

## 📞 Troubleshooting

### Problema: Connection Refused ao RabbitMQ

```
Error: "connect ECONNREFUSED 127.0.0.1:5672"
```

**Solução**:
```bash
# Verificar se RabbitMQ está rodando
docker ps | grep rabbitmq

# Se não estiver:
docker-compose up -d rabbitmq

# Aguarde 5 segundos e tente novamente
```

### Problema: Filas Vazias/Sem Mensagens

```
GET /notifications/dlq retorna "total: 0"
```

**Possíveis causas**:
1. Worker não iniciou (`npm run start:dev`)
2. Nenhuma POST foi feita ainda
3. Todas as mensagens foram processadas com sucesso

**Solução**:
```bash
# Verificar logs do worker
npm run start:dev

# Enviar mensagem de teste
curl -X POST http://localhost:3000/notifications \
  -d '{"email": "test@test.com", "message": "test"}'
```

### Problema: Metrics Não Aparecem

```
curl http://localhost:3000/metrics
# Output: vazio ou erro
```

**Solução**:
1. Garantir que MetricsModule está importado em AppModule
2. Verificar se /metrics endpoint está registrado
3. Testar com `curl http://localhost:3000/metrics -v`

---

## 📄 Licença

Este projeto é fornecido como-está para fins educacionais.

---

**Última atualização**: 26 de dezembro de 2025

**Versão**: 1.0.0

Construído com ❤️ para aprender Message Queues e Distributed Systems.

# Estudos práticos — Payment & Notification Systems

Breve repositório com dois projetos hands-on criados para aprender padrões avançados de backend na prática.

## Projetos

- `payment-system`

  - Simulação avançada de um sistema de pagamentos.
  - Foco em: Saga (orquestração), idempotência, circuit breaker, comunicação orientada a eventos.
  - Objetivo: entender comportamento de fluxos de pagamento sob falhas e como manter consistência.

- `notification-system`
  - Sistema de notificações assíncronas (envio de e‑mail) usando RabbitMQ.
  - Foco em: exchanges/queues, retries com exponential backoff, DLQ e observabilidade (Prometheus).
  - Objetivo: aprender a construir pipelines de mensagem confiáveis que não perdem mensagens.

## Filosofia de aprendizado

- Projetos feitos para "aprender fazendo" — não são tutoriais nem produtos prontos para produção.
- A ênfase está em reproduzir cenários reais de falha, resiliência e recuperação.
- Complexidade foi intencionalmente incluída para estudar comportamentos próximos a sistemas de produção.

## Como usar (rápido)

- Cada subprojeto tem seu próprio `README.md` e instruções: ver `payment-system` e `notification-system`.
- Ideal para mostrar em entrevistas ou para estudo rápido.

---

Última atualização: 26 de dezembro de 2025

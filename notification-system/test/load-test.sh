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
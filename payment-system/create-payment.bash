#!/bin/bash

for i in {1..50}; do
  curl -X POST http://localhost:3000/payments \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"550e8400-e29b-41d4-a716-446655440007\",
      \"amount\": 10,
      \"idempotencyKey\": \"test-uu-$i\"
    }"
  sleep 1
done
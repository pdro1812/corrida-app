#!/usr/bin/env python3
"""Processo persistente de sessão com o Garmin Connect.

Chamado como subprocesso pelo GarminService (backend/src/garmin/garmin.service.ts),
que mantém uma instância viva por sessão e conversa com ela por stdin/stdout —
uma linha JSON por comando, uma linha JSON por resposta. O login é feito de
forma preguiçosa (lazy), no primeiro comando recebido, e reaproveitado entre
comandos na mesma sessão, espelhando o comportamento anterior baseado na lib
npm garmin-connect (client em cache, relogin só depois de uma falha).

Motivo de existir (ver docs/ARCHITECTURE.md §3): as libs Node não-oficiais
(garmin-connect, @gooin/garmin-connect) pararam de conseguir autenticar após
uma mudança no fluxo de login do Garmin; a lib Python `garminconnect`
(mantida ativamente, cyberjunky/python-garminconnect) já foi corrigida para o
fluxo atual e foi validada manualmente contra a conta real antes desta troca.

Comandos suportados (um JSON por linha em stdin):
  {"cmd": "activities", "limit": 20}
  {"cmd": "splits", "activityId": 123456789}

Resposta (um JSON por linha em stdout):
  {"ok": true, "data": ...}
  {"ok": true, "data": ..., "novoTokenStore": "..."}  -- só quando houve login completo
  {"ok": false, "error": "mensagem"}

Cache de sessão (ver docs/ARCHITECTURE.md §3): login completo (usuário/senha)
repetido a cada restart do processo é o que aciona rate limit (429) no SSO
do Garmin. Por isso o token OAuth da lib `garth` é reaproveitado via
GARMIN_TOKEN_STORE (env var com o token salvo no Postgres pelo
GarminService) — login completo só acontece se não houver token ou ele
tiver sido rejeitado (expirado/inválido), e nesse caso a resposta do
próximo comando inclui "novoTokenStore" para o Node atualizar o cache.
"""
import json
import os
import sys

from garminconnect import Garmin


def login():
    email = os.environ["GARMIN_EMAIL"]
    password = os.environ["GARMIN_PASSWORD"]
    token_store = os.environ.get("GARMIN_TOKEN_STORE")

    client = Garmin(email, password)

    if token_store:
        try:
            client.garth.loads(token_store)
            return client, None
        except Exception:
            pass  # token expirado/inválido — cai para login completo abaixo

    client.login()
    return client, client.garth.dumps()


def handle(client, request):
    cmd = request.get("cmd")
    if cmd == "activities":
        limite = request.get("limit", 20)
        return client.get_activities(0, limite)
    if cmd == "splits":
        return client.get_activity_splits(request["activityId"])
    raise ValueError(f"comando desconhecido: {cmd!r}")


def main():
    client = None
    for linha in sys.stdin:
        linha = linha.strip()
        if not linha:
            continue

        try:
            requisicao = json.loads(linha)
            novo_token_store = None
            if client is None:
                client, novo_token_store = login()
            resultado = handle(client, requisicao)
            resposta = {"ok": True, "data": resultado}
            if novo_token_store:
                resposta["novoTokenStore"] = novo_token_store
        except Exception as erro:
            client = None  # força novo login na próxima linha
            resposta = {"ok": False, "error": str(erro)}

        print(json.dumps(resposta))
        sys.stdout.flush()


if __name__ == "__main__":
    main()

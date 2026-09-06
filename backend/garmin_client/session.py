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
  {"ok": false, "error": "mensagem"}
"""
import json
import os
import sys

from garminconnect import Garmin


def login():
    email = os.environ["GARMIN_EMAIL"]
    password = os.environ["GARMIN_PASSWORD"]
    client = Garmin(email, password)
    client.login()
    return client


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
            if client is None:
                client = login()
            resultado = handle(client, requisicao)
            resposta = {"ok": True, "data": resultado}
        except Exception as erro:
            client = None  # força novo login na próxima linha
            resposta = {"ok": False, "error": str(erro)}

        print(json.dumps(resposta))
        sys.stdout.flush()


if __name__ == "__main__":
    main()

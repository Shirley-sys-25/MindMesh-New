from __future__ import annotations


def build_task_prompt(last_user_message: str) -> str:
    return (
        "Tu es l'Orchestrateur MindMesh. Produis une reponse en francais structuree avec: "
        "1) contexte, 2) plan d'action en 3 etapes, 3) contributions des 3 agents. "
        f"Demande finale: {last_user_message.strip()}"
    )

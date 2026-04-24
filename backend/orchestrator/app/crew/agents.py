from __future__ import annotations


def build_agents() -> list[dict[str, str]]:
    return [
        {
            "id": "AfriConnect",
            "role": "Traduction et contexte local",
            "goal": "Adapter le message au contexte local francophone et africain.",
        },
        {
            "id": "Analyste Marche",
            "role": "Analyse marche",
            "goal": "Identifier les tendances et opportunites actionnables.",
        },
        {
            "id": "Stratege SEO",
            "role": "Strategie SEO",
            "goal": "Proposer un plan SEO concret, priorise et mesurable.",
        },
    ]

from __future__ import annotations

import logging

from ..core.config import get_settings
from .agents import build_agents
from .tasks import build_task_prompt


logger = logging.getLogger(__name__)


class MindMeshCrewOrchestrator:
    def __init__(self) -> None:
        self.agents = build_agents()
        self.settings = get_settings()

    @staticmethod
    def _latest_user_message(messages: list[dict[str, str]]) -> str:
        latest_user_message = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                latest_user_message = message.get("content", "")
                break

        if not latest_user_message:
            return "Precise ton objectif principal."
        return latest_user_message

    def _run_with_crewai(self, latest_user_message: str) -> str | None:
        if self.settings.orchestrator_engine == "skeleton":
            return None
        if not self.settings.openai_api_key:
            logger.info("crewai_disabled_missing_openai_key")
            return None

        try:
            from crewai import Agent, Crew, LLM, Task
        except Exception as error:  # noqa: BLE001
            logger.warning("crewai_import_failed", extra={"error": str(error)})
            return None

        llm_kwargs = {
            "model": self.settings.openai_model,
            "api_key": self.settings.openai_api_key,
        }
        if self.settings.openai_base_url:
            llm_kwargs["base_url"] = self.settings.openai_base_url

        try:
            llm = LLM(**llm_kwargs)

            afri_connect = Agent(
                role="AfriConnect",
                goal="Adapter le message au contexte local francophone et africain.",
                backstory="Expert en adaptation linguistique et culturelle.",
                llm=llm,
                allow_delegation=False,
                verbose=False,
            )
            analyste_marche = Agent(
                role="Analyste Marche",
                goal="Identifier les opportunites actionnables pour l'objectif utilisateur.",
                backstory="Analyste senior en positionnement de marche.",
                llm=llm,
                allow_delegation=False,
                verbose=False,
            )
            stratege_seo = Agent(
                role="Stratege SEO",
                goal="Proposer une strategie SEO claire et mesurable.",
                backstory="Specialiste en croissance organique et priorisation contenu.",
                llm=llm,
                allow_delegation=False,
                verbose=False,
            )

            contextualisation = Task(
                description=(
                    "Analyse la demande utilisateur et produis un cadrage en francais avec "
                    "contexte, objectifs et contraintes implicites. "
                    f"Demande utilisateur: {latest_user_message.strip()}"
                ),
                expected_output="Un cadrage concis en francais.",
                agent=afri_connect,
            )
            priorisation = Task(
                description=(
                    "A partir du cadrage, propose un plan d'action en 3 etapes avec des "
                    "priorites claires, hypotheses et indicateurs de succes."
                ),
                expected_output="Un plan d'action en 3 etapes prioritaires.",
                agent=analyste_marche,
            )
            execution = Task(
                description=(
                    "Complete le plan avec une strategie contenu/SEO sur 30 jours: structure "
                    "des contenus, themes prioritaires, quick wins et prochaines actions."
                ),
                expected_output="Une strategie SEO operationnelle sur 30 jours.",
                agent=stratege_seo,
            )

            crew = Crew(
                agents=[afri_connect, analyste_marche, stratege_seo],
                tasks=[contextualisation, priorisation, execution],
                verbose=False,
            )

            output = crew.kickoff()
            content = getattr(output, "raw", None) or str(output)
            content = content.strip()
            return content if content else None
        except Exception as error:  # noqa: BLE001
            logger.warning("crewai_execution_failed", extra={"error": str(error)})
            return None

    def _build_skeleton_content(self, latest_user_message: str) -> str:
        return (
            "Voici le cadrage initial pour ton objectif.\n\n"
            "**Contexte compris**\n"
            f"- Objectif formule: {latest_user_message.strip()}\n\n"
            "**Plan d'action propose**\n"
            "1. Clarifier ton objectif cible et ton audience prioritaire.\n"
            "2. Construire une proposition de valeur concrete adaptee au marche.\n"
            "3. Definir un plan execution contenu/SEO mesurable sur 30 jours.\n\n"
            "**Equipe mobilisee**\n"
            "- **AfriConnect**: localisation linguistique et culturelle.\n"
            "- **Analyste Marche**: tendances, besoins, signaux de demande.\n"
            "- **Stratege SEO**: structure semantique et priorisation des contenus.\n\n"
            "Pour demarrer, donne ton objectif principal en une phrase."
        )

    def run(self, messages: list[dict[str, str]]) -> dict:
        latest_user_message = self._latest_user_message(messages)

        prompt = build_task_prompt(latest_user_message)
        crew_content = self._run_with_crewai(latest_user_message)

        if crew_content:
            content = crew_content
            engine = "crewai-openai"
        else:
            content = self._build_skeleton_content(latest_user_message)
            engine = "crewai-skeleton"

        return {
            "content": content,
            "metadata": {
                "engine": engine,
                "agent_count": len(self.agents),
                "task_prompt": prompt,
            },
        }

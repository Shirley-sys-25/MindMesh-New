from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterator

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
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            logger.info("crewai_disabled_missing_openai_key")
            return None

        try:
            from crewai import Agent, Crew, LLM, Task
        except Exception as error:  # noqa: BLE001
            logger.warning("crewai_import_failed", extra={"error": str(error)})
            return None

        llm_kwargs = {
            "model": "gpt-5.5",
            "api_key": api_key,
            "base_url": self.settings.openai_base_url or "https://build.lewisnote.com/v1",
        }

        try:
            try:
                llm = LLM(**llm_kwargs, extra_body={"reasoning_effort": "high"})
            except TypeError:
                llm = LLM(**llm_kwargs, model_kwargs={"reasoning_effort": "high"})

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

    @staticmethod
    def _sse_block(event_name: str, payload: object) -> str:
        serialized = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        lines = str(serialized).splitlines() or [""]
        return f"event: {event_name}\n" + "\n".join(f"data: {line}" for line in lines) + "\n\n"

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        latest_user_message = self._latest_user_message(messages)

        if self.settings.orchestrator_engine == "skeleton":
            yield self._sse_block("message", self._build_skeleton_content(latest_user_message))
            yield self._sse_block("done", "[DONE]")
            return

        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            yield self._sse_block("message", self._build_skeleton_content(latest_user_message))
            yield self._sse_block("done", "[DONE]")
            return

        try:
            from crewai import Agent, Crew, LLM, Task
        except Exception as error:  # noqa: BLE001
            logger.warning("crewai_import_failed", extra={"error": str(error)})
            yield self._sse_block("message", self._build_skeleton_content(latest_user_message))
            yield self._sse_block("done", "[DONE]")
            return

        llm_kwargs = {
            "model": "gpt-5.5",
            "api_key": api_key,
            "base_url": self.settings.openai_base_url or "https://build.lewisnote.com/v1",
        }

        try:
            try:
                llm = LLM(**llm_kwargs, extra_body={"reasoning_effort": "high"})
            except TypeError:
                llm = LLM(**llm_kwargs, model_kwargs={"reasoning_effort": "high"})

            stages = [
                {
                    "id": "africonnect",
                    "role": "AfriConnect",
                    "goal": "Adapter le message au contexte local francophone et africain.",
                    "backstory": "Expert en adaptation linguistique et culturelle.",
                    "description": (
                        "Analyse la demande utilisateur et produis un cadrage en francais avec "
                        "contexte, objectifs et contraintes implicites. "
                        f"Demande utilisateur: {latest_user_message.strip()}"
                    ),
                    "expected_output": "Un cadrage concis en francais.",
                },
                {
                    "id": "analyste_marche",
                    "role": "Analyste Marche",
                    "goal": "Identifier les opportunites actionnables pour l'objectif utilisateur.",
                    "backstory": "Analyste senior en positionnement de marche.",
                    "description": (
                        "A partir du cadrage precedent, propose un plan d'action en 3 etapes avec "
                        "des priorites claires, hypotheses et indicateurs de succes. "
                        "Conserve le contexte du cadrage precedent et transforme-le en plan opérationnel."
                    ),
                    "expected_output": "Un plan d'action en 3 etapes prioritaires.",
                },
                {
                    "id": "stratege_seo",
                    "role": "Stratege SEO",
                    "goal": "Proposer une strategie SEO claire et mesurable.",
                    "backstory": "Specialiste en croissance organique et priorisation contenu.",
                    "description": (
                        "Complete le plan avec une strategie contenu/SEO sur 30 jours: structure "
                        "des contenus, themes prioritaires, quick wins et prochaines actions. "
                        "Appuie-toi sur les deux etapes precedentes pour livrer un plan final exploitable."
                    ),
                    "expected_output": "Une strategie SEO operationnelle sur 30 jours.",
                },
            ]

            stage_outputs: list[str] = []
            previous_context = latest_user_message.strip()

            for stage in stages:
                yield self._sse_block("agent_status", {"agent": stage["id"], "status": "working"})

                agent = Agent(
                    role=stage["role"],
                    goal=stage["goal"],
                    backstory=stage["backstory"],
                    llm=llm,
                    allow_delegation=False,
                    verbose=False,
                )

                task = Task(
                    description=f"{stage['description']}\n\nContexte precedent: {previous_context}",
                    expected_output=stage["expected_output"],
                    agent=agent,
                )

                crew = Crew(agents=[agent], tasks=[task], verbose=False)
                output = crew.kickoff()
                content = (getattr(output, "raw", None) or str(output)).strip()

                if content:
                    stage_outputs.append(content)
                    previous_context = content
                    yield self._sse_block("message", content)

                yield self._sse_block("agent_status", {"agent": stage["id"], "status": "idle"})

            if not stage_outputs:
                yield self._sse_block("message", self._build_skeleton_content(latest_user_message))

            yield self._sse_block("done", "[DONE]")
        except Exception as error:  # noqa: BLE001
            logger.warning("crewai_stream_failed", extra={"error": str(error)})
            yield self._sse_block(
                "error",
                {"code": "CREWAI_STREAM_FAILED", "message": "Orchestrateur injoignable."},
            )

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

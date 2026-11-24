# Ops RAG Desk

Support/ops desk product: grounded answers over runbooks and tickets, human-in-the-loop escalate, inspectable agent turns, CI eval gate.

Scaffolded from `fastify-react-starter`. Kit language (User, Admin, Document, Work / queue job, Page loader, Page gate) still applies until replaced.

## Language

**Ops corpus**:
Runbooks, ticket excerpts, and internal how-tos the desk retrieves from. Seeded for demos; uploaded documents are the intake path until a richer ingest lands.
_Avoid_: Generic “knowledge base” when meaning the ops-specific corpus

**Ask**:
A user question answered with retrieval + model; responses carry **citations** to corpus chunks.
_Avoid_: Chatbot, completion (when meaning the product action)

**Citation**:
A grounded pointer to a retrieved chunk (document + span) shown with the answer.
_Avoid_: Source link without retrieval provenance

**HITL escalate**:
Park or decision gate when the agent must not mutate or answer alone — human continues the thread.
_Avoid_: Slack ping-only; silent fallback without a durable park

**Agent turn / run**:
One durable execution of the desk loop (accept ≠ execute); inspectable steps on the worker.
_Avoid_: In-request only LLM call as the sole execution path

**Eval gate**:
Fixture suite (happy retrieval, ask park, decision refusal) that fails CI on regression.
_Avoid_: Manual eyeball-only QA

**Desk thread**:
Long-lived Ops Desk agent conversation (`desk_threads` + `desk_messages`).
_Avoid_: Chatbot session (when meaning Support Copilot chat tables from the lab)

**Ask HITL**:
`ask_user` parks the run (`awaiting_human`); human replies; a new turn resumes. Not chat-text approval of mutates.
_Avoid_: Decision HITL (mutate gate) until that seam is ported

**User** / **Admin** / **Document** / **Work** / **Page loader** / **Page gate**:
Same meanings as the Fastify kit — see starter CONTEXT until domain docs supersede.

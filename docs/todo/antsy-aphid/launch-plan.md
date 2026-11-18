---
kind: record
status: current
summary: "Write the production launch plan: platforms, audience, gates, rollout, monitoring and rollback."
verified: 2026-11-15
---

# Production launch plan

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** a written plan for launching to the public: which clients ship (web PWA, iOS, or both) and in what order, who the first users are, store and legal requirements, rollout steps and rollback. The gates are the rows of this milestone: every row blocks the launch, and work that can ship later goes to the [backlog](../backlog.md) (owner decision, 2026-11-14). Planned work the plan creates becomes rows on this milestone.
- **Why:** owner request, 2026-11-12. The v4 web and API have been live since 2026-11-13 ([production state](../../api/operations.md#production)), but no page defines what "launched" means. A proposed schedule to an invited beta, prepared 2026-11-04 and not approved, is in the [beta delivery plan](../../proposals/beta-delivery-plan.md); its open decisions (who the beta is for, invite-only enrollment, legacy data and old app versions, and who owns triage and the decision to stop generation) belong in this plan. The 2026-11-04 [protection decision](../../decisions/2026-11-04-api-protection.md#decision) selected a coordinated release of protected web and migrated native clients with production generation paused until then; production went live for web on 2026-11-13, so that policy needs the owner's confirmation here.
- **Done when:** the plan exists as a wiki page or proposal, the owner has approved it, and the work it creates is on this milestone.
